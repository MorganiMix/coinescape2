/**
 * KuCoin adapter (api.kucoin.com).
 * Signing (API key v2):
 *   KC-API-SIGN       = base64( HMAC-SHA256( secret, timestamp + method + endpoint + body ) )
 *   KC-API-PASSPHRASE = base64( HMAC-SHA256( secret, passphrase ) )
 * `endpoint` is the request path INCLUDING the querystring. Requires apiKey,
 * secret AND passphrase (the passphrase set when the key was created).
 * Docs: https://www.kucoin.com/docs/basic-info/connection-method/authentication/signing-a-message
 */
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';

import { ApiCredentials } from '@/security';
import {
  AdapterWithdrawal,
  AdapterWithdrawalResult,
  BalanceMapDetailed,
  ChainOption,
  ConnectionTestResult,
  ExchangeAdapter,
  SavedAddress,
} from '../adapter';
import { base64Encode, fetchWithTimeout, nowMs, toQuery, utf8ToBytes } from '../signing';

const BASE = 'https://api.kucoin.com';

/**
 * KuCoin identifies networks by its own lowercase chain IDs (e.g. `eth`, `trx`,
 * `bsc`), NOT by the display names other exchanges use (`ERC20`, `TRC20`, …).
 * Passing `ERC20` yields "currency:ETH,chain:ERC20 not exist". This maps the
 * common display names / aliases the app produces (see withdrawalEngine's
 * defaultNetwork) onto KuCoin chain IDs. Anything not here is resolved live
 * against KuCoin's currency-detail endpoint, then finally lowercased as-is.
 */
const KUCOIN_CHAIN_ALIASES: Record<string, string> = {
  ERC20: 'eth',
  ETH: 'eth',
  ETHEREUM: 'eth',
  TRC20: 'trx',
  TRON: 'trx',
  TRX: 'trx',
  BEP20: 'bsc',
  BSC: 'bsc',
  'BNB SMART CHAIN': 'bsc',
  BITCOIN: 'btc',
  BTC: 'btc',
  SOL: 'sol',
  SOLANA: 'sol',
  POLYGON: 'matic',
  MATIC: 'matic',
  ARBITRUM: 'arbitrum',
  OPTIMISM: 'optimism',
  AVALANCHE: 'avax',
  AVAXC: 'avax',
  BASE: 'base',
};

export class KucoinAdapter implements ExchangeAdapter {
  readonly id = 'kucoin';
  readonly name = 'KuCoin';
  constructor(private readonly creds: ApiCredentials) {}

  /** base64( HMAC-SHA256( secret, message ) ) — used for both sign and passphrase. */
  private hmacB64(message: string): string {
    return base64Encode(hmac(sha256, utf8ToBytes(this.creds.apiSecret), utf8ToBytes(message)));
  }

  private headers(timestamp: string, method: string, endpoint: string, body: string): HeadersInit {
    return {
      'KC-API-KEY': this.creds.apiKey,
      'KC-API-SIGN': this.hmacB64(timestamp + method + endpoint + body),
      'KC-API-TIMESTAMP': timestamp,
      // v2 keys hash the passphrase with the secret; older keys send it raw, but
      // KC-API-KEY-VERSION: 2 makes the hashed form the supported contract.
      'KC-API-PASSPHRASE': this.hmacB64(this.creds.passphrase ?? ''),
      'KC-API-KEY-VERSION': '2',
      'Content-Type': 'application/json',
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string | number> = {},
    bodyObj?: unknown
  ): Promise<any> {
    const ts = String(nowMs());
    // For GET the querystring is part of the signed endpoint; POST signs the JSON body.
    const query = method === 'GET' ? toQuery(params) : '';
    const endpoint = query ? `${path}?${query}` : path;
    const body = method === 'POST' && bodyObj ? JSON.stringify(bodyObj) : '';

    const res = await fetchWithTimeout(`${BASE}${endpoint}`, {
      method,
      headers: this.headers(ts, method, endpoint, body),
      body: method === 'POST' ? body : undefined,
    });
    const data = await res.json().catch(() => ({}));
    // KuCoin wraps responses as { code: '200000', data }. Anything else is an error.
    if (data?.code != null && String(data.code) !== '200000') {
      throw new Error(data?.msg || `KuCoin code ${data.code}`);
    }
    if (!res.ok) throw new Error(`KuCoin HTTP ${res.status}`);
    return data?.data;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // A successful authenticated call proves the key + passphrase are valid.
      // KuCoin does not expose per-key permission flags, so WITHDRAW is verified
      // at withdrawal time (matching the Kraken adapter's approach).
      await this.request('GET', '/api/v1/accounts');
      return { ok: true, canWithdraw: true };
    } catch (e) {
      return { ok: false, canWithdraw: false, errorMessage: errText(e) };
    }
  }

  async fetchBalances(): Promise<BalanceMapDetailed> {
    // /api/v1/accounts → [{ currency, type, balance, available, holds }]
    const accounts: any[] = (await this.request('GET', '/api/v1/accounts')) ?? [];
    const amounts: Record<string, number> = {};
    for (const a of accounts) {
      const free = parseFloat(a?.available ?? '0');
      if (free <= 0) continue;
      const ccy = String(a?.currency);
      amounts[ccy] = (amounts[ccy] ?? 0) + free;
    }

    const prices = await this.fetchUsdPrices(Object.keys(amounts));
    const out: BalanceMapDetailed = {};
    for (const [asset, amount] of Object.entries(amounts)) {
      const price = prices[asset];
      out[asset] = { amount, usdValue: price != null ? amount * price : null };
    }
    return out;
  }

  /**
   * Public price lookup (no auth) via KuCoin's allTickers endpoint. Symbols are
   * priced against USDT (treated as $1). One batched call covers every asset.
   */
  private async fetchUsdPrices(assets: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    const stables = new Set(['USDT', 'USDC', 'USD', 'DAI', 'TUSD']);
    for (const a of assets) if (stables.has(a)) out[a] = 1;

    const needed = assets.filter((a) => !stables.has(a));
    if (needed.length === 0) return out;

    try {
      const res = await fetchWithTimeout(`${BASE}/api/v1/market/allTickers`, { method: 'GET' });
      if (!res.ok) return out;
      const data = await res.json().catch(() => ({}));
      const tickers: any[] = data?.data?.ticker ?? [];
      const byPair = new Map<string, number>();
      for (const t of tickers) {
        const last = parseFloat(t?.last ?? '0');
        if (t?.symbol && last > 0) byPair.set(String(t.symbol), last);
      }
      for (const a of needed) {
        const p = byPair.get(`${a}-USDT`) ?? byPair.get(`${a}-USDC`);
        if (p && p > 0) out[a] = p;
      }
    } catch {
      // Unpriced assets fall through as null.
    }
    return out;
  }

  async fetchWithdrawAddresses(): Promise<SavedAddress[]> {
    // KuCoin has no public REST endpoint that lists the withdrawal-address
    // whitelist (the address book is managed in the KuCoin web UI / app only;
    // the API exposes deposit addresses and withdrawal quotas, but not the
    // saved withdrawal destinations). Like OKX and Coinbase, users enter the
    // (already-whitelisted) address manually. Returning [] makes the picker
    // fall back to manual entry instead of showing a misleading empty list.
    return [];
  }

  async fetchChains(asset: string): Promise<ChainOption[]> {
    try {
      // GET /api/v3/currencies/{asset} → { chains: [{ chainId, chainName,
      // isWithdrawEnabled, ... }] }. The id is chainId — exactly what
      // resolveChain() (used by withdraw) accepts and passes through.
      const detail = await this.request('GET', `/api/v3/currencies/${encodeURIComponent(asset)}`);
      const chains: any[] = detail?.chains ?? [];
      return chains
        .filter((c) => c?.chainId)
        .map((c) => ({
          id: String(c.chainId),
          label: c?.chainName ? `${String(c.chainName)} (${String(c.chainId)})` : String(c.chainId),
        }));
    } catch {
      return [];
    }
  }

  async withdraw(req: AdapterWithdrawal): Promise<AdapterWithdrawalResult> {
    try {
      // POST /api/v3/withdrawals (V3 funding withdrawal).
      const body: Record<string, unknown> = {
        currency: req.asset,
        toAddress: req.address,
        amount: String(req.amount),
        withdrawType: 'ADDRESS',
      };
      // Translate the app's network name (e.g. "ERC20") into KuCoin's chain ID
      // (e.g. "eth"). Omitting chain lets KuCoin use the currency's default.
      if (req.network) {
        const chain = await this.resolveChain(req.asset, req.network);
        if (chain) body.chain = chain;
      }
      if (req.memo) body.memo = req.memo;

      const result = await this.request('POST', '/api/v3/withdrawals', {}, body);
      return { ok: true, transactionId: result?.withdrawalId ?? result?.id };
    } catch (e) {
      return { ok: false, errorMessage: errText(e) };
    }
  }

  /**
   * Resolve an app network name to a KuCoin chain ID. Tries, in order:
   *  1. the static alias table (instant, covers the common networks);
   *  2. KuCoin's live currency-detail chains (GET /api/v3/currencies/{ccy}),
   *     matching the input against each chain's chainId / chainName / coin
   *     family / display network;
   *  3. the lowercased input as-is (KuCoin chain IDs are lowercase).
   * Never throws — returns undefined so the caller omits `chain` and lets
   * KuCoin fall back to the currency's default network.
   */
  private async resolveChain(asset: string, network: string): Promise<string | undefined> {
    const raw = network.trim();
    if (!raw) return undefined;
    const alias = KUCOIN_CHAIN_ALIASES[raw.toUpperCase()];
    if (alias) return alias;

    try {
      const detail = await this.request('GET', `/api/v3/currencies/${encodeURIComponent(asset)}`);
      const chains: any[] = detail?.chains ?? [];
      const want = raw.toLowerCase();
      const match = chains.find((c) => {
        const candidates = [c?.chainId, c?.chainName, c?.chain, c?.contractAddress]
          .filter(Boolean)
          .map((v: string) => String(v).toLowerCase());
        return candidates.includes(want) || candidates.some((v) => v.replace(/[^a-z0-9]/g, '') === want.replace(/[^a-z0-9]/g, ''));
      });
      if (match?.chainId) return String(match.chainId).toLowerCase();
    } catch {
      // Fall through to the lowercased input.
    }
    return raw.toLowerCase();
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
