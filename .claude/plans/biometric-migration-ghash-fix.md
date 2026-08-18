# Fix: `aes/gcm: invalid ghash tag` on Android during biometric upgrade

## Diagnosis

The error string is **not** from `expo-secure-store`. It is thrown by
`@noble/ciphers` (`node_modules/@noble/ciphers/aes.js:820`), i.e. by our own
`decryptString()` in `src/security/crypto.ts`. It means **we decrypted a
credential blob with the wrong key** — nothing is wrong with the Keystore.

It surfaces verbatim because `mapError()` in `src/app/sign-in.tsx:78` falls
through to `e.message` for unrecognised errors.

### The platform asymmetry that makes it Android-only

Verified against the installed native source
(`node_modules/expo-secure-store/android/.../AESEncryptor.kt`,
`AuthenticationHelper.kt`, `SecureStoreModule.kt` @ 56.0.4):

- `AuthenticationHelper.authenticateCipher()` is called from **both**
  `createEncryptedItem()` and `decryptItem()`. So on Android,
  `SecureStore.setItemAsync(..., { requireAuthentication: true })` **shows a
  biometric prompt on write**. On iOS the Keychain only prompts on *read*.
- `assertBiometricsSupport()` accepts **`BIOMETRIC_STRONG` only** — there is no
  `DEVICE_CREDENTIAL` fallback on Android.

`migrateLegacyAccount()` therefore triggers **two** biometric prompts on Android
(`createMasterKey()` then `writeMasterKey()`) and **zero** on iOS.

### Failure sequence

`src/security/auth.ts:migrateLegacyAccount()`:

1. `oldKey = deriveKey(password, salt)`
2. `newKey = await createMasterKey()` — **unconditionally mints a random key and
   overwrites the stored one.** Its docblock claims "No-op-safe: if a key already
   exists it is left untouched" — the code does not implement that.
3. PHASE 1 — decrypt all with `oldKey`, re-encrypt under `newKey` (in memory).
4. PHASE 2 — write records, snapshots, `writeMasterKey()` (**prompt #2**),
   marker, delete legacy.

If **anything** fails after the first `writeStoredCredentialRecord()` — user
cancels prompt #2, app backgrounded (`"Cannot display biometric prompt when the
app is not in the foreground"`), process death — we are left with:

| state | value |
|---|---|
| credentials on disk | encrypted under `newKey_1` |
| stored master key | `newKey_1` |
| `VAULT_MARKER_KEY` | **absent** |
| `LEGACY_ACCOUNT_KEY` | **still present** |

Next launch: `hasLegacyAccount()` → true → migration screen again → user types
the password → step 2 mints `newKey_2` and **destroys `newKey_1`** → step 3
decrypts a `newKey_1` blob with `oldKey` → **`aes/gcm: invalid ghash tag`**, and
the credentials are now permanently unrecoverable.

### Second Android-only trigger for the same loop

`hasAccount()` reads `VAULT_MARKER_KEY` from SecureStore. On Android,
`readJSONEncodedItem()` catches `BadPaddingException`, **silently deletes the
entry and returns null** (`SecureStoreModule.kt:159-167`) whenever
SharedPreferences and the Keystore desync. A *successfully migrated* device can
lose its marker this way and re-enter migration → same crash, same key loss.
iOS has no equivalent behaviour.

---

## Plan

### 1. `src/security/vaultKey.ts` — stop destroying existing keys

- Add `tryReadMasterKey(): Promise<Uint8Array | null>` — auth-gated read that
  distinguishes "no key stored" from "user cancelled" (`VaultAuthError`).
- Add `getOrCreateMasterKey()` and make `createMasterKey()` honour its own
  contract: read first, return the existing key untouched if present.
- Fix `hasMasterKey()`: it currently `return true` in its `catch`, so a plain
  user-cancel is reported as "key exists". Rethrow `VaultAuthError` instead.
- `ensureDeviceLock()`: on **Android**, `SecureStore.canUseBiometricAuthentication()`
  is exactly `assertBiometricsSupport()` (BIOMETRIC_STRONG). If it is false,
  throw a new `BiometricsRequiredError` — do **not** fall through to the
  `getEnrolledLevelAsync()` passcode branch, which lets passcode-only devices
  past a gate `createMasterKey()` will then fail. iOS keeps today's behaviour
  (Keychain genuinely falls back to the passcode).

### 2. `src/security/auth.ts` — idempotent, crash-safe, resumable migration

Restructure `migrateLegacyAccount()`:

- **PHASE 0** — `ensureDeviceLock()`, then `newKey = (await tryReadMasterKey()) ??
  randomBytes(32)`. Never mint over an existing key.
- **PHASE 1** — per-field tolerant decrypt: try `oldKey`; on GCM failure retry
  with `newKey`. A field that decrypts under `newKey` is *already migrated* — keep
  it as-is. Only if **both** fail is it a genuine wrong password / corruption.
  This makes a resumed migration a no-op on already-converted records.
- **PHASE 2** — commit in a crash-safe order, with the master-key write **first**
  so the key that can read the new blobs always exists before any blob does:
  1. `writeMasterKey(newKey)` (single prompt; drop the redundant second write)
  2. live records + profile snapshots
  3. `VAULT_MARKER_KEY`
  4. `deleteItem(LEGACY_ACCOUNT_KEY)`

  Net effect on Android: **two biometric prompts → one**, and every intermediate
  state is resumable.
- Typed errors so nothing raw reaches the UI:
  - `WrongPasswordError` — every field failed under both keys.
  - `VaultUnrecoverableError` — records decrypt under neither key *and* a master
    key exists (the already-lost case from a previous retry).

### 3. Recovery for devices already stuck

- Half-committed but key intact → recovered automatically by §2's tolerant
  re-entry. No user action.
- Key already overwritten by a retry → data is cryptographically gone. Detect it,
  raise `VaultUnrecoverableError`, and offer an **explicit opt-in** "Reset vault
  and continue" action that finishes the migration (writes the marker, clears the
  legacy account and the undecryptable records) so the user escapes the loop.
  Never silently delete.

### 4. `src/security/auth.ts` + `freshInstall.ts` — harden the enrolled marker

Move `VAULT_MARKER_KEY` (explicitly non-secret) to **AsyncStorage**, alongside the
existing install marker in `freshInstall.ts`. This removes the Android
"marker silently deleted by the module" path entirely. Read the old SecureStore
marker as a fallback and backfill it, so already-enrolled devices don't regress.
Semantics are preserved: AsyncStorage is wiped on real uninstall, which is
exactly what `detectFreshInstall()` already relies on.

### 5. `src/app/sign-in.tsx` — never surface raw crypto text

Extend `mapError()` to handle `WrongPasswordError`, `VaultUnrecoverableError` and
`BiometricsRequiredError`, and replace the `e.message` fallback with a generic
message. "aes/gcm: invalid ghash tag" must never be shown to a user.

## Verification

- `npx tsc --noEmit` and `npm run lint`.
- Android device, legacy v1 account: cancel the biometric prompt mid-migration,
  relaunch, re-enter the password → migration completes, credentials intact.
- Android: confirm the happy-path migration now prompts **once**.
- Android passcode-only (no fingerprint/face) → clear `BiometricsRequiredError`
  message, not a native failure.
- iOS regression pass: enroll, unlock, migrate — unchanged.

## Out of scope

`keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` in `secureStore.ts` and
`vaultKey.ts` is **iOS-only and ignored on Android**. Worth a follow-up (Android
auto-backup can restore SharedPreferences without the Keystore), but it is not
the cause of this bug.
