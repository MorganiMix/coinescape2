/**
 * Credential Vault — secure at-rest storage of exchange API credentials.
 *
 * Requirement 8:
 *  - apiSecret and passphrase are encrypted with AES-256-GCM (8.1, 8.2).
 *  - The key is the session key derived via PBKDF2-100k from the user
 *    password (8.3) and supplied at call time (8.4) — it is never persisted.
 *  - apiKey is stored unencrypted as it is only an identifier (per design.md).
 *  - Credentials are never logged in plain text (8.5).
 */
import { EncryptedData, decryptString, encryptString } from './crypto';
import { deleteItem, getJSON, setJSON } from './secureStore';

export interface ApiCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  /**
   * Base32 TOTP seed for exchanges that require a 2FA code on withdrawal
   * (e.g. Deribit's `tfa` parameter). Stored encrypted; used to generate the
   * live 6-digit code at panic time so the withdrawal is not rejected.
   */
  totpSecret?: string;
}

/**
 * At-rest shape of a stored credential record. apiKey is a plaintext identifier;
 * the secret fields are AES-256-GCM blobs encrypted under the account master key.
 *
 * Exported so the profile store can move whole records verbatim between
 * profiles without decrypting/re-encrypting (every profile shares the same
 * account master key, so an encrypted record is portable across profiles).
 */
export interface StoredCredentials {
  apiKey: string;
  apiSecret: EncryptedData;
  passphrase?: EncryptedData;
  totpSecret?: EncryptedData;
  /**
   * External IP address the key was set up / last verified from (plaintext — an
   * IP is not a secret). Used to warn the user if their IP changes so they can
   * re-whitelist it on the exchange. Profile-scoped automatically because it
   * lives in the credential record, which the profile store moves verbatim.
   */
  setupIp?: string;
}

const keyFor = (exchangeId: string) => `coinescape.creds.${exchangeId}.v1`;

/**
 * Index of exchange ids that currently have stored credentials. expo-secure-store
 * has no "list keys" API, so we maintain this set ourselves to know which
 * exchanges to restore as connected on the next login. It holds only exchange
 * ids (no secrets), so it is stored as plain JSON.
 */
const INDEX_KEY = 'coinescape.creds.index.v1';
/** Exported so the fresh-install reset can clear stale index entries on iOS. */
export const CREDS_INDEX_KEY = INDEX_KEY;

async function readIndex(): Promise<string[]> {
  return (await getJSON<string[]>(INDEX_KEY)) ?? [];
}

async function addToIndex(exchangeId: string): Promise<void> {
  const set = new Set(await readIndex());
  set.add(exchangeId);
  await setJSON(INDEX_KEY, [...set]);
}

async function removeFromIndex(exchangeId: string): Promise<void> {
  const next = (await readIndex()).filter((id) => id !== exchangeId);
  await setJSON(INDEX_KEY, next);
}

/** List the exchange ids that have stored credentials (for login restore). */
export async function listStoredCredentialExchanges(): Promise<string[]> {
  return readIndex();
}

/** Overwrite the credential index with an explicit set of exchange ids. */
export async function replaceCredentialIndex(exchangeIds: string[]): Promise<void> {
  await setJSON(INDEX_KEY, [...new Set(exchangeIds)]);
}

/**
 * Encrypt a set of plaintext credentials into the at-rest record shape under
 * the given master key (no persistence). Used both by storeCredentials and by
 * the profile importer to re-key imported credentials onto the account.
 */
export function encryptApiCredentials(
  creds: ApiCredentials,
  encryptionKey: Uint8Array
): StoredCredentials {
  return {
    apiKey: creds.apiKey,
    apiSecret: encryptString(creds.apiSecret, encryptionKey),
    passphrase: creds.passphrase
      ? encryptString(creds.passphrase, encryptionKey)
      : undefined,
    totpSecret: creds.totpSecret
      ? encryptString(creds.totpSecret, encryptionKey)
      : undefined,
  };
}

/** Encrypt + persist credentials for an exchange. */
export async function storeCredentials(
  exchangeId: string,
  creds: ApiCredentials,
  encryptionKey: Uint8Array
): Promise<void> {
  await setJSON(keyFor(exchangeId), encryptApiCredentials(creds, encryptionKey));
  await addToIndex(exchangeId);
}

/** Retrieve + decrypt credentials. Returns null if none stored. Throws on bad key. */
export async function retrieveCredentials(
  exchangeId: string,
  encryptionKey: Uint8Array
): Promise<ApiCredentials | null> {
  const record = await getJSON<StoredCredentials>(keyFor(exchangeId));
  if (!record) return null;
  return {
    apiKey: record.apiKey,
    apiSecret: decryptString(record.apiSecret, encryptionKey),
    passphrase: record.passphrase
      ? decryptString(record.passphrase, encryptionKey)
      : undefined,
    totpSecret: record.totpSecret
      ? decryptString(record.totpSecret, encryptionKey)
      : undefined,
  };
}

export async function deleteCredentials(exchangeId: string): Promise<void> {
  await deleteItem(keyFor(exchangeId));
  await removeFromIndex(exchangeId);
}

/**
 * Read the external IP the exchange's key was set up from (plaintext), or null
 * if none recorded / no credentials stored. No session key needed.
 */
export async function getStoredSetupIp(exchangeId: string): Promise<string | null> {
  const record = await getJSON<StoredCredentials>(keyFor(exchangeId));
  return record?.setupIp ?? null;
}

/**
 * Record/patch the setup IP on an existing credential record. No-op if there is
 * no stored record for the exchange. Leaves the encrypted fields untouched.
 */
export async function setStoredSetupIp(exchangeId: string, ip: string): Promise<void> {
  const record = await getJSON<StoredCredentials>(keyFor(exchangeId));
  if (!record) return;
  await setJSON(keyFor(exchangeId), { ...record, setupIp: ip });
}

// ───────────────────────────────────────────────────────────────────────────
// Raw record access — used by the profile store to snapshot / restore a whole
// profile's credentials. These move the ALREADY-ENCRYPTED record verbatim; no
// decryption happens here, so the session key is not required.
// ───────────────────────────────────────────────────────────────────────────

/** Read the encrypted credential record for an exchange (null if none). */
export async function readStoredCredentialRecord(
  exchangeId: string
): Promise<StoredCredentials | null> {
  return getJSON<StoredCredentials>(keyFor(exchangeId));
}

/** Write an encrypted credential record verbatim (does NOT touch the index). */
export async function writeStoredCredentialRecord(
  exchangeId: string,
  record: StoredCredentials
): Promise<void> {
  await setJSON(keyFor(exchangeId), record);
}

/** Delete an exchange's credential record only (does NOT touch the index). */
export async function deleteStoredCredentialRecord(exchangeId: string): Promise<void> {
  await deleteItem(keyFor(exchangeId));
}
