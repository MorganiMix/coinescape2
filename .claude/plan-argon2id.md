# Switch password KDF to Argon2id

## Decisions locked
- Migration: auto-upgrade existing accounts on successful login.
- Params: OWASP Argon2id minimum — m=19456 KiB (19 MiB), t=2, p=1, tag=32.

## Key architectural insight
Two independent derivations exist:
1. **Verifier** (`pwSalt` → `pwVerifier`) — gates login. SAFE to change algorithm;
   on login we re-hash and overwrite.
2. **Master encryption key** (`keySalt` → AES key) — encrypts ALL credentials,
   across ALL profiles, including inactive profile SNAPSHOTS. Changing this
   algorithm invalidates every stored ciphertext everywhere.

Re-encrypting the master key would require walking: live cred records + the
credential index + every `coinescape.profile.<id>.snapshot.v1` blob, decrypt
with old PBKDF2 key, re-encrypt with new Argon2 key — high blast radius, and a
partial failure could brick credentials.

**Decision: migrate ONLY the verifier to Argon2id. Keep the master key on
PBKDF2 (native quick-crypto, already fast).** This delivers the security win
(password hardening is exactly what the verifier does) with ZERO data
migration. The master key derivation stays byte-stable, so all existing
encrypted credentials + profile snapshots remain valid untouched.

Rationale: the master key is not a password hash the attacker brute-forces
offline in the same way — it is only ever derived from the correct password
after the Argon2id verifier already gated entry. Its job is stability, not
work-factor. (If we later want the key itself Argon2-hardened, that's a
separate, explicit re-encryption migration — out of scope here.)

## crypto.ts changes
- Add Argon2id, native (quick-crypto `argon2Sync('argon2id', {...})`) with
  @noble `argon2id` fallback for web/Expo Go. Byte-identical (both RFC 9106).
- Constants: `ARGON2_MEMORY_KIB = 19456`, `ARGON2_PASSES = 2`,
  `ARGON2_PARALLELISM = 1`, `ARGON2_VERSION = 0x13`, tag = KEY_LEN (32).
- New `deriveVerifierArgon2id(password, salt): Uint8Array`.
- Native param mapping (quick-crypto Argon2Params):
  message=pwBytes, nonce=salt, parallelism=1, tagLength=32, memory=19456,
  passes=2, version=0x13.
- noble mapping: `argon2id(pw, salt, { t:2, m:19456, p:1, dkLen:32 })`.
- KEEP `deriveKey` / `deriveKeyWithIterations` (PBKDF2) exactly as-is — master
  key stays PBKDF2. KEEP `PBKDF2_ITERATIONS`.

## auth.ts changes
- StoredAccount: add `kdf?: 'pbkdf2' | 'argon2id'` (absent ⇒ legacy pbkdf2) and
  keep `iterations` for legacy verify. Bump nothing else.
- register(): verifier = Argon2id; store `kdf:'argon2id'`, keep `keySalt` +
  master key on PBKDF2 as today.
- login():
  1. Read account. Determine verifier algo from `kdf` (default pbkdf2).
  2. Compute candidate verifier with THAT algo (+ stored iterations for pbkdf2).
  3. constant-time compare.
  4. On success, if `kdf !== 'argon2id'`: re-hash verifier with Argon2id under a
     fresh `pwSalt`, set `kdf:'argon2id'`, persist. Non-fatal on error.
  5. Master key = `deriveKey(password, keySalt)` (PBKDF2) — UNCHANGED, so
     credentials still decrypt.
- verifyPassword(): mirror login's algo-dispatch for the verifier.
- Keep the earlier `upgradedSalt` shadowing bugfix.

## Files
- src/security/crypto.ts (Argon2id + native/noble)
- src/security/auth.ts (kdf field, dispatch, migrate-on-login)
- app.json already has the quick-crypto plugin (argon2 needs no libsodium).
- Maybe src/security/noble.d.ts — add `@noble/hashes/argon2` shim.

## Verify (after dev-client rebuild)
1. Fresh register → login: fast (native Argon2id ~tens of ms), account shows
   kdf:'argon2id'.
2. Legacy pbkdf2 account (kdf absent): logs in, flips to kdf:'argon2id', and
   its stored credentials STILL decrypt (master key untouched).
3. Web/Expo-Go: noble Argon2id fallback authenticates.
4. Wrong password still rejected (constant-time compare).
