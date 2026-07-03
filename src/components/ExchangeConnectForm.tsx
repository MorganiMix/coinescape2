/**
 * Reusable "connect this exchange" form: the credential fields (capability-
 * aware — passphrase for OKX/KuCoin, 2FA for TOTP exchanges), validation, and
 * the live connect call.
 *
 * Extracted so both the Settings screen and the per-exchange guide screen can
 * offer the exact same connect flow without duplicating validation logic.
 */
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GradientButton } from '@/components/ui/GradientButton';
import { TextField } from '@/components/ui/TextField';
import { Brand, Spacing } from '@/constants/theme';
import { ExchangeId } from '@/domain/types';
import { REQUIRES_PASSPHRASE, REQUIRES_TOTP, isLiveSupported } from '@/exchange';
import { useAppStore } from '@/store/AppStore';

interface CredDraft {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  totpSecret: string;
}
const EMPTY_DRAFT: CredDraft = { apiKey: '', apiSecret: '', passphrase: '', totpSecret: '' };

export function ExchangeConnectForm({
  id,
  name,
  onConnected,
}: {
  id: ExchangeId;
  name: string;
  /** Called after a successful connect (e.g. to navigate or warm caches). */
  onConnected?: (id: ExchangeId, canWithdraw?: boolean) => void;
}) {
  const { connectExchange } = useAppStore();
  const [draft, setDraft] = useState<CredDraft>(EMPTY_DRAFT);
  const [connecting, setConnecting] = useState(false);

  const patch = (p: Partial<CredDraft>) => setDraft((d) => ({ ...d, ...p }));

  if (!isLiveSupported(id)) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {id === 'other'
          ? 'Live connection for other exchanges is coming soon.'
          : `Live connection for ${name} is coming soon.`}
      </ThemedText>
    );
  }

  const handleConnect = async () => {
    const apiKey = draft.apiKey.trim();
    const apiSecret = draft.apiSecret.trim();
    const passphrase = draft.passphrase.trim();
    const totpSecret = draft.totpSecret.replace(/\s/g, '');

    if (apiKey.length < 6 || apiSecret.length < 6) {
      Alert.alert(
        'Missing credentials',
        'Enter both the API key and secret (with WITHDRAW permission enabled).'
      );
      return;
    }
    if (REQUIRES_PASSPHRASE.has(id) && passphrase.length === 0) {
      Alert.alert('Passphrase required', `${name} requires the API passphrase you set when creating the key.`);
      return;
    }
    if (REQUIRES_TOTP.has(id) && totpSecret.length === 0) {
      Alert.alert(
        '2FA secret required',
        `${name} requires a 2FA code on every API withdrawal. Enter the base32 seed shown when you set up your authenticator so panic withdrawals can complete automatically.`
      );
      return;
    }

    setConnecting(true);
    try {
      const result = await connectExchange(id, {
        apiKey,
        apiSecret,
        passphrase: REQUIRES_PASSPHRASE.has(id) ? passphrase : undefined,
        totpSecret: REQUIRES_TOTP.has(id) ? totpSecret : undefined,
      });
      if (!result.ok) {
        Alert.alert('Connection failed', result.error ?? 'Could not verify these API credentials.');
        return;
      }
      setDraft(EMPTY_DRAFT);
      if (result.canWithdraw === false) {
        Alert.alert(
          'Connected — but no WITHDRAW permission',
          `${name} is connected for balances, but this API key cannot withdraw. Emergency withdrawals will fail until you enable the WITHDRAW permission on the key.`
        );
      }
      onConnected?.(id, result.canWithdraw);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View style={styles.form}>
      <TextField
        placeholder={`${name} API key`}
        autoCapitalize="none"
        autoCorrect={false}
        value={draft.apiKey}
        onChangeText={(t) => patch({ apiKey: t })}
      />
      <TextField
        placeholder={`${name} API secret`}
        autoCapitalize="none"
        autoCorrect={false}
        secureToggle
        value={draft.apiSecret}
        onChangeText={(t) => patch({ apiSecret: t })}
      />
      {REQUIRES_PASSPHRASE.has(id) && (
        <TextField
          placeholder="API passphrase"
          autoCapitalize="none"
          autoCorrect={false}
          secureToggle
          value={draft.passphrase}
          onChangeText={(t) => patch({ passphrase: t })}
        />
      )}
      {REQUIRES_TOTP.has(id) && (
        <>
          <TextField
            label="2FA secret (base32)"
            placeholder="e.g. JBSWY3DPEHPK3PXP"
            autoCapitalize="characters"
            autoCorrect={false}
            secureToggle
            value={draft.totpSecret}
            onChangeText={(t) => patch({ totpSecret: t })}
          />
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            {name} requires a 2FA code on every API withdrawal. Paste the base32 seed shown when you
            set up your authenticator (not the 6-digit code) — it&apos;s stored encrypted and used to
            generate the code automatically during a panic.
          </ThemedText>
        </>
      )}
      <GradientButton
        label={connecting ? 'Testing…' : 'Connect & Test'}
        variant="accent"
        disabled={connecting}
        style={styles.connectBtn}
        onPress={handleConnect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.two },
  hint: { lineHeight: 16, color: Brand.textSecondary },
  connectBtn: { minHeight: 44 },
});
