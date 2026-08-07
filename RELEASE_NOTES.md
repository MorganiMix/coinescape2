# Coin Escape — v1.3.0 Release Notes

_Release date: 2026-08-06_

This release is a security-first overhaul: sign-in is now passwordless and gated
by your device biometrics, profile transfer moves to encrypted QR codes, password
hashing is upgraded to Argon2id, and a first-run risk disclaimer is now required.

---

## ✨ Highlights

### Passwordless biometric sign-in
- Signing in no longer uses a username and password. Coin Escape now unlocks with
  **Face ID / Touch ID**, automatically falling back to your **device passcode**.
- Your vault is protected by a random master key stored in the device's
  biometric-gated keychain — there is no password to remember, phish, or leak.
- On returning devices the unlock prompt appears **automatically** on launch.
- **Coin Escape refuses to run on a device with no lock set up.** If you have no
  passcode, Face ID, or Touch ID, you'll be prompted to add one before continuing.

### One-time migration for existing users
- If you already had a password account, you'll be asked for your existing password
  **once**. Coin Escape re-secures your entire vault (every profile and API key)
  under the new biometric key, then the password is retired.
- Migration is atomic — a wrong password fails safely and never leaves your vault
  in a half-migrated state.

### Encrypted QR profile transfer
- Profile export/import no longer uses copy-pasted JSON. Transfer a profile between
  phones by displaying an **encrypted QR code** and scanning it on the other device.
- You set a **one-time transfer PIN** to encrypt the QR; the receiving phone enters
  the same PIN to import. Share the PIN separately from the code.
- Exporting requires a fresh biometric confirmation before the code is generated.
- Imports land in a free profile slot, or prompt you to choose which profile to
  overwrite when all slots are full.

### First-run risk disclaimer
- On first sign-up you must review and **accept a risk disclaimer** before a vault
  is created. It covers lost/unrecoverable funds, exchange freezes and downtime,
  incorrect liquidation orders, API/network failures, and force majeure.
- Declining exits the app on Android; on iOS the app remains on the notice until
  you accept (per App Store policy).

---

## 🔒 Security & cryptography

- **Argon2id password hashing** (RFC 9106) replaces PBKDF2 for the legacy-account
  migration path, following current OWASP guidance.
- **PBKDF2 iterations raised to 600,000** (from 100,000) where PBKDF2 is still used.
- **Native crypto acceleration** via `react-native-quick-crypto` — key derivation
  runs in native code with a pure-JS fallback, producing byte-identical results.
- All credentials remain encrypted with **AES-256-GCM**, stored only on-device.
- Master key material lives in memory only for the session and is zeroed on
  sign-out / auto-lock — it is never logged, serialized, or persisted in app state.

---

## 🛠 Improvements & fixes

- **Panic screen:** unlinked exchanges now read "Tap here to link" for a clearer call to action.
- Faster sign-in: native key derivation removes the previous multi-second unlock delay.
- Internal import cleanup in Settings.

---

## 📋 Notes for this build

New native modules are included in this release; a fresh dev/production build is
required:

- `expo-local-authentication` — biometric / passcode unlock
- `expo-camera` — QR scanning
- `react-native-qrcode-svg` + `react-native-svg` — QR rendering
- `react-native-quick-crypto` + `expo-build-properties` — native crypto (iOS
  deployment target 16.4+)

### Upgrading from a previous version
- Existing password accounts trigger the **one-time migration** described above.
- A device lock (passcode/biometrics) is now **mandatory** to use the app.
- There is **no account recovery** — losing device access means losing the vault.
  Export important profiles via QR to another device to keep a backup.
