/**
 * Kraken adapter (api.kraken.com).
 * Signing: API-Sign = HMAC-SHA512... Kraken actually uses SHA-512; to stay on
 * the dependency we already ship (@noble/hashes sha2) we use its sha512 export.
 * Signature = base64( HMAC-SHA512( secret, uriPath + SHA256(nonce + postData) ) ).
 * Docs: https://docs.kraken.com/rest/#section/Authentication
 */
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha2';

import { ApiCredentials } from '@/security';
import {
  AdapterWithdrawal,
  AdapterWithdrawalResult,
  BalanceMapDetailed,
  ConnectionTestResult,
  ExchangeAdapter,
  SavedAddress,
} from '../adapter';
import {
  base64Decode,
  base64Encode,
  fetchWithTimeout,
  nowMs,
  sha256Bytes,
  toQuery,
  utf8ToBytes,
} from '../signing';
import {
  isKrakenUsdPairFor,
  parseKrakenAsset,
  toAppSymbol,
  toKrakenAsset,
  toKrakenUsdPair,
} from './krakenAssets';

const BASE = 'https://api.kraken.com';

export class KrakenAdapter implements ExchangeAdapter {
  readonly id = 'kraken';
  readonly name = 'Kraken';
  constructor(private readonly creds: ApiCredentials) {}

  private async privatePost(
    path: string,
    params: Record<string, string | number> = {}
  ): Promise<any> {
    const nonce = nowMs() * 1000;
    const post = toQuery({ nonce, ...params });
    // SHA256(nonce + postData)
    const inner = sha256Bytes(utf8ToBytes(String(nonce) + post));
    // uriPath bytes + inner
    const pathBytes = utf8ToBytes(path);
    const message = new Uint8Array(pathBytes.length + inner.length);
    message.set(pathBytes, 0);
    message.set(inner, pathBytes.length);
    const secret = base64Decode(this.creds.apiSecret);
    const sig = base64Encode(hmac(sha512, secret, message));

    const res = await fetchWithTimeout(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'API-Key': this.creds.apiKey,
        'API-Sign': sig,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: post,
    });
    const data = await res.json().catch(() => ({}));
    if (data?.error?.length) throw new Error(data.error.join('; '));
    if (!res.ok) throw new Error(`Kraken HTTP ${res.status}`);
    return data.result;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.privatePost('/0/private/Balance');
      // Kraken doesn't expose a permission-flags endpoint; a successful private
      // call proves the key is valid. WITHDRAW is verified at withdrawal time.
      return { ok: true, canWithdraw: true };
    } catch (e) {
      return { ok: false, canWithdraw: false, errorMessage: errText(e) };
    }
  }

  async fetchBalances(): Promise<BalanceMapDetailed> {
    const result = await this.privatePost('/0/private/Balance');
    const amounts: Record<string, number> = {};
    for (const [raw, amountStr] of Object.entries(result ?? {})) {
      const amount = parseFloat(amountStr as string);
      if (!(amount > 0)) continue;

      // Kraken reports legacy-prefixed codes (XXDG, XXMR, ZUSD) and per-product
      // sub-balances (DOT.S, XBT.M, EUR.HOLD) from the same endpoint.
      const { symbol, withdrawable } = parseKrakenAsset(raw);

      // Bonded balances are deliberately dropped rather than summed into spot.
      // DOT unbonds over 28 days and ATOM over 21 — including them would let the
      // withdrawal engine plan a transfer larger than the account can actually
      // send, and the failure would only surface mid-panic.
      if (!withdrawable) continue;

      // `.M` / `.HOLD` sub-balances fold into their spot symbol (XBT.M → BTC).
      amounts[symbol] = (amounts[symbol] ?? 0) + amount;
    }

    const prices = await this.fetchUsdPrices(Object.keys(amounts));
    const out: BalanceMapDetailed = {};
    for (const [asset, amount] of Object.entries(amounts)) {
      const price = prices[asset];
      out[asset] = { amount, usdValue: price != null ? amount * price : null };
    }
    return out;
  }

  /** Public Kraken Ticker prices in USD (USDT/USDC priced at $1). */
  private async fetchUsdPrices(assets: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    const stables = new Set(['USDT', 'USDC', 'USD', 'DAI']);
    for (const a of assets) if (stables.has(a)) out[a] = 1;

    // Pairs are requested by altname (BTC → XBTUSD, DOGE → XDGUSD).
    const needed = assets.filter((a) => !stables.has(a));
    if (needed.length === 0) return out;

    try {
      const pairs = needed.map(toKrakenUsdPair).join(',');
      const res = await fetchWithTimeout(
        `${BASE}/0/public/Ticker?pair=${encodeURIComponent(pairs)}`,
        { method: 'GET' }
      );
      if (!res.ok) return out;
      const data = await res.json();
      const result = data?.result ?? {};
      for (const a of needed) {
        // Kraken answers with the canonical key, not the altname we asked for
        // (XMRUSD → XXMRZUSD), so match against every shape it is known to use.
        // The previous substring match was ambiguous: a DOT lookup would happily
        // bind to any returned key merely containing "DOT".
        const entry = Object.entries(result).find(([k]) => isKrakenUsdPairFor(k, a));
        const last = (entry?.[1] as any)?.c?.[0];
        const price = last != null ? parseFloat(last) : NaN;
        if (price > 0) out[a] = price;
      }
    } catch {
      // Unpriced assets fall through as null.
    }
    return out;
  }

  async fetchWithdrawAddresses(): Promise<SavedAddress[]> {
    try {
      // POST /0/private/WithdrawAddresses → [{ address, asset, method, key, verified }]
      const result = await this.privatePost('/0/private/WithdrawAddresses');
      const list: any[] = Array.isArray(result) ? result : [];
      return list.map((a) => ({
        asset: a?.asset ? toAppSymbol(String(a.asset).toUpperCase()) : null,
        address: String(a?.address ?? ''),
        // The withdrawal-key name is the label AND the value Kraken withdraws to.
        label: String(a?.key ?? a?.address ?? 'Unnamed'),
        network: a?.method ? String(a.method) : undefined,
        krakenKey: a?.key ? String(a.key) : undefined,
        verified: Boolean(a?.verified),
      }));
    } catch {
      return [];
    }
  }

  async withdraw(req: AdapterWithdrawal): Promise<AdapterWithdrawalResult> {
    try {
      // Kraken withdraws to a pre-named, whitelisted "withdrawal key" — `key` is
      // that wallet-name label, configured per asset in Settings. Fall back to
      // the address field only if no explicit Kraken key was provided.
      const key = (req.krakenKey ?? '').trim() || req.address;
      if (!key) {
        return { ok: false, errorMessage: 'Kraken requires a withdrawal wallet name (key).' };
      }
      const result = await this.privatePost('/0/private/Withdraw', {
        // BTC → XBT, DOGE → XDG; everything else is already Kraken's own code.
        asset: toKrakenAsset(req.asset),
        key,
        amount: req.amount,
      });
      return { ok: true, transactionId: result?.refid };
    } catch (e) {
      return { ok: false, errorMessage: errText(e) };
    }
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
