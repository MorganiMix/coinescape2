/**
 * RFC 6238 TOTP generator — used to satisfy exchange 2FA requirements (e.g.
 * Deribit's `private/withdraw` `tfa` parameter) automatically at panic time,
 * from the same base32 secret seed the user's authenticator app holds.
 *
 * Implemented over @noble/hashes (already a dependency) — no native crypto:
 *  - HMAC-SHA1 over the 8-byte big-endian time counter (RFC 4226 HOTP),
 *  - dynamic truncation to a zero-padded N-digit code.
 *
 * The secret seed never leaves the device unencrypted — it is stored in the
 * AES-256-GCM credential vault and only decrypted in-memory during a session.
 */
import { hmac } from '@noble/hashes/hmac';
import { sha1 } from '@noble/hashes/legacy';

/** Decode an RFC 4648 base32 string (case-insensitive, padding optional). */
export function base32Decode(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  // Strip spaces (authenticator apps group the seed) and padding, uppercase.
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  if (clean.length === 0) return new Uint8Array(0);

  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character in 2FA secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** Encode an integer as an 8-byte big-endian buffer (the HOTP counter). */
function counterBytes(counter: number): Uint8Array {
  const buf = new Uint8Array(8);
  // JS bitwise ops are 32-bit; split into high/low 32-bit halves.
  let lo = counter >>> 0;
  let hi = Math.floor(counter / 0x100000000) >>> 0;
  for (let i = 7; i >= 4; i--) {
    buf[i] = lo & 0xff;
    lo >>>= 8;
  }
  for (let i = 3; i >= 0; i--) {
    buf[i] = hi & 0xff;
    hi >>>= 8;
  }
  return buf;
}

/** Compute an HOTP code for a given counter and secret bytes. */
function hotp(secret: Uint8Array, counter: number, digits: number): string {
  const mac = hmac(sha1, secret, counterBytes(counter));
  // Dynamic truncation (RFC 4226 §5.3).
  const offset = mac[mac.length - 1] & 0x0f;
  const binCode =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  const mod = 10 ** digits;
  return String(binCode % mod).padStart(digits, '0');
}

/**
 * Generate the current TOTP code for a base32 secret.
 *
 * @param secretBase32 the authenticator seed (base32; spaces/padding tolerated)
 * @param nowMs        current epoch ms (injectable for testing / sandboxes)
 * @param period       time step in seconds (default 30)
 * @param digits       code length (default 6)
 */
export function generateTotp(
  secretBase32: string,
  nowMs: number,
  period = 30,
  digits = 6
): string {
  const secret = base32Decode(secretBase32);
  if (secret.length === 0) throw new Error('Empty 2FA secret');
  const counter = Math.floor(nowMs / 1000 / period);
  return hotp(secret, counter, digits);
}
