/**
 * Coinbase adapter (api.coinbase.com — legacy HMAC scheme).
 * Signing: CB-ACCESS-SIGN = hex( HMAC-SHA256( secret, timestamp + method +
 * requestPath + body ) ); timestamp is epoch SECONDS.
 * Docs: https://docs.cdp.coinbase.com/coinbase-app/docs/api-key-authentication
 *
 * Note: Coinbase's newer CDP keys use ECDSA/JWT, which needs an EC signer not
 * present in our dependency set. This adapter targets the still-supported
 * legacy HMAC API keys (apiKey + apiSecret).
 */
import { ApiCredentials } from '@/security';
import {
  AdapterWithdrawal,
  AdapterWithdrawalResult,
  BalanceMapDetailed,
  ConnectionTestResult,
  ExchangeAdapter,
  SavedAddress,
} from '../adapter';
import { fetchWithTimeout, hmacSha256Hex, nowMs } from '../signing';

const BASE = 'https://api.coinbase.com';

export class CoinbaseAdapter implements ExchangeAdapter {
  readonly id = 'coinbase';
  readonly name = 'Coinbase';
  constructor(private readonly creds: ApiCredentials) {}

  private headers(method: string, path: string, body: string): HeadersInit {
    const ts = Math.floor(nowMs() / 1000).toString();
    const sign = hmacSha256Hex(this.creds.apiSecret, ts + method + path + body);
    return {
      'CB-ACCESS-KEY': this.creds.apiKey,
      'CB-ACCESS-SIGN': sign,
      'CB-ACCESS-TIMESTAMP': ts,
      'CB-VERSION': '2024-01-01',
      'Content-Type': 'application/json',
    };
  }

  private async request(method: 'GET' | 'POST', path: string, bodyObj?: unknown): Promise<any> {
    const body = bodyObj ? JSON.stringify(bodyObj) : '';
    const res = await fetchWithTimeout(`${BASE}${path}`, {
      method,
      headers: this.headers(method, path, body),
      body: method === 'POST' ? body : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.errors?.[0]?.message ?? data?.message ?? `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // A successful authenticated read proves the key is valid; Coinbase
      // scopes (wallet:transactions:send) gate the withdrawal itself.
      await this.request('GET', '/v2/user');
      return { ok: true, canWithdraw: true };
    } catch (e) {
      return { ok: false, canWithdraw: false, errorMessage: errText(e) };
    }
  }

  async fetchBalances(): Promise<BalanceMapDetailed> {
    const amounts: Record<string, number> = {};
    let path: string | null = '/v2/accounts?limit=100';
    // Paginate through accounts.
    while (path) {
      const data = await this.request('GET', path);
      for (const acc of data?.data ?? []) {
        const amount = parseFloat(acc?.balance?.amount ?? '0');
        const cur = acc?.balance?.currency;
        if (cur && amount > 0) amounts[cur] = (amounts[cur] ?? 0) + amount;
      }
      path = data?.pagination?.next_uri ?? null;
    }

    const prices = await this.fetchUsdPrices(Object.keys(amounts));
    const out: BalanceMapDetailed = {};
    for (const [asset, amount] of Object.entries(amounts)) {
      const price = prices[asset];
      out[asset] = { amount, usdValue: price != null ? amount * price : null };
    }
    return out;
  }

  /** Coinbase public spot prices: GET /v2/prices/{ASSET}-USD/spot (one per asset). */
  private async fetchUsdPrices(assets: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    const stables = new Set(['USD', 'USDC', 'USDT', 'DAI']);
    const needed: string[] = [];
    for (const a of assets) {
      if (stables.has(a)) out[a] = 1;
      else needed.push(a);
    }

    await Promise.all(
      needed.map(async (asset) => {
        try {
          // Public endpoint — no auth headers required.
          const res = await fetchWithTimeout(`${BASE}/v2/prices/${asset}-USD/spot`, {
            method: 'GET',
          });
          if (!res.ok) return;
          const data = await res.json();
          const price = parseFloat(data?.data?.amount ?? '');
          if (price > 0) out[asset] = price;
        } catch {
          // Skip unpriceable assets.
        }
      })
    );
    return out;
  }

  async fetchWithdrawAddresses(): Promise<SavedAddress[]> {
    // Coinbase has no whitelist/address-book API; a send goes to any address.
    // Users enter the recipient manually.
    return [];
  }

  async withdraw(req: AdapterWithdrawal): Promise<AdapterWithdrawalResult> {
    try {
      // Resolve the account id for the asset, then POST a send transaction.
      const accounts = await this.request('GET', '/v2/accounts?limit=100');
      const acc = (accounts?.data ?? []).find(
        (a: any) => a?.balance?.currency === req.asset
      );
      if (!acc) return { ok: false, errorMessage: `No ${req.asset} account on Coinbase` };

      const data = await this.request('POST', `/v2/accounts/${acc.id}/transactions`, {
        type: 'send',
        to: req.address,
        amount: String(req.amount),
        currency: req.asset,
        ...(req.memo ? { destination_tag: req.memo } : {}),
      });
      return { ok: true, transactionId: data?.data?.id };
    } catch (e) {
      return { ok: false, errorMessage: errText(e) };
    }
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
