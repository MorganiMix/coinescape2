/**
 * Cryptographic primitives for Coin Escape.
 *
 * Implements Requirement 8 (Credential Security):
 *  - AES-256-GCM authenticated encryption for API secrets / passphrases.
 *  - PBKDF2-SHA256 key derivation from the user password (600,000 iterations).
 *  - CSPRNG salt / IV generation via expo-crypto.
 *
 * All routines are pure JS (@noble/*) so there is no native linking and the
 * exact named algorithms (AES-256-GCM, PBKDF2-600k) are guaranteed regardless
 * of platform WebCrypto availability.
 */
import { gcm } from '@noble/ciphers/aes';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';
import * as ExpoCrypto from 'expo-crypto';

/** PBKDF2 iteration count mandated by Requirement 8.3 (OWASP 600,000+). */
export const PBKDF2_ITERATIONS = 600_000;
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
  return pbkdf2(sha256, utf8ToBytes(password), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LEN,
  });
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
  return pbkdf2(sha256, utf8ToBytes(password), salt, {
    c: iterations,
    dkLen: KEY_LEN,
  });
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
