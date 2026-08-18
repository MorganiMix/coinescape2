import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { DisclaimerGate } from '@/components/DisclaimerGate';
import { PinCreate, PinUnlock } from '@/components/PinEntry';
import { ThemedText } from '@/components/themed-text';
import { GradientButton } from '@/components/ui/GradientButton';
import { Logo } from '@/components/ui/Logo';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { Brand, Spacing } from '@/constants/theme';
import {
  acceptDisclaimer,
  hasAcceptedDisclaimer,
  BiometricsRequiredError,
  NoDeviceLockError,
  PinLockedOutError,
  VaultAuthError,
  VaultKeyMissingError,
  VaultUnrecoverableError,
  WeakPinError,
  WrongPasswordError,
  WrongPinError,
} from '@/security';
import { useAppStore } from '@/store/AppStore';

/**
 * Which flow the screen is presenting.
 *
 *  - `enroll`   — first run: choose a PIN and create the vault.
 *  - `unlock`   — returning user: PIN pad, with biometrics fired automatically
 *                 over the top when they're switched on.
 *  - `addPin`   — a vault from a pre-PIN build: unlock once the old way, then
 *                 choose a PIN so the vault stops depending on a key the OS can
 *                 destroy behind our back.
 *  - `migrate`  — a legacy v1 password account: password once, then a PIN.
 */
type Mode = 'enroll' | 'unlock' | 'addPin' | 'migrate';

export default function SignInScreen() {
  const router = useRouter();
  const {
    hasAccount,
    needsMigration,
    needsPinSetup,
    authChecked,
    biometricEnabled,
    biometricAvailable,
    biometricLabel,
    pinLockedUntil,
    unlockWithPin,
    unlockWithBiometrics,
    enroll,
    completePinSetup,
    setBiometricEnabled,
    migrate,
    abandonMigration,
    resetVault,
  } = useAppStore();

  const mode: Mode = needsMigration
    ? 'migrate'
    : hasAccount
      ? needsPinSetup
        ? 'addPin'
        : 'unlock'
      : 'enroll';

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * Set when the vault contains credentials that decrypt under no available
   * key — the residue of an upgrade interrupted by a pre-fix build. The only
   * way forward is to drop them, which needs explicit consent.
   */
  const [stranded, setStranded] = useState<VaultUnrecoverableError | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  /**
   * The user can't get in — a forgotten PIN, or a vault whose key the OS
   * destroyed before PINs existed. There is deliberately no recovery: the only
   * move is a reset, which the screen makes explicit and two-tap.
   */
  const [forgotPin, setForgotPin] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  /**
   * True once a biometric unlock in the `addPin` flow has handed us the key —
   * the PIN chooser can't be shown before that, because there'd be no key to
   * wrap.
   */
  const [readyForPin, setReadyForPin] = useState(false);
  /**
   * Why the biometric shortcut didn't work, when it's worth telling the user.
   *
   * `invalidated` means the OS destroyed the stored key (a biometric was added
   * or removed). During normal unlock that's a note, not an error — the PIN
   * works and the copy is rebuilt on the next success. During the one-time PIN
   * setup it's fatal, because the biometric key is the *only* way to reach a
   * pre-PIN vault. `cancelled` is never shown: the pad is already on screen.
   */
  const [bioFailure, setBioFailure] = useState<'invalidated' | 'unavailable' | null>(null);
  /** Post-enrolment offer to switch the biometric shortcut on. */
  const [offerBiometric, setOfferBiometric] = useState(false);
  /** Password + PIN are collected on separate steps of the migrate flow. */
  const [migratePinStep, setMigratePinStep] = useState(false);

  // First-run legal disclaimer. `null` = still loading the persisted flag so we
  // don't flash the gate for returning users. Only enrolment is gated.
  const [disclaimerAccepted, setDisclaimerAccepted] = useState<boolean | null>(null);

  const goToApp = useCallback(() => router.replace('/(app)/panic'), [router]);

  // Load the persisted disclaimer acceptance once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const accepted = await hasAcceptedDisclaimer();
      if (!cancelled) setDisclaimerAccepted(accepted);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAgreeDisclaimer = async () => {
    await acceptDisclaimer();
    setDisclaimerAccepted(true);
  };

  /** Guards against two biometric prompts being opened at once. */
  const bioInFlight = useRef(false);

  /**
   * Turn any thrown error into something worth showing a user.
   *
   * Note there is no longer a "your device has no lock" dead end: the PIN works
   * on every device, so the errors that used to block the whole app now only
   * ever mean "the biometric shortcut isn't available here".
   */
  const mapError = (e: unknown): string => {
    if (e instanceof NoDeviceLockError || e instanceof BiometricsRequiredError) {
      return e.message;
    }
    if (e instanceof WrongPinError) {
      return e.attemptsRemaining > 0
        ? `Incorrect PIN. ${e.attemptsRemaining} ${
            e.attemptsRemaining === 1 ? 'try' : 'tries'
          } left before a short wait.`
        : 'Incorrect PIN.';
    }
    if (
      e instanceof PinLockedOutError ||
      e instanceof WeakPinError ||
      // Checked BEFORE VaultAuthError: a missing key is not a failed prompt, and
      // telling the user to "try again" gives them an unwinnable loop.
      e instanceof VaultKeyMissingError ||
      e instanceof WrongPasswordError ||
      e instanceof VaultUnrecoverableError
    ) {
      return e.message;
    }
    if (e instanceof VaultAuthError) {
      return 'Authentication cancelled. Tap to try again.';
    }
    // Never surface a raw error message here — the crypto layer throws things
    // like "aes/gcm: invalid ghash tag", which is meaningless to a user.
    return 'Something went wrong. Please try again.';
  };

  // ─────────────────────────────── unlock ───────────────────────────────────

  const runPinUnlock = async (pin: string) => {
    setError(null);
    setBusy(true);
    try {
      await unlockWithPin(pin);
      goToApp();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Try the biometric shortcut.
   *
   * Every failure here is soft — the PIN pad is already on screen behind the
   * prompt, so a cancel needs no message at all. Only an invalidated key gets a
   * note, and even then it's reassurance rather than an error: the PIN works,
   * and the next successful unlock quietly rebuilds the biometric copy.
   */
  const runBiometricUnlock = useCallback(async () => {
    // expo-secure-store's Android AuthenticationHelper keeps a single
    // `isAuthenticating` flag and throws "Authentication is already in
    // progress" on a second overlapping call. React re-invoking the auto-prompt
    // effect (StrictMode double-mount, or a fast tap landing on top of it) is
    // enough to trigger that, so serialise every entry point through one guard.
    if (bioInFlight.current) return;
    bioInFlight.current = true;
    try {
      const result = await unlockWithBiometrics();
      if (result.ok) {
        if (needsPinSetup) setReadyForPin(true);
        else goToApp();
        return;
      }
      if (result.reason === 'invalidated' || result.reason === 'unavailable') {
        setBioFailure(result.reason);
      }
    } finally {
      bioInFlight.current = false;
    }
  }, [unlockWithBiometrics, needsPinSetup, goToApp]);

  // Fire the biometric prompt automatically on an existing-account device, so
  // the common path stays one glance. Deferred a tick so the prompt is not
  // opened from inside the render commit, and so a screen that unmounts
  // immediately never opens one at all.
  useEffect(() => {
    if (!authChecked) return;
    if (mode !== 'unlock' && mode !== 'addPin') return;
    if (!biometricEnabled || !biometricAvailable) return;
    if (pinLockedUntil > Date.now()) return;
    const t = setTimeout(() => void runBiometricUnlock(), 0);
    return () => clearTimeout(t);
  }, [
    authChecked,
    mode,
    biometricEnabled,
    biometricAvailable,
    pinLockedUntil,
    runBiometricUnlock,
  ]);

  // ─────────────────────────────── enrol ────────────────────────────────────

  const runEnroll = async (pin: string) => {
    setError(null);
    setBusy(true);
    try {
      await enroll(pin);
      // Offer the biometric shortcut only where it can actually be honoured.
      if (biometricAvailable) setOfferBiometric(true);
      else goToApp();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  const runAddPin = async (pin: string) => {
    setError(null);
    setBusy(true);
    try {
      await completePinSetup(pin);
      goToApp();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  const runEnableBiometric = async () => {
    setBusy(true);
    try {
      const res = await setBiometricEnabled(true);
      // A refused or failed prompt is not worth blocking on — the vault is
      // already usable, and the toggle lives in Settings.
      if (!res.ok) setError(null);
      goToApp();
    } finally {
      setBusy(false);
    }
  };

  // ────────────────────────────── recovery ──────────────────────────────────

  /** Second tap only: wipe the unusable vault and go back to first-run setup. */
  const runReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setBusy(true);
    try {
      await resetVault();
      // `hasAccount` flips to false, so `mode` becomes 'enroll' on re-render.
      setForgotPin(false);
      setBioFailure(null);
      setConfirmReset(false);
      setError(null);
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  const runMigrate = async (pin: string) => {
    setError(null);
    setStranded(null);
    setConfirmDiscard(false);
    setBusy(true);
    try {
      await migrate(password, pin);
      setPassword('');
      goToApp();
    } catch (e) {
      if (e instanceof VaultUnrecoverableError) {
        setStranded(e);
        setMigratePinStep(false);
      }
      if (e instanceof WrongPasswordError) setMigratePinStep(false);
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  /** Second tap only: finish the upgrade, permanently dropping what's lost. */
  const runDiscardAndContinue = async (pin: string) => {
    setError(null);
    setBusy(true);
    try {
      await abandonMigration(password, pin);
      setPassword('');
      goToApp();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  const canMigrate = useMemo(() => !busy && password.length > 0, [busy, password]);

  // While the AppStore detects a fresh install and reads the keychain — and
  // while we load the persisted disclaimer flag — render a quiet loader so the
  // UI doesn't flash between modes on first launch. Kept below the hooks so
  // rules-of-hooks ordering is preserved.
  if (!authChecked || disclaimerAccepted === null) {
    return (
      <Screen>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Brand.accent} />
        </View>
      </Screen>
    );
  }

  // First sign-up: the user MUST accept the risk disclaimer before creating a
  // vault. Returning users and legacy migrations are not re-gated.
  if (mode === 'enroll' && !disclaimerAccepted) {
    return <DisclaimerGate onAgree={handleAgreeDisclaimer} />;
  }

  // ───────────────────────────── PIN screens ────────────────────────────────

  if (mode === 'unlock' && !forgotPin && !offerBiometric) {
    const bioUsable = biometricEnabled && biometricAvailable && bioFailure === null;
    return (
      <PinScreen>
        <PinUnlock
          title="Unlock Coin Escape"
          subtitle={
            bioFailure === 'invalidated'
              ? undefined
              : bioUsable
                ? `Use ${biometricLabel}, or enter your PIN.`
                : 'Enter your PIN to continue.'
          }
          busy={busy}
          error={error}
          lockedUntil={pinLockedUntil}
          onSubmit={runPinUnlock}
          onEditError={() => setError(null)}
          onBiometric={bioUsable ? () => void runBiometricUnlock() : undefined}
          biometricLabel={biometricLabel}
          footer={
            <View style={styles.unlockFooter}>
              {bioFailure === 'invalidated' && (
                <View style={styles.noticeBox}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.noticeText}>
                    {biometricLabel} needs setting up again — your device
                    invalidated it when the enrolled biometrics changed. Enter
                    your PIN and we{'’'}ll restore it automatically. Nothing has
                    been lost.
                  </ThemedText>
                </View>
              )}
              <Pressable onPress={() => setForgotPin(true)} hitSlop={8}>
                <ThemedText type="small" themeColor="textSecondary">
                  Forgot your PIN?
                </ThemedText>
              </Pressable>
            </View>
          }
        />
      </PinScreen>
    );
  }

  if (mode === 'enroll' && !offerBiometric) {
    return (
      <PinScreen>
        <PinCreate
          title="Choose a PIN"
          subtitle="Six digits. This unlocks your vault on this device — there is no way to recover it, so pick something you won’t forget."
          busy={busy}
          error={error}
          onComplete={runEnroll}
          onEditError={() => setError(null)}
        />
      </PinScreen>
    );
  }

  if (mode === 'addPin') {
    // The key only exists in memory after a successful biometric unlock, so the
    // PIN chooser waits for that. Until then this is the old unlock screen.
    if (!readyForPin) {
      return (
        <PinScreen>
          <View style={styles.addPinIntro}>
            <Logo size={56} />
            <ThemedText type="subtitle" style={styles.title}>
              One-time security upgrade
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Coin Escape now unlocks with a 6-digit PIN, so adding a new
              fingerprint or face can never lock you out of your vault again.
              Confirm with {biometricLabel} once more to set yours up.
            </ThemedText>
            {bioFailure && (
              <View style={styles.warnBox}>
                <ThemedText type="small" style={styles.warnText}>
                  {bioFailure === 'invalidated'
                    ? `This device’s ${biometricLabel} key was already invalidated — most likely a fingerprint or face was added or removed — so the saved vault can no longer be opened.`
                    : `${biometricLabel} is no longer set up on this device, and this vault was created before PINs existed, so there is no other way in.`}{' '}
                  This is exactly what the PIN prevents from here on. You{'’'}ll
                  need to reset and re-add your exchanges.
                </ThemedText>
              </View>
            )}
            {bioFailure ? (
              <GradientButton
                label={confirmReset ? 'Tap again to erase and start over' : 'Reset vault'}
                variant="danger"
                disabled={busy}
                loading={busy}
                onPress={runReset}
              />
            ) : (
              <GradientButton
                label={`Continue with ${biometricLabel}`}
                variant="accent"
                disabled={busy}
                loading={busy}
                onPress={() => void runBiometricUnlock()}
              />
            )}
          </View>
        </PinScreen>
      );
    }
    return (
      <PinScreen>
        <PinCreate
          title="Choose a PIN"
          subtitle="Six digits. Your saved exchanges stay exactly as they are — this just gives them a second, sturdier lock."
          busy={busy}
          error={error}
          onComplete={runAddPin}
          onEditError={() => setError(null)}
        />
      </PinScreen>
    );
  }

  if (mode === 'migrate' && migratePinStep) {
    return (
      <PinScreen>
        <PinCreate
          title="Choose a PIN"
          subtitle="Six digits. This replaces your password for good."
          busy={busy}
          error={error}
          onComplete={stranded ? runDiscardAndContinue : runMigrate}
          onEditError={() => setError(null)}
          footer={
            <Pressable onPress={() => setMigratePinStep(false)} disabled={busy}>
              <ThemedText type="small" themeColor="textSecondary">
                ‹ Back
              </ThemedText>
            </Pressable>
          }
        />
      </PinScreen>
    );
  }

  // ──────────────────────── prose + button screens ──────────────────────────

  // Every other state is handled by a `return` above, so this screen is one of:
  // the biometric offer after enrolling, the legacy password step, or the
  // forgotten-PIN reset.
  const title = offerBiometric
    ? `Enable ${biometricLabel}?`
    : mode === 'migrate'
      ? 'Upgrade to a PIN'
      : 'Forgotten PIN';

  const subtitle = offerBiometric
    ? `Skip the PIN most of the time by unlocking with ${biometricLabel}. Your PIN always keeps working — including when your device forgets ${biometricLabel}.`
    : mode === 'migrate'
      ? 'Enter your existing password once. We’ll re-secure your vault with a 6-digit PIN.'
      : 'There is no way to recover a forgotten PIN — the vault is encrypted with it, and nothing outside this device holds a copy.';

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.logoWrap}>
            <Logo size={64} />
          </View>

          <ThemedText type="subtitle" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            {subtitle}
          </ThemedText>

          <View style={styles.form}>
            {mode === 'migrate' && (
              <TextField
                label="Current password"
                placeholder="Enter your existing password"
                secureToggle
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setError(null);
                  setStranded(null);
                  setConfirmDiscard(false);
                }}
              />
            )}

            {error && (
              <View style={styles.errorBox}>
                <ThemedText type="small" style={styles.errorText}>
                  {error}
                </ThemedText>
              </View>
            )}

            {offerBiometric && (
              <>
                <GradientButton
                  label={`Enable ${biometricLabel}`}
                  variant="accent"
                  disabled={busy}
                  loading={busy}
                  onPress={runEnableBiometric}
                />
                <GradientButton
                  label="Not now"
                  variant="ghost"
                  disabled={busy}
                  onPress={goToApp}
                />
              </>
            )}

            {mode === 'unlock' && forgotPin && (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.strandedText}>
                  Resetting erases the saved vault — every stored exchange API
                  key goes with it — and returns the app to first-run setup. Your
                  funds are untouched; they live on the exchanges, not here. You
                  will need to create new API keys and add them again.
                </ThemedText>
                <GradientButton
                  label={confirmReset ? 'Tap again to erase everything' : 'Reset vault'}
                  variant="danger"
                  disabled={busy}
                  loading={busy}
                  onPress={runReset}
                />
                <GradientButton
                  label="Back to PIN entry"
                  variant="ghost"
                  disabled={busy}
                  onPress={() => {
                    setForgotPin(false);
                    setConfirmReset(false);
                  }}
                />
              </>
            )}

            {mode === 'migrate' && !stranded && (
              <GradientButton
                label="Continue"
                variant="accent"
                disabled={!canMigrate}
                loading={busy}
                onPress={() => {
                  setError(null);
                  setMigratePinStep(true);
                }}
              />
            )}

            {mode === 'migrate' && stranded && (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.strandedText}>
                  {stranded.recoveredCount > 0
                    ? `${stranded.recoveredCount} connection(s) can be restored. The remaining ${stranded.lostExchangeIds.length} cannot be decrypted and must be re-added from scratch.`
                    : 'If your password is correct, an interrupted upgrade has made these credentials permanently unreadable. You can continue with an empty vault and re-add your exchanges.'}
                </ThemedText>
                <GradientButton
                  label={
                    confirmDiscard
                      ? 'Tap again to permanently discard'
                      : 'Continue without them'
                  }
                  variant="danger"
                  disabled={busy || password.length === 0}
                  loading={busy}
                  onPress={() => {
                    if (!confirmDiscard) {
                      setConfirmDiscard(true);
                      return;
                    }
                    setError(null);
                    setMigratePinStep(true);
                  }}
                />
              </>
            )}
          </View>

          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.footerText}>
              Your vault is encrypted on this device. There is no account
              recovery — if you forget your PIN, the saved data cannot be
              restored.
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** Full-height, vertically-centred frame for the numpad flows. */
function PinScreen({ children }: { children: React.ReactNode }) {
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.pinContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  pinContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
  },
  addPinIntro: { alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.two },
  logoWrap: { alignItems: 'center', marginBottom: Spacing.four },
  title: { textAlign: 'center', fontSize: 26, lineHeight: 32 },
  subtitle: { textAlign: 'center', marginBottom: Spacing.four },
  form: { gap: Spacing.three },
  warnBox: {
    backgroundColor: Brand.dangerSoft,
    borderRadius: 8,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  warnText: { color: Brand.danger },
  noticeBox: {
    backgroundColor: Brand.inputBg,
    borderRadius: 8,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginHorizontal: Spacing.three,
  },
  noticeText: { textAlign: 'center', lineHeight: 18 },
  unlockFooter: { alignItems: 'center', gap: Spacing.three },
  errorBox: {
    backgroundColor: Brand.dangerSoft,
    borderRadius: 8,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  errorText: { color: Brand.danger },
  strandedText: { lineHeight: 18 },
  footer: { marginTop: Spacing.four },
  footerText: { textAlign: 'center', lineHeight: 18 },
});
