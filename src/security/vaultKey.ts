/**
 * The vault master key and its optional biometric-gated copy.
 *
 * The master key is a random 256-bit AES-256-GCM key that encrypts every stored
 * exchange credential. It has two homes:
 *
 *  1. **`pinVault.ts`** — wrapped under the user's 6-digit PIN, written without
 *     `requireAuthentication`. This is the authoritative copy and the one that
 *     survives everything short of an uninstall.
 *  2. **here** — a verbatim copy in a secure-store item written *with*
 *     `requireAuthentication: true`, so reading it forces a biometric check.
 *     Purely a convenience, and explicitly disposable: both platforms destroy
 *     this item when the enrolled biometrics change, which used to take the
 *     whole vault with it.
 *
 * Nothing in this module should be treated as fatal by callers. `biometricVault.ts`
 * wraps it in a result type that turns every failure into "use your PIN".
 *
 * The key is only ever held in memory for the session (zeroed on sign-out).
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { bytesToHex, hexToBytes, randomBytes } from './crypto';

/** Secure-store key holding the hex-encoded biometric-gated master key copy. */
const MASTER_KEY_ID = 'coinescape.masterkey.v1';

/** Typed errors so the UI can distinguish "no lock" from "auth failed". */
export class NoDeviceLockError extends Error {
  constructor() {
    super('This device has no screen lock. Set up Face ID, Touch ID, or a passcode to use biometric unlock.');
    this.name = 'NoDeviceLockError';
  }
}
export class VaultAuthError extends Error {
  constructor(message = 'Authentication was cancelled or failed.') {
    super(message);
    this.name = 'VaultAuthError';
  }
}
/**
 * The vault holds no key any authentication can reach.
 *
 * Since the PIN wrap landed this means something close to total loss — the PIN
 * wrap is absent *and* the biometric copy is gone — and the only way forward is
 * to re-enrol. A merely-invalidated biometric copy is no longer reported this
 * way; see `BiometricUnlockResult`.
 */
export class VaultKeyMissingError extends Error {
  constructor() {
    super(
      'This device’s vault key is no longer available. The saved data can’t be recovered — set up the vault again to continue.'
    );
    this.name = 'VaultKeyMissingError';
  }
}

/**
 * Android-only: the device has a lock but no *strong* biometric enrolled, and
 * expo-secure-store's Android implementation can only gate a key behind
 * `BIOMETRIC_STRONG` (`AuthenticationHelper.assertBiometricsSupport()` has no
 * `DEVICE_CREDENTIAL` fallback).
 *
 * This no longer blocks anyone from using the app — such a device sets a PIN
 * like any other — it only means the biometric shortcut can't be offered.
 */
export class BiometricsRequiredError extends Error {
  constructor() {
    super(
      'Android requires a fingerprint or face unlock to protect a key with biometrics. A PIN or pattern alone is not enough — enrol a biometric in your device settings to use this shortcut.'
    );
    this.name = 'BiometricsRequiredError';
  }
}

const authProtected: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Unlock Coin Escape',
  // Bind to this device; never migrated to another device on restore.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Ensure the device can hold a *biometric-gated* key.
 *
 * Only the biometric shortcut needs this now. Vault access itself requires
 * nothing of the device, which is what lets the app run on Android handsets
 * with a pattern-only lock and on iPhones with a passcode but no Face ID —
 * both of which the old enrolment flow refused outright.
 *
 * @throws {NoDeviceLockError} nothing is enrolled at all.
 * @throws {BiometricsRequiredError} a lock exists but can't gate a key.
 */
export async function ensureDeviceLock(): Promise<void> {
  if (Platform.OS === 'web') return;

  if (SecureStore.canUseBiometricAuthentication()) return;

  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) {
    throw new NoDeviceLockError();
  }
  throw new BiometricsRequiredError();
}

// Web-only in-memory key so the flow is testable in a browser (no keychain).
let webMasterKey: Uint8Array | null = null;

/** Mint a fresh random master key. Persists nothing. */
export function mintMasterKey(): Uint8Array {
  return randomBytes(32);
}

/**
 * Read the biometric-gated copy of the master key.
 *
 * Returns `null` when no such item exists — which covers both "the user never
 * enabled biometrics" and "the item was destroyed by a biometric re-enrolment",
 * because the native modules swallow `KeyPermanentlyInvalidatedException` /
 * `BadPaddingException` and return null rather than raising. Throws
 * {@link VaultAuthError} only when the user cancelled or failed the prompt.
 *
 * That distinction is load-bearing: a cancelled prompt must never be mistaken
 * for an absent key, or a caller could mint a replacement over a live one.
 */
export async function readBiometricCopy(): Promise<Uint8Array | null> {
  if (Platform.OS === 'web') return webMasterKey;
  let hex: string | null;
  try {
    hex = await SecureStore.getItemAsync(MASTER_KEY_ID, authProtected);
  } catch (e) {
    throw new VaultAuthError(e instanceof Error ? e.message : undefined);
  }
  return hex ? hexToBytes(hex) : null;
}

/**
 * Write (or overwrite) the biometric-gated copy of the master key.
 *
 * Safe to call repeatedly with the same key — that is exactly how a copy
 * invalidated by a biometric re-enrolment gets repaired after a PIN unlock.
 * Requires a device that can gate a key; on Android this shows a prompt,
 * because the native encryptor authenticates the cipher for writes too.
 */
export async function writeBiometricCopy(key: Uint8Array): Promise<void> {
  if (Platform.OS === 'web') {
    webMasterKey = key;
    return;
  }
  await ensureDeviceLock();
  await SecureStore.setItemAsync(MASTER_KEY_ID, bytesToHex(key), authProtected);
}

/** Remove the biometric-gated copy. The PIN wrap is untouched. */
export async function deleteBiometricCopy(): Promise<void> {
  if (Platform.OS === 'web') {
    webMasterKey = null;
    return;
  }
  await SecureStore.deleteItemAsync(MASTER_KEY_ID, authProtected);
}

/**
 * Read the biometric copy without prompting-related exceptions escaping.
 *
 * Used by the legacy-account migration, which needs to know whether a master
 * key already exists on the device so it can resume rather than mint a second
 * one — but must not fall over if the biometric prompt is dismissed.
 */
export async function peekExistingMasterKey(): Promise<Uint8Array | null> {
  try {
    return await readBiometricCopy();
  } catch {
    return null;
  }
}
