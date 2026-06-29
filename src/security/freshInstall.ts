/**
 * Fresh-install detection + secure-store reset.
 *
 * Why this exists: on iOS, the OS Keychain can persist entries across app
 * uninstalls (notably in the iOS Simulator, and on real devices that have
 * retained the app's keychain items for any reason). That means after the
 * user deletes and reinstalls the app, `hasAccount()` in auth.ts returns
 * `true` based on stale keychain data, and the sign-in screen incorrectly
 * renders the login UI instead of the create-account UI.
 *
 * Android's Keystore is wiped on uninstall, so the bug only manifests on iOS.
 *
 * The fix: store an "install marker" in AsyncStorage, which lives in the
 * app's sandbox directory and is *guaranteed* to be wiped on iOS uninstall.
 * On boot, if the marker is missing, this is a fresh install — we clear any
 * stale secure-store entries so the sign-in flow behaves like a real
 * first-launch.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  Preserves credentials across app updates
 * ─────────────────────────────────────────────────────────────────────────
 * The marker is written exactly once per app install. Both of the update
 * paths the app supports keep the app sandbox intact, so the marker (and
 * therefore the credentials) survive:
 *
 *   • App Store / TestFlight update (native version bump) — sandbox preserved
 *   • EAS Update (OTA JS hot reload via the `updates.url` in app.json) —
 *     sandbox preserved
 *
 * Only a full uninstall clears the sandbox, which is the *only* situation
 * where the keychain could carry stale data and we need to reset.
 *
 * Behavior matrix:
 *
 *   Event                                 AsyncStorage   Wipe?
 *   ────────────────────────────────────  ─────────────  ─────
 *   First launch (truly fresh install)    empty          yes (no-op)
 *   App relaunch (cold start)             preserved      no
 *   App Store / TestFlight update         preserved      no
 *   EAS Update (OTA JS hot reload)        preserved      no
 *   Uninstall → reinstall (iOS bug case)  wiped          yes
 *   iOS "Erase All Content & Settings"    wiped          yes
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { deleteItem } from './secureStore';
import { deleteAccount } from './auth';
import { clearAllocations } from './preferencesStore';
import { CREDS_INDEX_KEY } from './credentialVault';
import { clearAllProfiles } from './profileStore';

const INSTALL_MARKER_KEY = 'coinescape.install.v1';

/**
 * Returns true the first time it is called for a given app install.
 * On every subsequent call within the same install — including after App
 * Store updates and EAS Updates — it returns false, so credentials are
 * preserved across updates.
 *
 * Side effect: writes the marker to AsyncStorage if it was missing. The
 * write is local-only; if it fails, the next launch will simply re-run the
 * wipe, which is idempotent.
 */
export async function detectFreshInstall(): Promise<boolean> {
  const existing = await AsyncStorage.getItem(INSTALL_MARKER_KEY);
  if (existing !== null) return false;
  await AsyncStorage.setItem(INSTALL_MARKER_KEY, String(Date.now()));
  return true;
}

/**
 * Best-effort wipe of every secure-store entry the app owns. Safe to call
 * even when nothing is stored — each `delete*` is a no-op on a missing key.
 *
 * Called ONLY on detected fresh install to discard keychain entries carried
 * over from a previous iOS install. Never called in response to an update.
 */
export async function wipeAllSecureStoreEntries(): Promise<void> {
  await Promise.allSettled([
    deleteAccount(),
    clearAllocations(),
    deleteItem(CREDS_INDEX_KEY),
    clearAllProfiles(),
  ]);
}