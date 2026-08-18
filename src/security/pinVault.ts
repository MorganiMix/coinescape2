/**
 * PIN-wrapped vault master key — the primary, always-available way in.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Why this exists (the biometric lockout bug)
 * ─────────────────────────────────────────────────────────────────────────────
 * The vault master key used to live in exactly one place: a secure-store item
 * written with `requireAuthentication: true`. Both platforms destroy that item
 * when the device's enrolled biometrics change:
 *
 *  - **Android** — `AESEncryptor.initializeKeyStoreEntry` builds the Keystore
 *    entry with `.setUserAuthenticationRequired(true)` and never calls
 *    `setInvalidatedByBiometricEnrollment(false)`. The platform default is to
 *    invalidate, so adding or removing a single fingerprint permanently destroys
 *    the key. `SecureStoreModule.readJSONEncodedItem` then swallows
 *    `KeyPermanentlyInvalidatedException` and returns null, so JS cannot even
 *    tell the difference between "invalidated" and "never existed".
 *  - **iOS** — `SecureStoreModule.set` uses
 *    `SecAccessControlCreateWithFlags(..., .biometryCurrentSet, ...)`.
 *    `.biometryCurrentSet` invalidates on any change to the enrolled biometric
 *    set, and carries no `.devicePasscode` fallback — so this was never the
 *    Android-only problem the old comments claimed, and there was no passcode
 *    path to the key when Face ID failed.
 *
 * Either way the user's exchange credentials became permanently unreadable and
 * the only exit the UI could offer was a full wipe.
 *
 * The fix: the master key's *primary* home is this PIN wrap — AES-256-GCM under
 * an Argon2id key derived from a 6-digit PIN — written **without**
 * `requireAuthentication`. Both native implementations keep authenticated and
 * unauthenticated items under separate keystore aliases / keychain services
 * (`:authenticated` vs `:unauthenticated` on Android, `:auth` vs `:no-auth` on
 * iOS), so nothing about biometric enrolment can touch this item. The
 * biometric-gated copy (see `biometricVault.ts`) is now only a convenience
 * shortcut whose loss is recoverable: unlock with the PIN and it is rewritten.
 *
 * A wrong PIN is detected by GCM authentication failing on the unwrap, so no
 * password verifier is stored — there is nothing here to attack offline except
 * the wrap itself.
 */
import type { Argon2Params, EncryptedData } from './crypto';
import {
  PIN_ARGON2_MEMORY_KIB,
  PIN_ARGON2_PARALLELISM,
  PIN_ARGON2_PASSES,
  bytesToHex,
  decryptString,
  derivePinKey,
  encryptString,
  hexToBytes,
  newSalt,
} from './crypto';
import { deleteItem, getJSON, setJSON } from './secureStore';

/** Digits in a vault PIN. Fixed at 6 (the numpad UI is built around it). */
export const PIN_LENGTH = 6;

/** The PIN-wrapped master key. Written WITHOUT `requireAuthentication`. */
const PIN_WRAP_KEY = 'coinescape.pinwrap.v1';
/**
 * Failed-attempt state. Also in secure store rather than AsyncStorage so that
 * clearing app data doesn't hand an attacker a fresh set of guesses.
 */
const PIN_ATTEMPTS_KEY = 'coinescape.pin.attempts.v1';

/** Wrong PINs allowed before the lockout starts escalating. */
const FREE_ATTEMPTS = 3;
/** First lockout, doubling with each further failure. */
const LOCKOUT_BASE_MS = 30_000;
/** Ceiling on the escalation. */
const LOCKOUT_MAX_MS = 30 * 60_000;

interface PinWrap {
  v: 1;
  /** Hex Argon2id salt. */
  salt: string;
  /** Cost parameters this wrap was created under (so they can be raised later). */
  kdf: Argon2Params;
  /** The master key, hex-encoded, encrypted under the PIN-derived key. */
  blob: EncryptedData;
}

interface AttemptState {
  /** Consecutive failures. Reset to 0 on any successful unlock. */
  fails: number;
  /** Epoch ms until which unlocking is refused. */
  lockedUntil: number;
}

const NO_ATTEMPTS: AttemptState = { fails: 0, lockedUntil: 0 };

/** No PIN has been set on this device yet. */
export class PinNotSetError extends Error {
  constructor() {
    super('No PIN has been set up on this device yet.');
    this.name = 'PinNotSetError';
  }
}

/** The entered PIN did not unwrap the master key. */
export class WrongPinError extends Error {
  /** Failures in a row, including this one. */
  readonly fails: number;
  /** Epoch ms the vault is locked until (0 when not yet locked out). */
  readonly lockedUntil: number;
  /** Attempts left before the next lockout kicks in (0 once locked). */
  readonly attemptsRemaining: number;

  constructor(fails: number, lockedUntil: number) {
    super('That PIN is not correct.');
    this.name = 'WrongPinError';
    this.fails = fails;
    this.lockedUntil = lockedUntil;
    this.attemptsRemaining = Math.max(0, FREE_ATTEMPTS - fails);
  }
}

/** Too many wrong PINs — unlocking is refused until `lockedUntil`. */
export class PinLockedOutError extends Error {
  readonly lockedUntil: number;

  constructor(lockedUntil: number) {
    super('Too many incorrect PIN attempts. Try again later.');
    this.name = 'PinLockedOutError';
    this.lockedUntil = lockedUntil;
  }
}

/** The proposed PIN is not acceptable (wrong length, or trivially guessable). */
export class WeakPinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeakPinError';
  }
}

// ───────────────────────────── PIN quality ──────────────────────────────────

/**
 * Reject the handful of PINs that are the first thing anyone tries.
 *
 * Deliberately narrow: a single repeated digit (`000000`) and a straight run in
 * either direction (`123456`, `654321`, and their wrap-arounds). Anything
 * broader starts rejecting PINs that users have a real reason to pick, which
 * pushes them towards writing it down — a worse outcome than a mildly weak PIN
 * behind a rate limit.
 *
 * @returns an error message, or null when the PIN is acceptable.
 */
export function checkPinStrength(pin: string): string | null {
  if (pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
    return `Your PIN must be ${PIN_LENGTH} digits.`;
  }
  if (/^(\d)\1+$/.test(pin)) {
    return 'Pick a PIN that isn’t the same digit repeated.';
  }
  const digits = [...pin].map(Number);
  const isRun = (step: number) =>
    digits.every((d, i) => i === 0 || d === (digits[i - 1] + step + 10) % 10);
  if (isRun(1) || isRun(-1)) {
    return 'Pick a PIN that isn’t a simple sequence.';
  }
  return null;
}

/** Throwing form of {@link checkPinStrength}. */
function assertPinAcceptable(pin: string): void {
  const problem = checkPinStrength(pin);
  if (problem) throw new WeakPinError(problem);
}

// ─────────────────────────── attempt throttling ─────────────────────────────

/**
 * How long to lock the vault after `fails` consecutive wrong PINs.
 * 0 for the first {@link FREE_ATTEMPTS}, then 30s doubling to a 30-minute cap.
 */
function lockoutFor(fails: number): number {
  if (fails <= FREE_ATTEMPTS) return 0;
  const step = fails - FREE_ATTEMPTS - 1;
  return Math.min(LOCKOUT_BASE_MS * 2 ** step, LOCKOUT_MAX_MS);
}

async function readAttempts(): Promise<AttemptState> {
  return (await getJSON<AttemptState>(PIN_ATTEMPTS_KEY)) ?? NO_ATTEMPTS;
}

async function writeAttempts(state: AttemptState): Promise<void> {
  await setJSON(PIN_ATTEMPTS_KEY, state);
}

async function clearAttempts(): Promise<void> {
  await deleteItem(PIN_ATTEMPTS_KEY);
}

/**
 * Current lockout status, for the UI to render a countdown without attempting
 * an unlock. `lockedUntil` is 0 when the vault is not locked.
 */
export async function getPinLockout(): Promise<{
  fails: number;
  lockedUntil: number;
  attemptsRemaining: number;
}> {
  const { fails, lockedUntil } = await readAttempts();
  const expired = lockedUntil <= Date.now();
  return {
    fails,
    lockedUntil: expired ? 0 : lockedUntil,
    attemptsRemaining: Math.max(0, FREE_ATTEMPTS - fails),
  };
}

// ──────────────────────────────── the wrap ──────────────────────────────────

/** True once a PIN has been set on this device. */
export async function hasPin(): Promise<boolean> {
  return (await getJSON<PinWrap>(PIN_WRAP_KEY)) !== null;
}

/**
 * Wrap `masterKey` under `pin` and persist it, replacing any existing wrap and
 * clearing the failed-attempt state.
 *
 * Used for first enrolment, for giving an existing biometric-only vault a PIN,
 * and (via {@link changePin}) for changing it. The master key itself is never
 * altered, so every credential encrypted under it stays readable.
 *
 * @throws {WeakPinError} the PIN is the wrong shape or trivially guessable.
 */
export async function setPin(pin: string, masterKey: Uint8Array): Promise<void> {
  assertPinAcceptable(pin);

  const salt = newSalt();
  const kdf: Argon2Params = {
    m: PIN_ARGON2_MEMORY_KIB,
    t: PIN_ARGON2_PASSES,
    p: PIN_ARGON2_PARALLELISM,
  };
  const kek = derivePinKey(pin, salt, kdf);
  const wrap: PinWrap = {
    v: 1,
    salt: bytesToHex(salt),
    kdf,
    blob: encryptString(bytesToHex(masterKey), kek),
  };
  kek.fill(0);

  await setJSON(PIN_WRAP_KEY, wrap);
  await clearAttempts();
}

/**
 * Unwrap the master key with the user's PIN.
 *
 * The failure counter is bumped **before** the attempt and only cleared after a
 * success, so force-quitting the app mid-guess cannot be used to farm unlimited
 * attempts.
 *
 * @throws {PinNotSetError} no PIN wrap exists on this device.
 * @throws {PinLockedOutError} still inside an escalating lockout window.
 * @throws {WrongPinError} the PIN did not unwrap the key.
 */
export async function unlockWithPin(pin: string): Promise<Uint8Array> {
  const wrap = await getJSON<PinWrap>(PIN_WRAP_KEY);
  if (!wrap) throw new PinNotSetError();

  const attempts = await readAttempts();
  if (attempts.lockedUntil > Date.now()) {
    throw new PinLockedOutError(attempts.lockedUntil);
  }

  // Record the attempt up front: a crash or force-quit between here and the
  // success path must count as a failure, never as a free guess.
  const fails = attempts.fails + 1;
  await writeAttempts({ fails, lockedUntil: 0 });

  const kek = derivePinKey(pin, hexToBytes(wrap.salt), wrap.kdf);
  let masterKeyHex: string;
  try {
    masterKeyHex = decryptString(wrap.blob, kek);
  } catch {
    // GCM authentication failed — the derived key is wrong, i.e. wrong PIN.
    const penalty = lockoutFor(fails);
    const lockedUntil = penalty > 0 ? Date.now() + penalty : 0;
    await writeAttempts({ fails, lockedUntil });
    throw new WrongPinError(fails, lockedUntil);
  } finally {
    kek.fill(0);
  }

  await clearAttempts();
  return hexToBytes(masterKeyHex);
}

/**
 * Change the PIN. Verifies the current one first (which also means a wrong
 * current PIN counts against the lockout, exactly like a failed unlock).
 *
 * @throws {WrongPinError} / {PinLockedOutError} / {PinNotSetError} / {WeakPinError}
 */
export async function changePin(currentPin: string, newPin: string): Promise<void> {
  // Validate the new PIN before spending ~250ms deriving the old one, so an
  // unacceptable new PIN fails fast and without touching the attempt counter.
  assertPinAcceptable(newPin);
  const masterKey = await unlockWithPin(currentPin);
  try {
    await setPin(newPin, masterKey);
  } finally {
    masterKey.fill(0);
  }
}

/** Remove the PIN wrap and attempt state (full vault reset only). */
export async function deletePin(): Promise<void> {
  await deleteItem(PIN_WRAP_KEY);
  await clearAttempts();
}
