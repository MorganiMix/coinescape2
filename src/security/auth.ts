/**
 * Local-only, PASSWORDLESS vault authentication.
 *
 * Requirement 9 (revisited — biometric/passcode model):
 *  - There is no username/password. Access to the vault is gated by the
 *    device's own authentication (Face ID / Touch ID → passcode) via the
 *    biometric-protected master key in {@link module:security/vaultKey}.
 *  - The AES-256-GCM master key is a random value unlocked by device auth and
 *    held in memory only for the session (Requirement 8.6).
 *  - A tiny non-secret marker records that the vault has been enrolled on this
 *    device (so we can show "unlock" vs "set up").
 *
 * Legacy (v1) password accounts are migrated on first launch — see
 * {@link migrateLegacyAccount}.
 */
import { EncryptedData, decryptString, deriveKey, encryptString, hexToBytes } from './crypto';
import {
  StoredCredentials,
  listStoredCredentialExchanges,
  readStoredCredentialRecord,
  writeStoredCredentialRecord,
} from './credentialVault';
import { deleteItem, getJSON, setJSON } from './secureStore';
import { createMasterKey, deleteMasterKey, unlockMasterKey, writeMasterKey } from './vaultKey';

/** Non-secret marker: the vault has been enrolled on this device. */
const VAULT_MARKER_KEY = 'coinescape.vault.v2';
/** Legacy v1 password account (pre-biometric). Read-only, for migration. */
const LEGACY_ACCOUNT_KEY = 'coinescape.account.v1';
/** Legacy profile snapshot key builder (mirrors profileStore). */
const legacySnapshotKey = (id: string) => `coinescape.profile.${id}.snapshot.v1`;
const PROFILE_REGISTRY_KEY = 'coinescape.profiles.v1';

interface VaultMarker {
  createdAt: number;
}

export interface AuthSuccess {
  /** AES-256-GCM master key for the credential vault — keep in memory only. */
  encryptionKey: Uint8Array;
}

/** True once the biometric vault has been enrolled on this device. */
export async function hasAccount(): Promise<boolean> {
  return (await getJSON<VaultMarker>(VAULT_MARKER_KEY)) !== null;
}

/** True when a pre-biometric (v1 password) account still needs migrating. */
export async function hasLegacyAccount(): Promise<boolean> {
  const legacy = await getJSON<LegacyAccount>(LEGACY_ACCOUNT_KEY);
  const migrated = await hasAccount();
  return legacy !== null && !migrated;
}

/**
 * First-time enrolment: require a device lock, mint a random biometric-gated
 * master key, and record the marker. Returns the session key.
 */
export async function enrollVault(): Promise<AuthSuccess> {
  const encryptionKey = await createMasterKey(); // throws NoDeviceLockError if no lock
  const marker: VaultMarker = { createdAt: Date.now() };
  await setJSON(VAULT_MARKER_KEY, marker);
  return { encryptionKey };
}

/**
 * Unlock an existing vault: reads the master key back, which forces device
 * authentication (biometric → passcode). Throws on cancel/failure/no-lock.
 */
export async function unlockVault(): Promise<AuthSuccess> {
  const encryptionKey = await unlockMasterKey();
  return { encryptionKey };
}

/** Remove the vault marker + master key entirely (reset flow). */
export async function deleteAccount(): Promise<void> {
  await deleteItem(VAULT_MARKER_KEY);
  await deleteMasterKey();
}

// ───────────────────────────────────────────────────────────────────────────
// Legacy migration: v1 password account → v2 biometric-gated random key.
// One-time. Decrypts every credential (live + all profile snapshots) with the
// old password-derived key and re-encrypts under the new random master key.
// ───────────────────────────────────────────────────────────────────────────

interface LegacyAccount {
  username: string;
  keySalt: string;
  // (verifier fields exist but are irrelevant once we have the password)
}

interface ProfileRegistry {
  activeId: string;
  profiles: { id: string; name: string; createdAt: number }[];
}
interface ProfileSnapshot {
  allocations: unknown;
  credIndex: string[];
  creds: Record<string, StoredCredentials>;
}

function reEncryptField(
  blob: EncryptedData | undefined,
  oldKey: Uint8Array,
  newKey: Uint8Array
): EncryptedData | undefined {
  if (!blob) return undefined;
  return encryptString(decryptString(blob, oldKey), newKey);
}

function reEncryptRecord(
  rec: StoredCredentials,
  oldKey: Uint8Array,
  newKey: Uint8Array
): StoredCredentials {
  return {
    ...rec,
    apiSecret: reEncryptField(rec.apiSecret, oldKey, newKey)!,
    passphrase: reEncryptField(rec.passphrase, oldKey, newKey),
    totpSecret: reEncryptField(rec.totpSecret, oldKey, newKey),
  };
}

/**
 * Migrate the legacy password vault to the biometric model.
 *
 * @param password the user's existing password (used ONLY to derive the old
 *   master key so we can re-encrypt; never stored).
 * @returns the new session key on success.
 * @throws if the password can't unlock the old credentials, or the device has
 *   no lock (createMasterKey enforces it).
 */
export async function migrateLegacyAccount(password: string): Promise<AuthSuccess> {
  const legacy = await getJSON<LegacyAccount>(LEGACY_ACCOUNT_KEY);
  if (!legacy) throw new Error('No legacy account to migrate');

  const oldKey = deriveKey(password, hexToBytes(legacy.keySalt));

  // Mint the new random biometric-gated key FIRST (this enforces device lock).
  const newKey = await createMasterKey();

  // PHASE 1 — compute everything in memory. Any wrong-password (GCM auth)
  // failure throws HERE, before a single record is written, so a bad password
  // can never leave the vault half-migrated / corrupted.
  const liveIds = await listStoredCredentialExchanges();
  const liveNext: Record<string, StoredCredentials> = {};
  for (const id of liveIds) {
    const rec = await readStoredCredentialRecord(id);
    if (rec) liveNext[id] = reEncryptRecord(rec, oldKey, newKey);
  }

  const registry = await getJSON<ProfileRegistry>(PROFILE_REGISTRY_KEY);
  const snapNext: { key: string; snap: ProfileSnapshot }[] = [];
  if (registry) {
    for (const p of registry.profiles) {
      const key = legacySnapshotKey(p.id);
      const snap = await getJSON<ProfileSnapshot>(key);
      if (!snap) continue;
      const nextCreds: Record<string, StoredCredentials> = {};
      for (const [id, rec] of Object.entries(snap.creds)) {
        nextCreds[id] = reEncryptRecord(rec, oldKey, newKey);
      }
      snapNext.push({ key, snap: { ...snap, creds: nextCreds } });
    }
  }

  // PHASE 2 — commit. All decryption succeeded, so these writes are safe.
  for (const [id, rec] of Object.entries(liveNext)) {
    await writeStoredCredentialRecord(id, rec);
  }
  for (const { key, snap } of snapNext) {
    await setJSON(key, snap);
  }
  await writeMasterKey(newKey);
  await setJSON(VAULT_MARKER_KEY, { createdAt: Date.now() } satisfies VaultMarker);
  await deleteItem(LEGACY_ACCOUNT_KEY);

  return { encryptionKey: newKey };
}
