# Coin Escape 🪙🚀

An emergency "panic withdrawal" app for crypto exchanges. Connect your exchange
API keys, pre-configure per-coin escape destinations, and drain your funds to
self-custody in one action when an exchange looks compromised.

Built with [Expo](https://expo.dev) (SDK 56) + Expo Router + React Native.
Credentials are encrypted on-device (AES-256-GCM) and the session key lives only
in memory — see `src/security/`.

> ⚠️ This app can move real funds. Withdrawals are irreversible. Test in
> **Dry Run** mode before enabling **Real Withdrawal**.

---

## Prerequisites

- **Node.js** 20+ and npm
- **EAS CLI** for cloud builds: `npm install -g eas-cli` (then `eas login`)
- For local native builds: **Xcode** (iOS) and/or **Android Studio + JDK 17** (Android)

## Install

```bash
npm install
```

## Run in development

```bash
npx expo start          # or: npm start
```

Then open the app in:

- a [development build](https://docs.expo.dev/develop/development-builds/introduction/) (recommended — this project uses `expo-dev-client` and native modules like `expo-secure-store`)
- an [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/) — `npm run android`
- an [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/) — `npm run ios`
- the web target — `npm run web`

> Expo Go is **not** suitable here: the secure-store / dev-client native modules
> require a development build.

---

## Building the app

Coin Escape builds with [EAS Build](https://docs.expo.dev/build/introduction/).
Build profiles are defined in [`eas.json`](./eas.json).

One-time setup:

```bash
npm install -g eas-cli
eas login
```

### Android

```bash
# Installable APK for sideloading / internal testing
eas build --platform android --profile preview

# Release AAB for the Play Store
eas build --platform android --profile production
```

The `preview` profile emits an `.apk` (`buildType: apk`); `production` emits the
default `.aab` bundle for store submission.

### iOS

```bash
# Internal distribution build (TestFlight / ad-hoc)
eas build --platform ios --profile preview4

# App Store production build
eas build --platform ios --profile production
```

iOS builds require an Apple Developer account; EAS will prompt to manage signing
credentials on first run. Bundle identifier: `com.morganimix.coinescape`.

### Both platforms at once

```bash
eas build --platform all --profile production
```

### Local (no EAS cloud) builds

If you prefer to compile natively on your own machine:

```bash
npx expo prebuild                 # generate the native android/ + ios/ projects
npx expo run:android              # build & install a local Android dev build
npx expo run:ios                  # build & install a local iOS dev build
```

### Submitting to the stores

```bash
eas submit --platform android --profile production
eas submit --platform ios --profile production
```

---

## App icons & branding

The app icon is generated from a single vector master,
[`assets/images/coin-escape-icon.svg`](./assets/images/coin-escape-icon.svg)
(a platinum coin breaking out of a charcoal exchange bracket with a crimson
escape arrow). To regenerate all icon PNGs after editing the SVG:

```bash
npm run generate-icons
```

This rasterizes `icon.png`, the Android adaptive layers, the splash icon, and
the favicon (uses `sharp`; falls back to `rsvg-convert` / ImageMagick / Inkscape
if present). Icon and splash colors are configured in [`app.json`](./app.json).

---

## Project layout

| Path | Purpose |
|------|---------|
| `src/app/` | Screens (Expo Router file-based routing) — `sign-in`, `(app)/panic`, `(app)/settings`, `(app)/guide` |
| `src/store/AppStore.tsx` | App-wide state: auth, exchange connections, balances, withdrawal execution |
| `src/exchange/` | `ExchangeManager` + per-exchange adapters (Binance, Bybit, Coinbase, Deribit, Kraken, KuCoin, OKX) |
| `src/security/` | On-device credential vault, crypto, local auth, TOTP |
| `src/domain/` | Types, withdrawal engine, pricing (CoinGecko) |
| `src/components/` | UI components and design-system primitives |
| `src/constants/theme.ts` | Brand palette, gradients, spacing tokens |

## Quality checks

```bash
npm run lint            # ESLint (expo config)
npx tsc --noEmit        # TypeScript type check
```

## Learn more

- [Expo SDK 56 docs](https://docs.expo.dev/versions/v56.0.0/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
