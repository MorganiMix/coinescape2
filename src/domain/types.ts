/**
 * Core domain types for Coin Escape, mirroring the data models in the design
 * document (design_specs/design.md).
 */

export type ExchangeId = string;
export type AssetSymbol = string;

export enum ConnectionStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR',
  CONNECTING = 'CONNECTING',
}

export enum ExecutionMode {
  DRY_RUN = 'DRY_RUN',
  REAL_WITHDRAWAL = 'REAL_WITHDRAWAL',
}

export enum TransactionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  CANCELLED = 'CANCELLED',
}

export enum OperationStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PARTIAL_SUCCESS = 'PARTIAL_SUCCESS',
}

export interface Exchange {
  id: ExchangeId;
  name: string;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  lastSyncTime: number | null;
  supportedAssets: AssetSymbol[];
  /** API key stored for this exchange (secret intentionally not retained in app state). */
  apiKeyMasked?: string;
}

/** Map of asset symbol -> available balance. */
export type BalanceMap = Record<AssetSymbol, number>;

export interface WithdrawalRequest {
  exchangeId: ExchangeId;
  asset: AssetSymbol;
  amount: number;
  destinationAddress: string;
  network?: string;
  memo?: string;
  /**
   * Kraken (and similar exchanges) withdraw to a pre-named, whitelisted
   * "withdrawal key" rather than a raw address. When set, the Kraken adapter
   * uses this wallet-key name instead of destinationAddress.
   */
  krakenKey?: string;
}

export interface WithdrawalPlan {
  operationId: string;
  createdAt: number;
  mode: ExecutionMode;
  requests: WithdrawalRequest[];
  estimatedDurationMs: number;
  totalValueUSD: number;
}

export interface WithdrawalResult {
  exchangeId: ExchangeId;
  asset: AssetSymbol;
  amount: number;
  status: TransactionStatus;
  transactionId?: string;
  errorMessage?: string;
  timestamp: number;
}

export interface ExecutionResults {
  operationId: string;
  mode: ExecutionMode;
  startTime: number;
  endTime: number;
  overallStatus: OperationStatus;
  individualResults: WithdrawalResult[];
  successCount: number;
  failureCount: number;
  totalProcessed: number;
}

export interface AllocationConfig {
  /**
   * Percentage of the asset to withdraw (0-100). Retained for the design-spec
   * port; the live escape flow withdraws the full balance and no longer reads
   * this in the UI.
   */
  percentage: number;
  minimumAmount: number;
  priority: number;
  enabled: boolean;
  /** Per-asset recipient address funds are sent to during a panic. */
  address?: string;
  /** Kraken-style whitelisted withdrawal-key name for this asset (optional). */
  krakenKey?: string;
  /** Network / chain selected for this destination (from the saved address). */
  network?: string;
  /** Destination tag / memo, when the chosen saved address carries one. */
  memo?: string;
}

/**
 * Destinations are configured PER EXCHANGE: each connected exchange has its own
 * set of enabled coins and their recipients, since whitelisted withdrawal
 * addresses (and Kraken withdrawal-key names) are exchange-specific.
 */
export interface AllocationTargets {
  /** Legacy global address (retained for the design-spec port; unused live). */
  targetAddress: string;
  /**
   * exchangeId -> (assetSymbol -> destination config). A coin only escapes from
   * an exchange when that exchange's entry has it enabled with a destination.
   */
  byExchange: Record<ExchangeId, Record<AssetSymbol, AllocationConfig>>;
}

/**
 * A saved / whitelisted withdrawal destination fetched live from an exchange.
 * Normalised across exchanges so the picker can render a single shape.
 */
export interface SavedAddress {
  /** Canonical asset symbol this address is for (e.g. BTC), or null if generic. */
  asset: AssetSymbol | null;
  /** On-chain address (may be empty for Kraken key-only entries). */
  address: string;
  /** Human label: Kraken withdrawal-key name, Binance address name, Bybit remark. */
  label: string;
  /** Network / chain the address belongs to, when reported. */
  network?: string;
  /** Destination tag / memo, when present. */
  memo?: string;
  /**
   * Kraken-style withdrawal-key name. Set only for Kraken entries; the Kraken
   * adapter withdraws to this key rather than the raw address.
   */
  krakenKey?: string;
  /** Whether the exchange reports this address as verified / whitelisted. */
  verified: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/** Approximate USD spot prices used for plan valuation (mock price feed). */
export const USD_PRICES: Record<AssetSymbol, number> = {
  BTC: 64000,
  ETH: 3400,
  SOL: 145,
  ADA: 0.45,
  DOT: 6.8,
  XRP: 0.52,
  USDT: 1,
  USDC: 1,
  DAI: 1,
};

export const ASSET_META: Record<AssetSymbol, { name: string; color: string }> = {
  BTC: { name: 'Bitcoin', color: '#F7931A' },
  ETH: { name: 'Ethereum', color: '#627EEA' },
  SOL: { name: 'Solana', color: '#14F195' },
  ADA: { name: 'Cardano', color: '#0033AD' },
  DOT: { name: 'Polkadot', color: '#E6007A' },
  XRP: { name: 'XRP', color: '#23292F' },
  USDT: { name: 'Tether', color: '#26A17B' },
  USDC: { name: 'USD Coin', color: '#2775CA' },
  DAI: { name: 'Dai', color: '#F5AC37' },
};
