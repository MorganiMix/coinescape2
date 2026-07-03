/**
 * Warning shown when an exchange's API key was set up from one external IP but
 * the device is now on a different IP. Many exchanges let you restrict an API
 * key to whitelisted IPs, so a changed IP can silently break withdrawals until
 * the new IP is added. Renders nothing when there's no mismatch.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GradientButton } from '@/components/ui/GradientButton';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { ExchangeId } from '@/domain/types';
import { useAppStore } from '@/store/AppStore';

export function IpChangeWarning({
  id,
  name,
  compact,
}: {
  id: ExchangeId;
  name: string;
  /** compact = single-line note (for tight rows); default = full card with action. */
  compact?: boolean;
}) {
  const { ipChangedForExchange, setupIpByExchange, currentIp, updateSetupIp } = useAppStore();

  if (!ipChangedForExchange(id)) return null;

  const savedIp = setupIpByExchange[id];

  if (compact) {
    return (
      <View style={styles.compact}>
        <ThemedText style={styles.icon}>⚠️</ThemedText>
        <ThemedText type="small" style={styles.compactText}>
          {name}: IP changed ({savedIp} → {currentIp}). Re-whitelist it.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <ThemedText style={styles.icon}>⚠️</ThemedText>
        <ThemedText style={styles.title}>Your IP address changed</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
        {name}&apos;s API key was set up from {savedIp}, but you&apos;re now on {currentIp}. If you
        whitelisted the old IP on {name}, add the new one or withdrawals may be blocked.
      </ThemedText>
      <View style={styles.ips}>
        <ThemedText type="small" themeColor="textSecondary">
          Whitelisted: <ThemedText style={styles.mono}>{savedIp}</ThemedText>
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Current: <ThemedText style={styles.monoAccent}>{currentIp}</ThemedText>
        </ThemedText>
      </View>
      <GradientButton
        label="I've re-whitelisted — save new IP"
        variant="outline"
        onPress={() => updateSetupIp(id)}
        style={styles.btn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.warning,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  icon: { fontSize: 14 },
  title: { fontSize: 14, fontWeight: '800', color: Brand.warning },
  body: { lineHeight: 16 },
  ips: { gap: 2 },
  mono: { fontFamily: 'Courier', fontWeight: '700', color: Brand.text },
  monoAccent: { fontFamily: 'Courier', fontWeight: '700', color: Brand.accent },
  btn: { minHeight: 40, marginTop: Spacing.one },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.warning,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  compactText: { flex: 1, color: Brand.warning, fontWeight: '600' },
});
