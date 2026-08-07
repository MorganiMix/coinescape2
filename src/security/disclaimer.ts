/**
 * First-run legal disclaimer acceptance.
 *
 * Stored in AsyncStorage (app sandbox) — NOT the keychain — so it is wiped on
 * iOS uninstall alongside the install marker. That means a truly fresh install
 * re-shows the disclaimer, which is the intended behaviour: every new install
 * must accept before enrolling a vault.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const DISCLAIMER_KEY = 'coinescape.disclaimer.v1';

/** True once the user has accepted the risk disclaimer on this install. */
export async function hasAcceptedDisclaimer(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DISCLAIMER_KEY)) !== null;
  } catch {
    return false;
  }
}

/** Persist acceptance. Best-effort — a failed write just re-prompts next launch. */
export async function acceptDisclaimer(): Promise<void> {
  try {
    await AsyncStorage.setItem(DISCLAIMER_KEY, String(Date.now()));
  } catch {
    // Ignore: worst case the user re-accepts on the next launch.
  }
}

/** Clear acceptance (used by the fresh-install wipe). */
export async function clearDisclaimer(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DISCLAIMER_KEY);
  } catch {
    // Ignore.
  }
}
