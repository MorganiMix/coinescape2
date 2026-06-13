/**
 * Exchange adapter contract — the TS realization of design.md's ExchangeManager
 * (Component 1). Each supported exchange implements this interface over its own
 * signed REST API. The orchestrator (ExchangeManager) depends only on this
 * shape, so adapters can be added without touching the engine or store.
 */
import { ApiCredentials } from '@/security';
import { AssetSymbol, BalanceMap, SavedAddress } from '@/domain/types';

/** Per-asset balance enriched with the USD value reported by the exchange. */
export interface BalanceDetail {
  /** Free/available amount of the asset. */
  amount: number;
  /**
   * USD value of `amount` as sourced from the exchange — either a native USD
   * field in the balance response or the exchange's own public ticker price.
   * `null` when the exchange could not price the asset.
   */
  usdValue: number | null;
}

/** Map of asset symbol -> { amount, usdValue }. */
export type BalanceMapDetailed = Record<AssetSymbol, BalanceDetail>;

/** Project a detailed balance map down to plain amounts (for the withdrawal engine). */
export function toBalanceMap(detailed: BalanceMapDetailed): BalanceMap {
  const out: BalanceMap = {};
  for (const [asset, d] of Object.entries(detailed)) out[asset] = d.amount;
  return out;
}

/** Outcome of validating credentials against the live exchange. */
export interface ConnectionTestResult {
  ok: boolean;
  /** True when the key carries the WITHDRAW permission (Requirement: design.md line 309). */
  canWithdraw: boolean;
  /** Human-readable failure reason when ok === false. */
  errorMessage?: string;
}

/** A single live withdrawal request sent to an exchange. */
export interface AdapterWithdrawal {
  asset: AssetSymbol;
  amount: number;
  address: string;
  network?: string;
  memo?: string;
  /**
   * Kraken-style whitelisted withdrawal-key name. When present, the Kraken
   * adapter uses this as its `key` parameter instead of `address`.
   */
  krakenKey?: string;
}

/** Normalised result of a live withdrawal call. */
export interface AdapterWithdrawalResult {
  ok: boolean;
  /** Exchange-assigned withdrawal id / tx hash on success. */
  transactionId?: string;
  errorMessage?: string;
  /**
   * The exchange ACCEPTED the request but is holding it for an out-of-band
   * confirmation step the app cannot complete automatically (e.g. Deribit's
   * email/2FA withdrawal confirmation). The funds have NOT left yet — the user
   * must finish confirmation manually. Mapped to TransactionStatus.PENDING.
   */
  pending?: boolean;
}

/**
 * One adapter instance per (exchange, credential) pairing. Stateless beyond the
 * credentials it is constructed with — safe to create per operation.
 */
export interface ExchangeAdapter {
  readonly id: string;
  readonly name: string;

  /** Validate credentials + permissions against the live API. Never throws. */
  testConnection(): Promise<ConnectionTestResult>;

  /**
   * Fetch available (free) balances enriched with exchange-sourced USD values.
   * Throws on auth/network failure.
   */
  fetchBalances(): Promise<BalanceMapDetailed>;

  /**
   * Fetch the user's saved / whitelisted withdrawal addresses (the address
   * book). Returns [] for exchanges with no such API (OKX, Coinbase) — those
   * fall back to manual address entry. Never throws.
   */
  fetchWithdrawAddresses(): Promise<SavedAddress[]>;

  /** Submit a single withdrawal. Never throws — failures come back in the result. */
  withdraw(req: AdapterWithdrawal): Promise<AdapterWithdrawalResult>;
}

/** Re-export so adapter modules can import the saved-address shape from here. */
export type { SavedAddress } from '@/domain/types';

/** Factory signature: build an adapter from decrypted credentials. */
export type AdapterFactory = (creds: ApiCredentials) => ExchangeAdapter;
