/**
 * Local-only user authentication.
 *
 * Requirement 9 (User Authentication & Session Management):
 *  - The account (username + password verifier) lives entirely on-device in
 *    the OS secure store. No network, no server.
 *  - The password is NEVER stored. We store a PBKDF2-SHA256 verifier (a hash
 *    derived from the password + a random salt) and compare in constant time.
 *  - A successful login also derives the AES-256-GCM master key (separate
 *    salt) used by the credential vault; that key is returned to the caller to
 *    hold in memory only for the session (Requirement 8.6).
 *
 * Requirement 9.6/9.7: failed attempts are logged (without the password) and a
 * minimum password strength is enforced at registration.
 */
import {
  PBKDF2_ITERATIONS,
  bytesToHex,
  deriveKey,
  hexToBytes,
  newSalt,
} from './crypto';
import { deleteItem, getJSON, setJSON } from './secureStore';

const ACCOUNT_KEY = 'coinescape.account.v1';

interface StoredAccount {
  username: string;
  /** salt for the password verifier (hex) */
  pwSalt: string;
  /** PBKDF2 verifier of the password (hex) — NOT the password itself */
  pwVerifier: string;
  /** independent salt used to derive the credential-encryption master key */
  keySalt: string;
  iterations: number;
  createdAt: number;
}

export interface PasswordRules {
  minLength: number;
}

export const PASSWORD_RULES: PasswordRules = { minLength: 8 };

export interface AuthSuccess {
  username: string;
  /** AES-256-GCM master key for the credential vault — keep in memory only. */
  encryptionKey: Uint8Array;
}

/** Returns true once a local account has been created on this device. */
export async function hasAccount(): Promise<boolean> {
  return (await getJSON<StoredAccount>(ACCOUNT_KEY)) !== null;
}

export async function getUsername(): Promise<string | null> {
  const acct = await getJSON<StoredAccount>(ACCOUNT_KEY);
  return acct?.username ?? null;
}

/** Enforces Requirement 9.7 strong-password rule. Returns an error or null. */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_RULES.minLength) {
    return `Password must be at least ${PASSWORD_RULES.minLength} characters`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain letters and numbers';
  }
  return null;
}

/**
 * First-run account creation. Stores the username + password verifier and
 * returns the freshly-derived encryption key for the new session.
 */
export async function registerAccount(
  username: string,
  password: string
): Promise<AuthSuccess> {
  const uname = username.trim();
  if (uname.length < 3) throw new Error('Username must be at least 3 characters');
  const pwError = validatePassword(password);
  if (pwError) throw new Error(pwError);

  const pwSalt = newSalt();
  const keySalt = newSalt();
  const verifier = deriveKey(password, pwSalt);

  const account: StoredAccount = {
    username: uname,
    pwSalt: bytesToHex(pwSalt),
    pwVerifier: bytesToHex(verifier),
    keySalt: bytesToHex(keySalt),
    iterations: PBKDF2_ITERATIONS,
    createdAt: Date.now(),
  };
  await setJSON(ACCOUNT_KEY, account);

  return {
    username: uname,
    encryptionKey: deriveKey(password, keySalt),
  };
}

/**
 * Authenticate against the stored account. On success returns the session
 * encryption key; on failure logs the attempt (Req 9.6) and throws.
 */
export async function login(username: string, password: string): Promise<AuthSuccess> {
  const account = await getJSON<StoredAccount>(ACCOUNT_KEY);
  if (!account) throw new Error('No local account exists');

  const candidate = deriveKey(password, hexToBytes(account.pwSalt));
  const ok =
    account.username.toLowerCase() === username.trim().toLowerCase() &&
    constantTimeEqual(candidate, hexToBytes(account.pwVerifier));

  if (!ok) {
    logFailedAttempt(username);
    throw new Error('Invalid username or password');
  }

  return {
    username: account.username,
    encryptionKey: deriveKey(password, hexToBytes(account.keySalt)),
  };
}

/**
 * Verify a password against the stored account WITHOUT establishing a session.
 * Used to gate sensitive in-session actions (e.g. exporting a profile) where we
 * require the user to re-enter their password but don't want to re-login.
 * Constant-time; returns false if no account exists.
 */
export async function verifyPassword(password: string): Promise<boolean> {
  const account = await getJSON<StoredAccount>(ACCOUNT_KEY);
  if (!account) return false;
  const candidate = deriveKey(password, hexToBytes(account.pwSalt));
  return constantTimeEqual(candidate, hexToBytes(account.pwVerifier));
}

/** Remove the local account entirely (e.g. for a reset flow). */
export async function deleteAccount(): Promise<void> {
  await deleteItem(ACCOUNT_KEY);
}

/** Req 9.6 — record failed authentication without ever logging the password. */
function logFailedAttempt(username: string): void {
  console.warn(
    `[auth] Failed login attempt for "${username.trim().slice(0, 32)}" at ${new Date().toISOString()}`
  );
}

/** Constant-time comparison to avoid timing side channels on the verifier. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
