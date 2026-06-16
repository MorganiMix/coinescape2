import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  buildFullWithdrawalPlan,
  executeWithdrawalPlan,
  executeWithdrawalPlanLive,
  simulateWithdrawal,
} from '@/domain/withdrawalEngine';
import { BalanceMapDetailed, ChainOption, ExchangeManager, isLiveSupported } from '@/exchange';
import {
  ApiCredentials,
  deleteCredentials,
  hasAccount as hasLocalAccount,
  listStoredCredentialExchanges,
  loadAllocations,
  login as localLogin,
  registerAccount as localRegister,
  retrieveCredentials,
  saveAllocations,
  storeCredentials,
} from '@/security';
import {
  defaultAllocationTargets,
  initialExchanges,
  mockBalances,
  newAllocationConfig,
} from '@/domain/mockData';
import { clearPriceCache, fetchPrices } from '@/domain/coingecko';
import {
  AllocationConfig,
  AllocationTargets,
  AssetSymbol,
  BalanceMap,
  ConnectionStatus,
  Exchange,
  ExchangeId,
  ExecutionMode,
  ExecutionResults,
  SavedAddress,
  USD_PRICES,
} from '@/domain/types';

/** 15-minute inactivity auto-logout window (Requirement 9.2), in ms. */
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

interface AppState {
  // Auth (local-only, username + password)
  isAuthenticated: boolean;
  /** Whether the on-device account check has finished (avoids redirect flash). */
  authChecked: boolean;
  /** True once a local account exists — drives login vs. create-account UI. */
  hasAccount: boolean;
  username: string | null;
  /** Authenticate against the local account. Throws on bad credentials. */
  login: (username: string, password: string) => Promise<void>;
  /** First-run: create the local account, then sign in. Throws on weak input. */
  register: (username: string, password: string) => Promise<void>;
  signOut: () => void;
  /** Reset the inactivity timer; call on user interaction. */
  touchSession: () => void;

  // Exchanges
  exchanges: Exchange[];
  toggleExchange: (id: ExchangeId) => void;
  /**
   * Connect an exchange with REAL credentials: validates against the live API,
   * and on success encrypts + stores them in the credential vault.
   * Resolves with { ok, error } — never throws.
   */
  connectExchange: (
    id: ExchangeId,
    creds: ApiCredentials
  ) => Promise<{ ok: boolean; canWithdraw?: boolean; error?: string }>;
  /**
   * Re-validate an already-connected exchange's STORED credentials against the
   * live API — used to recover when the exchange drops the connection (key
   * marked ERROR) without making the user re-enter their API key/secret.
   * Resolves with { ok, error } — never throws.
   */
  reconnectExchange: (
    id: ExchangeId
  ) => Promise<{ ok: boolean; canWithdraw?: boolean; error?: string }>;
  disconnectExchange: (id: ExchangeId) => Promise<void>;
  connectedExchanges: Exchange[];
  /** Live balances fetched from connected exchanges (empty until refreshed). */
  liveBalances: Record<ExchangeId, BalanceMap>;
  /**
   * Pull fresh balances from all connected, live-supported exchanges.
   * Resolves with the merged balance map (live + mock fallback).
   */
  refreshBalances: () => Promise<Record<ExchangeId, BalanceMap>>;
  isRefreshingBalances: boolean;
  /** Per-asset amount totals across all connected exchanges (from live balances). */
  totalsByAsset: BalanceMap;
  /**
   * Per-asset USD totals. Priced CoinGecko-first (CoinGecko spot × amount),
   * falling back to the exchange-reported USD, then a static estimate. A value
   * is null only when none of those sources can price the asset.
   */
  totalsUsdByAsset: Record<string, number | null>;
  /** Sum of all priced USD values (null entries treated as 0). */
  totalPortfolioUsd: number;
  /**
   * Price a single (asset, amount) in USD using the CoinGecko-first chain:
   * CoinGecko spot → exchange-reported per-unit → static USD_PRICES. Returns
   * null when no source can price the asset. `exchangeUsd` is the exchange's
   * reported USD value for this exact amount (optional).
   */
  priceUsd: (asset: AssetSymbol, amount: number, exchangeUsd?: number | null) => number | null;
  /** Assets with a non-zero balance on a specific exchange (from live data). */
  heldAssetsForExchange: (id: ExchangeId) => AssetSymbol[];

  // Allocation config — destinations are configured PER EXCHANGE.
  allocations: AllocationTargets;
  /** Which exchange's coin set is currently being edited in Settings. */
  selectedExchangeId: ExchangeId | null;
  setSelectedExchangeId: (id: ExchangeId | null) => void;
  /** Per-asset destination config for one exchange (empty object if none). */
  allocationsForExchange: (id: ExchangeId) => Record<AssetSymbol, AllocationConfig>;
  /** Toggle whether a coin escapes from a specific exchange. */
  toggleAsset: (exchangeId: ExchangeId, asset: AssetSymbol) => void;
  /** Patch one (exchange, asset) destination config. */
  updateAllocation: (
    exchangeId: ExchangeId,
    asset: AssetSymbol,
    patch: Partial<AllocationConfig>
  ) => void;
  /** Apply a saved/whitelisted address as the destination for (exchange, asset). */
  applySavedAddress: (exchangeId: ExchangeId, asset: AssetSymbol, addr: SavedAddress) => void;
  /** Count of enabled coins for one exchange. */
  enabledCountForExchange: (id: ExchangeId) => number;

  // Whitelisted withdrawal addresses fetched from exchanges
  savedAddresses: Record<ExchangeId, SavedAddress[]>;
  isFetchingAddresses: Record<ExchangeId, boolean>;
  /** Pull the saved withdrawal-address book for one exchange. Never throws. */
  fetchWithdrawAddresses: (id: ExchangeId) => Promise<SavedAddress[]>;

  // Withdrawal networks/chains fetched per (exchange, asset)
  chainOptions: Record<ExchangeId, Record<AssetSymbol, ChainOption[]>>;
  /** In-flight chain fetches, keyed `${exchangeId}:${asset}`. */
  isFetchingChains: Record<string, boolean>;
  /** Fetch the available withdrawal chains for an (exchange, asset). Never throws. */
  fetchChains: (id: ExchangeId, asset: AssetSymbol) => Promise<ChainOption[]>;

  // Execution mode
  mode: ExecutionMode;
  setMode: (mode: ExecutionMode) => void;

  // Withdrawal execution
  isExecuting: boolean;
  lastResults: ExecutionResults | null;
  runEmergencyWithdrawal: () => Promise<ExecutionResults>;
  clearResults: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>(initialExchanges);
  const [allocations, setAllocations] = useState<AllocationTargets>(defaultAllocationTargets);
  const [selectedExchangeId, setSelectedExchangeId] = useState<ExchangeId | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<Record<ExchangeId, SavedAddress[]>>({});
  const [isFetchingAddresses, setIsFetchingAddresses] = useState<Record<ExchangeId, boolean>>({});
  const [chainOptions, setChainOptions] = useState<
    Record<ExchangeId, Record<AssetSymbol, ChainOption[]>>
  >({});
  const [isFetchingChains, setIsFetchingChains] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<ExecutionMode>(ExecutionMode.DRY_RUN);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResults, setLastResults] = useState<ExecutionResults | null>(null);
  // Detailed live balances (amount + exchange-sourced USD) keyed by exchange.
  const [liveDetailed, setLiveDetailed] = useState<Record<ExchangeId, BalanceMapDetailed>>({});
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);
  // CoinGecko USD spot prices by asset symbol, refreshed alongside balances.
  const [prices, setPrices] = useState<Record<string, number>>({});

  // Amount-only projection of the detailed live balances (for the engine/UI).
  const liveBalances = useMemo<Record<ExchangeId, BalanceMap>>(() => {
    const out: Record<ExchangeId, BalanceMap> = {};
    for (const [id, detailed] of Object.entries(liveDetailed)) {
      const m: BalanceMap = {};
      for (const [asset, d] of Object.entries(detailed)) m[asset] = d.amount;
      out[id] = m;
    }
    return out;
  }, [liveDetailed]);

  /**
   * The AES-256-GCM session key lives in a ref, never in React state — so it
   * is never serialized, logged, or persisted (Requirements 8.5 / 8.6). It is
   * cleared on sign-out / auto-logout.
   */
  const encryptionKeyRef = useRef<Uint8Array | null>(null);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Guards the persist-on-change effect so we don't overwrite saved allocations
   * with the in-memory default before the saved copy has been loaded at login.
   * Set true once hydration (or a deliberate fresh start) has completed.
   */
  const hasHydratedAllocations = useRef(false);

  // Detect an existing on-device account at startup.
  useEffect(() => {
    let cancelled = false;
    hasLocalAccount()
      .then((exists) => {
        if (!cancelled) setHasAccount(exists);
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
      inactivityTimer.current = null;
    }
  }, []);

  const signOut = useCallback(() => {
    clearInactivityTimer();
    // Wipe the decrypted key material from memory (Requirement 8.6).
    if (encryptionKeyRef.current) {
      encryptionKeyRef.current.fill(0);
      encryptionKeyRef.current = null;
    }
    setUsername(null);
    setIsAuthenticated(false);
    setLiveDetailed({});
    setPrices({});
    clearPriceCache();
    setChainOptions({});
    setIsFetchingChains({});
    // Reset in-memory session state so the NEXT login re-hydrates cleanly from
    // disk. Persisted credentials/allocations are NOT deleted here.
    setExchanges(initialExchanges);
    setAllocations(defaultAllocationTargets);
    hasHydratedAllocations.current = false;
  }, [clearInactivityTimer]);

  /**
   * Build an ExchangeManager bound to the in-memory session key. Returns null
   * if the session is locked (no key) — callers fall back to mock data.
   */
  const getManager = useCallback((): ExchangeManager | null => {
    const key = encryptionKeyRef.current;
    return key ? new ExchangeManager(key) : null;
  }, []);

  /** (Re)start the 15-minute inactivity countdown (Requirement 9.2). */
  const touchSession = useCallback(() => {
    if (!isAuthenticated) return;
    clearInactivityTimer();
    inactivityTimer.current = setTimeout(() => {
      signOut();
    }, SESSION_TIMEOUT_MS);
  }, [isAuthenticated, clearInactivityTimer, signOut]);

  /**
   * Restore persisted setup after a session key is available: the saved coin
   * selection and the previously-connected exchanges (re-validated live in the
   * background). Best-effort — never throws into the login flow.
   */
  const restoreSession = useCallback(async (key: Uint8Array) => {
    // 1. Coin selection (allocations). Load BEFORE flipping the hydration guard
    //    so the persist-on-change effect can't clobber it with the default.
    try {
      const saved = await loadAllocations();
      if (saved) setAllocations(saved);
    } catch {
      // Ignore — fall back to the default selection.
    } finally {
      hasHydratedAllocations.current = true;
    }

    // 2. Connected exchanges. Restore each id that has stored credentials,
    //    showing the masked key, then re-validate live.
    let ids: string[] = [];
    try {
      ids = await listStoredCredentialExchanges();
    } catch {
      ids = [];
    }
    if (ids.length === 0) return;

    const masks = await Promise.all(
      ids.map(async (id) => {
        try {
          const creds = await retrieveCredentials(id, key);
          if (!creds) return null;
          const masked =
            creds.apiKey.length > 4
              ? `••••••${creds.apiKey.slice(-4).toUpperCase()}`
              : '••••••KEY';
          return [id, masked] as const;
        } catch {
          return null;
        }
      })
    );
    const maskById = new Map(masks.filter(Boolean) as (readonly [string, string])[]);
    if (maskById.size === 0) return;

    setExchanges((prev) =>
      prev.map((ex) =>
        maskById.has(ex.id)
          ? {
              ...ex,
              isConnected: true,
              connectionStatus: ConnectionStatus.CONNECTED,
              apiKeyMasked: maskById.get(ex.id),
            }
          : ex
      )
    );

    // 3. Background re-validation: confirm each restored key still works.
    //    Inlined setExchanges (rather than the setStatus callback) to avoid a
    //    forward reference + keep this callback dependency-free.
    const markError = (id: string) =>
      setExchanges((prev) =>
        prev.map((ex) => (ex.id === id ? { ...ex, connectionStatus: ConnectionStatus.ERROR } : ex))
      );
    const manager = new ExchangeManager(key);
    await Promise.all(
      [...maskById.keys()].map(async (id) => {
        if (!isLiveSupported(id)) return;
        try {
          const test = await manager.testConnection(id);
          if (!test.ok) markError(id);
        } catch {
          markError(id);
        }
      })
    );
  }, []);

  const beginSession = useCallback(
    (name: string, key: Uint8Array) => {
      encryptionKeyRef.current = key;
      setUsername(name);
      setHasAccount(true);
      setIsAuthenticated(true);
      clearInactivityTimer();
      inactivityTimer.current = setTimeout(() => signOut(), SESSION_TIMEOUT_MS);
      // Best-effort restore of saved setup; runs after state is set.
      void restoreSession(key);
    },
    [clearInactivityTimer, signOut, restoreSession]
  );

  const login = useCallback(
    async (name: string, password: string) => {
      const { username: uname, encryptionKey } = await localLogin(name, password);
      beginSession(uname, encryptionKey);
    },
    [beginSession]
  );

  const register = useCallback(
    async (name: string, password: string) => {
      const { username: uname, encryptionKey } = await localRegister(name, password);
      beginSession(uname, encryptionKey);
    },
    [beginSession]
  );

  // Clean up any pending timer on unmount.
  useEffect(() => clearInactivityTimer, [clearInactivityTimer]);

  const toggleExchange = useCallback((id: ExchangeId) => {
    setExchanges((prev) =>
      prev.map((ex) =>
        ex.id === id
          ? {
              ...ex,
              isConnected: !ex.isConnected,
              connectionStatus: !ex.isConnected
                ? ConnectionStatus.CONNECTED
                : ConnectionStatus.DISCONNECTED,
              lastSyncTime: !ex.isConnected ? Date.now() : ex.lastSyncTime,
            }
          : ex
      )
    );
  }, []);

  const setStatus = useCallback((id: ExchangeId, status: ConnectionStatus) => {
    setExchanges((prev) =>
      prev.map((ex) => (ex.id === id ? { ...ex, connectionStatus: status } : ex))
    );
  }, []);

  const connectExchange = useCallback(
    async (id: ExchangeId, creds: ApiCredentials) => {
      const manager = getManager();
      if (!manager) {
        return { ok: false, error: 'Session locked — sign in again to connect exchanges.' };
      }
      if (!isLiveSupported(id)) {
        return { ok: false, error: 'Live connection is not yet supported for this exchange.' };
      }

      setStatus(id, ConnectionStatus.CONNECTING);
      try {
        // Persist first so the manager can build an adapter, then validate live.
        await storeCredentials(id, creds, encryptionKeyRef.current!);
        const test = await manager.testConnection(id);
        if (!test.ok) {
          await deleteCredentials(id);
          setStatus(id, ConnectionStatus.ERROR);
          return { ok: false, error: test.errorMessage ?? 'Connection test failed.' };
        }

        const masked =
          creds.apiKey.length > 4
            ? `••••••${creds.apiKey.slice(-4).toUpperCase()}`
            : '••••••KEY';
        setExchanges((prev) =>
          prev.map((ex) =>
            ex.id === id
              ? {
                  ...ex,
                  isConnected: true,
                  connectionStatus: ConnectionStatus.CONNECTED,
                  lastSyncTime: Date.now(),
                  apiKeyMasked: masked,
                }
              : ex
          )
        );
        return { ok: true, canWithdraw: test.canWithdraw };
      } catch (e) {
        await deleteCredentials(id).catch(() => {});
        setStatus(id, ConnectionStatus.ERROR);
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [getManager, setStatus]
  );

  const reconnectExchange = useCallback(
    async (id: ExchangeId) => {
      const manager = getManager();
      if (!manager) {
        return { ok: false, error: 'Session locked — sign in again to reconnect exchanges.' };
      }
      if (!isLiveSupported(id)) {
        return { ok: false, error: 'Live connection is not supported for this exchange.' };
      }

      setStatus(id, ConnectionStatus.CONNECTING);
      try {
        // Re-validate the STORED credentials — no re-entry of key/secret needed.
        const connectable = await manager.isConnectable(id);
        if (!connectable) {
          setStatus(id, ConnectionStatus.ERROR);
          return {
            ok: false,
            error: 'No stored credentials for this exchange — connect it again.',
          };
        }
        const test = await manager.testConnection(id);
        if (!test.ok) {
          setStatus(id, ConnectionStatus.ERROR);
          return { ok: false, error: test.errorMessage ?? 'Connection test failed.' };
        }
        setExchanges((prev) =>
          prev.map((ex) =>
            ex.id === id
              ? {
                  ...ex,
                  isConnected: true,
                  connectionStatus: ConnectionStatus.CONNECTED,
                  lastSyncTime: Date.now(),
                }
              : ex
          )
        );
        return { ok: true, canWithdraw: test.canWithdraw };
      } catch (e) {
        setStatus(id, ConnectionStatus.ERROR);
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [getManager, setStatus]
  );

  const disconnectExchange = useCallback(async (id: ExchangeId) => {
    await deleteCredentials(id).catch(() => {});
    setLiveDetailed((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setExchanges((prev) =>
      prev.map((ex) =>
        ex.id === id
          ? {
              ...ex,
              isConnected: false,
              connectionStatus: ConnectionStatus.DISCONNECTED,
              apiKeyMasked: undefined,
            }
          : ex
      )
    );
  }, []);

  const allocationsForExchange = useCallback(
    (id: ExchangeId): Record<AssetSymbol, AllocationConfig> =>
      allocations.byExchange[id] ?? {},
    [allocations]
  );

  const updateAllocation = useCallback(
    (exchangeId: ExchangeId, asset: AssetSymbol, patch: Partial<AllocationConfig>) => {
      setAllocations((prev) => {
        const exCfg = prev.byExchange[exchangeId] ?? {};
        const existing = exCfg[asset] ?? newAllocationConfig();
        return {
          ...prev,
          byExchange: {
            ...prev.byExchange,
            [exchangeId]: { ...exCfg, [asset]: { ...existing, ...patch } },
          },
        };
      });
    },
    []
  );

  const toggleAsset = useCallback((exchangeId: ExchangeId, asset: AssetSymbol) => {
    setAllocations((prev) => {
      const exCfg = prev.byExchange[exchangeId] ?? {};
      const existing = exCfg[asset];
      const nextCfg: AllocationConfig = existing
        ? { ...existing, enabled: !existing.enabled }
        : newAllocationConfig();
      return {
        ...prev,
        byExchange: {
          ...prev.byExchange,
          [exchangeId]: { ...exCfg, [asset]: nextCfg },
        },
      };
    });
  }, []);

  const applySavedAddress = useCallback(
    (exchangeId: ExchangeId, asset: AssetSymbol, addr: SavedAddress) => {
      setAllocations((prev) => {
        const exCfg = prev.byExchange[exchangeId] ?? {};
        const existing = exCfg[asset] ?? newAllocationConfig();
        return {
          ...prev,
          byExchange: {
            ...prev.byExchange,
            [exchangeId]: {
              ...exCfg,
              [asset]: {
                ...existing,
                enabled: true,
                address: addr.address,
                krakenKey: addr.krakenKey ?? '',
                network: addr.network,
                memo: addr.memo,
              },
            },
          },
        };
      });
    },
    []
  );

  const enabledCountForExchange = useCallback(
    (id: ExchangeId): number =>
      Object.values(allocations.byExchange[id] ?? {}).filter((c) => c.enabled).length,
    [allocations]
  );

  const fetchWithdrawAddresses = useCallback(
    async (id: ExchangeId): Promise<SavedAddress[]> => {
      const manager = getManager();
      if (!manager) return [];
      setIsFetchingAddresses((p) => ({ ...p, [id]: true }));
      try {
        const list = await manager.fetchWithdrawAddresses(id);
        setSavedAddresses((p) => ({ ...p, [id]: list }));
        return list;
      } finally {
        setIsFetchingAddresses((p) => ({ ...p, [id]: false }));
      }
    },
    [getManager]
  );

  const fetchChains = useCallback(
    async (id: ExchangeId, asset: AssetSymbol): Promise<ChainOption[]> => {
      const manager = getManager();
      if (!manager) return [];
      const key = `${id}:${asset}`;
      setIsFetchingChains((p) => ({ ...p, [key]: true }));
      try {
        const list = await manager.fetchChains(id, asset);
        setChainOptions((p) => ({ ...p, [id]: { ...(p[id] ?? {}), [asset]: list } }));
        return list;
      } finally {
        setIsFetchingChains((p) => ({ ...p, [key]: false }));
      }
    },
    [getManager]
  );

  const connectedExchanges = useMemo(
    () => exchanges.filter((ex) => ex.isConnected),
    [exchanges]
  );

  // Persist the emergency coin selection whenever it changes — but only after
  // the saved copy has been hydrated at login, so we never overwrite stored
  // data with the in-memory default. Best-effort; storage errors are ignored.
  useEffect(() => {
    if (!isAuthenticated || !hasHydratedAllocations.current) return;
    void saveAllocations(allocations).catch(() => {});
  }, [allocations, isAuthenticated]);

  // Keep the Settings exchange selector pointed at a valid connected exchange:
  // default to the first connected one, and clear/repoint if it disconnects.
  useEffect(() => {
    const ids = connectedExchanges.map((ex) => ex.id);
    setSelectedExchangeId((cur) => {
      if (cur && ids.includes(cur)) return cur;
      return ids[0] ?? null;
    });
  }, [connectedExchanges]);

  /**
   * Display view of balances: prefer LIVE balances pulled from the exchange;
   * fall back to mock data for connected exchanges we have no live data for
   * (the demo "binance/coinbase/kraken" seed before a refresh).
   */
  const displayBalances = useMemo(() => {
    const result: Record<ExchangeId, BalanceMap> = {};
    for (const ex of connectedExchanges) {
      if (liveBalances[ex.id]) result[ex.id] = liveBalances[ex.id];
      else if (mockBalances[ex.id]) result[ex.id] = mockBalances[ex.id];
    }
    return result;
  }, [connectedExchanges, liveBalances]);

  /** Sum each asset across all connected exchanges for the panic-screen view. */
  const totalsByAsset = useMemo(() => {
    const totals: BalanceMap = {};
    for (const balanceMap of Object.values(displayBalances)) {
      for (const [asset, amount] of Object.entries(balanceMap)) {
        if (amount > 0) totals[asset] = (totals[asset] ?? 0) + amount;
      }
    }
    return totals;
  }, [displayBalances]);

  /**
   * Price one (asset, amount) in USD, CoinGecko-first:
   *   1. CoinGecko spot × amount (consistent valuation across exchanges);
   *   2. the exchange-reported USD value for this amount (if provided);
   *   3. a static estimate from USD_PRICES.
   * Returns null when no source can price the asset.
   */
  const priceUsd = useCallback(
    (asset: AssetSymbol, amount: number, exchangeUsd?: number | null): number | null => {
      const gecko = prices[asset.toUpperCase()];
      if (gecko != null && gecko > 0) return gecko * amount;
      if (exchangeUsd != null) return exchangeUsd;
      const stat = USD_PRICES[asset];
      if (stat != null) return stat * amount;
      return null;
    },
    [prices]
  );

  /**
   * Total amount AND exchange-reported USD per asset, summed across exchanges.
   * (Exchange USD is retained as the fallback price source.)
   */
  const exchangeUsdByAsset = useMemo(() => {
    const totals: Record<string, number | null> = {};
    for (const detailed of Object.values(liveDetailed)) {
      for (const [asset, d] of Object.entries(detailed)) {
        if (d.amount <= 0) continue;
        if (d.usdValue == null) {
          if (!(asset in totals)) totals[asset] = null;
        } else {
          totals[asset] = (totals[asset] ?? 0) + d.usdValue;
        }
      }
    }
    return totals;
  }, [liveDetailed]);

  /**
   * Per-asset USD totals, priced CoinGecko-first (see priceUsd), falling back to
   * the summed exchange-reported USD, then a static estimate. Null only when no
   * source can price the asset.
   */
  const totalsUsdByAsset = useMemo(() => {
    const totals: Record<string, number | null> = {};
    for (const [asset, amount] of Object.entries(totalsByAsset)) {
      totals[asset] = priceUsd(asset, amount, exchangeUsdByAsset[asset] ?? null);
    }
    return totals;
  }, [totalsByAsset, exchangeUsdByAsset, priceUsd]);

  /** Sum of all priced USD values (null entries treated as 0). */
  const totalPortfolioUsd = useMemo(
    () =>
      Object.values(totalsUsdByAsset).reduce<number>(
        (sum, v) => sum + (v ?? 0),
        0
      ),
    [totalsUsdByAsset]
  );

  /** Assets with a non-zero balance on a specific exchange (from live data). */
  const heldAssetsForExchange = useCallback(
    (id: ExchangeId): AssetSymbol[] => {
      const detailed = liveDetailed[id];
      if (!detailed) return [];
      return Object.entries(detailed)
        .filter(([, d]) => d.amount > 0)
        .map(([asset]) => asset);
    },
    [liveDetailed]
  );

  /**
   * Pull fresh balances from every connected, live-supported exchange.
   * Returns the merged balance map (live where available, mock fallback for
   * demo-seed exchanges) so callers can act on fresh data immediately.
   */
  const refreshBalances = useCallback(async (): Promise<Record<ExchangeId, BalanceMap>> => {
    const manager = getManager();
    const liveIds = connectedExchanges.map((ex) => ex.id).filter(isLiveSupported);

    let fetched: Record<ExchangeId, BalanceMapDetailed> = {};
    if (manager && liveIds.length > 0) {
      setIsRefreshingBalances(true);
      try {
        fetched = await manager.fetchBalancesDetailed(liveIds);
        setLiveDetailed((prev) => ({ ...prev, ...fetched }));
        const now = Date.now();
        setExchanges((prev) =>
          prev.map((ex) => (fetched[ex.id] ? { ...ex, lastSyncTime: now } : ex))
        );
      } finally {
        setIsRefreshingBalances(false);
      }
    }

    // Build the amount-only merged view for the caller (don't wait on a re-render).
    const merged: Record<ExchangeId, BalanceMap> = {};
    for (const ex of connectedExchanges) {
      if (fetched[ex.id]) {
        const m: BalanceMap = {};
        for (const [asset, d] of Object.entries(fetched[ex.id])) m[asset] = d.amount;
        merged[ex.id] = m;
      } else if (liveBalances[ex.id]) {
        merged[ex.id] = liveBalances[ex.id];
      } else if (mockBalances[ex.id]) {
        merged[ex.id] = mockBalances[ex.id];
      }
    }

    // Refresh CoinGecko USD prices for every held symbol so balances are valued
    // consistently across exchanges. Fire-and-forget into state (cached 3 min);
    // failures simply leave prices to fall back to exchange/static sources.
    const heldSymbols = new Set<string>();
    for (const m of Object.values(merged)) {
      for (const [asset, amount] of Object.entries(m)) {
        if (amount > 0) heldSymbols.add(asset);
      }
    }
    if (heldSymbols.size > 0) {
      void fetchPrices([...heldSymbols])
        .then((p) => {
          if (Object.keys(p).length > 0) setPrices((prev) => ({ ...prev, ...p }));
        })
        .catch(() => {});
    }

    return merged;
  }, [getManager, connectedExchanges, liveBalances]);

  const runEmergencyWithdrawal = useCallback(async () => {
    setIsExecuting(true);
    try {
      // A panic withdraws EVERYTHING: pull the freshest balances we can, then
      // build a plan that drains the full available amount of every enabled
      // asset to its configured per-asset recipient (address / Kraken key).
      const balances = await refreshBalances();
      const plan = buildFullWithdrawalPlan(balances, allocations, mode);

      if (mode === ExecutionMode.DRY_RUN) {
        const results = simulateWithdrawal(plan, balances);
        setLastResults(results);
        return results;
      }

      // REAL_WITHDRAWAL: use the live executor when a session manager exists and
      // at least one request targets a live-connected exchange; otherwise fall
      // back to the mock executor (demo seed exchanges with no stored creds).
      const manager = getManager();
      const hasLiveTarget =
        manager != null &&
        (await Promise.all(plan.requests.map((r) => manager.isConnectable(r.exchangeId)))).some(
          Boolean
        );

      const results =
        manager && hasLiveTarget
          ? await executeWithdrawalPlanLive(plan, manager)
          : await executeWithdrawalPlan(plan, balances);
      setLastResults(results);
      return results;
    } finally {
      setIsExecuting(false);
    }
  }, [refreshBalances, allocations, mode, getManager]);

  const clearResults = useCallback(() => setLastResults(null), []);

  const value: AppState = {
    isAuthenticated,
    authChecked,
    hasAccount,
    username,
    login,
    register,
    signOut,
    touchSession,
    exchanges,
    toggleExchange,
    connectExchange,
    reconnectExchange,
    disconnectExchange,
    connectedExchanges,
    liveBalances,
    refreshBalances,
    isRefreshingBalances,
    totalsByAsset,
    totalsUsdByAsset,
    totalPortfolioUsd,
    priceUsd,
    heldAssetsForExchange,
    allocations,
    selectedExchangeId,
    setSelectedExchangeId,
    allocationsForExchange,
    toggleAsset,
    updateAllocation,
    applySavedAddress,
    enabledCountForExchange,
    savedAddresses,
    isFetchingAddresses,
    fetchWithdrawAddresses,
    chainOptions,
    isFetchingChains,
    fetchChains,
    mode,
    setMode,
    isExecuting,
    lastResults,
    runEmergencyWithdrawal,
    clearResults,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppStore(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppStore must be used within AppProvider');
  return ctx;
}
