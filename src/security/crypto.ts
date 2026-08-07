/**
 * Cryptographic primitives for Coin Escape.
 *
 * Implements Requirement 8 (Credential Security):
 *  - AES-256-GCM authenticated encryption for API secrets / passphrases.
 *  - PBKDF2-SHA256 key derivation from the user password (600,000 iterations).
 *  - CSPRNG salt / IV generation via expo-crypto.
 *
 * PBKDF2 uses react-native-quick-crypto (native JSI) when present for speed,
 * falling back to pure-JS @noble on web / Expo Go; both compute the identical
 * PBKDF2-HMAC-SHA256 result. AES-256-GCM stays on @noble. The exact named
 * algorithms (AES-256-GCM, PBKDF2-600k) are guaranteed on every platform.
 */
import { gcm } from '@noble/ciphers/aes';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils';
import { argon2id as nobleArgon2id } from '@noble/hashes/argon2';
import { pbkdf2 as noblePbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';
import * as ExpoCrypto from 'expo-crypto';

/**
 * PBKDF2 iteration count used for the credential-encryption MASTER key
 * (Requirement 8.3, OWASP 600,000+). The password *verifier* uses Argon2id
 * (see below); the master key stays on PBKDF2 so existing encrypted
 * credentials + profile snapshots remain valid without re-encryption.
 */
export const PBKDF2_ITERATIONS = 600_000;

/**
 * Argon2id cost parameters for the password verifier — OWASP minimum for
 * Argon2id: 19 MiB memory, 2 passes, 1 lane. Native (quick-crypto) runs this
 * in tens of ms; the @noble fallback is slower but only used on web/Expo Go.
 */
export const ARGON2_MEMORY_KIB = 19_456; // 19 MiB
export const ARGON2_PASSES = 2;
export const ARGON2_PARALLELISM = 1;
export const ARGON2_VERSION = 0x13; // v1.3

/**
 * Native PBKDF2 (react-native-quick-crypto, JSI/C++) when available, else the
 * pure-JS @noble implementation. On device the native path is 10–50x faster,
 * which is what keeps a 600,000-iteration login sub-second instead of ~30–45s
 * per derivation. The fallback keeps web / Expo Go working.
 *
 * Both paths compute standard PBKDF2-HMAC-SHA256 over the raw password/salt
 * bytes, so their outputs are byte-identical for identical inputs — existing
 * stored verifiers and encryption keys remain valid after the switch.
 */
type NativePbkdf2Sync = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keylen: number,
  digest: string
) => Uint8Array;

const nativePbkdf2Sync: NativePbkdf2Sync | null = (() => {
  try {
    // Lazily required so a missing native module (web/Expo Go) just falls back.
    const qc = require('react-native-quick-crypto');
    const fn = qc?.pbkdf2Sync ?? qc?.default?.pbkdf2Sync;
    return typeof fn === 'function' ? (fn as NativePbkdf2Sync) : null;
  } catch {
    return null;
  }
})();

function pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keylen: number
): Uint8Array {
  if (nativePbkdf2Sync) {
    // quick-crypto returns a Buffer (a Uint8Array subclass); normalise to a
    // plain Uint8Array so downstream length/GCM checks behave identically.
    const out = nativePbkdf2Sync(password, salt, iterations, keylen, 'sha256');
    return Uint8Array.from(out);
  }
  return noblePbkdf2(sha256, password, salt, { c: iterations, dkLen: keylen });
}

/**
 * Native Argon2id (react-native-quick-crypto) when available, else pure-JS
 * @noble. Both implement RFC 9106 Argon2id, so for identical inputs and cost
 * parameters they produce byte-identical output — a verifier hashed natively
 * verifies against the noble fallback and vice-versa.
 */
interface NativeArgon2Params {
  message: Uint8Array;
  nonce: Uint8Array;
  parallelism: number;
  tagLength: number;
  memory: number;
  passes: number;
  version: number;
}
type NativeArgon2Sync = (algorithm: string, params: NativeArgon2Params) => Uint8Array;

const nativeArgon2Sync: NativeArgon2Sync | null = (() => {
  try {
    const qc = require('react-native-quick-crypto');
    const fn = qc?.argon2Sync ?? qc?.default?.argon2Sync;
    return typeof fn === 'function' ? (fn as NativeArgon2Sync) : null;
  } catch {
    return null;
  }
})();

function argon2idRaw(
  password: Uint8Array,
  salt: Uint8Array,
  tagLength: number
): Uint8Array {
  if (nativeArgon2Sync) {
    const out = nativeArgon2Sync('argon2id', {
      message: password,
      nonce: salt,
      parallelism: ARGON2_PARALLELISM,
      tagLength,
      memory: ARGON2_MEMORY_KIB,
      passes: ARGON2_PASSES,
      version: ARGON2_VERSION,
    });
    return Uint8Array.from(out);
  }
  return Uint8Array.from(
    nobleArgon2id(password, salt, {
      t: ARGON2_PASSES,
      m: ARGON2_MEMORY_KIB,
      p: ARGON2_PARALLELISM,
      version: ARGON2_VERSION,
      dkLen: tagLength,
    })
  );
}

/** AES-256 key length in bytes. */
const KEY_LEN = 32;
/** 128-bit salt. */
const SALT_LEN = 16;
/** 96-bit IV/nonce recommended for GCM. */
const IV_LEN = 12;

/** Cryptographically-secure random bytes from the platform CSPRNG. */
export function randomBytes(length: number): Uint8Array {
  return ExpoCrypto.getRandomBytes(length);
}

export function newSalt(): Uint8Array {
  return randomBytes(SALT_LEN);
}

/**
 * Derive a 256-bit AES key from a password + salt using PBKDF2-SHA256.
 * Used both as the credential-encryption key and (separately salted) for the
 * password verifier.
 */
export function deriveKey(password: string, salt: Uint8Array): Uint8Array {
  return pbkdf2Sha256(utf8ToBytes(password), salt, PBKDF2_ITERATIONS, KEY_LEN);
}

/**
 * Derive a 256-bit AES key from a password + salt using PBKDF2-SHA256
 * with a custom iteration count. Used for verifying old password hashes
 * during the upgrade process.
 */
export function deriveKeyWithIterations(
  password: string,
  salt: Uint8Array,
  iterations: number
): Uint8Array {
  return pbkdf2Sha256(utf8ToBytes(password), salt, iterations, KEY_LEN);
}

/**
 * Derive a 256-bit password *verifier* using Argon2id (OWASP-recommended
 * memory-hard KDF). Used only to gate login — compared in constant time
 * against the stored verifier. This is NOT the credential-encryption key.
 */
export function deriveVerifierArgon2id(
  password: string,
  salt: Uint8Array
): Uint8Array {
  return argon2idRaw(utf8ToBytes(password), salt, KEY_LEN);
}

/**
 * Derive a 256-bit AES key from a short one-time transfer PIN using Argon2id.
 * Used to encrypt a profile-transfer QR payload — a low-entropy PIN is only
 * safe because the memory-hard KDF + single-use nature make brute force
 * impractical within the transfer window.
 */
export function deriveTransferKey(pin: string, salt: Uint8Array): Uint8Array {
  return argon2idRaw(utf8ToBytes(pin), salt, KEY_LEN);
}

/** Shape of an AES-256-GCM ciphertext, hex-encoded for JSON-safe storage. */
export interface EncryptedData {
  /** AES-256-GCM */
  alg: 'AES-256-GCM';
  /** hex IV (96-bit) */
  iv: string;
  /** hex ciphertext including the GCM auth tag appended by @noble */
  ct: string;
}

/**
 * Encrypt a UTF-8 string with AES-256-GCM under the supplied 32-byte key.
 * A fresh random IV is generated per call (never reuse an IV with GCM).
 */
export function encryptString(plaintext: string, key: Uint8Array): EncryptedData {
  assertKey(key);
  const iv = randomBytes(IV_LEN);
  const cipher = gcm(key, iv);
  const ct = cipher.encrypt(utf8ToBytes(plaintext));
  return { alg: 'AES-256-GCM', iv: bytesToHex(iv), ct: bytesToHex(ct) };
}

/**
 * Decrypt an {@link EncryptedData} blob. Throws if the key is wrong or the
 * ciphertext/tag has been tampered with (GCM authentication failure).
 * Satisfies Requirement 8.4 — decryption only succeeds with a valid key.
 */
export function decryptString(data: EncryptedData, key: Uint8Array): string {
  assertKey(key);
  const cipher = gcm(key, hexToBytes(data.iv));
  const pt = cipher.decrypt(hexToBytes(data.ct));
  return bytesToUtf8(pt);
}

function assertKey(key: Uint8Array): void {
  if (key.length !== KEY_LEN) {
    throw new Error(`Invalid encryption key length: expected ${KEY_LEN} bytes`);
  }
}

export { bytesToHex, hexToBytes };
