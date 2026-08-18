/**
 * Local-only vault authentication — PIN first, biometrics as a shortcut.
 *
 * Requirement 9 (revisited — PIN/biometric model):
 *  - There is no username/password. The vault is opened with a 6-digit PIN,
 *    which unwraps the AES-256-GCM master key (see {@link module:security/pinVault}).
 *  - Biometric unlock is an optional convenience on top, holding a second copy
 *    of the same key. Losing it — which the OS does whenever the device's
 *    enrolled biometrics change — costs the user nothing but a PIN entry, and
 *    the copy is silently rebuilt afterwards.
 *  - The master key is held in memory only for the session (Requirement 8.6).
 *  - A tiny non-secret marker records that the vault has been enrolled on this
 *    device (so we can show "unlock" vs "set up").
 *
 * Legacy (v1) password accounts are migrated on first launch — see
 * {@link migrateLegacyAccount}.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EncryptedData,
  decryptString,
  deriveKey,
  encryptString,
  hexToBytes,
  randomBytes,
} from './crypto';
import {
  StoredCredentials,
  deleteStoredCredentialRecord,
  listStoredCredentialExchanges,
  readStoredCredentialRecord,
  replaceCredentialIndex,
  writeStoredCredentialRecord,
} from './credentialVault';
import { disableBiometric, tryBiometricUnlock } from './biometricVault';
import { deletePin, hasPin, setPin, unlockWithPin } from './pinVault';
import { deleteItem, getJSON, setJSON } from './secureStore';
import { mintMasterKey, peekExistingMasterKey } from './vaultKey';

/**
 * Non-secret marker: the vault has been enrolled on this device.
 *
 * Lives in AsyncStorage, NOT SecureStore. On Android the secure-store module
 * silently deletes an entry and returns null whenever SharedPreferences and the
 * Keystore fall out of sync (`SecureStoreModule.readJSONEncodedItem` catches
 * `BadPaddingException`, calls `deleteItemImpl`, returns null). A successfully
 * enrolled device could therefore lose this marker, be treated as un-migrated,
 * and get pushed back through the legacy upgrade flow. The marker holds nothing
 * secret, so the app sandbox is the right place for it — and it has exactly the
 * lifetime we want, since `freshInstall.ts` already relies on AsyncStorage being
 * wiped on a real uninstall.
 */
const VAULT_MARKER_ASYNC_KEY = 'coinescape.vault.v2';
/** Previous SecureStore location of the marker; read for backfill only. */
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

/** Record that the vault is enrolled on this device. */
async function markVaultEnrolled(): Promise<void> {
  const marker: VaultMarker = { createdAt: Date.now() };
  await AsyncStorage.setItem(VAULT_MARKER_ASYNC_KEY, JSON.stringify(marker));
  // Also keep the legacy SecureStore copy so rolling back to an older build
  // doesn't strand the user in the migration flow.
  await setJSON(VAULT_MARKER_KEY, marker);
}

/**
 * True once the biometric vault has been enrolled on this device.
 *
 * Checks AsyncStorage first, falling back to the old SecureStore location and
 * backfilling it — so devices enrolled by an earlier build are recognised, and
 * Android can't lose the marker a second time.
 */
export async function hasAccount(): Promise<boolean> {
  if ((await AsyncStorage.getItem(VAULT_MARKER_ASYNC_KEY)) !== null) return true;

  const legacyMarker = await getJSON<VaultMarker>(VAULT_MARKER_KEY);
  if (legacyMarker !== null) {
    await AsyncStorage.setItem(VAULT_MARKER_ASYNC_KEY, JSON.stringify(legacyMarker));
    return true;
  }

  // Last resort: a PIN wrap is proof of enrolment regardless of what the markers
  // say. Without this, a device that lost both markers would be offered "set up"
  // and mint a second master key over a vault it could still have opened.
  if (await hasPin()) {
    await markVaultEnrolled();
    return true;
  }
  return false;
}

/** True when a pre-biometric (v1 password) account still needs migrating. */
export async function hasLegacyAccount(): Promise<boolean> {
  const legacy = await getJSON<LegacyAccount>(LEGACY_ACCOUNT_KEY);
  const migrated = await hasAccount();
  return legacy !== null && !migrated;
}

/**
 * True when this device has a vault but no PIN protecting it.
 *
 * That combination means an install enrolled by a pre-PIN build: its master key
 * exists only in the biometric-gated item, one biometric re-enrolment away from
 * being destroyed. The sign-in flow uses this to walk the user through setting a
 * PIN immediately after they unlock.
 */
export async function needsPinSetup(): Promise<boolean> {
  if (!(await hasAccount())) return false;
  return !(await hasPin());
}

/**
 * First-time enrolment: mint a master key and wrap it under the user's PIN.
 *
 * Deliberately asks nothing of the device — no screen lock, no biometric
 * hardware. The old flow refused to enrol on Android handsets without a strong
 * biometric and on iPhones without Face ID/Touch ID enrolled, locking those
 * users out of the app entirely.
 *
 * @throws {WeakPinError} the PIN is the wrong shape or trivially guessable.
 */
export async function enrollVault(pin: string): Promise<AuthSuccess> {
  const encryptionKey = mintMasterKey();
  await setPin(pin, encryptionKey);
  await markVaultEnrolled();
  return { encryptionKey };
}

/**
 * Unlock with the PIN. This is the path that always works.
 *
 * @throws {WrongPinError} / {PinLockedOutError} / {PinNotSetError}
 */
export async function unlockVaultWithPin(pin: string): Promise<AuthSuccess> {
  const encryptionKey = await unlockWithPin(pin);
  return { encryptionKey };
}

/**
 * Attach a PIN to a vault that was enrolled before PINs existed.
 *
 * Wraps the *same* master key the caller just unlocked with, so every stored
 * credential stays readable — nothing is re-encrypted.
 */
export async function attachPinToVault(
  pin: string,
  encryptionKey: Uint8Array
): Promise<void> {
  await setPin(pin, encryptionKey);
  await markVaultEnrolled();
}

/**
 * Try the biometric shortcut. Never throws — see `BiometricUnlockResult` for the
 * failure reasons, all of which the UI resolves by falling back to the PIN pad.
 */
export async function unlockVaultWithBiometric() {
  return tryBiometricUnlock();
}

/**
 * Remove the vault marker, the PIN wrap, and the biometric copy.
 *
 * Clearing the marker is load-bearing for the reset flow: it is what lets
 * `hasAccount()` go back to false so the sign-in screen offers "set up" again.
 * Leave it behind and a device whose key was lost is stuck on an unlock screen
 * it can never satisfy.
 */
export async function deleteAccount(): Promise<void> {
  await AsyncStorage.removeItem(VAULT_MARKER_ASYNC_KEY);
  await deleteItem(VAULT_MARKER_KEY);
  await deletePin();
  await disableBiometric();
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

/**
 * Re-wrap one encrypted field, tolerating a field that an interrupted earlier
 * run already converted.
 *
 * Order matters: try `oldKey` first (the common case), and only if GCM
 * authentication fails try `newKey`. A blob that already decrypts under
 * `newKey` was migrated by a previous attempt and is returned verbatim — no
 * point re-encrypting it, and doing so would be a second chance to fail
 * halfway. If neither key works the field is unrecoverable.
 */
function migrateField(
  blob: EncryptedData,
  oldKey: Uint8Array,
  newKey: Uint8Array
): EncryptedData | null {
  try {
    return encryptString(decryptString(blob, oldKey), newKey);
  } catch {
    // Not under the password-derived key.
  }
  try {
    decryptString(blob, newKey);
    return blob; // already migrated by an interrupted run
  } catch {
    return null; // decrypts under neither key
  }
}

/**
 * Re-wrap a whole credential record. Returns `null` if ANY field is
 * unrecoverable — a record with a readable api key but an unreadable secret is
 * useless, so we treat it as a unit.
 */
function migrateRecord(
  rec: StoredCredentials,
  oldKey: Uint8Array,
  newKey: Uint8Array
): StoredCredentials | null {
  const apiSecret = migrateField(rec.apiSecret, oldKey, newKey);
  if (!apiSecret) return null;

  const next: StoredCredentials = { ...rec, apiSecret };

  for (const field of ['passphrase', 'totpSecret'] as const) {
    const blob = rec[field];
    if (!blob) continue;
    const migrated = migrateField(blob, oldKey, newKey);
    if (!migrated) return null;
    next[field] = migrated;
  }

  return next;
}

/** The supplied password does not unlock the legacy vault. */
export class WrongPasswordError extends Error {
  constructor() {
    super('That password doesn’t match this vault. Check it and try again.');
    this.name = 'WrongPasswordError';
  }
}

/**
 * Some stored credentials decrypt under neither the password-derived key nor
 * the device's current master key. See {@link migrateLegacyAccount} for how a
 * pre-fix build could produce this state.
 */
export class VaultUnrecoverableError extends Error {
  /** Exchange ids whose credentials cannot be decrypted by any available key. */
  readonly lostExchangeIds: string[];
  /** How many records DID decrypt — 0 means a wrong password is also possible. */
  readonly recoveredCount: number;

  constructor(lostExchangeIds: string[], recoveredCount: number) {
    super(
      recoveredCount > 0
        ? `${lostExchangeIds.length} saved exchange connection(s) could not be recovered.`
        : 'Your saved exchange connections could not be unlocked — either the password is wrong, or an interrupted upgrade left them unreadable.'
    );
    this.name = 'VaultUnrecoverableError';
    this.lostExchangeIds = lostExchangeIds;
    this.recoveredCount = recoveredCount;
  }
}

interface MigrationPlan {
  /** The key everything will be encrypted under once committed. */
  newKey: Uint8Array;
  /** True if this key was already on the device (i.e. we are resuming). */
  keyPreexisted: boolean;
  live: { id: string; record: StoredCredentials }[];
  snapshots: { key: string; snap: ProfileSnapshot }[];
  lostExchangeIds: string[];
  recoveredCount: number;
}

/**
 * Work out — entirely in memory, writing nothing — what the migration would do.
 *
 * The key decision is made here: we NEVER mint a master key over one that
 * already exists. If the device has a key, that key is the target and this run
 * is a resume of an interrupted migration; blobs already converted under it are
 * detected and kept as-is. If there is no key we generate one but do not
 * persist it yet, so a wrong password leaves the device exactly as it was.
 */
async function buildMigrationPlan(
  legacy: LegacyAccount,
  password: string
): Promise<MigrationPlan> {
  const oldKey = deriveKey(password, hexToBytes(legacy.keySalt));

  // If a previous (interrupted) attempt already installed a master key in the
  // biometric slot, that key is the target — anything it re-encrypted must stay
  // readable. A dismissed prompt reads as "no key", which is safe here: the plan
  // is only committed once every record decrypts under one of the two keys.
  const existing = await peekExistingMasterKey();
  const keyPreexisted = existing !== null;
  const newKey = existing ?? randomBytes(32);

  const lostExchangeIds: string[] = [];
  let recoveredCount = 0;

  const liveIds = await listStoredCredentialExchanges();
  const live: { id: string; record: StoredCredentials }[] = [];
  for (const id of liveIds) {
    const rec = await readStoredCredentialRecord(id);
    if (!rec) continue;
    const migrated = migrateRecord(rec, oldKey, newKey);
    if (migrated) {
      live.push({ id, record: migrated });
      recoveredCount++;
    } else {
      lostExchangeIds.push(id);
    }
  }

  const registry = await getJSON<ProfileRegistry>(PROFILE_REGISTRY_KEY);
  const snapshots: { key: string; snap: ProfileSnapshot }[] = [];
  if (registry) {
    for (const p of registry.profiles) {
      const key = legacySnapshotKey(p.id);
      const snap = await getJSON<ProfileSnapshot>(key);
      if (!snap) continue;

      const nextCreds: Record<string, StoredCredentials> = {};
      const keptIds: string[] = [];
      for (const [id, rec] of Object.entries(snap.creds)) {
        const migrated = migrateRecord(rec, oldKey, newKey);
        if (migrated) {
          nextCreds[id] = migrated;
          keptIds.push(id);
          recoveredCount++;
        } else if (!lostExchangeIds.includes(id)) {
          lostExchangeIds.push(id);
        }
      }
      snapshots.push({
        key,
        snap: {
          ...snap,
          creds: nextCreds,
          credIndex: snap.credIndex.filter((id) => keptIds.includes(id)),
        },
      });
    }
  }

  return { newKey, keyPreexisted, live, snapshots, lostExchangeIds, recoveredCount };
}

/**
 * Apply a plan. Ordered so that every intermediate state is resumable:
 *
 *  1. the master key, BEFORE any blob encrypted under it — so a crash can never
 *     leave ciphertext whose key was never persisted,
 *  2. the re-wrapped records and snapshots,
 *  3. the enrolled marker,
 *  4. the legacy account.
 *
 * If this is interrupted at any point, the next run's `buildMigrationPlan`
 * finds the key in step 1, recognises the already-converted blobs from step 2,
 * and completes the rest — instead of minting a fresh key and orphaning them.
 *
 * Step 1 is now the PIN wrap rather than a biometric-gated write, which also
 * removes the Android-only failure this function used to warn about: wrapping
 * under the PIN never shows a prompt, so there is no longer a prompt to cancel
 * halfway through a migration.
 */
async function commitMigration(plan: MigrationPlan, pin: string): Promise<void> {
  await setPin(pin, plan.newKey);

  for (const { id, record } of plan.live) {
    await writeStoredCredentialRecord(id, record);
  }

  if (plan.lostExchangeIds.length > 0) {
    for (const id of plan.lostExchangeIds) {
      await deleteStoredCredentialRecord(id);
    }
    await replaceCredentialIndex(plan.live.map((l) => l.id));
  }

  for (const { key, snap } of plan.snapshots) {
    await setJSON(key, snap);
  }

  await markVaultEnrolled();
  await deleteItem(LEGACY_ACCOUNT_KEY);
}

/**
 * Migrate the legacy password vault to the PIN model.
 *
 * Idempotent and resumable: every credential is re-encrypted under a new master
 * key, which is then wrapped under the PIN the user just chose.
 *
 * @param password the user's existing password (used ONLY to derive the old
 *   master key so we can re-encrypt; never stored).
 * @param pin the new 6-digit vault PIN.
 * @returns the session key on success.
 * @throws {WrongPasswordError} the password doesn't unlock the vault.
 * @throws {VaultUnrecoverableError} some records decrypt under no available key.
 * @throws {WeakPinError} the chosen PIN is unacceptable.
 */
export async function migrateLegacyAccount(
  password: string,
  pin: string
): Promise<AuthSuccess> {
  const legacy = await getJSON<LegacyAccount>(LEGACY_ACCOUNT_KEY);
  if (!legacy) throw new Error('No legacy account to migrate');

  const plan = await buildMigrationPlan(legacy, password);

  if (plan.lostExchangeIds.length > 0) {
    // Nothing decrypted and the device had no prior key: the only explanation
    // is a wrong password, and no earlier run can have converted anything.
    if (!plan.keyPreexisted && plan.recoveredCount === 0) {
      throw new WrongPasswordError();
    }
    // Otherwise data is genuinely stranded. Refuse to commit a partial vault
    // silently — the caller must confirm via `abandonUnrecoverableCredentials`.
    throw new VaultUnrecoverableError(plan.lostExchangeIds, plan.recoveredCount);
  }

  await commitMigration(plan, pin);
  return { encryptionKey: plan.newKey };
}

/**
 * Recovery path for a device left unrecoverable by a pre-fix build.
 *
 * Completes the migration with the undecryptable records DROPPED, so the user
 * escapes the upgrade loop with whatever survived and can re-add the rest. This
 * deletes credentials permanently and must only be called after an explicit,
 * informed user confirmation — never automatically.
 *
 * @returns the session key and the exchange ids that were discarded.
 */
export async function abandonUnrecoverableCredentials(
  password: string,
  pin: string
): Promise<AuthSuccess & { discardedExchangeIds: string[] }> {
  const legacy = await getJSON<LegacyAccount>(LEGACY_ACCOUNT_KEY);
  if (!legacy) throw new Error('No legacy account to migrate');

  const plan = await buildMigrationPlan(legacy, password);

  // Guard against nuking a vault because of a simple typo: if the device never
  // had a master key and nothing decrypted, this is a wrong password, not an
  // unrecoverable vault.
  if (!plan.keyPreexisted && plan.recoveredCount === 0) {
    throw new WrongPasswordError();
  }

  await commitMigration(plan, pin);
  return { encryptionKey: plan.newKey, discardedExchangeIds: plan.lostExchangeIds };
}
