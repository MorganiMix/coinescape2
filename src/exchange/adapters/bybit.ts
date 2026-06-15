/**
 * Bybit V5 adapter (api.bybit.com).
 * Signing: HMAC-SHA256( timestamp + apiKey + recvWindow + (queryString|body) ),
 * hex-encoded, in the X-BAPI-SIGN header.
 * Docs: https://bybit-exchange.github.io/docs/v5/guide
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

const BASE = 'https://api.bybit.com';
const RECV = '10000';

export class BybitAdapter implements ExchangeAdapter {
  readonly id = 'bybit';
  readonly name = 'Bybit';
  constructor(private readonly creds: ApiCredentials) {}

  private headers(ts: string, payload: string): HeadersInit {
    const sign = hmacSha256Hex(this.creds.apiSecret, ts + this.creds.apiKey + RECV + payload);
    return {
      'X-BAPI-API-KEY': this.creds.apiKey,
      'X-BAPI-TIMESTAMP': ts,
      'X-BAPI-RECV-WINDOW': RECV,
      'X-BAPI-SIGN': sign,
      'Content-Type': 'application/json',
    };
  }

  private async get(path: string, params: Record<string, string | number> = {}): Promise<any> {
    const ts = String(nowMs());
    const query = toQuery(params);
    const res = await fetchWithTimeout(`${BASE}${path}${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: this.headers(ts, query),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.retCode !== 0) throw new Error(data?.retMsg ?? `Bybit HTTP ${res.status}`);
    return data.result;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const info = await this.get('/v5/user/query-api');
      // Bybit permissions object lists Withdraw under "Wallet".
      const perms = info?.permissions ?? {};
      const canWithdraw = Array.isArray(perms.Withdraw)
        ? perms.Withdraw.length > 0
        : Boolean(perms.Wallet?.includes?.('Withdraw'));
      return { ok: true, canWithdraw };
    } catch (e) {
      return { ok: false, canWithdraw: false, errorMessage: errText(e) };
    }
  }

  async fetchBalances(): Promise<BalanceMapDetailed> {
    const result = await this.get('/v5/account/wallet-balance', { accountType: 'UNIFIED' });
    const out: BalanceMapDetailed = {};
    for (const account of result?.list ?? []) {
      for (const c of account.coin ?? []) {
        const free = parseFloat(c.walletBalance ?? c.free ?? '0');
        if (free <= 0) continue;
        // Bybit reports per-coin USD value directly (usdValue field).
        const usd = c.usdValue != null && c.usdValue !== '' ? parseFloat(c.usdValue) : null;
        const prev = out[c.coin];
        out[c.coin] = {
          amount: (prev?.amount ?? 0) + free,
          usdValue:
            usd == null && prev?.usdValue == null
              ? null
              : (prev?.usdValue ?? 0) + (usd ?? 0),
        };
      }
    }
    return out;
  }

  async fetchWithdrawAddresses(): Promise<SavedAddress[]> {
    try {
      // GET /v5/asset/withdraw/query-address
      // → result.rows: [{ coin, chain, address, tag, remark, verified }]
      const result = await this.get('/v5/asset/withdraw/query-address');
      const rows: any[] = result?.rows ?? [];
      return rows.map((a) => ({
        asset: a?.coin ? String(a.coin) : null,
        address: String(a?.address ?? ''),
        label: a?.remark ? String(a.remark) : String(a?.address ?? 'Unnamed'),
        network: a?.chain ? String(a.chain) : undefined,
        memo: a?.tag ? String(a.tag) : undefined,
        verified: Number(a?.verified) === 1,
      }));
    } catch {
      return [];
    }
  }

  async fetchChains(asset: string): Promise<ChainOption[]> {
    try {
      // GET /v5/asset/coin/query-info?coin={asset} → result.rows[0].chains:
      // [{ chain, chainType, ... }]. `chain` is what withdraw() sends, so it is
      // the id used verbatim.
      const result = await this.get('/v5/asset/coin/query-info', { coin: asset });
      const rows: any[] = result?.rows ?? [];
      const row = rows.find((r) => String(r?.coin).toUpperCase() === asset.toUpperCase()) ?? rows[0];
      const chains: any[] = row?.chains ?? [];
      return chains
        .filter((c) => c?.chain)
        .map((c) => ({
          id: String(c.chain),
          label: c?.chainType ? `${String(c.chainType)} (${String(c.chain)})` : String(c.chain),
        }));
    } catch {
      return [];
    }
  }

  async withdraw(req: AdapterWithdrawal): Promise<AdapterWithdrawalResult> {
    try {
      const ts = String(nowMs());
      const body = JSON.stringify({
        coin: req.asset,
        chain: req.network ?? '',
        address: req.address,
        tag: req.memo ?? '',
        amount: String(req.amount),
        timestamp: Number(ts),
      });
      const res = await fetchWithTimeout(`${BASE}/v5/asset/withdraw/create`, {
        method: 'POST',
        headers: this.headers(ts, body),
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (data?.retCode !== 0) return { ok: false, errorMessage: data?.retMsg ?? `HTTP ${res.status}` };
      return { ok: true, transactionId: data?.result?.id };
    } catch (e) {
      return { ok: false, errorMessage: errText(e) };
    }
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
