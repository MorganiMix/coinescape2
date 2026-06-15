import { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, UIManager, View } from 'react-native';

import { NavMenu } from '@/components/NavMenu';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { Screen } from '@/components/ui/Screen';
import { Brand, Radius, Spacing } from '@/constants/theme';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Step {
  title: string;
  body: string;
}

interface GuideSection {
  id: string;
  heading: string;
  intro: string;
  steps: Step[];
}

const SECTIONS: GuideSection[] = [
  {
    id: 'api',
    heading: 'Section 1 · Create your Exchange API key',
    intro: 'Generate a withdrawal-enabled API key on each exchange you want to protect.',
    steps: [
      {
        title: 'Step 1 · Open API management',
        body: 'On your exchange, go to Account → API Management → Create API. Name it "CoinEscape".',
      },
      {
        title: 'Step 2 · Set permissions',
        body: 'Enable ONLY "Read" and "Enable Withdrawals". Do NOT enable Trading or Futures — Coin Escape never needs them.',
      },
      {
        title: 'Step 3 · Copy the key & secret',
        body: 'Copy the API Key and Secret. The Secret is shown once — store it safely, then paste both into Settings → Connect.',
      },
    ],
  },
  {
    id: 'whitelist',
    heading: 'Section 2 · Withdrawal whitelist setup',
    intro: 'Lock withdrawals to your safe wallet so even a leaked key cannot drain funds elsewhere.',
    steps: [
      {
        title: 'Step 1 · Enable address whitelist',
        body: 'In API security settings, turn on "Withdraw to whitelisted addresses only".',
      },
      {
        title: 'Step 2 · Add your safe wallet',
        body: 'Add your self-custody recipient address (the same one you enter in Settings) to the whitelist for each asset/network.',
      },
      {
        title: 'Step 3 · Bind the key to the whitelist',
        body: 'Associate the CoinEscape API key with the whitelist. Now withdrawals can only ever go to your safe wallet.',
      },
    ],
  },
  {
    id: 'verify',
    heading: 'Section 3 · Verify with a Dry Run',
    intro: 'Confirm everything works before you ever need it.',
    steps: [
      {
        title: 'Step 1 · Configure allocations',
        body: 'In Settings, pick the coins to rescue and set withdrawal percentages totalling 100%.',
      },
      {
        title: 'Step 2 · Run a simulation',
        body: 'On the Panic tab, keep Mode = Dry Run, arm the button and swipe. No funds move — you only validate the plan.',
      },
      {
        title: 'Step 3 · Review results',
        body: 'Check that every exchange/asset shows ✓ SIMULATED. Fix any failures (balance, address, whitelist) and re-run.',
      },
    ],
  },
];

export default function GuideScreen() {
  const [open, setOpen] = useState<string | null>('api');
  const [done, setDone] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((cur) => (cur === id ? null : id));
  };

  const totalSteps = SECTIONS.reduce((n, s) => n + s.steps.length, 0);
  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Logo size={40} />
          <View style={styles.flex}>
            <ThemedText type="subtitle" style={styles.title}>
              Setup Guide
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              API & whitelist configuration
            </ThemedText>
          </View>
          <NavMenu />
        </View>

        {/* Progress */}
        <Card style={styles.progressCard}>
          <View style={styles.progressTop}>
            <ThemedText style={styles.progressTitle}>Your progress</ThemedText>
            <ThemedText type="small" style={{ color: Brand.accent, fontWeight: '700' }}>
              {doneCount}/{totalSteps}
            </ThemedText>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${totalSteps ? (doneCount / totalSteps) * 100 : 0}%` },
              ]}
            />
          </View>
        </Card>

        {SECTIONS.map((section) => {
          const expanded = open === section.id;
          return (
            <Card key={section.id} style={styles.sectionCard}>
              <Pressable style={styles.sectionHead} onPress={() => toggle(section.id)}>
                <View style={styles.flex}>
                  <ThemedText style={styles.sectionHeading}>{section.heading}</ThemedText>
                  {!expanded && (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {section.intro}
                    </ThemedText>
                  )}
                </View>
                <ThemedText style={styles.chevron}>{expanded ? '▾' : '▸'}</ThemedText>
              </Pressable>

              {expanded && (
                <View style={styles.steps}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
                    {section.intro}
                  </ThemedText>
                  {section.steps.map((step, i) => {
                    const key = `${section.id}-${i}`;
                    const checked = !!done[key];
                    return (
                      <Pressable
                        key={key}
                        style={styles.stepRow}
                        onPress={() => setDone((d) => ({ ...d, [key]: !d[key] }))}>
                        <View style={[styles.stepCheck, checked && styles.stepCheckOn]}>
                          {checked && <ThemedText style={styles.stepCheckMark}>✓</ThemedText>}
                        </View>
                        <View style={styles.flex}>
                          <ThemedText style={[styles.stepTitle, checked && styles.stepTitleDone]}>
                            {step.title}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {step.body}
                          </ThemedText>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Card>
          );
        })}

        <View style={styles.tipCard}>
          <ThemedText style={styles.tipIcon}>💡</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            Tip: Repeat Section 1 & 2 for every exchange. The whitelist is your strongest defence —
            it guarantees funds can only escape to your wallet.
          </ThemedText>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.two },
  title: { fontSize: 24, lineHeight: 28 },
  progressCard: { gap: Spacing.two },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { fontSize: 15, fontWeight: '700' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: Brand.inputBg, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: Brand.accent },
  sectionCard: { gap: Spacing.two },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sectionHeading: { fontSize: 16, fontWeight: '700' },
  chevron: { fontSize: 16, color: Brand.textSecondary },
  steps: {
    gap: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.cardBorder,
    paddingTop: Spacing.three,
  },
  intro: { marginBottom: -Spacing.one },
  stepRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  stepCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Brand.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepCheckOn: { backgroundColor: Brand.accent, borderColor: Brand.accent },
  stepCheckMark: { color: Brand.bg, fontWeight: '900', fontSize: 13 },
  stepTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  stepTitleDone: { textDecorationLine: 'line-through', color: Brand.textMuted },
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
