/**
 * Preferences store — persists non-secret user configuration so the app
 * doesn't have to be set up again on the next login.
 *
 * Currently holds the "emergency coin selection" (AllocationTargets): which
 * assets escape from which exchange and to which destination address / network
 * / memo / Kraken withdrawal-key.
 *
 * Unlike the credential vault, this data is NOT app-encrypted: destination
 * addresses are public on-chain identifiers, not secrets. It is still written
 * through expo-secure-store (OS Keychain / Keystore) for at-rest file
 * protection, as plain JSON.
 */
import { AllocationTargets } from '@/domain/types';
import { deleteItem, getJSON, setJSON } from './secureStore';

const ALLOCATIONS_KEY = 'coinescape.allocations.v1';

/** Persist the current emergency coin selection. */
export async function saveAllocations(allocations: AllocationTargets): Promise<void> {
  await setJSON(ALLOCATIONS_KEY, allocations);
}

/** Load the saved coin selection, or null if none has been stored yet. */
export async function loadAllocations(): Promise<AllocationTargets | null> {
  return getJSON<AllocationTargets>(ALLOCATIONS_KEY);
}

/** Remove the saved coin selection (e.g. on a full account reset). */
export async function clearAllocations(): Promise<void> {
  await deleteItem(ALLOCATIONS_KEY);
}
