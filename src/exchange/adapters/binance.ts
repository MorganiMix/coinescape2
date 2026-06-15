/**
 * Binance Spot adapter (api.binance.com).
 * Signing: HMAC-SHA256 of the querystring with the API secret, hex-encoded,
 * passed as the `signature` param. Key sent in the X-MBX-APIKEY header.
 * Docs: https://developers.binance.com/docs/wallet/withdraw
 */
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
import { fetchWithTimeout, hmacSha256Hex, nowMs, toQuery } from '../signing';

const BASE = 'https://api.binance.com';

export class BinanceAdapter implements ExchangeAdapter {
  readonly id = 'binance';
  readonly name = 'Binance';
  constructor(private readonly creds: ApiCredentials) {}

  private signedUrl(path: string, params: Record<string, string | number> = {}): string {
    const query = toQuery({ ...params, timestamp: nowMs(), recvWindow: 10_000 });
    const signature = hmacSha256Hex(this.creds.apiSecret, query);
    return `${BASE}${path}?${query}&signature=${signature}`;
  }

  private headers(): HeadersInit {
    return { 'X-MBX-APIKEY': this.creds.apiKey };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // /sapi/v1/account/apiRestrictions reports the key's permission flags.
      const res = await fetchWithTimeout(
        this.signedUrl('/sapi/v1/account/apiRestrictions'),
        { method: 'GET', headers: this.headers() }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, canWithdraw: false, errorMessage: body?.msg ?? `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, canWithdraw: Boolean(data?.enableWithdrawals) };
    } catch (e) {
      return { ok: false, canWithdraw: false, errorMessage: errText(e) };
    }
  }

  async fetchBalances(): Promise<BalanceMapDetailed> {
    const res = await fetchWithTimeout(this.signedUrl('/api/v3/account'), {
      method: 'GET',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Binance balance HTTP ${res.status}`);
    const data = await res.json();

    const amounts: Record<string, number> = {};
    for (const b of data?.balances ?? []) {
      const free = parseFloat(b.free);
      if (free > 0) amounts[b.asset] = free;
    }

    // Price every held asset in USD via Binance's own public ticker.
    const prices = await this.fetchUsdPrices(Object.keys(amounts));
    const out: BalanceMapDetailed = {};
    for (const [asset, amount] of Object.entries(amounts)) {
      const price = prices[asset];
      out[asset] = { amount, usdValue: price != null ? amount * price : null };
    }
    return out;
  }

  /**
   * Public price lookup (no auth) against USDT pairs — USDT is treated as $1.
   * One batched call: /api/v3/ticker/price returns all symbols.
   */
  private async fetchUsdPrices(assets: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    const stables = new Set(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'FDUSD']);
    for (const a of assets) if (stables.has(a)) out[a] = 1;

    const needed = assets.filter((a) => !stables.has(a));
    if (needed.length === 0) return out;

    try {
      const res = await fetchWithTimeout(`${BASE}/api/v3/ticker/price`, { method: 'GET' });
      if (!res.ok) return out;
      const all: { symbol: string; price: string }[] = await res.json();
      const bySymbol = new Map(all.map((t) => [t.symbol, parseFloat(t.price)]));
      for (const a of needed) {
        const p = bySymbol.get(`${a}USDT`) ?? bySymbol.get(`${a}USDC`);
        if (p && p > 0) out[a] = p;
      }
    } catch {
      // Leave unpriced assets out; caller treats missing price as null.
    }
    return out;
  }

  async fetchWithdrawAddresses(): Promise<SavedAddress[]> {
    try {
      // GET /sapi/v1/capital/withdraw/address/list
      // → [{ address, addressTag, coin, name, network, whiteStatus }]
      const res = await fetchWithTimeout(this.signedUrl('/sapi/v1/capital/withdraw/address/list'), {
        method: 'GET',
        headers: this.headers(),
      });
      if (!res.ok) return [];
      const list: any[] = await res.json().catch(() => []);
      if (!Array.isArray(list)) return [];
      return list.map((a) => ({
        asset: a?.coin ? String(a.coin) : null,
        address: String(a?.address ?? ''),
        label: a?.name ? String(a.name) : String(a?.address ?? 'Unnamed'),
        network: a?.network ? String(a.network) : undefined,
        memo: a?.addressTag ? String(a.addressTag) : undefined,
        verified: Boolean(a?.whiteStatus),
      }));
    } catch {
      return [];
    }
  }

  async fetchChains(asset: string): Promise<ChainOption[]> {
    try {
      // GET /sapi/v1/capital/config/getall → [{ coin, networkList: [{ network,
      // name, isDefault, withdrawEnable, ... }] }]. The `network` value is what
      // withdraw() passes as its `network` param, so use it verbatim as the id.
      const res = await fetchWithTimeout(this.signedUrl('/sapi/v1/capital/config/getall'), {
        method: 'GET',
        headers: this.headers(),
      });
      if (!res.ok) return [];
      const all: any[] = await res.json().catch(() => []);
      if (!Array.isArray(all)) return [];
      const entry = all.find((c) => String(c?.coin).toUpperCase() === asset.toUpperCase());
      const list: any[] = entry?.networkList ?? [];
      return list
        .filter((n) => n?.network)
        .map((n) => ({
          id: String(n.network),
          label: n?.name ? `${String(n.name)} (${String(n.network)})` : String(n.network),
          isDefault: Boolean(n?.isDefault),
        }));
    } catch {
      return [];
    }
  }

  async withdraw(req: AdapterWithdrawal): Promise<AdapterWithdrawalResult> {
    try {
      const params: Record<string, string | number> = {
        coin: req.asset,
        address: req.address,
        amount: req.amount,
      };
      if (req.network) params.network = req.network;
      if (req.memo) params.addressTag = req.memo;
      const res = await fetchWithTimeout(this.signedUrl('/sapi/v1/capital/withdraw/apply', params), {
        method: 'POST',
        headers: this.headers(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, errorMessage: data?.msg ?? `HTTP ${res.status}` };
      return { ok: true, transactionId: data?.id };
    } catch (e) {
      return { ok: false, errorMessage: errText(e) };
    }
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
