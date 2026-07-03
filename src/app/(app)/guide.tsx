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
        <View style={styles.header}>
          <Logo size={40} />
          <View style={styles.flex}>
            <ThemedText type="subtitle" style={styles.title}>
              Setup Guide
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Choose an exchange to connect
            </ThemedText>
          </View>
          <NavMenu />
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
          Each guide walks you through creating a withdrawal-enabled API key with the correct,
          minimal permissions — then you connect it in Settings.
        </ThemedText>

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          EXCHANGES
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
  intro: { lineHeight: 18, marginTop: Spacing.one },
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
