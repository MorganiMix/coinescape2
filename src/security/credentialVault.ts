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
}
