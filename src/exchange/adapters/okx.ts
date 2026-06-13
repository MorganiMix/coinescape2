/**
 * OKX V5 adapter (www.okx.com).
 * Signing: OK-ACCESS-SIGN = base64( HMAC-SHA256( secret, timestamp + method +
 * requestPath + body ) ). Requires apiKey, secret AND passphrase.
 * Docs: https://www.okx.com/docs-v5/en/#overview-rest-authentication
 */
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';

import { ApiCredentials } from '@/security';
import {
  AdapterWithdrawal,
  AdapterWithdrawalResult,
  BalanceMapDetailed,
  ConnectionTestResult,
  ExchangeAdapter,
  SavedAddress,
} from '../adapter';
import { base64Encode, fetchWithTimeout, utf8ToBytes } from '../signing';

const BASE = 'https://www.okx.com';

export class OkxAdapter implements ExchangeAdapter {
  readonly id = 'okx';
  readonly name = 'OKX';
  constructor(private readonly creds: ApiCredentials) {}

  private sign(timestamp: string, method: string, path: string, body: string): string {
    const prehash = timestamp + method + path + body;
    return base64Encode(hmac(sha256, utf8ToBytes(this.creds.apiSecret), utf8ToBytes(prehash)));
  }

  private headers(timestamp: string, method: string, path: string, body: string): HeadersInit {
    return {
      'OK-ACCESS-KEY': this.creds.apiKey,
      'OK-ACCESS-SIGN': this.sign(timestamp, method, path, body),
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.creds.passphrase ?? '',
      'Content-Type': 'application/json',
    };
  }

  /** OKX timestamps are ISO-8601 with millis. Built from epoch ms (sandbox-safe). */
  private isoTimestamp(): string {
    return new Date(Date.now()).toISOString();
  }

  private async request(method: 'GET' | 'POST', path: string, bodyObj?: unknown): Promise<any> {
    const ts = this.isoTimestamp();
    const body = bodyObj ? JSON.stringify(bodyObj) : '';
    const res = await fetchWithTimeout(`${BASE}${path}`, {
      method,
      headers: this.headers(ts, method, path, body),
      body: method === 'POST' ? body : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (data?.code && data.code !== '0') {
      throw new Error(data?.msg || data?.data?.[0]?.sMsg || `OKX code ${data.code}`);
    }
    if (!res.ok) throw new Error(`OKX HTTP ${res.status}`);
    return data;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const data = await this.request('GET', '/api/v5/account/config');
      const perm: string = data?.data?.[0]?.perm ?? '';
      return { ok: true, canWithdraw: perm.includes('withdraw') };
    } catch (e) {
      return { ok: false, canWithdraw: false, errorMessage: errText(e) };
    }
  }

  async fetchBalances(): Promise<BalanceMapDetailed> {
    const data = await this.request('GET', '/api/v5/account/balance');
    const out: BalanceMapDetailed = {};
    for (const acc of data?.data ?? []) {
      for (const d of acc.details ?? []) {
        const free = parseFloat(d.availBal ?? d.cashBal ?? '0');
        if (free <= 0) continue;
        // OKX reports per-asset USD equity directly (eqUsd field).
        const usd = d.eqUsd != null && d.eqUsd !== '' ? parseFloat(d.eqUsd) : null;
        const prev = out[d.ccy];
        out[d.ccy] = {
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
    // OKX has no public endpoint to list the saved address book — it is managed
    // in the web UI only. Users enter the (already-whitelisted) address manually.
    return [];
  }

  async withdraw(req: AdapterWithdrawal): Promise<AdapterWithdrawalResult> {
    try {
      const data = await this.request('POST', '/api/v5/asset/withdrawal', {
        ccy: req.asset,
        amt: String(req.amount),
        dest: '4', // on-chain
        toAddr: req.memo ? `${req.address}:${req.memo}` : req.address,
        chain: req.network ? `${req.asset}-${req.network}` : undefined,
      });
      const wdId = data?.data?.[0]?.wdId;
      return { ok: true, transactionId: wdId };
    } catch (e) {
      return { ok: false, errorMessage: errText(e) };
    }
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
