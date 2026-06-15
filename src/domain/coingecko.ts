/**
 * CoinGecko spot-price source.
 *
 * Provides USD prices for held assets so the app can value balances
 * consistently across every exchange (rather than relying on each exchange's
 * own reported figure). Used by AppStore to price the panic-screen balances and
 * the emergency coin-selection list.
 *
 * Free public endpoint, no API key:
 *   GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd
 *
 * Prices are cached in-module for a few minutes to stay well within the free
 * tier's rate limits — a panic refresh and a settings view a minute apart reuse
 * the same fetch.
 */
import { fetchWithRetry } from '@/exchange/signing';

const BASE = 'https://api.coingecko.com/api/v3';

/** Symbol → CoinGecko coin id for the assets the app knows about. */
const SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  ADA: 'cardano',
  DOT: 'polkadot',
  XRP: 'ripple',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  // Common extras likely to appear in live balances.
  BNB: 'binancecoin',
  MATIC: 'matic-network',
  POL: 'matic-network',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  TRX: 'tron',
  ATOM: 'cosmos',
  ARB: 'arbitrum',
  OP: 'optimism',
  APT: 'aptos',
  SUI: 'sui',
  NEAR: 'near',
  XLM: 'stellar',
  BCH: 'bitcoin-cash',
  ETC: 'ethereum-classic',
  FIL: 'filecoin',
  UNI: 'uniswap',
  AAVE: 'aave',
  TON: 'the-open-network',
  SHIB: 'shiba-inu',
  PEPE: 'pepe',
  TUSD: 'true-usd',
  FDUSD: 'first-digital-usd',
};

/** Stablecoins we treat as exactly $1 without a network round-trip. */
const STABLES = new Set(['USDT', 'USDC', 'USD', 'DAI', 'TUSD', 'FDUSD', 'BUSD']);

/** Map a ticker symbol to a CoinGecko id, or undefined if unknown. */
export function coinGeckoId(symbol: string): string | undefined {
  return SYMBOL_TO_ID[symbol.toUpperCase()];
}

interface CacheEntry {
  price: number;
  at: number;
}

const PRICE_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

/** Clear the in-module price cache (e.g. on sign-out). */
export function clearPriceCache(): void {
  PRICE_CACHE.clear();
}

/**
 * Fetch USD spot prices for the given asset symbols. Returns a map of
 * symbol → price; symbols that are unknown to CoinGecko or fail to price are
 * simply absent from the result. Stablecoins resolve to 1 without a request.
 * Never throws — network failures yield whatever was cached/known.
 *
 * `now` is injected (defaults to Date.now) so the cache TTL is testable in
 * sandboxes that restrict Date.now.
 */
export async function fetchPrices(
  symbols: string[],
  now: number = Date.now()
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const wantIds = new Map<string, string>(); // coingecko id → symbol

  for (const raw of symbols) {
    const sym = raw.toUpperCase();
    if (STABLES.has(sym)) {
      out[sym] = 1;
      continue;
    }
    // Serve from cache when fresh.
    const cached = PRICE_CACHE.get(sym);
    if (cached && now - cached.at < CACHE_TTL_MS) {
      out[sym] = cached.price;
      continue;
    }
    const id = coinGeckoId(sym);
    if (id) wantIds.set(id, sym);
  }

  if (wantIds.size === 0) return out;

  try {
    const ids = [...wantIds.keys()].join(',');
    const res = await fetchWithRetry(
      `${BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`,
      { method: 'GET', headers: { accept: 'application/json' } },
      { retries: 1, retryOn: (r) => r.status === 429 || r.status >= 500 }
    );
    if (res.ok) {
      const data: Record<string, { usd?: number }> = await res.json().catch(() => ({}));
      for (const [id, sym] of wantIds) {
        const price = data?.[id]?.usd;
        if (typeof price === 'number' && price > 0) {
          out[sym] = price;
          PRICE_CACHE.set(sym, { price, at: now });
        }
      }
    }
  } catch {
    // Leave unpriced symbols absent; callers fall back to other sources.
  }

  // Backfill any still-missing symbol from a (possibly stale) cache entry so a
  // transient failure doesn't blank a price the user just saw.
  for (const raw of symbols) {
    const sym = raw.toUpperCase();
    if (out[sym] == null) {
      const cached = PRICE_CACHE.get(sym);
      if (cached) out[sym] = cached.price;
    }
  }

  return out;
}
