/**
 * Authenticate against the stored account. On success returns the session
 * encryption key; on failure logs the attempt (Req 9.6) and throws.
 * 
 * If the stored account uses an older iteration count (< 600,000), the
 * password is automatically re-hashed with the current count during a
 * successful login (upgrades existing users over time).
 */
export async function login(username: string, password: string): Promise<AuthSuccess> {
  const account = await getJSON<StoredAccount>(ACCOUNT_KEY);
  if (!account) throw new Error('No local account exists');

  // 1. Use the iteration count that was stored when the account was created
  const storedIterations = account.iterations || 100000; // Fallback for very old accounts
  
  // 2. Derive the candidate using the SAME iteration count that was used to create it
  const candidate = deriveKeyWithIterations(password, hexToBytes(account.pwSalt), storedIterations);
  
  const ok =
    account.username.toLowerCase() === username.trim().toLowerCase() &&
    constantTimeEqual(candidate, hexToBytes(account.pwVerifier));

  if (!ok) {
    logFailedAttempt(username);
    throw new Error('Invalid username or password');
  }

  // 3. ✅ UPGRADE: If user is using an old iteration count, re-hash their password
  if (storedIterations < PBKDF2_ITERATIONS) {
    try {
      const newSalt = newSalt();
      const newVerifier = deriveKeyWithIterations(password, newSalt, PBKDF2_ITERATIONS);
      
      const updatedAccount: StoredAccount = {
        ...account,
        pwSalt: bytesToHex(newSalt),
        pwVerifier: bytesToHex(newVerifier),
        iterations: PBKDF2_ITERATIONS,
        // Preserve keySalt so encryption key derivation stays the same
      };
      await setJSON(ACCOUNT_KEY, updatedAccount);
      
      console.log(`✅ Upgraded ${username} from ${storedIterations} to ${PBKDF2_ITERATIONS} iterations`);
    } catch (e) {
      // Non-fatal: log but don't block login
      console.warn('Failed to upgrade password hash:', e);
    }
  }

  // 4. Derive the encryption key using the original keySalt (unchanged)
  return {
    username: account.username,
    encryptionKey: deriveKey(password, hexToBytes(account.keySalt)),
  };
}
