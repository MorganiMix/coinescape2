/**
 * Encrypted, PIN-gated profile transfer — encoded into a QR code.
 *
 * A profile's sensitive payload (exchange API credentials + coin allocations)
 * is encrypted with AES-256-GCM under a key derived (Argon2id) from a one-time
 * transfer code the app generates and the sender reads out to the receiver.
 * The ciphertext is emitted as a single compact string that the sender renders
 * as a QR code and the receiver scans. A wrong PIN fails GCM authentication and
 * the import is rejected.
 *
 * QR codes have a finite byte capacity, so the encoded string is capped; a
 * profile with too many exchanges to fit in one code is rejected with a clear
 * message (see {@link MAX_QR_PAYLOAD_CHARS}).
 */
import { AllocationTargets } from '@/domain/types';
import {
  EncryptedData,
  bytesToHex,
  decryptString,
  deriveTransferKey,
  encryptString,
  hexToBytes,
  newSalt,
} from './crypto';
import { ApiCredentials } from './credentialVault';

const FORMAT = 'coinescape.profile' as const;
const VERSION = 2 as const;
/** Known constant encrypted under the transfer key — clean wrong-PIN detection. */
const CHECK_CONSTANT = 'coinescape-profile-ok';

/**
 * Upper bound on the encoded transfer-string length. QR "alphanumeric" mode
 * tops out ~4296 chars at the lowest error correction; JSON+hex is byte mode
 * (~2953 max) — we stay well under with margin for reliable scanning.
 */
export const MAX_QR_PAYLOAD_CHARS = 2200;

/** Plaintext payload that gets encrypted into the transfer. */
export interface ProfilePayload {
  allocations: AllocationTargets;
  /** exchangeId -> plaintext API credentials. */
  creds: Record<string, ApiCredentials>;
}

/** Wire shape of a transferred profile (compact keys to save QR bytes). */
interface ProfileTransferFile {
  f: typeof FORMAT;
  v: typeof VERSION;
  /** Profile display name (non-secret; shown by the importer before PIN entry). */
  n: string;
  /** Argon2id salt (hex). */
  s: string;
  /** AES-256-GCM of JSON.stringify(ProfilePayload). */
  p: EncryptedData;
  /** AES-256-GCM of CHECK_CONSTANT — for a clean wrong-PIN message. */
  c: EncryptedData;
}

export class TransferTooLargeError extends Error {
  constructor() {
    super('This profile has too many exchanges to transfer in one QR code. Remove some and try again.');
    this.name = 'TransferTooLargeError';
  }
}

/**
 * Build the encrypted transfer string for a profile, to be rendered as a QR.
 * @param name    profile display name
 * @param payload plaintext profile data (decrypted credentials + allocations)
 * @param code    one-time transfer code the sender reads out to the receiver.
 *                Deliberately NOT the user's vault PIN: this QR leaves the
 *                device, and a captured one encrypted under the vault PIN would
 *                put that PIN inside a 10^6 offline search.
 * @throws {@link TransferTooLargeError} if the result won't fit in one QR code.
 */
export function buildExport(name: string, payload: ProfilePayload, code: string): string {
  const salt = newSalt();
  const key = deriveTransferKey(code, salt);
  try {
    const file: ProfileTransferFile = {
      f: FORMAT,
      v: VERSION,
      n: name,
      s: bytesToHex(salt),
      p: encryptString(JSON.stringify(payload), key),
      c: encryptString(CHECK_CONSTANT, key),
    };
    const encoded = JSON.stringify(file);
    if (encoded.length > MAX_QR_PAYLOAD_CHARS) throw new TransferTooLargeError();
    return encoded;
  } finally {
    key.fill(0);
  }
}

export interface ImportResult {
  name: string;
  payload: ProfilePayload;
}

/** Read just the non-secret display name from a scanned string (before PIN). */
export function peekTransferName(text: string): string | null {
  try {
    const file = JSON.parse(text) as Partial<ProfileTransferFile>;
    if (file?.f !== FORMAT) return null;
    return typeof file.n === 'string' ? file.n : 'Imported profile';
  } catch {
    return null;
  }
}

/**
 * Parse + decrypt a scanned transfer string with its one-time transfer code.
 * Throws a user-facing Error on malformed input or a wrong code.
 */
export function parseImport(text: string, code: string): ImportResult {
  let file: ProfileTransferFile;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('That QR code isn’t a valid Coin Escape profile.');
  }
  if (!file || file.f !== FORMAT) {
    throw new Error('Unrecognised QR code — this is not a Coin Escape profile transfer.');
  }
  if (file.v !== VERSION) {
    throw new Error(`Unsupported profile transfer version (${file.v}).`);
  }
  if (!file.s || !file.p || !file.c) {
    throw new Error('Profile transfer is missing required fields or is corrupted.');
  }

  const key = deriveTransferKey(code, hexToBytes(file.s));
  try {
    // Wrong code → GCM auth failure → throws here (or check mismatch below).
    const check = decryptString(file.c, key);
    if (check !== CHECK_CONSTANT) throw new Error('wrong-code');
    const json = decryptString(file.p, key);
    const payload = JSON.parse(json) as ProfilePayload;
    if (!payload || typeof payload !== 'object' || !payload.creds) {
      throw new Error('Profile transfer decrypted but its contents are invalid.');
    }
    return { name: typeof file.n === 'string' ? file.n : 'Imported profile', payload };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('decrypted but its contents')) throw e;
    throw new Error('Wrong transfer code for this QR — the API credentials could not be decrypted.');
  } finally {
    key.fill(0);
  }
}
