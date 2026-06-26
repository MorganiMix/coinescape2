import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GradientButton } from '@/components/ui/GradientButton';
import { Logo } from '@/components/ui/Logo';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { Brand, Spacing } from '@/constants/theme';
import { PASSWORD_RULES } from '@/security';
import { useAppStore } from '@/store/AppStore';

export default function SignInScreen() {
  const router = useRouter();
  const { hasAccount, authChecked, login, register } = useAppStore();

  // First launch (no local account) → create-account mode; otherwise login.
  const isCreating = !hasAccount;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (username.trim().length < 3 || password.length === 0) return false;
    if (isCreating && confirm.length === 0) return false;
    return true;
  }, [busy, username, password, confirm, isCreating]);

  // While the AppStore is detecting a fresh install (iOS) and reading the
  // keychain, render a quiet loader so the UI doesn't flash between
  // "create-account" and "login" on first launch. Kept below the hooks so
  // the rules-of-hooks ordering is preserved across renders.
  if (!authChecked) {
    return (
      <Screen>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Brand.accent} />
        </View>
      </Screen>
    );
  }

  const handleSubmit = async () => {
    setError(null);

    if (isCreating && password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setBusy(true);
    try {
      if (isCreating) {
        await register(username, password);
      } else {
        await login(username, password);
      }
      router.replace('/(app)/panic');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

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
            {isCreating ? 'Create Your Vault' : 'Sign In to Coin Escape'}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            {isCreating
              ? 'Set a username and password. Credentials are stored only on this device.'
              : 'Secure access to your emergency withdrawal vault'}
          </ThemedText>

          <View style={styles.form}>
            <TextField
              label="Username"
              placeholder="Choose a username"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              value={username}
              onChangeText={(t) => {
                setUsername(t);
                setError(null);
              }}
            />
            <TextField
              label="Password"
              placeholder={isCreating ? 'Create a password' : 'Enter your password'}
              secureToggle
              autoCapitalize="none"
              autoComplete={isCreating ? 'new-password' : 'current-password'}
              textContentType={isCreating ? 'newPassword' : 'password'}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
            />
            {isCreating && (
              <TextField
                label="Confirm password"
                placeholder="Re-enter your password"
                secureToggle
                autoCapitalize="none"
                value={confirm}
                onChangeText={(t) => {
                  setConfirm(t);
                  setError(null);
                }}
              />
            )}

            {isCreating && (
              <ThemedText type="small" style={styles.hint}>
                At least {PASSWORD_RULES.minLength} characters, with letters and numbers.
              </ThemedText>
            )}

            {error && (
              <View style={styles.errorBox}>
                <ThemedText type="small" style={styles.errorText}>
                  {error}
                </ThemedText>
              </View>
            )}

            <GradientButton
              label={isCreating ? 'Create Vault & Continue' : 'Sign In'}
              variant="accent"
              disabled={!canSubmit}
              loading={busy}
              onPress={handleSubmit}
            />
          </View>

          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.footerText}>
              Your username and password never leave this device. There is no
              account recovery — keep them safe.
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
  hint: { marginLeft: 2, marginTop: -Spacing.one, color: Brand.textMuted },
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
