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

interface StoredCredentials {
  apiKey: string;
  apiSecret: EncryptedData;
  passphrase?: EncryptedData;
  totpSecret?: EncryptedData;
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

/** Encrypt + persist credentials for an exchange. */
export async function storeCredentials(
  exchangeId: string,
  creds: ApiCredentials,
  encryptionKey: Uint8Array
): Promise<void> {
  const record: StoredCredentials = {
    apiKey: creds.apiKey,
    apiSecret: encryptString(creds.apiSecret, encryptionKey),
    passphrase: creds.passphrase
      ? encryptString(creds.passphrase, encryptionKey)
      : undefined,
    totpSecret: creds.totpSecret
      ? encryptString(creds.totpSecret, encryptionKey)
      : undefined,
  };
  await setJSON(keyFor(exchangeId), record);
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
