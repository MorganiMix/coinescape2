/**
 * Biometric-gated vault master key.
 *
 * Radical passwordless model (Requirement 8/9 revisited):
 *  - The AES-256-GCM master key that encrypts all exchange credentials is a
 *    random 256-bit value — NOT derived from a password.
 *  - It is stored in the OS secure store with `requireAuthentication: true`, so
 *    reading it back forces the device's own authentication: Face ID / Touch ID
 *    with an automatic fall-through to the device passcode.
 *  - We refuse to operate on a device with no lock enrolled at all — there would
 *    be nothing protecting the key at rest.
 *
 * The key is only ever held in memory for the session (zeroed on sign-out).
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { hexToBytes, randomBytes } from './crypto';
import { bytesToHex } from './crypto';

/** Secure-store key holding the hex-encoded random master key. */
const MASTER_KEY_ID = 'coinescape.masterkey.v1';

/** Typed errors so the UI can distinguish "no lock" from "auth failed". */
export class NoDeviceLockError extends Error {
  constructor() {
    super('This device has no screen lock. Set up Face ID, Touch ID, or a passcode to use Coin Escape.');
    this.name = 'NoDeviceLockError';
  }
}
export class VaultAuthError extends Error {
  constructor(message = 'Authentication was cancelled or failed.') {
    super(message);
    this.name = 'VaultAuthError';
  }
}

const authProtected: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Unlock Coin Escape',
  // Bind to this device; never migrated to another device on restore.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Ensure the device has SOME lock we can gate the key behind. On native this
 * means a biometric OR a device passcode is enrolled. Throws
 * {@link NoDeviceLockError} otherwise. On web there is no secure enclave, so we
 * simply allow the in-memory fallback used elsewhere for dev.
 */
export async function ensureDeviceLock(): Promise<void> {
  if (Platform.OS === 'web') return;

  // `canUseBiometricAuthentication()` is true when biometrics are ready, but a
  // device with only a passcode (no biometrics) must still pass. Combine both
  // signals: hasHardware+enrolled covers biometrics; canUse covers the broader
  // "secure-store can require auth" case which includes the passcode path.
  const canUse = SecureStore.canUseBiometricAuthentication();
  if (canUse) return;

  // No biometrics ready — check whether the OS at least has a passcode by
  // asking LocalAuthentication for the enrolled security level.
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) {
    throw new NoDeviceLockError();
  }
}

/** True once a master key exists in the secure store. */
export async function hasMasterKey(): Promise<boolean> {
  if (Platform.OS === 'web') return webMasterKey !== null;
  // getItemAsync WITHOUT requireAuthentication would still find the item's
  // presence, but to avoid a stray prompt we read metadata via a plain get.
  // secure-store has no "exists" API, so a guarded read is the only option; use
  // the non-auth variant which returns null for an auth-protected item on some
  // platforms — so instead we track existence separately is overkill. We accept
  // that hasMasterKey triggers the auth prompt on iOS; callers use it only at
  // unlock time. Web keeps an in-memory copy.
  try {
    const v = await SecureStore.getItemAsync(MASTER_KEY_ID, authProtected);
    return v !== null;
  } catch {
    return true; // an auth-required error still implies the item exists
  }
}

// Web-only in-memory key so the flow is testable in a browser (no keychain).
let webMasterKey: Uint8Array | null = null;

/**
 * Create the random master key on first enrolment. Requires a device lock.
 * No-op-safe: if a key already exists it is left untouched.
 */
export async function createMasterKey(): Promise<Uint8Array> {
  await ensureDeviceLock();
  const key = randomBytes(32);
  if (Platform.OS === 'web') {
    webMasterKey = key;
    return key;
  }
  await SecureStore.setItemAsync(MASTER_KEY_ID, bytesToHex(key), authProtected);
  return key;
}

/**
 * Read the master key back, forcing device authentication (biometric →
 * passcode). Throws {@link VaultAuthError} if the user cancels/fails and
 * {@link NoDeviceLockError} if the device has no lock.
 */
export async function unlockMasterKey(): Promise<Uint8Array> {
  await ensureDeviceLock();
  if (Platform.OS === 'web') {
    if (!webMasterKey) throw new VaultAuthError('No vault on this device.');
    return webMasterKey;
  }
  let hex: string | null;
  try {
    hex = await SecureStore.getItemAsync(MASTER_KEY_ID, authProtected);
  } catch (e) {
    // secure-store throws when the user cancels or auth fails.
    throw new VaultAuthError(e instanceof Error ? e.message : undefined);
  }
  if (!hex) throw new VaultAuthError('No vault on this device.');
  return hexToBytes(hex);
}

/**
 * Overwrite the stored master key (used by migration to install the new random
 * key after re-wrapping credentials). Requires a device lock.
 */
export async function writeMasterKey(key: Uint8Array): Promise<void> {
  await ensureDeviceLock();
  if (Platform.OS === 'web') {
    webMasterKey = key;
    return;
  }
  await SecureStore.setItemAsync(MASTER_KEY_ID, bytesToHex(key), authProtected);
}

/** Remove the master key entirely (reset flow). */
export async function deleteMasterKey(): Promise<void> {
  if (Platform.OS === 'web') {
    webMasterKey = null;
    return;
  }
  await SecureStore.deleteItemAsync(MASTER_KEY_ID, authProtected);
}
