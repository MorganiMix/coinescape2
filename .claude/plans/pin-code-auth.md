# PIN-first vault access (6-digit numpad) + repairable biometrics

## The bug, root-caused in the native source

The vault master key (`coinescape.masterkey.v1`) is the **only** copy of the
AES-256-GCM key that encrypts every exchange credential, and it is stored with
`requireAuthentication: true`. I read the installed native modules to confirm
what that actually does:

- **Android** — `expo-secure-store/android/.../encryptors/AESEncryptor.kt:63`
  builds the Keystore entry with `.setUserAuthenticationRequired(true)` and
  **never calls `setInvalidatedByBiometricEnrollment(false)`**. Android's default
  is `true`, so *enrolling or removing any fingerprint/face permanently destroys
  the key*. `SecureStoreModule.kt:156` then catches
  `KeyPermanentlyInvalidatedException` and **returns null** — so JS sees "no key"
  rather than an error.
- **iOS** — `SecureStoreModule.swift:105` uses
  `SecAccessControlCreateWithFlags(..., .biometryCurrentSet, ...)`. `.biometryCurrentSet`
  invalidates the item whenever the enrolled biometric set changes, and there is
  **no `.devicePasscode` fallback flag**. So this is *not* an Android-only bug as
  `vaultKey.ts` currently claims, and the sign-in screen's promise "Confirm with
  Face ID, Touch ID, **or your device passcode**" is false on iOS — if Face ID
  fails there is no passcode path to the key.

Result today: user adds a fingerprint → key gone → `VaultKeyMissingError` → the
only offered exit is "Reset vault", which erases every saved exchange
connection. That is the reported "app forgets the biometric and login becomes
impossible".

Two related defects fall out of the same design:

- Android devices with a PIN/pattern lock but no *strong* biometric are refused
  outright (`BiometricsRequiredError`), because `AuthenticationHelper.kt:62` only
  accepts `BIOMETRIC_STRONG`. Those users cannot use the app at all.
- iOS devices with a passcode but no biometric enrolled will throw
  `SecAccessControlError` on write, contradicting the "iOS with a passcode but no
  biometrics — the Keychain handles this fine" comment in `ensureDeviceLock()`.

## The fix: PIN is the root of trust, biometrics is a repairable shortcut

Keep the same random 256-bit master key (MK) and the same AES-256-GCM credential
blobs — **no credential re-encryption, no data migration of the vault itself**.
Change only how MK is protected at rest:

| Store | Item | Auth-gated? | Role |
|---|---|---|---|
| SecureStore | `coinescape.pinwrap.v1` | **no** | `{v, salt, kdf, blob}` — MK encrypted under `Argon2id(pin, salt)`. **Primary, always works.** |
| SecureStore | `coinescape.masterkey.v1` | yes | hex MK — unchanged item, now just an optional biometric fast path. **Loss is non-fatal.** |
| SecureStore | `coinescape.pin.attempts.v1` | no | `{fails, lockedUntil}` — survives app kill / data clear. |
| AsyncStorage | `coinescape.bio.enabled.v1` | — | non-secret flag so we know whether to auto-prompt without a read that itself prompts. |

Both native implementations keep auth-gated and non-auth-gated items under
**separate keystore aliases / keychain services** (`:authenticated` vs
`:unauthenticated` on Android, `:auth` vs `:no-auth` on iOS). The PIN wrap
therefore lives in a bucket that biometric enrolment changes cannot touch. That
is the whole fix: when the biometric copy evaporates, the PIN still opens the
vault, and after a successful PIN unlock the app **silently re-writes the
biometric copy** so Face ID works again next launch. No data loss, no reset.

Wrong PIN = GCM authentication failure on the unwrap. No separate verifier
needed, nothing extra stored.

### KDF parameters

`crypto.ts` already has native+JS Argon2id (used for the transfer PIN). Add
`derivePinKey(pin, salt)` at hardened cost — **64 MiB, 3 passes, 1 lane**
(vs. the existing 19 MiB/2 for transfer), targeting ~250-400 ms on device. A
6-digit PIN is only 10^6 guesses, so the depth of defence is: the wrap sits in
hardware-backed OS storage (needs a rooted/jailbroken device to extract at all),
memory-hard KDF, and the lockout below. The wrap is deliberately **not**
mirrored into AsyncStorage.

### Lockout (your choice: escalating, never destructive)

Attempts 1-3 free. Then a forced wait that doubles: 30 s, 1 m, 2 m, 4 m … capped
at 30 m. Counter is incremented *before* the unwrap attempt and cleared only on
success, so force-quitting mid-attempt cannot reset it. Persisted in SecureStore.
The vault is never auto-erased.

## Flows

**Fresh install** → disclaimer (unchanged) → "Create a PIN" (6 dots) → "Confirm
your PIN" → mint MK, write pinwrap → *if* the device has usable biometrics,
"Enable Face ID / fingerprint?" (skippable) → app. `NoDeviceLockError` and
`BiometricsRequiredError` stop blocking enrolment; a PIN works on every device,
including Android pattern-only and web.

**Existing install** (your choice: forced) → unlock with biometrics exactly as
today → immediately walked through creating a PIN before reaching the app. The
existing auth-gated item is left untouched and simply becomes the biometric
shortcut, so this migration writes one new item and re-encrypts nothing.
Users whose key is *already* invalidated are unchanged — their credentials were
lost before this change and still need a reset; the difference is it can never
happen to them again.

**Legacy v1 password accounts** — `migrateLegacyAccount()` is unchanged; on
success it now routes into PIN setup rather than straight to the app.

**Unlock** → PIN pad is the screen. If biometrics are enabled and available the
prompt fires automatically over it (as today); cancel just drops you to the pad,
and the fingerprint key in the pad retries. If the biometric read comes back
empty/invalidated we show a quiet "Biometric unlock needs re-enabling — use your
PIN" note instead of an error, and repair it after the PIN succeeds.

**Re-lock** (your choice) — keep the 15-minute inactivity logout, add an
`AppState` listener that re-locks when the app returns to the foreground after
60 s or more in the background. Both just call the existing `signOut()`, which
the `(app)/_layout.tsx` redirect already turns into a bounce to `/sign-in`.

**Profile transfer QR** (your choice) — the numpad replaces the text-field PIN
entry, and the flow changes to: type your **login PIN to authorise** the export,
then the app generates a **random 6-digit transfer code** shown beside the QR
which the receiving device types in. Your login PIN never leaves the device, so
a photographed QR can't be brute-forced into it. `deriveTransferKey` and the
payload format are unchanged — only who picks the code changes.

## Files

**New**
- `src/security/pinVault.ts` — `hasPin`, `setPin`, `unlockWithPin`, `changePin`,
  `deletePin`, attempt counter + lockout, typed `WrongPinError`,
  `PinLockedOutError`, `PinNotSetError`.
- `src/security/biometricVault.ts` — `biometricCapability()` (hardware/enrolled/
  strong-enough, per platform), `isBiometricEnabled`, `enableBiometric(mk)`,
  `disableBiometric`, `tryUnlockWithBiometric()` returning
  `{ok, mk}` or `{ok:false, reason:'cancelled'|'unavailable'|'invalidated'}` —
  **never throws a fatal error**.
- `src/components/ui/PinPad.tsx` — presentational Cake-Wallet-style pad: dot row,
  3x4 grid of circular keys, bottom row `[biometric] [0] [backspace]`,
  shake-on-error, auto-submit on the 6th digit, optional haptics via a dynamic
  `require('expo-haptics')` that no-ops if absent (same lazy-require pattern
  `crypto.ts` uses for quick-crypto — **no new dependency**).
- `src/components/PinEntry.tsx` — stateful wrapper (enter/confirm sequencing,
  error + shake state, lockout countdown, busy state).

**Changed**
- `src/security/vaultKey.ts` — demote biometrics to optional; drop the hard
  `ensureDeviceLock()` gate from enrolment; stop treating a missing auth-gated
  key as fatal; correct the now-wrong iOS comments.
- `src/security/auth.ts` — `enrollVault(pin)`, `unlockVaultWithPin(pin)`,
  `unlockVaultWithBiometric()`; marker gains `pinSet` (derived from the pinwrap's
  existence, single source of truth).
- `src/security/freshInstall.ts` — wipe the three new keys.
- `src/security/index.ts` — export the new surface.
- `src/security/crypto.ts` — add `derivePinKey` + hardened Argon2 constants.
- `src/store/AppStore.tsx` — auth API becomes `unlockWithPin`, `unlockWithBiometrics`,
  `enroll(pin)`, `setPin`, `changePin`, `setBiometricEnabled`; new state
  `pinSet`, `needsPinSetup`, `biometricEnabled`, `biometricAvailable`,
  `lockedUntil`; AppState background re-lock.
- `src/app/sign-in.tsx` — rewritten as a state machine:
  `loading -> disclaimer -> createPin -> confirmPin -> offerBiometric -> unlock`,
  plus `migrateLegacy` and `setPinForExistingVault`. Keeps the existing
  stranded-credentials and reset-vault recovery paths.
- `src/app/(app)/settings.tsx` — new `SECURITY` section (matching the existing
  uppercase `sectionLabel` + `group`/`Card` pattern): Change PIN, Face ID /
  fingerprint toggle, Lock now.
- `src/app/(app)/profiles.tsx` — numpad + generated transfer code.
- `design_specs/requirements.md` — Requirement 9 updated to state PIN-first with
  optional biometrics.

## Order of work

1. `crypto.ts` + `pinVault.ts` + `biometricVault.ts` (pure logic, no UI).
2. `auth.ts` / `vaultKey.ts` / `freshInstall.ts` / `index.ts` rewiring.
3. `PinPad` + `PinEntry` components.
4. `sign-in.tsx` state machine.
5. `AppStore` API + background re-lock.
6. Settings security section.
7. Profiles transfer-code change.
8. `npx tsc --noEmit` + `npm run lint`, then a manual device pass.

## Risks / notes

- I cannot test biometric invalidation from here. The verification that matters
  is manual: enrol a new fingerprint, reopen the app, confirm it falls back to
  the PIN pad and self-repairs.
- Writing the auth-gated item on Android triggers a biometric prompt (the native
  encryptor authenticates the cipher for *writes* too), so enabling biometrics
  shows one prompt. Expected, not a bug.
- JS strings are immutable, so the typed PIN cannot be zeroed from memory; it is
  held only for the duration of the unwrap. MK continues to live in a ref and is
  zeroed on sign-out, unchanged.
- The app currently ships `expo-local-authentication`'s `faceIDPermission`, which
  writes the `NSFaceIDUsageDescription` that iOS `requireAuthentication` writes
  demand — no `app.json` change needed.
