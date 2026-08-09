// src/app/(tabs)/risk.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { MOCK_RISK_BASELINE } from '@/constants/mockData';
import { useRiskTicker } from '@/hooks/useRiskTicker';
import RiskCard from '@/components/RiskCard';
import { Brand, Spacing, Fonts } from '@/constants/Colors';

export default function RiskScreen() {
  const [baseline, setBaseline] = useState(MOCK_RISK_BASELINE);
  const displayRisks = useRiskTicker(baseline);

  useEffect(() => {
    const refresh = setInterval(() => {
      setBaseline(MOCK_RISK_BASELINE);
    }, 30000);
    return () => clearInterval(refresh);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>⚠️ Exchange Risk Monitor</Text>
        <View style={styles.liveBadge}>
          <Text style={styles.liveDot}>●</Text>
          <Text style={styles.liveText}>Live · 1s</Text>
        </View>
      </View>

      <FlatList
        data={displayRisks}
        keyExtractor={item => item.exchange}
        renderItem={({ item }) => <RiskCard item={item} />}
        contentContainerStyle={styles.list}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        showsVerticalScrollIndicator={false}
      />

      <Text style={styles.footer}>
        Risk = estimated probability of forced shutdown within 12 months.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bg,
    paddingTop: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Brand.text,
    fontFamily: Fonts.default.sans,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.successSoft,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.one,
  },
  liveDot: {
    color: Brand.success,
    fontSize: 10,
    marginRight: Spacing.half,
  },
  liveText: {
    color: Brand.success,
    fontSize: 11,
    fontFamily: Fonts.default.mono,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  footer: {
    fontSize: 10,
    color: Brand.textMuted,
    textAlign: 'center',
    fontFamily: Fonts.default.sans,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
});
