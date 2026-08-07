# Fix 1:30 login — native PBKDF2 via react-native-quick-crypto

## Root cause
Login is slow for two compounding reasons:
1. **Pure-JS PBKDF2** (`@noble/hashes`) runs 600k SHA256 iterations on the JS thread.
2. **`login()` derives the KDF up to 3×** at 600k each:
   - candidate verifier (`deriveKeyWithIterations`)
   - upgrade re-hash (only when `storedIterations < 600k`)
   - encryption key (`deriveKey`)

   A newly-registered 600k account still pays **2× 600k every login**. That is the ~1:30.
   The old 10s build was 100k with fewer derivations.

## Approach (chosen): native PBKDF2 + remove redundant derivations

### 1. Add native crypto dependency
- `npx expo install react-native-quick-crypto` (+ its peer `react-native-nitro-modules` if the installed version requires it — verify after install).
- Add its config plugin to `app.json` `plugins`.
- Requires New Architecture (default-on in SDK 56/RN 0.85 — confirm no `newArchEnabled:false` anywhere; app.json has none).
- Requires a **dev-client rebuild** (`expo prebuild` + `run:ios`/`run:android` or an EAS build). Not usable in Expo Go — the project already uses `expo-dev-client`.

### 2. Wrap PBKDF2 in crypto.ts behind the existing API
- Keep `deriveKey`, `deriveKeyWithIterations`, `PBKDF2_ITERATIONS = 600_000` signatures **unchanged** so no caller changes.
- Internally call `QuickCrypto.pbkdf2Sync(passwordBytes, salt, iterations, 32, 'sha256')` returning a Buffer → `Uint8Array`.
- Verify exact arg order / digest name / return type against the installed version's types before wiring (do NOT guess the API).
- Keep `@noble` pbkdf2 as a **fallback** path (e.g. when native module is absent, such as web build / Expo Go) so `crypto.ts` still works everywhere. Guard with a capability check.
- Output must be **byte-identical** to the current noble output for the same inputs, or existing stored verifiers/keys break. Add a one-off runtime self-check comparing noble vs native on a known vector during dev.

### 3. Cut redundant derivations in auth.ts `login()`
- The verifier salt (`pwSalt`) and key salt (`keySalt`) differ, so verifier and encryption key are genuinely 2 separate derivations — can't merge without a storage format change. Leave as-is for now, but:
- Skip work where possible: only run the upgrade re-hash branch when actually upgrading (already conditional — fine).
- Net: with native KDF each derivation drops from ~30–45s to well under 1s, so 2× is fine.

### 4. Keep the already-applied bug fix
- `login()`'s upgrade branch previously had `const newSalt = newSalt()` shadowing the imported `newSalt()` → ReferenceError, silently failing every upgrade. Already renamed to `upgradedSalt`. Keep it.

## Files touched
- `app.json` — add quick-crypto plugin.
- `package.json` — new dep (via expo install).
- `src/security/crypto.ts` — native pbkdf2 with noble fallback, unchanged exports.
- (maybe) `src/security/noble.d.ts` or a new `quick-crypto.d.ts` — types if needed.
- No changes needed in `auth.ts` callers, `AppStore.tsx`, `sign-in.tsx` (API preserved).

## Verification
1. Rebuild dev client.
2. Register a fresh account → time login (expect < ~1s KDF).
3. Migrate path: seed an account with `iterations: 100000` (old noble verifier) → log in → confirm it authenticates AND `iterations` flips to 600000 in secure store (this also proves native output == noble output for the legacy vector).
4. Confirm existing encrypted credentials still decrypt (encryption key derivation unchanged & byte-identical).
5. Web/Expo-Go path (if used) still works via noble fallback.

## Open risk
- react-native-quick-crypto version compatibility with RN 0.85 / New Arch must be confirmed at install time; if the current release doesn't support it, fall back to the "tiny Expo native module" option or a tuned iteration count. Will surface this before committing the dep.
