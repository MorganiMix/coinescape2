/**
 * Deribit V2 adapter (www.deribit.com).
 *
 * Deribit exposes a JSON-RPC 2.0 API over REST at `/api/v2/`. Authentication
 * uses OAuth2 client_credentials: POST `public/auth` with the API key as
 * client_id and the API secret as client_secret returns a short-lived bearer
 * access token, which is then sent as `Authorization: Bearer <token>` on every
 * private call. (No per-request HMAC signing required.)
 *
 * Docs: https://docs.deribit.com/ (Authentication → client_credentials)
 *
 * Notes:
 *  - Balances come from `private/get_account_summaries` (one entry per currency).
 *    Deribit reports `available_withdrawal_funds` and an `equity_usd`-style USD
 *    figure we use to price each currency.
 *  - The saved withdrawal address book is `private/get_withdrawal` is per-asset;
 *    we sweep the account currencies and merge their address lists.
 *  - Withdrawals use `private/withdraw` with a pre-created (whitelisted) address.
 */
import { ApiCredentials, generateTotp } from '@/security';
import {
  AdapterWithdrawal,
  AdapterWithdrawalResult,
  BalanceMapDetailed,
  ConnectionTestResult,
  ExchangeAdapter,
  SavedAddress,
} from '../adapter';
import { fetchWithRetry, nowMs, toQuery } from '../signing';

const BASE = 'https://www.deribit.com';

export class DeribitAdapter implements ExchangeAdapter {
  readonly id = 'deribit';
  readonly name = 'Deribit';
  constructor(private readonly creds: ApiCredentials) {}

  /** Cached bearer token + expiry (epoch ms) for the life of this adapter. */
  private token: string | null = null;
  private tokenExpiry = 0;
  /** Scope string from the most recent auth grant (e.g. "wallet:read_write"). */
  private scope = '';
  /** De-duplicates concurrent auth calls so a fan-out triggers ONE auth. */
  private authInFlight: Promise<string> | null = null;

  /** Authenticate via client_credentials and cache the bearer token + scope. */
  private async authToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiry - 5_000) return this.token;
    // Collapse concurrent callers (e.g. the address-book sweep) onto one request.
    if (this.authInFlight) return this.authInFlight;

    this.authInFlight = (async () => {
      const query = toQuery({
        grant_type: 'client_credentials',
        client_id: this.creds.apiKey,
        client_secret: this.creds.apiSecret,
      });
      // Auth is idempotent (no funds move), so retry transient edge errors:
      // Cloudflare 52x (e.g. 525 SSL handshake failed) + rate-limit/5xx.
      const res = await fetchWithRetry(
        `${BASE}/api/v2/public/auth?${query}`,
        { method: 'GET' },
        { retries: 3, retryOn: isTransientStatus }
      );
      const data = await res.json().catch(() => ({}));
      if (data?.error) throw new Error(deribitErr(data.error, 'auth'));
      const token = data?.result?.access_token;
      if (!token) {
        console.error(`[Deribit] auth failed — HTTP ${res.status} (no access_token)`);
        throw new Error(
          res.status >= 520 && res.status <= 527
            ? `Deribit auth failed — Cloudflare edge error HTTP ${res.status} (Deribit/CDN issue, usually transient). Try again in a moment.`
            : `Deribit auth failed (HTTP ${res.status})`
        );
      }
      this.token = String(token);
      this.scope = String(data?.result?.scope ?? '');
      const expiresInSec = Number(data?.result?.expires_in ?? 900);
      this.tokenExpiry = Date.now() + expiresInSec * 1000;
      return this.token;
    })();

    try {
      return await this.authInFlight;
    } finally {
      this.authInFlight = null;
    }
  }

  /**
   * Call a private JSON-RPC method (GET with bearer auth).
   *
   * Read calls retry transient timeouts/5xx with backoff. WRITE calls (i.e.
   * withdrawals) must NOT be retried on timeout: if the request reached Deribit
   * but the response was lost, a blind retry could submit the withdrawal twice.
   * Callers pass `{ idempotent: false }` for writes — that disables retries and
   * uses a longer timeout, since withdrawals take longer server-side.
   */
  private async privateCall(
    method: string,
    params: Record<string, string | number | undefined> = {},
    opts: { idempotent?: boolean } = {}
  ): Promise<any> {
    const { idempotent = true } = opts;
    const token = await this.authToken();
    const query = toQuery(params);
    const res = await fetchWithRetry(
      `${BASE}/api/v2/${method}${query ? `?${query}` : ''}`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      idempotent
        ? // Reads: retry rate-limit /5xx / Cloudflare 52x with backoff.
          { retries: 3, retryOn: isTransientStatus }
        : // Writes: single attempt, no retry, longer timeout (no double-submit).
          { retries: 0, timeoutMs: 30_000 }
    );
    const data = await res.json().catch(() => ({}));
    if (data?.error) throw new Error(deribitErr(data.error, method));
    if (!res.ok) {
      console.error(`[Deribit] ${method} failed — HTTP ${res.status}`);
      const edge = res.status >= 520 && res.status <= 527 ? ' (Cloudflare edge error)' : '';
      throw new Error(`Deribit HTTP ${res.status}${edge}`);
    }
    return data?.result;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // get_account_summaries proves the key is valid; authToken() also captures
      // the granted scope, so we read withdraw permission without a 2nd auth.
      await this.privateCall('private/get_account_summaries');
      // Deribit scopes look like "account:read_write wallet:read_write ...".
      // Withdrawals require wallet read_write (not wallet:none / wallet:read).
      const canWithdraw = /wallet:read_write/.test(this.scope);
      return { ok: true, canWithdraw };
    } catch (e) {
      return { ok: false, canWithdraw: false, errorMessage: errText(e) };
    }
  }

  async fetchBalances(): Promise<BalanceMapDetailed> {
    const result = await this.privateCall('private/get_account_summaries', { extended: 'true' });
    const summaries: any[] = result?.summaries ?? (Array.isArray(result) ? result : []);
    const out: BalanceMapDetailed = {};
    for (const s of summaries) {
      const ccy = String(s?.currency ?? '').toUpperCase();
      if (!ccy) continue;
      // Prefer the funds that can actually be withdrawn; fall back to balance.
      const amount = parseFloat(
        s?.available_withdrawal_funds ?? s?.available_funds ?? s?.balance ?? '0'
      );
      if (!amount || amount <= 0) continue;
      // Deribit reports equity in USD via `equity_usd` (extended summaries).
      const usd = s?.equity_usd != null && s.equity_usd !== '' ? parseFloat(s.equity_usd) : null;
      out[ccy] = { amount, usdValue: Number.isFinite(usd as number) ? (usd as number) : null };
    }
    return out;
  }

  async fetchWithdrawAddresses(): Promise<SavedAddress[]> {
    try {
      // The address book is per-currency. Discover the account's currencies
      // from the balances, then merge each currency's saved-address list.
      const balances = await this.fetchBalances().catch(() => ({} as BalanceMapDetailed));
      const currencies = Object.keys(balances);
      // Always include the core Deribit settlement currencies so the picker is
      // useful even before any balance has been fetched.
      for (const c of ['BTC', 'ETH', 'USDC', 'USDT']) {
        if (!currencies.includes(c)) currencies.push(c);
      }

      // Fetch each currency's address book SEQUENTIALLY (not Promise.all): a
      // parallel burst across several currencies is what trips Deribit's rate
      // limit and causes the requests to be cancelled. One auth is shared.
      const out: SavedAddress[] = [];
      for (const currency of currencies) {
        try {
          // Deribit's address book is `private/get_address_book`, scoped by
          // currency AND the `withdrawal` address type. (The whitelisted
          // withdrawal targets live under this type; `transfer` /
          // `deposit_source` rows are not valid withdrawal destinations.)
          const rows: any[] = await this.privateCall('private/get_address_book', {
            currency,
            type: 'withdrawal',
          });
          for (const a of rows ?? []) {
            out.push({
              asset: currency,
              address: String(a?.address ?? ''),
              label: a?.label ? String(a.label) : String(a?.address ?? 'Unnamed'),
              network: undefined,
              memo: undefined,
              // Deribit returns `requires_confirmation`/`confirmed`; treat an
              // address as verified unless it is explicitly unconfirmed.
              verified: a?.confirmed !== false && a?.requires_confirmation !== true,
            });
          }
        } catch {
          // Skip this currency on error; keep whatever the others returned.
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  async withdraw(req: AdapterWithdrawal): Promise<AdapterWithdrawalResult> {
    try {
      // Deribit's API requires a 2FA (TOTP) code on `private/withdraw` — without
      // a valid `tfa` it rejects the request outright with no withdrawal id.
      // Generate the live code from the stored base32 seed so a panic can
      // complete hands-free. If no seed was provided, fail with a clear hint.
      const seed = (this.creds.totpSecret ?? '').trim();
      if (!seed) {
        return {
          ok: false,
          errorMessage:
            'Deribit withdrawals require a 2FA code. Add your Deribit 2FA secret in Settings (the base32 seed from when you set up your authenticator) so panic withdrawals can generate the code automatically.',
        };
      }

      let tfa: string;
      try {
        tfa = generateTotp(seed, nowMs());
      } catch {
        return {
          ok: false,
          errorMessage:
            'Could not generate a Deribit 2FA code — the stored 2FA secret looks invalid. Re-enter the base32 seed in Settings.',
        };
      }

      // Deribit withdraws to a pre-created (whitelisted) address; `address` here
      // is the saved-address label OR the raw address registered on the account.
      // idempotent:false → single attempt, no timeout retry (avoid double-send).
      const result = await this.privateCall(
        'private/withdraw',
        {
          currency: req.asset.toUpperCase(),
          address: req.address,
          amount: req.amount,
          tfa,
        },
        { idempotent: false }
      );

      const id = result?.id ?? result?.transaction_id;
      // Deribit returns a `state` for the withdrawal. When the account still
      // requires email confirmation (separate from 2FA), the withdrawal is
      // created "unconfirmed" and won't execute until confirmed via email.
      const state = String(result?.state ?? '').toLowerCase();
      const needsConfirmation = state === 'unconfirmed' || result?.confirmed === false;

      if (id == null && !needsConfirmation) {
        return { ok: false, errorMessage: 'Deribit returned no withdrawal id' };
      }

      if (needsConfirmation) {
        return {
          ok: false,
          pending: true,
          transactionId: id != null ? String(id) : undefined,
          errorMessage:
            'Submitted to Deribit, awaiting email confirmation. Funds have NOT left yet — confirm the withdrawal via the email Deribit sent, or disable email confirmation for this whitelisted address so panic withdrawals can complete automatically.',
        };
      }

      return { ok: true, transactionId: String(id) };
    } catch (e) {
      const msg = errText(e);
      console.error(`[Deribit] withdraw failed for ${req.asset}: ${msg}`);

      // A timeout/cancel means we never got a response — the withdrawal may or
      // may NOT have reached Deribit. Report it as PENDING (unknown), not a hard
      // failure, so the user verifies on Deribit before assuming it didn't fire
      // (re-running a panic could double-withdraw). We deliberately do not auto-
      // retry withdrawals for the same reason.
      if (isTimeoutOrCancel(e)) {
        return {
          ok: false,
          pending: true,
          errorMessage:
            'Deribit did not respond in time, so the withdrawal status is UNKNOWN — it may or may not have been submitted. Check your Deribit withdrawal history before retrying to avoid sending twice.',
        };
      }

      return { ok: false, errorMessage: msg };
    }
  }
}

/**
 * HTTP statuses worth retrying with backoff: rate limit (429), origin 5xx
 * (500/502/503/504), and Cloudflare edge errors (520–527, e.g. 525 SSL
 * handshake failed) — all transient CDN/origin hiccups, not client errors.
 */
function isTransientStatus(res: Response): boolean {
  const s = res.status;
  return s === 429 || s === 500 || s === 502 || s === 503 || s === 504 || (s >= 520 && s <= 527);
}

/** True for AbortController timeouts / cancelled fetches and network drops. */
function isTimeoutOrCancel(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? '';
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    name === 'AbortError' ||
    msg.includes('cancel') ||
    msg.includes('abort') ||
    msg.includes('timeout') ||
    msg.includes('network request failed')
  );
}

/**
 * Normalise a Deribit JSON-RPC error object to a readable message AND log the
 * numeric error code for diagnostics. Deribit errors look like
 * `{ code: 13009, message: "unauthorized", data: { reason, param } }`.
 *
 * @param context where the error occurred (e.g. "withdraw", "auth") — included
 *   in the log line so the code can be traced to the failing call.
 */
function deribitErr(error: any, context = 'request'): string {
  if (!error) {
    console.error(`[Deribit] ${context} failed: unknown error (no error object)`);
    return 'Deribit error';
  }
  const code = error?.code;
  const msg = error?.message ?? 'error';
  const data = error?.data?.reason ?? error?.data?.param;

  // Log the raw code + message so the exact Deribit error code is visible in
  // the device/console logs even when the user only sees a friendly message.
  console.error(
    `[Deribit] ${context} failed — code=${code ?? 'n/a'} message="${msg}"` +
      (data ? ` data="${data}"` : '')
  );

  const codePart = code != null ? ` [${code}]` : '';
  return data
    ? `Deribit: ${msg} (${data})${codePart}`
    : `Deribit: ${msg}${codePart}`;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
