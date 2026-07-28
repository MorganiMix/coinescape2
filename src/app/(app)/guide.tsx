import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NavMenu } from '@/components/NavMenu';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { Screen } from '@/components/ui/Screen';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { EXCHANGE_GUIDES } from '@/domain/exchangeGuides';
import { SUPPORTED_EXCHANGES } from '@/domain/mockData';

export default function GuideScreen() {
  const router = useRouter();

  // List every exchange in the roster that has a guide, preserving roster order.
  const items = SUPPORTED_EXCHANGES.filter((ex) => EXCHANGE_GUIDES[ex.id]);

  const openGuide = (id: string) => {
    router.push({ pathname: '/(app)/exchange-guide', params: { exchange: id } });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* --- Header --- */}
        <View style={styles.header}>
          <Logo size={40} />
          <View style={styles.flex}>
            <ThemedText type="subtitle" style={styles.title}>
              Setup Guide
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              How Coin Escape works + exchange guides
            </ThemedText>
          </View>
          <NavMenu />
        </View>

        {/* ====== NEW: General App UI Guide ====== */}
        <Card style={styles.generalCard}>
          <ThemedText style={styles.generalTitle}>How Coin Escape Works</ThemedText>

          <ThemedText type="small" themeColor="textSecondary" style={styles.generalIntro}>
            Coin Escape is a crypto withdrawal tool that lets you securely connect your
            exchange accounts via API keys (Read + Withdraw permissions only), monitor
            your balances, and quickly move your assets to a safe wallet when you need to exit.
          </ThemedText>

          <ThemedText style={styles.generalHeading}>Getting Started</ThemedText>

          <View style={styles.stepRow}>
            <ThemedText style={styles.stepNum}>1.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.stepText}>
              <ThemedText style={styles.bold}>Install Coin Escape App</ThemedText> – Download the
              exchange app you want to connect and sign in to your account.
            </ThemedText>
          </View>

          <View style={styles.stepRow}>
            <ThemedText style={styles.stepNum}>2.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.stepText}>
              <ThemedText style={styles.bold}>Create an API Key</ThemedText> – Generate a new API key
              on your exchange and enable only: ✅ Read + ✅ Withdraw.
              {'\n\n'}If your exchange requires a Trusted IP, follow the exchange‑specific guide
              and add the provided IP address to your API settings.
            </ThemedText>
          </View>

          <View style={styles.stepRow}>
            <ThemedText style={styles.stepNum}>3.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.stepText}>
              <ThemedText style={styles.bold}>Connect to Coin Escape</ThemedText> – Open the app,
              sign up/log in, and connect your exchange by entering your API Key, Secret Key,
              and Passphrase (if required). Some exchanges may require a UK VPN.
            </ThemedText>
          </View>

          <View style={styles.stepRow}>
            <ThemedText style={styles.stepNum}>4.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.stepText}>
              <ThemedText style={styles.bold}>Verify Your Assets</ThemedText> – Ensure your funds are
              in your exchange's <ThemedText style={styles.bold}>Funding</ThemedText> or{' '}
              <ThemedText style={styles.bold}>Trading</ThemedText> account. Web3/external wallets
              won't appear.
            </ThemedText>
          </View>

          <View style={styles.stepRow}>
            <ThemedText style={styles.stepNum}>5.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.stepText}>
              <ThemedText style={styles.bold}>Configure Withdrawals</ThemedText> – Enter your
              withdrawal address and select the correct blockchain network. Double‑check both.
            </ThemedText>
          </View>

          <View style={styles.stepRow}>
            <ThemedText style={styles.stepNum}>6.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.stepText}>
              <ThemedText style={styles.bold}>Withdraw Your Funds</ThemedText> – Tap{' '}
              <ThemedText style={styles.bold}>Real Withdrawal</ThemedText> to securely withdraw.
            </ThemedText>
          </View>

          <ThemedText style={styles.generalHeading}>Security</ThemedText>

          <View style={styles.bulletRow}>
            <ThemedText style={styles.bullet}>•</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.bulletText}>
              Coin Escape only requires <ThemedText style={styles.bold}>Read</ThemedText> and{' '}
              <ThemedText style={styles.bold}>Withdraw</ThemedText> permissions.
            </ThemedText>
          </View>
          <View style={styles.bulletRow}>
            <ThemedText style={styles.bullet}>•</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.bulletText}>
              Never enable unnecessary API permissions unless specifically instructed.
            </ThemedText>
          </View>
          <View style={styles.bulletRow}>
            <ThemedText style={styles.bullet}>•</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.bulletText}>
              Keep your API Secret and Passphrase secure. Your exchange may only display them once.
            </ThemedText>
          </View>
          <View style={styles.bulletRow}>
            <ThemedText style={styles.bullet}>•</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.bulletText}>
              Always verify withdrawal addresses and blockchain networks before confirming any
              transaction.
            </ThemedText>
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.generalFooter}>
            Coin Escape is designed to make connecting your exchange accounts simple, giving you a
            fast and convenient way to manage and withdraw your assets from one place.
          </ThemedText>
        </Card>

        {/* ====== EXCHANGE GUIDES LIST (existing) ====== */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          EXCHANGE-SPECIFIC GUIDES
        </ThemedText>
        <View style={styles.group}>
          {items.map((ex) => {
            const guide = EXCHANGE_GUIDES[ex.id];
            return (
              <Pressable
                key={ex.id}
                onPress={() => openGuide(ex.id)}
                style={({ pressed }) => [pressed && styles.pressed]}>
                <Card style={styles.row}>
                  <View style={styles.flex}>
                    <ThemedText style={styles.exchangeName}>{ex.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      {guide.intro}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.chevron}>›</ThemedText>
                </Card>
              </Pressable>
            );
          })}
        </View>

        {/* Tip (existing) */}
        <View style={styles.tipCard}>
          <ThemedText style={styles.tipIcon}>💡</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            Tip: only enable Read and Withdraw permissions on your API keys — never Trading or
            Futures. Whitelisting your withdrawal address is your strongest defence.
          </ThemedText>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.one },
  title: { fontSize: 24, lineHeight: 28 },

  // --- General guide styles ---
  generalCard: { padding: Spacing.three, gap: Spacing.two },
  generalTitle: { fontSize: 22, fontWeight: '700' },
  generalIntro: { lineHeight: 18 },
  generalHeading: { fontSize: 16, fontWeight: '700', marginTop: Spacing.two },
  generalFooter: { fontStyle: 'italic', marginTop: Spacing.two },

  stepRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  stepNum: { fontWeight: '700', width: 24 },
  stepText: { flex: 1, lineHeight: 18 },

  bulletRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  bullet: { width: 16, textAlign: 'center' },
  bulletText: { flex: 1, lineHeight: 18 },
  bold: { fontWeight: '700' },

  // --- Exchange list styles (existing) ---
  sectionLabel: { letterSpacing: 1, fontWeight: '700', marginTop: Spacing.two },
  group: { gap: Spacing.two },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  exchangeName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  chevron: { fontSize: 24, color: Brand.textMuted },
  tipCard: {
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: Brand.accentSoft,
    borderRadius: Radius.md,
    padding: Spacing.three,
    marginTop: Spacing.two,
    alignItems: 'flex-start',
  },
  tipIcon: { fontSize: 16 },
});
