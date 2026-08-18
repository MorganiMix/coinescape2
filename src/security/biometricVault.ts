/**
 * Biometric unlock — an optional shortcut to the master key, never the only copy.
 *
 * The biometric-gated secure-store item is inherently fragile: both platforms
 * destroy it when the device's enrolled biometrics change (see the long note in
 * `pinVault.ts`). That is fine now, because it is a *second* copy of a master
 * key whose primary home is the PIN wrap. So every function here is written to
 * degrade quietly:
 *
 *  - nothing throws a fatal "your vault is gone" error;
 *  - a vanished key is reported as `invalidated`, which the UI turns into
 *    "unlock with your PIN" rather than a dead end;
 *  - after any PIN unlock the caller can call {@link enableBiometric} again to
 *    transparently re-arm it, which is what turns the old permanent lockout into
 *    an invisible self-repair.
 *
 * A biometric *gate* (calling `LocalAuthentication.authenticateAsync` and then
 * reading an unprotected key) would be simpler and immune to invalidation, but
 * it would also mean the master key sits in the keystore readable by anyone who
 * can run code as the app — which would throw away the protection the PIN wrap
 * provides. So the key stays cryptographically bound to the biometric, and we
 * absorb the fragility here instead.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  deleteBiometricCopy,
  readBiometricCopy,
  writeBiometricCopy,
} from './vaultKey';

/**
 * Non-secret flag recording that the user opted into biometric unlock.
 *
 * In AsyncStorage, and load-bearing: we must know whether to fire the biometric
 * prompt *without* performing the secure-store read that would itself fire one.
 * Reading it from the keychain to find out would prompt the user before they've
 * asked for anything.
 */
const BIO_ENABLED_KEY = 'coinescape.bio.enabled.v1';

/** What the device can do, and what to call it in the UI. */
export interface BiometricCapability {
  /** True when a biometric-gated key can actually be written and read here. */
  available: boolean;
  /** Platform-appropriate name: "Face ID", "Touch ID", "fingerprint"… */
  label: string;
  /** Why it isn't available (absent when it is). */
  reason?: 'web' | 'no_hardware' | 'not_enrolled';
}

/**
 * Whether this device can hold a biometric-gated key, and what to call it.
 *
 * `SecureStore.canUseBiometricAuthentication()` is the authoritative gate: it
 * maps to `LAContext.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics)`
 * on iOS and to `BiometricManager.canAuthenticate(BIOMETRIC_STRONG)` on Android
 * — precisely the conditions under which `requireAuthentication` writes succeed.
 * Checking `hasHardwareAsync`/`isEnrolledAsync` instead would say yes on Android
 * devices with only a weak biometric, and the write would then fail.
 */
export async function getBiometricCapability(): Promise<BiometricCapability> {
  if (Platform.OS === 'web') {
    return { available: false, label: 'Biometrics', reason: 'web' };
  }

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync().catch(
    () => [] as LocalAuthentication.AuthenticationType[]
  );
  const label = labelFor(types);

  if (SecureStore.canUseBiometricAuthentication()) {
    return { available: true, label };
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
  return {
    available: false,
    label,
    reason: hasHardware ? 'not_enrolled' : 'no_hardware',
  };
}

function labelFor(types: LocalAuthentication.AuthenticationType[]): string {
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  if (Platform.OS === 'ios') {
    if (face) return 'Face ID';
    if (finger) return 'Touch ID';
    return 'Biometrics';
  }
  if (face && finger) return 'fingerprint or face unlock';
  if (face) return 'face unlock';
  if (finger) return 'fingerprint';
  return 'biometrics';
}

/** True when the user has opted into biometric unlock (no prompt). */
export async function isBiometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BIO_ENABLED_KEY)) === '1';
}

/**
 * Mark biometric unlock as enabled for a vault enrolled by a pre-PIN build.
 *
 * Those installs have a biometric-gated master key by construction — it was the
 * only way in — but no `BIO_ENABLED_KEY`, because the flag didn't exist yet.
 * Without this backfill {@link tryBiometricUnlock} would refuse with `disabled`
 * and the one-time PIN-setup screen would have no way to reach the key it needs
 * to wrap. Call it when a vault is found to have no PIN.
 */
export async function adoptLegacyBiometricEnrolment(): Promise<void> {
  if (Platform.OS === 'web') return;
  await AsyncStorage.setItem(BIO_ENABLED_KEY, '1');
}

/**
 * Store a biometric-gated copy of the master key and mark the shortcut enabled.
 *
 * Note for the caller: on Android this shows a biometric prompt, because the
 * native encryptor authenticates the cipher for writes as well as reads. That is
 * expected — but it means this must never be called speculatively in the
 * background, only in response to a user action or immediately after a
 * successful unlock where a prompt is unsurprising.
 */
export async function enableBiometric(masterKey: Uint8Array): Promise<void> {
  await writeBiometricCopy(masterKey);
  await AsyncStorage.setItem(BIO_ENABLED_KEY, '1');
}

/** Forget the biometric copy and turn the shortcut off. Never throws. */
export async function disableBiometric(): Promise<void> {
  await AsyncStorage.removeItem(BIO_ENABLED_KEY);
  await deleteBiometricCopy().catch(() => {
    // Already gone, or gone in a way we can't observe. The flag above is what
    // decides whether we offer the shortcut, so this is not worth failing on.
  });
}

/** Outcome of an attempted biometric unlock. Never an exception. */
export type BiometricUnlockResult =
  | { ok: true; masterKey: Uint8Array }
  /** The user dismissed the prompt, or it failed in a way retrying can fix. */
  | { ok: false; reason: 'cancelled' }
  /** The shortcut was never turned on. */
  | { ok: false; reason: 'disabled' }
  /** No usable biometric hardware/enrolment right now. */
  | { ok: false; reason: 'unavailable' }
  /**
   * The stored key is gone — biometrics were re-enrolled, or app data was
   * restored onto another device. Retrying is futile; the PIN is the way in,
   * and {@link enableBiometric} afterwards repairs it.
   */
  | { ok: false; reason: 'invalidated' };

/**
 * Try to read the master key back via biometrics.
 *
 * Distinguishing `cancelled` from `invalidated` is the whole point: the old code
 * reported both as a failed prompt, so a user whose key had been destroyed was
 * told to "try again" forever. A null read from an enabled-and-available device
 * means the key itself is gone, because neither platform prompts for an item
 * that isn't there.
 */
export async function tryBiometricUnlock(): Promise<BiometricUnlockResult> {
  if (!(await isBiometricEnabled())) return { ok: false, reason: 'disabled' };

  const capability = await getBiometricCapability();
  if (!capability.available) return { ok: false, reason: 'unavailable' };

  try {
    const key = await readBiometricCopy();
    if (!key) return { ok: false, reason: 'invalidated' };
    return { ok: true, masterKey: key };
  } catch {
    // A thrown error here is the prompt being dismissed or failing — the native
    // modules surface a vanished key as null, not as an exception.
    return { ok: false, reason: 'cancelled' };
  }
}
