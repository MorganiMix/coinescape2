import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { DisclaimerGate } from '@/components/DisclaimerGate';
import { ThemedText } from '@/components/themed-text';
import { GradientButton } from '@/components/ui/GradientButton';
import { Logo } from '@/components/ui/Logo';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { Brand, Spacing } from '@/constants/theme';
import { acceptDisclaimer, hasAcceptedDisclaimer, NoDeviceLockError, VaultAuthError } from '@/security';
import { useAppStore } from '@/store/AppStore';

type Mode = 'unlock' | 'enroll' | 'migrate';

export default function SignInScreen() {
  const router = useRouter();
  const { hasAccount, needsMigration, authChecked, unlock, enroll, migrate } = useAppStore();

  // Decide which flow to present:
  //  - needsMigration → a legacy password account exists; migrate it once.
  //  - no account     → first run; enrol the biometric vault.
  //  - account exists → unlock with device authentication.
  const mode: Mode = needsMigration ? 'migrate' : hasAccount ? 'unlock' : 'enroll';

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [noLock, setNoLock] = useState(false);
  const [busy, setBusy] = useState(false);

  // First-run legal disclaimer. `null` = still loading the persisted flag so we
  // don't flash the gate for returning users. Only enrolment is gated.
  const [disclaimerAccepted, setDisclaimerAccepted] = useState<boolean | null>(null);

  const goToApp = () => router.replace('/(app)/panic');

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

  // On an existing-account device, trigger the biometric prompt automatically
  // as soon as the screen is ready — no button tap needed for the common path.
  useEffect(() => {
    if (!authChecked || mode !== 'unlock' || busy) return;
    void runUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, mode]);

  const mapError = (e: unknown): { message: string; noLock: boolean } => {
    if (e instanceof NoDeviceLockError) {
      return { message: e.message, noLock: true };
    }
    if (e instanceof VaultAuthError) {
      return { message: 'Authentication cancelled. Tap to try again.', noLock: false };
    }
    return {
      message: e instanceof Error ? e.message : 'Authentication failed',
      noLock: false,
    };
  };

  const runUnlock = async () => {
    setError(null);
    setNoLock(false);
    setBusy(true);
    try {
      await unlock();
      goToApp();
    } catch (e) {
      const m = mapError(e);
      setError(m.message);
      setNoLock(m.noLock);
    } finally {
      setBusy(false);
    }
  };

  const runEnroll = async () => {
    setError(null);
    setNoLock(false);
    setBusy(true);
    try {
      await enroll();
      goToApp();
    } catch (e) {
      const m = mapError(e);
      setError(m.message);
      setNoLock(m.noLock);
    } finally {
      setBusy(false);
    }
  };

  const runMigrate = async () => {
    setError(null);
    setNoLock(false);
    setBusy(true);
    try {
      await migrate(password);
      setPassword('');
      goToApp();
    } catch (e) {
      const m = mapError(e);
      setError(m.message);
      setNoLock(m.noLock);
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

  // First sign-up: the user MUST accept the risk disclaimer before enrolling a
  // vault. Returning users (unlock) and legacy migrations are not re-gated.
  if (mode === 'enroll' && !disclaimerAccepted) {
    return <DisclaimerGate onAgree={handleAgreeDisclaimer} />;
  }

  const title =
    mode === 'migrate'
      ? 'Upgrade to Biometric Sign-In'
      : mode === 'enroll'
        ? 'Set Up Coin Escape'
        : 'Unlock Coin Escape';

  const subtitle =
    mode === 'migrate'
      ? 'Enter your existing password once. We’ll re-secure your vault with Face ID / Touch ID and your device passcode.'
      : mode === 'enroll'
        ? 'Coin Escape is protected by your device biometrics and passcode. No passwords to remember.'
        : 'Confirm with Face ID, Touch ID, or your device passcode to continue.';

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
                }}
              />
            )}

            {noLock && (
              <View style={styles.warnBox}>
                <ThemedText type="small" style={styles.warnText}>
                  Coin Escape needs a device lock. Set up a passcode, Face ID, or
                  Touch ID in your phone{'’'}s settings, then reopen the app.
                </ThemedText>
              </View>
            )}

            {error && !noLock && (
              <View style={styles.errorBox}>
                <ThemedText type="small" style={styles.errorText}>
                  {error}
                </ThemedText>
              </View>
            )}

            {mode === 'unlock' && (
              <GradientButton
                label={busy ? 'Authenticating…' : 'Unlock with Device'}
                variant="accent"
                disabled={busy}
                loading={busy}
                onPress={runUnlock}
              />
            )}

            {mode === 'enroll' && (
              <GradientButton
                label="Enable & Continue"
                variant="accent"
                disabled={busy}
                loading={busy}
                onPress={runEnroll}
              />
            )}

            {mode === 'migrate' && (
              <GradientButton
                label="Upgrade & Continue"
                variant="accent"
                disabled={!canMigrate}
                loading={busy}
                onPress={runMigrate}
              />
            )}
          </View>

          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.footerText}>
              Your vault is encrypted on this device and gated by your biometrics.
              There is no account recovery — losing device access means losing the
              vault.
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  errorBox: {
    backgroundColor: Brand.dangerSoft,
    borderRadius: 8,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  errorText: { color: Brand.danger },
  footer: { marginTop: Spacing.four },
  footerText: { textAlign: 'center', lineHeight: 18 },
});
