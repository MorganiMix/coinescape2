/**
 * Profile store — lets the user keep up to {@link MAX_PROFILES} independent
 * "exchange + coin" setups and switch between them.
 *
 * Design: the ACTIVE profile always uses the existing live vault keys
 * (`coinescape.creds.<id>.v1`, the credential index, and
 * `coinescape.allocations.v1`). The exchange layer (ExchangeManager,
 * restoreSession, connectExchange…) is therefore completely unaware of
 * profiles — it always operates on "the active profile".
 *
 * INACTIVE profiles are kept as encrypted snapshots under
 * `coinescape.profile.<id>.snapshot.v1`. Switching profiles means:
 *   1. snapshot the current live keys into the outgoing profile's slot,
 *   2. load the incoming profile's snapshot into the live keys.
 *
 * Credential records are moved VERBATIM (still AES-256-GCM encrypted under the
 * account master key), so switching never needs the session key.
 */
import { AllocationTargets } from '@/domain/types';
import { bytesToHex, randomBytes } from './crypto';
import {
  StoredCredentials,
  deleteStoredCredentialRecord,
  listStoredCredentialExchanges,
  readStoredCredentialRecord,
  replaceCredentialIndex,
  writeStoredCredentialRecord,
} from './credentialVault';
import {
  clearAllocations,
  loadAllocations,
  saveAllocations,
} from './preferencesStore';
import { deleteItem, getJSON, setJSON } from './secureStore';

/** Hard cap on the number of stored profiles. */
export const MAX_PROFILES = 3;

const REGISTRY_KEY = 'coinescape.profiles.v1';
const snapshotKeyFor = (id: string) => `coinescape.profile.${id}.snapshot.v1`;

export interface ProfileMeta {
  id: string;
  name: string;
  createdAt: number;
}

export interface ProfileRegistry {
  activeId: string;
  profiles: ProfileMeta[];
}

/**
 * Stored data for ONE profile when it is not the active one. Credential records
 * are the already-encrypted at-rest shape — portable across profiles because
 * every profile shares the same account master key.
 */
export interface ProfileSnapshot {
  allocations: AllocationTargets | null;
  credIndex: string[];
  creds: Record<string, StoredCredentials>;
}

const EMPTY_ALLOCATIONS: AllocationTargets = { targetAddress: '', byExchange: {} };

/** Short random hex id (8 bytes) for a profile. */
function newProfileId(): string {
  return bytesToHex(randomBytes(8));
}

/**
 * Read the snapshot of the CURRENT live vault keys (active profile's data).
 * Used to stash the outgoing profile before switching away from it, and to seed
 * the very first profile during legacy migration.
 */
export async function snapshotActive(): Promise<ProfileSnapshot> {
  const allocations = await loadAllocations();
  const credIndex = await listStoredCredentialExchanges();
  const creds: Record<string, StoredCredentials> = {};
  for (const id of credIndex) {
    const rec = await readStoredCredentialRecord(id);
    if (rec) creds[id] = rec;
  }
  return { allocations, credIndex: Object.keys(creds), creds };
}

/**
 * Overwrite the live vault keys with a snapshot's contents. Clears whatever was
 * live first, so the live state exactly matches the snapshot afterward.
 */
export async function applySnapshot(snap: ProfileSnapshot): Promise<void> {
  // 1. Clear current live credential records (by the current index).
  const currentIds = await listStoredCredentialExchanges();
  for (const id of currentIds) await deleteStoredCredentialRecord(id);

  // 2. Write the snapshot's credential records + rebuild the index.
  const ids = Object.keys(snap.creds);
  for (const id of ids) await writeStoredCredentialRecord(id, snap.creds[id]);
  await replaceCredentialIndex(ids);

  // 3. Allocations.
  if (snap.allocations) await saveAllocations(snap.allocations);
  else await clearAllocations();
}

async function loadSnapshot(id: string): Promise<ProfileSnapshot> {
  const snap = await getJSON<ProfileSnapshot>(snapshotKeyFor(id));
  return (
    snap ?? { allocations: EMPTY_ALLOCATIONS, credIndex: [], creds: {} }
  );
}

async function storeSnapshot(id: string, snap: ProfileSnapshot): Promise<void> {
  await setJSON(snapshotKeyFor(id), snap);
}

/**
 * Load the profile registry, creating it on first run. On first run any
 * pre-existing live setup (credentials + allocations from before profiles
 * existed) is adopted as "Profile 1" so nothing is lost.
 */
export async function loadRegistry(): Promise<ProfileRegistry> {
  const existing = await getJSON<ProfileRegistry>(REGISTRY_KEY);
  if (existing && existing.profiles.length > 0) return existing;

  // First run / migration: adopt current live keys as the initial profile.
  const id = newProfileId();
  const registry: ProfileRegistry = {
    activeId: id,
    profiles: [{ id, name: 'Profile 1', createdAt: Date.now() }],
  };
  await setJSON(REGISTRY_KEY, registry);
  // The active profile lives in the live keys, so we DON'T snapshot it here —
  // a snapshot is only written when this profile is switched away from.
  return registry;
}

export async function saveRegistry(registry: ProfileRegistry): Promise<void> {
  await setJSON(REGISTRY_KEY, registry);
}

export async function listProfiles(): Promise<ProfileMeta[]> {
  return (await loadRegistry()).profiles;
}

export async function renameProfile(id: string, name: string): Promise<ProfileRegistry> {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error('Profile name cannot be empty');
  const registry = await loadRegistry();
  const next: ProfileRegistry = {
    ...registry,
    profiles: registry.profiles.map((p) =>
      p.id === id ? { ...p, name: trimmed.slice(0, 40) } : p
    ),
  };
  await saveRegistry(next);
  return next;
}

/**
 * Switch the active profile. Snapshots the current live keys into the outgoing
 * profile, then loads the target profile's snapshot into the live keys.
 * No-op if `targetId` is already active. Returns the updated registry.
 */
export async function switchProfile(targetId: string): Promise<ProfileRegistry> {
  const registry = await loadRegistry();
  if (registry.activeId === targetId) return registry;
  if (!registry.profiles.some((p) => p.id === targetId)) {
    throw new Error('Unknown profile');
  }

  // 1. Stash the outgoing (currently live) profile.
  const outgoing = await snapshotActive();
  await storeSnapshot(registry.activeId, outgoing);

  // 2. Load the incoming profile into the live keys, then drop its snapshot
  //    (its data now lives in the live keys; keeping a stale copy would diverge).
  const incoming = await loadSnapshot(targetId);
  await applySnapshot(incoming);
  await deleteItem(snapshotKeyFor(targetId));

  const next: ProfileRegistry = { ...registry, activeId: targetId };
  await saveRegistry(next);
  return next;
}

/**
 * Create a new profile (rejects when at {@link MAX_PROFILES}). Its data is
 * provided as a snapshot (default: empty). The new profile becomes active —
 * the current one is stashed first.
 */
export async function createProfile(
  name: string,
  snapshot: ProfileSnapshot = { allocations: EMPTY_ALLOCATIONS, credIndex: [], creds: {} }
): Promise<ProfileRegistry> {
  const registry = await loadRegistry();
  if (registry.profiles.length >= MAX_PROFILES) {
    throw new Error(`You can keep at most ${MAX_PROFILES} profiles`);
  }
  const id = newProfileId();

  // Stash the current live profile, then make the new one live.
  const outgoing = await snapshotActive();
  await storeSnapshot(registry.activeId, outgoing);
  await applySnapshot(snapshot);

  const next: ProfileRegistry = {
    activeId: id,
    profiles: [
      ...registry.profiles,
      { id, name: (name.trim() || `Profile ${registry.profiles.length + 1}`).slice(0, 40), createdAt: Date.now() },
    ],
  };
  await saveRegistry(next);
  return next;
}

/**
 * Replace an EXISTING profile's data with the given snapshot. If it is the
 * active profile, the live keys are overwritten; otherwise its stored snapshot
 * is replaced. Used when importing over an occupied slot.
 */
export async function overwriteProfile(
  id: string,
  name: string,
  snapshot: ProfileSnapshot
): Promise<ProfileRegistry> {
  const registry = await loadRegistry();
  if (!registry.profiles.some((p) => p.id === id)) throw new Error('Unknown profile');

  if (registry.activeId === id) {
    await applySnapshot(snapshot);
  } else {
    await storeSnapshot(id, snapshot);
  }
  const next: ProfileRegistry = {
    ...registry,
    profiles: registry.profiles.map((p) =>
      p.id === id ? { ...p, name: (name.trim() || p.name).slice(0, 40) } : p
    ),
  };
  await saveRegistry(next);
  return next;
}

/**
 * Delete a profile. Refuses to delete the last remaining profile (there must
 * always be at least one). When the ACTIVE profile is deleted, another profile
 * is promoted to active and loaded into the live keys (which also clears the
 * deleted profile's live data). Returns the updated registry.
 */
export async function deleteProfile(id: string): Promise<ProfileRegistry> {
  const registry = await loadRegistry();
  if (!registry.profiles.some((p) => p.id === id)) throw new Error('Unknown profile');
  if (registry.profiles.length <= 1) {
    throw new Error('You must keep at least one profile');
  }

  const remaining = registry.profiles.filter((p) => p.id !== id);

  if (registry.activeId === id) {
    // Promote the first remaining profile and load it into the live keys.
    // applySnapshot() first clears the current (deleted) profile's live data.
    const promoted = remaining[0];
    const snap = await loadSnapshot(promoted.id);
    await applySnapshot(snap);
    await deleteItem(snapshotKeyFor(promoted.id)); // its data now lives in the live keys
    const next: ProfileRegistry = { activeId: promoted.id, profiles: remaining };
    await saveRegistry(next);
    return next;
  }

  // Inactive profile: drop its snapshot; live keys are untouched.
  await deleteItem(snapshotKeyFor(id));
  const next: ProfileRegistry = { ...registry, profiles: remaining };
  await saveRegistry(next);
  return next;
}

/**
 * Wipe every profile-related secure-store key. Called only by the fresh-install
 * reset. Best-effort.
 */
export async function clearAllProfiles(): Promise<void> {
  const registry = await getJSON<ProfileRegistry>(REGISTRY_KEY);
  if (registry) {
    await Promise.allSettled(
      registry.profiles.map((p) => deleteItem(snapshotKeyFor(p.id)))
    );
  }
  await deleteItem(REGISTRY_KEY);
}
