import { BackHandler, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GradientButton } from '@/components/ui/GradientButton';
import { Screen } from '@/components/ui/Screen';
import { Brand, Radius, Spacing } from '@/constants/theme';

type Clause = { title: string; body: string };

const CLAUSES: Clause[] = [
  {
    title: 'Assets lost to “the void”',
    body: 'Funds lost or unrecoverable due to on-chain, bridge, exchange, or wallet issues. No compensation.',
  },
  {
    title: 'Slow execution while the exchange “locks the gates”',
    body: 'The exchange pauses, freezes, or delays withdrawals, or goes down. No compensation.',
  },
  {
    title: 'Incorrect liquidate-position orders',
    body: 'A liquidate-position order that is executed incorrectly, turns into a new position, or produces any unintended order outcome. No compensation.',
  },
  {
    title: 'Exchange API & network failures',
    body: 'Any loss caused by exchange API failures, rate limiting, maintenance, price slippage, network congestion, and the like. No compensation.',
  },
  {
    title: 'Force majeure & third-party systems',
    body: 'Any other loss caused by force majeure or third-party systems (etc.). No compensation.',
  },
];

/**
 * First-run legal gate. Rendered before the biometric vault is enrolled. The
 * user MUST accept to proceed.
 *
 *  - Agree    → onAgree() (continues to enrolment).
 *  - Disagree → Android closes the app; iOS cannot legally exit programmatically
 *               (App Store guideline 2.5.2 / possible rejection for exit(0)), so
 *               it stays on this blocking screen — there is no path past it
 *               without accepting.
 */
export function DisclaimerGate({ onAgree }: { onAgree: () => void }) {
  const handleDisagree = () => {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    }
    // iOS: intentionally do nothing — the user stays on this blocking screen.
    // Apple forbids programmatic termination, so quitting is left to the user.
  };

  return (
    <Screen>
      <View style={styles.root}>
        <ThemedText type="subtitle" style={styles.title}>
          Before you begin
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.intro}>
          Coin Escape is a self-custodial, decentralized, open-source tool. All
          transactions execute on-chain and through exchange APIs, and their
          outcomes depend on network conditions, exchange systems, and the
          blockchain itself — none of which Coin Escape controls. We accept no
          liability and offer no compensation for the following:
        </ThemedText>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator>
          {CLAUSES.map((c) => (
            <View key={c.title} style={styles.clause}>
              <ThemedText style={styles.clauseTitle}>
                <ThemedText style={styles.cross}>✕ </ThemedText>
                {c.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.clauseBody}>
                {c.body}
              </ThemedText>
            </View>
          ))}

          <ThemedText type="small" themeColor="textSecondary" style={styles.footerText}>
            By using Coin Escape you acknowledge and accept these risks and bear
            all consequences yourself. Coin Escape does not provide financial,
            investment, or legal advice. Use entirely at your own risk.
          </ThemedText>
        </ScrollView>

        <View style={styles.actions}>
          <GradientButton
            label="I Agree — Continue"
            variant="accent"
            onPress={onAgree}
          />
          <GradientButton
            label={Platform.OS === 'android' ? 'I Disagree — Quit' : 'I Disagree'}
            variant="outline"
            onPress={handleDisagree}
          />
          {Platform.OS !== 'android' && (
            <ThemedText type="small" style={styles.quitHint}>
              You must accept to use Coin Escape. To decline, close the app from
              the app switcher.
            </ThemedText>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  title: { fontSize: 24, lineHeight: 30 },
  intro: { lineHeight: 20 },
  scroll: {
    flex: 1,
    marginTop: Spacing.two,
  },
  scrollContent: { gap: Spacing.three, paddingBottom: Spacing.three },
  clause: {
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    padding: Spacing.three,
    gap: 4,
  },
  clauseTitle: { fontWeight: '700', lineHeight: 20 },
  cross: { color: Brand.danger, fontWeight: '800' },
  clauseBody: { lineHeight: 18 },
  footerText: { lineHeight: 18, marginTop: Spacing.one },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
  quitHint: { textAlign: 'center', lineHeight: 16, color: Brand.textMuted },
});
