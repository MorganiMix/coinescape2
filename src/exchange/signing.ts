/**
 * Signed-REST primitives shared by every exchange adapter.
 *
 * React Native has `fetch` and `TextEncoder` but no Node crypto, so request
 * signing uses @noble/hashes (the same dependency the security layer relies on)
 * for HMAC-SHA256 and SHA-256 — no native linking required.
 */
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils';

/** HMAC-SHA256(message, key) as a lowercase hex string. */
export function hmacSha256Hex(key: string, message: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(key), utf8ToBytes(message)));
}

/** HMAC-SHA256 with a raw byte key (Kraken uses a base64-decoded secret). */
export function hmacSha256Bytes(key: Uint8Array, message: Uint8Array): Uint8Array {
  return hmac(sha256, key, message);
}

/** SHA-256(message) raw bytes. */
export function sha256Bytes(message: Uint8Array): Uint8Array {
  return sha256(message);
}

/** SHA-256(message) hex. */
export function sha256Hex(message: string): string {
  return bytesToHex(sha256(utf8ToBytes(message)));
}

/** Deterministic querystring (insertion order preserved) for signing. */
export function toQuery(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

/** Base64 helpers built on the noble byte utils (no Buffer dependency). */
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64_CHARS[b2 & 0x3f] : '=';
  }
  return out;
}

export function base64Decode(str: string): Uint8Array {
  const clean = str.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i]);
    const c1 = B64_CHARS.indexOf(clean[i + 1]);
    const c2 = B64_CHARS.indexOf(clean[i + 2]);
    const c3 = B64_CHARS.indexOf(clean[i + 3]);
    if (p < len) out[p++] = (c0 << 2) | (c1 >> 4);
    if (p < len && c2 >= 0) out[p++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    if (p < len && c3 >= 0) out[p++] = ((c2 & 0x03) << 6) | c3;
  }
  return out;
}

export { bytesToHex, hexToBytes, utf8ToBytes };

/**
 * Monotonic millisecond timestamp source for nonces. `Date.now()` is restricted
 * in some sandboxes used during testing, so callers pass an explicit base when
 * needed; in the app this resolves to wall-clock ms.
 */
export function nowMs(): number {
  return Date.now();
}

/** fetch() with a timeout so a hung exchange can't stall the panic flow. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 12_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * fetch() with a timeout AND exponential-backoff retries for transient
 * failures — aborted requests (timeout) and network errors. HTTP responses
 * (including 4xx/5xx and rate-limit 429s) are returned to the caller unless
 * `retryOn` says otherwise, so the caller can inspect status/body.
 *
 * Used by exchanges (e.g. Deribit) that intermittently drop or stall requests
 * and recommend client-side backoff rather than failing on the first hiccup.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: {
    timeoutMs?: number;
    retries?: number;
    /** Base backoff in ms; doubles each attempt. */
    backoffMs?: number;
    /** Return true to retry a *successful* HTTP response (e.g. 429/503). */
    retryOn?: (res: Response) => boolean;
  } = {}
): Promise<Response> {
  const { timeoutMs = 20_000, retries = 2, backoffMs = 600, retryOn } = opts;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (attempt < retries && retryOn?.(res)) {
        await delay(backoffMs * 2 ** attempt);
        continue;
      }
      return res;
    } catch (e) {
      // AbortError (timeout) and network errors are transient — back off and
      // retry. Re-throw on the final attempt.
      lastErr = e;
      if (attempt >= retries) break;
      await delay(backoffMs * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
