/**
 * Thin wrapper over expo-secure-store (OS Keychain / Keystore).
 *
 * Satisfies Requirement 8.7 — credentials live in secure local storage with
 * OS-enforced file permissions, never in plain AsyncStorage. All values are
 * JSON strings.
 *
 * On web there is no native secure store; expo-secure-store falls back and we
 * additionally guard so the app degrades gracefully during development.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isAvailable = Platform.OS !== 'web';

/** Web dev-only fallback so the flow is testable in a browser. */
const webMemory = new Map<string, string>();

export async function setItem(key: string, value: string): Promise<void> {
  if (!isAvailable) {
    webMemory.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getItem(key: string): Promise<string | null> {
  if (!isAvailable) return webMemory.get(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function deleteItem(key: string): Promise<void> {
  if (!isAvailable) {
    webMemory.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  await setItem(key, JSON.stringify(value));
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await getItem(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
