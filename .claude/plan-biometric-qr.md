# Radical sign-in redesign: biometric/passcode + QR profile transfer

## Locked decisions
- Master key: random 256-bit key stored in secure-store, gated by
  `requireAuthentication: true` (biometrics → OS passcode auto-fallback).
- Require a device lock; refuse to run with no lock enrolled.
- Ditch JSON copy-paste. Transfer profiles via QR code (display + scan).
- Single QR per profile, payload compressed, hard cap with a clear error if
  too large.
- QR payload encrypted under a one-time transfer PIN (Argon2id-derived key).
- Existing users: one-time password unlock → migrate to biometric-gated key.

## Part A — Passwordless auth (biometric + passcode)

### New deps
- `expo-local-authentication` — to (a) detect whether ANY device lock/biometric
  is enrolled (enforce "refuse to run without a lock"), and (b) optional
  explicit auth prompt. secure-store's `requireAuthentication` handles the
  actual key-unlock gate + passcode fallback.

### Key model (src/security)
- New `vaultKey.ts` (or fold into auth.ts):
  - `ensureDeviceLock()`: uses LocalAuthentication.hasHardwareAsync /
    isEnrolledAsync + SecureStore.canUseBiometricAuthentication(). Throws a
    typed "NO_DEVICE_LOCK" error if nothing enrolled.
  - `getOrCreateMasterKey()`: on first run generate `randomBytes(32)`, store at
    `coinescape.masterkey.v1` with `{ requireAuthentication:true,
    authenticationPrompt: 'Unlock Coin Escape',
    keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY }`. On later runs read it
    back (this triggers Face ID / Touch ID / passcode). Return Uint8Array.
  - Note: secure-store getItem with requireAuthentication BLOCKS the JS thread;
    call from an async action with a loading state.
- Keep crypto.ts encrypt/decrypt (AES-256-GCM) unchanged — credentials are now
  encrypted under this random master key instead of a PBKDF2/password key.

### auth.ts / account model
- Replace username+password account with a lightweight marker:
  `coinescape.account.v2 = { createdAt, migrated? }` — no verifier, no pwSalt.
- `hasAccount()` = marker exists. `register` → `enrollBiometricVault()`:
  ensureDeviceLock() → getOrCreateMasterKey() → write marker.
- `login` → `unlockVault()`: ensureDeviceLock() → getOrCreateMasterKey()
  (biometric prompt happens here) → returns key.
- Delete password paths (validatePassword, verifier, iterations, Argon2id
  verifier). KEEP Argon2id in crypto for the QR transfer PIN (Part B).

### Migration (v1 password account → v2 biometric)
- On startup, if v1 account exists but no v2 marker:
  - Show a one-time "Migrate: enter your password" screen.
  - Derive old key (existing deriveKey), decrypt-nothing-needed: instead
    RE-WRAP — read every credential record (live + all profile snapshots),
    decrypt with old key, re-encrypt with new random master key, write back.
    (Same re-encryption walk we scoped for the Argon2 master-key case — here it
    IS necessary.) Then write v2 marker, delete v1 account.
  - Must cover: live creds via index + every
    `coinescape.profile.<id>.snapshot.v1`.

### AppStore.tsx
- `login(name,password)` / `register(name,password)` → `unlock()` / `enroll()`
  (no args). sign-in screen loses username/password fields.
- `verifyPassword` (used to gate export) → replace with a fresh biometric
  prompt (`LocalAuthentication.authenticateAsync`) before showing a QR.
- signOut unchanged (still zeroes the in-memory key).

### sign-in.tsx
- Replace form with: logo + "Unlock with Face ID / passcode" button (or
  auto-prompt on mount). Error states: no-lock-enrolled (blocking), auth
  failed/cancelled (retry). Migration variant asks for password once.

## Part B — QR profile transfer (replaces JSON copy-paste)

### New deps
- `react-native-svg` + `react-native-qrcode-svg` (render QR).
- `expo-camera` (scan QR — SDK 56 CameraView has barcodeScannerSettings for
  qr). Add camera permission + Info.plist usage string via config.

### Crypto for transfer (profileExport.ts rework)
- Keep AES-256-GCM. Replace username+password key derivation with:
  key = Argon2id(PIN, random salt) — reuse deriveVerifierArgon2id-style path
  (or a dedicated deriveTransferKey). PIN is a one-time code the sender sets.
- Payload: `{ format, v:2, name, kdf:{salt}, check, data }` (drop `iterations`,
  add nothing password-y). Compress JSON (payload can be large) before
  encrypt — use a small pure-JS deflate (need a dep, e.g. pako) OR base64 of
  raw and rely on QR byte mode; DECISION: evaluate size first, add compression
  only if needed. Cap encoded length; if a single QR can't hold it, error:
  "Too many exchanges to transfer at once."
- buildExport(name, payload, pin) / parseImport(qrString, pin).

### UI
- Export: settings → "Transfer profile out" → set 4-6 digit PIN → render QR
  (react-native-qrcode-svg) + show PIN. Behind a biometric re-auth.
- Import: settings → "Receive profile" → CameraView scanner → on scan, prompt
  for PIN → parseImport → existing slot/overwrite logic (unchanged downstream).

### Removed
- Clipboard copy/paste of JSON, the big TextField(s) for import text.

## Files (confirmed)
- deps (you run `npx expo install`): expo-local-authentication, react-native-svg,
  react-native-qrcode-svg, expo-camera (+ camera permission strings + plugins in
  app.json).
- src/security: new vaultKey.ts; auth.ts rewrite; profileExport.ts rework (v2,
  PIN); crypto.ts (add deriveTransferKey; keep Argon2id + AES).
- src/store/AppStore.tsx: unlock()/enroll() replace login()/register();
  QR export/import actions; verifyPassword→biometric re-auth; migration flow.
- src/app/sign-in.tsx: biometric/passcode UI + one-time migration variant.
- src/app/(app)/profiles.tsx (~506 lines): the ONLY export/import UI. Replace the
  two JSON modals (export TextField+password at ~L320-350; import
  TextField+password at ~L196-240) with: Export → set PIN → <QRCode> + PIN
  display; Import → CameraView scanner → PIN prompt. Remove exportText/importText/
  exportPassword/importPassword state + Clipboard.

## Verify
1. Fresh install, device WITH lock → enroll, relaunch prompts Face ID, unlocks.
2. Device with NO lock → blocked with clear message.
3. Legacy v1 account → migrate once with password, creds re-wrapped & intact,
   never asks again.
4. Export profile → QR + PIN; import on second device via camera + PIN →
   credentials transfer and decrypt.
5. Cancel biometric prompt → stays locked, retry works.
6. Requires dev-client rebuild (native camera + local-auth + secure-store auth).
