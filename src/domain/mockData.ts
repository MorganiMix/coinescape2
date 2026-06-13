import {
  AllocationConfig,
  AllocationTargets,
  AssetSymbol,
  BalanceMap,
  ConnectionStatus,
  Exchange,
  ExchangeId,
} from './types';

export const SUPPORTED_EXCHANGES: { id: ExchangeId; name: string }[] = [
  { id: 'binance', name: 'Binance' },
  { id: 'coinbase', name: 'Coinbase' },
  { id: 'kraken', name: 'Kraken' },
  { id: 'bybit', name: 'Bybit' },
  { id: 'okx', name: 'OKX' },
  { id: 'deribit', name: 'Deribit' },
  { id: 'other', name: 'Other' },
];

const COMMON_ASSETS = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'XRP', 'USDT', 'USDC'];

/** Per-exchange supported-asset lists; defaults to the common set. */
const SUPPORTED_ASSETS_BY_EXCHANGE: Record<ExchangeId, AssetSymbol[]> = {
  coinbase: ['BTC', 'ETH', 'SOL', 'USDC'],
  kraken: ['BTC', 'ETH', 'DOT', 'ADA', 'USDT'],
  deribit: ['BTC', 'ETH', 'USDC', 'USDT'],
};

/**
 * Initial exchange roster shown on the main page. Every exchange starts
 * DISCONNECTED with no stored API credentials — users connect their own keys in
 * Settings. (No test/default keys are seeded.)
 */
export const initialExchanges: Exchange[] = SUPPORTED_EXCHANGES.map((ex) => ({
  id: ex.id,
  name: ex.name,
  isConnected: false,
  connectionStatus: ConnectionStatus.DISCONNECTED,
  lastSyncTime: null,
  supportedAssets: SUPPORTED_ASSETS_BY_EXCHANGE[ex.id] ?? COMMON_ASSETS,
}));

/**
 * No seeded balances. Balances come exclusively from live exchange API calls
 * once the user connects real credentials.
 */
export const mockBalances: Record<ExchangeId, BalanceMap> = {};

/** Factory for a fresh per-asset destination config (enabled, no recipient yet). */
export function newAllocationConfig(): AllocationConfig {
  return { percentage: 100, minimumAmount: 0, priority: 99, enabled: true, address: '', krakenKey: '' };
}

/**
 * Destinations start empty: each exchange's coin set is configured by the user
 * in Settings, against that exchange's own whitelisted withdrawal addresses.
 */
export const defaultAllocationTargets: AllocationTargets = {
  // Legacy global address; the live flow uses per-(exchange, asset) addresses.
  targetAddress: '',
  byExchange: {},
};
