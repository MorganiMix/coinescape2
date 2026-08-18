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
  buildExport,
  createProfile as createProfileStore,
  deleteCredentials,
  deleteProfile as deleteProfileStore,
  encryptApiCredentials,
  detectFreshInstall,
  hasAccount as hasLocalAccount,
  hasLegacyAccount,
  getStoredSetupIp,
  listStoredCredentialExchanges,
  setStoredSetupIp,
  loadAllocations,
  loadRegistry,
  enrollVault,
  attachPinToVault,
  unlockVaultWithPin,
  unlockVaultWithBiometric,
  needsPinSetup as needsPinSetupCheck,
  changePin as changePinStore,
  getPinLockout,
  enableBiometric,
  disableBiometric,
  adoptLegacyBiometricEnrolment,
  isBiometricEnabled,
  getBiometricCapability,
  type BiometricUnlockResult,
  migrateLegacyAccount,
  abandonUnrecoverableCredentials,
  MAX_PROFILES,
  overwriteProfile,
  parseImport,
  randomDigits,
  ProfileMeta,
  ProfilePayload,
  ProfileSnapshot,
  renameProfile as renameProfileStore,
  retrieveCredentials,
  saveAllocations,
  storeCredentials,
  switchProfile as switchProfileStore,
  wipeAllSecureStoreEntries,
} from '@/security';
// Aliased: `AppState` is also the name of this store's own state interface.
import { AppState as RNAppState } from 'react-native';
import {
  defaultAllocationTargets,
  initialExchanges,
  mockBalances,
  newAllocationConfig,
} from '@/domain/mockData';
import { clearPriceCache, fetchPrices } from '@/domain/coingecko';
import { fetchExternalIp } from '@/domain/network';
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

/**
 * How long the app may sit in the background before returning requires the PIN
 * again. Short enough that a phone left on a table re-locks, long enough to
 * survive the app switch you make to paste a withdrawal address.
 */
const BACKGROUND_LOCK_MS = 60 * 1000;

/** Digits in a one-time profile-transfer code. */
const TRANSFER_CODE_LENGTH = 6;

interface AppState {
  // Auth (local-only — 6-digit PIN, with biometrics as an optional shortcut)
  isAuthenticated: boolean;
  /** Whether the on-device account check has finished (avoids redirect flash). */
  authChecked: boolean;
  /** True once a vault has been enrolled on this device. */
  hasAccount: boolean;
  /** True when a pre-biometric password account is present and needs migrating. */
  needsMigration: boolean;
  /**
   * True when a vault exists but has no PIN — an install from a pre-PIN build.
   * The user unlocks with biometrics once more, then must choose a PIN before
   * reaching the app, so the vault stops depending on a key the OS can destroy.
   */
  needsPinSetup: boolean;
  /** True once the biometric shortcut is switched on for this vault. */
  biometricEnabled: boolean;
  /** True when this device can hold a biometric-gated key at all. */
  biometricAvailable: boolean;
  /** What to call it here: "Face ID", "Touch ID", "fingerprint"… */
  biometricLabel: string;
  /** Epoch ms until which PIN entry is refused; 0 when not locked out. */
  pinLockedUntil: number;
  /**
   * Unlock with the 6-digit PIN. Throws WrongPinError / PinLockedOutError.
   * Also silently repairs the biometric copy if a prior attempt found it
   * destroyed by a biometric re-enrolment.
   */
  unlockWithPin: (pin: string) => Promise<void>;
  /**
   * Try the biometric shortcut. Never throws — resolves with the reason it
   * didn't work so the caller can fall back to the PIN pad.
   */
  unlockWithBiometrics: () => Promise<BiometricUnlockResult>;
  /** First-run: create the vault under a new PIN, then sign in. */
  enroll: (pin: string) => Promise<void>;
  /** Attach a PIN to a pre-PIN vault that was just unlocked, then sign in. */
  completePinSetup: (pin: string) => Promise<void>;
  /** Change the vault PIN. Throws WrongPinError / WeakPinError. */
  changeVaultPin: (currentPin: string, newPin: string) => Promise<void>;
  /**
   * Turn the biometric shortcut on or off. Turning it on requires an unlocked
   * session (it stores a copy of the live key) and shows a prompt on Android.
   */
  setBiometricEnabled: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
  /**
   * One-time migration of a legacy password account: re-wraps all credentials
   * under a new master key and protects it with the chosen PIN.
   */
  migrate: (password: string, pin: string) => Promise<void>;
  /**
   * Recovery for a vault left unreadable by an interrupted pre-fix upgrade:
   * finish the migration, permanently discarding the credentials that decrypt
   * under no available key. Requires explicit user confirmation at the call
   * site. Resolves with the exchange ids that were dropped.
   */
  abandonMigration: (password: string, pin: string) => Promise<string[]>;
  /**
   * Escape hatch for a device whose vault key is gone (Android invalidates it
   * when a new fingerprint is enrolled). Wipes everything and returns the app
   * to first-run enrolment. Destructive — confirm with the user first.
   */
  resetVault: () => Promise<void>;
  signOut: () => void;
  /** Reset the inactivity timer; call on user interaction. */
  touchSession: () => void;
  /**
   * Verify the PIN of the *current* session without ending it — for actions
   * that need re-authentication (exporting a profile's decrypted credentials).
   * Resolves true when the PIN is correct.
   */
  verifyPin: (pin: string) => Promise<boolean>;

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

  // ── IP whitelisting ──
  /** The device's current external IP (null while detecting / on failure). */
  currentIp: string | null;
  /** Per-exchange IP the key was set up from (for whitelist-change warnings). */
  setupIpByExchange: Record<ExchangeId, string>;
  /** Re-detect the current external IP. */
  refreshCurrentIp: () => Promise<void>;
  /**
   * True when we know the current IP AND a saved setup IP for this exchange and
   * they differ — i.e. the user likely needs to re-whitelist. False if either
   * is unknown (never warn on missing data).
   */
  ipChangedForExchange: (id: ExchangeId) => boolean;
  /** Record the current IP as this exchange's setup IP (clears the warning). */
  updateSetupIp: (id: ExchangeId) => Promise<void>;
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

  // Profiles — up to MAX_PROFILES independent exchange+coin setups.
  /** All saved profiles (the active one's data lives in the live vault keys). */
  profiles: ProfileMeta[];
  /** Id of the currently-active profile. */
  activeProfileId: string | null;
  /** Maximum number of profiles allowed. */
  maxProfiles: number;
  /** Switch to another saved profile, then rehydrate the session from it. */
  switchProfile: (id: string) => Promise<void>;
  /** Rename a profile. */
  renameProfile: (id: string, name: string) => Promise<void>;
  /**
   * Delete a profile. Rejects deleting the last remaining profile. When the
   * active profile is deleted, another is promoted and loaded. Resolves with
   * { ok, error }.
   */
  deleteProfile: (id: string) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Create a fresh (empty) profile and switch to it. Rejects when already at
   * the profile cap. Resolves with { ok, error }.
   */
  createProfile: (name: string) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Export the ACTIVE profile as an encrypted transfer string (to be rendered
   * as a QR code).
   *
   * Re-authenticates with the vault PIN, then encrypts the payload under a
   * freshly generated one-time transfer code which is returned for display
   * beside the QR. The vault PIN itself is never used as the payload key: the
   * QR leaves the device, and a photographed QR encrypted under the login PIN
   * would put that PIN inside a 10^6 offline search.
   *
   * Resolves with { ok, text?, code?, error? }.
   */
  exportActiveProfile: (
    pin: string
  ) => Promise<{ ok: boolean; text?: string; code?: string; error?: string }>;
  /**
   * Import an encrypted profile from a scanned QR string + the transfer code it
   * was exported under. Lands in `overwriteId` if given, else a free slot.
   * Resolves with { ok, needsSlot? (all slots full), error? }.
   */
  importProfileFromText: (
    text: string,
    code: string,
    overwriteId?: string
  ) => Promise<{ ok: boolean; needsSlot?: boolean; error?: string }>;

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
  /**
   * True when the in-memory coin selection differs from what was last saved to
   * disk. Drives the "save your changes?" prompt when leaving Settings.
   */
  allocationsDirty: boolean;
  /** Persist the current coin selection to disk and mark it as the saved state. */
  saveAllocationsNow: () => Promise<void>;
  /** Discard unsaved edits, restoring the last-saved coin selection everywhere. */
  revertAllocations: () => void;

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
  const [needsMigration, setNeedsMigration] = useState(false);
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [pinLockedUntil, setPinLockedUntil] = useState(0);
  const [exchanges, setExchanges] = useState<Exchange[]>(initialExchanges);
  // External IP tracking for API-key IP-whitelist warnings.
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const [setupIpByExchange, setSetupIpByExchange] = useState<Record<ExchangeId, string>>({});
  const [allocations, setAllocations] = useState<AllocationTargets>(defaultAllocationTargets);
  // Serialized snapshot of the LAST-SAVED coin selection. Edits update
  // `allocations` (in memory) immediately, but are only written to disk on an
  // explicit save; comparing against this snapshot tells us if there are unsaved
  // changes and lets us revert. Seeded on login-restore and profile switch.
  const [savedAllocationsJson, setSavedAllocationsJson] = useState<string>(() =>
    JSON.stringify(defaultAllocationTargets)
  );
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
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
   * Master key recovered by a pre-PIN install's final biometric unlock, held
   * only until the user picks a PIN. Not a session key — the user is not
   * authenticated until `completePinSetup` runs.
   */
  const pendingKeyRef = useRef<Uint8Array | null>(null);
  /**
   * Set when a biometric unlock found its stored key destroyed (a re-enrolment
   * or a restore onto another device). The next successful PIN unlock rewrites
   * it, which is what turns the old permanent lockout into a silent repair. We
   * only rewrite when we know it's broken: on Android an auth-gated write shows
   * a prompt, so doing it after every PIN unlock would be its own annoyance.
   */
  const biometricNeedsRepair = useRef(false);
  /**
   * Guards the persist-on-change effect so we don't overwrite saved allocations
   * with the in-memory default before the saved copy has been loaded at login.
   * Set true once hydration (or a deliberate fresh start) has completed.
   */
  const hasHydratedAllocations = useRef(false);

  // Detect an existing on-device account at startup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // iOS Keychain can persist entries across app uninstalls, so on a
        // fresh install the keychain may still report an existing account.
        // AsyncStorage lives in the app sandbox and IS wiped on iOS uninstall,
        // so we use it as the source of truth for "have we ever run before?".
        if (await detectFreshInstall()) {
          await wipeAllSecureStoreEntries();
        }
        const exists = await hasLocalAccount();
        const legacy = exists ? false : await hasLegacyAccount();
        const pinPending = exists ? await needsPinSetupCheck() : false;
        // A vault with no PIN predates PINs entirely, so its master key is in
        // the biometric slot whether or not the (newer) opt-in flag says so.
        // Backfill it, or the PIN-setup screen has no way to reach that key.
        if (pinPending) await adoptLegacyBiometricEnrolment();
        const [bioOn, capability, lockout] = await Promise.all([
          isBiometricEnabled(),
          getBiometricCapability(),
          getPinLockout(),
        ]);
        if (!cancelled) {
          setHasAccount(exists);
          setNeedsMigration(legacy);
          setNeedsPinSetup(pinPending);
          setBiometricEnabledState(bioOn);
          setBiometricAvailable(capability.available);
          setBiometricLabel(capability.label);
          setPinLockedUntil(lockout.lockedUntil);
        }
      } catch {
        // If the detection itself fails, fall back to the marker check so the
        // user can still unlock an existing vault.
        try {
          const exists = await hasLocalAccount();
          if (!cancelled) setHasAccount(exists);
        } catch {
          if (!cancelled) setHasAccount(false);
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
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
    setIsAuthenticated(false);
    setLiveDetailed({});
    setPrices({});
    clearPriceCache();
    setChainOptions({});
    setIsFetchingChains({});
    // Reset in-memory session state so the NEXT login re-hydrates cleanly from
    // disk. Persisted credentials/allocations are NOT deleted here.
    setExchanges(initialExchanges);
    setSetupIpByExchange({});
    setCurrentIp(null);
    setAllocations(defaultAllocationTargets);
    setSavedAllocationsJson(JSON.stringify(defaultAllocationTargets));
    setProfiles([]);
    setActiveProfileId(null);
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
    // 0. Profile registry. Creates a default "Profile 1" on first run and
    //    adopts any pre-profiles live setup into it. Best-effort.
    try {
      const registry = await loadRegistry();
      setProfiles(registry.profiles);
      setActiveProfileId(registry.activeId);
    } catch {
      setProfiles([]);
      setActiveProfileId(null);
    }

    // 1. Coin selection (allocations). Seed both the in-memory state and the
    //    saved-snapshot baseline so a freshly-loaded config is NOT seen as
    //    "dirty" (no spurious save prompt on first visit to Settings).
    try {
      const saved = await loadAllocations();
      if (saved) {
        setAllocations(saved);
        setSavedAllocationsJson(JSON.stringify(saved));
      } else {
        setSavedAllocationsJson(JSON.stringify(defaultAllocationTargets));
      }
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

    // Load each exchange's recorded setup IP, and detect the current IP in the
    // background, so the UI can warn when the whitelisted IP has changed.
    try {
      const pairs = await Promise.all(
        ids.map(async (id) => [id, await getStoredSetupIp(id)] as const)
      );
      const map: Record<string, string> = {};
      for (const [id, ip] of pairs) if (ip) map[id] = ip;
      setSetupIpByExchange(map);
    } catch {
      // Non-fatal — no warnings if we can't read setup IPs.
    }
    void fetchExternalIp()
      .then((ip) => ip && setCurrentIp(ip))
      .catch(() => {});

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
    (key: Uint8Array) => {
      encryptionKeyRef.current = key;
      setHasAccount(true);
      setNeedsMigration(false);
      setIsAuthenticated(true);
      clearInactivityTimer();
      inactivityTimer.current = setTimeout(() => signOut(), SESSION_TIMEOUT_MS);
      // Best-effort restore of saved setup; runs after state is set.
      void restoreSession(key);
    },
    [clearInactivityTimer, signOut, restoreSession]
  );

  /**
   * Unlock with the PIN — the path that always works, whatever the OS has done
   * to the biometric key since last launch.
   */
  const unlockWithPin = useCallback(
    async (pin: string) => {
      try {
        const { encryptionKey } = await unlockVaultWithPin(pin);
        setPinLockedUntil(0);
        // Rebuild a biometric copy the OS destroyed, so the shortcut the user
        // switched on keeps working from the next launch without them ever
        // being told it broke. Best-effort: a refused prompt just means we try
        // again next time.
        if (biometricNeedsRepair.current) {
          biometricNeedsRepair.current = false;
          await enableBiometric(encryptionKey).catch(() => {});
        }
        beginSession(encryptionKey);
      } catch (e) {
        // Keep the countdown in the UI in step with the persisted lockout.
        const lockout = await getPinLockout().catch(() => null);
        if (lockout) setPinLockedUntil(lockout.lockedUntil);
        throw e;
      }
    },
    [beginSession]
  );

  /**
   * Try the biometric shortcut. Never throws: on any failure the caller simply
   * leaves the PIN pad on screen.
   *
   * A pre-PIN install lands in `needsPinSetup`, so a successful read here parks
   * the key in `pendingKeyRef` and waits for the user to choose a PIN rather
   * than starting a session.
   */
  const unlockWithBiometrics = useCallback(async (): Promise<BiometricUnlockResult> => {
    const result = await unlockVaultWithBiometric();
    if (!result.ok) {
      if (result.reason === 'invalidated') biometricNeedsRepair.current = true;
      return result;
    }
    if (needsPinSetup) {
      pendingKeyRef.current = result.masterKey;
      return result;
    }
    beginSession(result.masterKey);
    return result;
  }, [beginSession, needsPinSetup]);

  /** First-run: create the vault under a new PIN, then start the session. */
  const enroll = useCallback(
    async (pin: string) => {
      const { encryptionKey } = await enrollVault(pin);
      beginSession(encryptionKey);
    },
    [beginSession]
  );

  /**
   * Give a pre-PIN vault a PIN, using the key its final biometric unlock
   * recovered. Re-encrypts nothing — the same master key is simply wrapped a
   * second way, so every stored credential stays exactly as it was.
   */
  const completePinSetup = useCallback(
    async (pin: string) => {
      const key = pendingKeyRef.current;
      if (!key) throw new Error('Unlock the vault before choosing a PIN.');
      await attachPinToVault(pin, key);
      pendingKeyRef.current = null;
      setNeedsPinSetup(false);
      beginSession(key);
    },
    [beginSession]
  );

  /** Change the vault PIN (re-wraps the same master key under a new one). */
  const changeVaultPin = useCallback(async (currentPin: string, newPin: string) => {
    await changePinStore(currentPin, newPin);
    setPinLockedUntil(0);
  }, []);

  /** Verify the current PIN without disturbing the session. */
  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const { encryptionKey } = await unlockVaultWithPin(pin);
      encryptionKey.fill(0);
      setPinLockedUntil(0);
      return true;
    } catch {
      const lockout = await getPinLockout().catch(() => null);
      if (lockout) setPinLockedUntil(lockout.lockedUntil);
      return false;
    }
  }, []);

  /** Turn the biometric shortcut on or off for the current vault. */
  const setBiometricEnabled = useCallback(
    async (enabled: boolean): Promise<{ ok: boolean; error?: string }> => {
      if (!enabled) {
        await disableBiometric();
        biometricNeedsRepair.current = false;
        setBiometricEnabledState(false);
        return { ok: true };
      }
      const key = encryptionKeyRef.current;
      if (!key) return { ok: false, error: 'Session locked — sign in again.' };
      try {
        await enableBiometric(key);
        biometricNeedsRepair.current = false;
        setBiometricEnabledState(true);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    []
  );

  /** One-time migration of a legacy password account to the PIN vault. */
  const migrate = useCallback(
    async (password: string, pin: string) => {
      const { encryptionKey } = await migrateLegacyAccount(password, pin);
      setNeedsPinSetup(false);
      beginSession(encryptionKey);
    },
    [beginSession]
  );

  /**
   * Wipe the vault so the device can enrol again. Used when the master key has
   * been invalidated and no amount of re-authenticating will bring it back.
   */
  const resetVault = useCallback(async () => {
    await wipeAllSecureStoreEntries();
    encryptionKeyRef.current = null;
    pendingKeyRef.current = null;
    biometricNeedsRepair.current = false;
    setIsAuthenticated(false);
    setNeedsMigration(false);
    setNeedsPinSetup(false);
    setBiometricEnabledState(false);
    setPinLockedUntil(0);
    setHasAccount(false); // flips the sign-in screen back to "set up"
  }, []);

  /** Finish a migration by discarding credentials no key can decrypt. */
  const abandonMigration = useCallback(
    async (password: string, pin: string) => {
      const { encryptionKey, discardedExchangeIds } =
        await abandonUnrecoverableCredentials(password, pin);
      setNeedsPinSetup(false);
      beginSession(encryptionKey);
      return discardedExchangeIds;
    },
    [beginSession]
  );

  // Clean up any pending timer on unmount.
  useEffect(() => clearInactivityTimer, [clearInactivityTimer]);

  /**
   * Re-lock when the app comes back from the background after a spell away.
   *
   * The 15-minute inactivity timer alone doesn't cover the case that matters
   * most: a phone left unattended with the app sitting unlocked in the app
   * switcher. Timing the absence (rather than locking on every blur) keeps the
   * quick trip to another app — to copy a withdrawal address, say — friction
   * free. `signOut()` is all that's needed; `(app)/_layout.tsx` already bounces
   * an unauthenticated session to the sign-in screen.
   */
  useEffect(() => {
    let leftAt: number | null = null;

    const sub = RNAppState.addEventListener('change', (next) => {
      if (next === 'active') {
        const away = leftAt === null ? 0 : Date.now() - leftAt;
        leftAt = null;
        if (away >= BACKGROUND_LOCK_MS) signOut();
        return;
      }
      // 'background' on both platforms; iOS also emits 'inactive' for transient
      // interruptions (notification shade, incoming call), which must not start
      // the clock over and must not be mistaken for a real backgrounding.
      if (next === 'background' && leftAt === null) leftAt = Date.now();
    });

    return () => sub.remove();
  }, [signOut]);

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
        // Record the IP this key was set up from, so we can warn if it changes
        // (many exchanges let you whitelist an API key to specific IPs).
        void fetchExternalIp()
          .then((ip) => {
            if (!ip) return;
            setCurrentIp(ip);
            setSetupIpByExchange((prev) => ({ ...prev, [id]: ip }));
            void setStoredSetupIp(id, ip).catch(() => {});
          })
          .catch(() => {});
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
    setSetupIpByExchange((prev) => {
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

  /** Re-detect the device's current external IP. */
  const refreshCurrentIp = useCallback(async () => {
    const ip = await fetchExternalIp().catch(() => null);
    if (ip) setCurrentIp(ip);
  }, []);

  /**
   * True only when BOTH the current IP and a saved setup IP for this exchange
   * are known and they differ. Never warns on missing data.
   */
  const ipChangedForExchange = useCallback(
    (id: ExchangeId): boolean => {
      const saved = setupIpByExchange[id];
      return Boolean(saved && currentIp && saved !== currentIp);
    },
    [setupIpByExchange, currentIp]
  );

  /** Accept the current IP as this exchange's setup IP (clears the warning). */
  const updateSetupIp = useCallback(
    async (id: ExchangeId) => {
      const ip = currentIp ?? (await fetchExternalIp().catch(() => null));
      if (!ip) return;
      setCurrentIp(ip);
      setSetupIpByExchange((prev) => ({ ...prev, [id]: ip }));
      await setStoredSetupIp(id, ip).catch(() => {});
    },
    [currentIp]
  );

  // ───────────────────────────── Profiles ─────────────────────────────────

  /**
   * Re-pull exchange connection state + allocations from the live vault keys
   * after they've been swapped underneath us (profile switch/import). Resets the
   * in-memory exchange list to the seed first so a previously-connected exchange
   * that ISN'T in the new profile is correctly shown disconnected.
   */
  const rehydrateActiveProfile = useCallback(
    async (key: Uint8Array) => {
      setExchanges(initialExchanges);
      setSetupIpByExchange({});
      setAllocations(defaultAllocationTargets);
      hasHydratedAllocations.current = false;
      setLiveDetailed({});
      setSavedAddresses({});
      setChainOptions({});
      await restoreSession(key);
    },
    [restoreSession]
  );

  const switchProfile = useCallback(
    async (id: string) => {
      const key = encryptionKeyRef.current;
      if (!key) return;
      const registry = await switchProfileStore(id);
      setProfiles(registry.profiles);
      setActiveProfileId(registry.activeId);
      await rehydrateActiveProfile(key);
    },
    [rehydrateActiveProfile]
  );

  const renameProfile = useCallback(async (id: string, name: string) => {
    const registry = await renameProfileStore(id, name);
    setProfiles(registry.profiles);
  }, []);

  const deleteProfile = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const key = encryptionKeyRef.current;
      if (!key) return { ok: false, error: 'Session locked — sign in again.' };
      const wasActive = activeProfileId === id;
      try {
        const registry = await deleteProfileStore(id);
        setProfiles(registry.profiles);
        setActiveProfileId(registry.activeId);
        // If the active profile was deleted, a different one is now live —
        // rehydrate exchanges/allocations from the promoted profile's keys.
        if (wasActive) await rehydrateActiveProfile(key);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [activeProfileId, rehydrateActiveProfile]
  );

  const createProfile = useCallback(
    async (name: string): Promise<{ ok: boolean; error?: string }> => {
      const key = encryptionKeyRef.current;
      if (!key) return { ok: false, error: 'Session locked — sign in again.' };
      try {
        const registry = await createProfileStore(name);
        setProfiles(registry.profiles);
        setActiveProfileId(registry.activeId);
        await rehydrateActiveProfile(key);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [rehydrateActiveProfile]
  );

  const exportActiveProfile = useCallback(
    async (
      pin: string
    ): Promise<{ ok: boolean; text?: string; code?: string; error?: string }> => {
      const key = encryptionKeyRef.current;
      if (!key) return { ok: false, error: 'Session locked — sign in again.' };

      // Re-authenticate before exposing decrypted credentials in a transferable
      // payload. The PIN is the vault's own authenticator, so this works even
      // when biometrics are off or the OS has invalidated them.
      if (!(await verifyPin(pin))) {
        return { ok: false, error: 'That PIN is not correct.' };
      }

      // The QR is protected by its own single-use code, not by the vault PIN.
      const code = randomDigits(TRANSFER_CODE_LENGTH);
      try {
        // Decrypt the active profile's credentials with the live session key,
        // then re-encrypt the whole payload under the one-time transfer code.
        const ids = await listStoredCredentialExchanges();
        const creds: Record<string, ApiCredentials> = {};
        for (const id of ids) {
          const c = await retrieveCredentials(id, key);
          if (c) creds[id] = c;
        }
        const savedAlloc = (await loadAllocations()) ?? allocations;
        const payload: ProfilePayload = { allocations: savedAlloc, creds };
        const active = profiles.find((p) => p.id === activeProfileId);
        const text = buildExport(active?.name ?? 'Profile', payload, code);
        return { ok: true, text, code };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [allocations, profiles, activeProfileId, verifyPin]
  );

  const importProfileFromText = useCallback(
    async (
      text: string,
      code: string,
      overwriteId?: string
    ): Promise<{ ok: boolean; needsSlot?: boolean; error?: string }> => {
      const key = encryptionKeyRef.current;
      if (!key) return { ok: false, error: 'Session locked — sign in again.' };

      // 1. Decrypt with the one-time transfer code the QR was exported under.
      let imported: { name: string; payload: ProfilePayload };
      try {
        imported = parseImport(text.trim(), code);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }

      // 2. Build a snapshot, re-encrypting the imported plaintext credentials
      //    under the CURRENT account master key so they're portable like any
      //    other stored profile.
      const snapshot: ProfileSnapshot = {
        allocations: imported.payload.allocations ?? null,
        credIndex: [],
        creds: {},
      };
      try {
        for (const [id, c] of Object.entries(imported.payload.creds)) {
          snapshot.creds[id] = encryptApiCredentials(c, key);
        }
        snapshot.credIndex = Object.keys(snapshot.creds);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }

      try {
        const registry = await loadRegistry();
        if (overwriteId) {
          const next = await overwriteProfile(overwriteId, imported.name, snapshot);
          setProfiles(next.profiles);
          // If we overwrote the active profile, reload it live.
          if (next.activeId === overwriteId) await rehydrateActiveProfile(key);
          else {
            setActiveProfileId(next.activeId);
          }
          return { ok: true };
        }
        if (registry.profiles.length >= MAX_PROFILES) {
          return { ok: false, needsSlot: true };
        }
        // Free slot available — create a new profile from the snapshot & switch.
        const next = await createProfileStore(imported.name, snapshot);
        setProfiles(next.profiles);
        setActiveProfileId(next.activeId);
        await rehydrateActiveProfile(key);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [rehydrateActiveProfile]
  );

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

  // Coin-selection edits are NOT auto-persisted. They live in `allocations`
  // (in memory) until the user explicitly saves, so they can also be discarded
  // (reverted to the last-saved snapshot) when leaving Settings without saving.
  const allocationsDirty = JSON.stringify(allocations) !== savedAllocationsJson;

  /** Persist the current coin selection and mark it as the new saved state. */
  const saveAllocationsNow = useCallback(async () => {
    const snapshot = allocations;
    await saveAllocations(snapshot);
    setSavedAllocationsJson(JSON.stringify(snapshot));
  }, [allocations]);

  /** Discard unsaved edits — restore the last-saved coin selection. */
  const revertAllocations = useCallback(() => {
    try {
      setAllocations(JSON.parse(savedAllocationsJson) as AllocationTargets);
    } catch {
      // Snapshot should always be valid JSON; ignore if not.
    }
  }, [savedAllocationsJson]);

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
    needsMigration,
    needsPinSetup,
    biometricEnabled,
    biometricAvailable,
    biometricLabel,
    pinLockedUntil,
    unlockWithPin,
    unlockWithBiometrics,
    enroll,
    completePinSetup,
    changeVaultPin,
    setBiometricEnabled,
    migrate,
    abandonMigration,
    resetVault,
    signOut,
    touchSession,
    verifyPin,
    exchanges,
    toggleExchange,
    connectExchange,
    reconnectExchange,
    disconnectExchange,
    connectedExchanges,
    currentIp,
    setupIpByExchange,
    refreshCurrentIp,
    ipChangedForExchange,
    updateSetupIp,
    liveBalances,
    refreshBalances,
    isRefreshingBalances,
    totalsByAsset,
    totalsUsdByAsset,
    totalPortfolioUsd,
    priceUsd,
    heldAssetsForExchange,
    profiles,
    activeProfileId,
    maxProfiles: MAX_PROFILES,
    switchProfile,
    renameProfile,
    deleteProfile,
    createProfile,
    exportActiveProfile,
    importProfileFromText,
    allocations,
    selectedExchangeId,
    setSelectedExchangeId,
    allocationsForExchange,
    toggleAsset,
    updateAllocation,
    applySavedAddress,
    enabledCountForExchange,
    allocationsDirty,
    saveAllocationsNow,
    revertAllocations,
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
