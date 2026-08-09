// src/components/RiskCard.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RiskItem } from '@/constants/mockData';
import { Brand, Radius, Spacing, Fonts } from '@/constants/Colors';

export default function RiskCard({ item }: { item: RiskItem }) {
  const getColor = (risk: number) => {
    if (risk < 15) return Brand.success;
    if (risk < 35) return Brand.warning;
    if (risk < 50) return '#F97316'; // Orange – not in your palette but useful here
    return Brand.danger;
  };

  const getBgColor = (risk: number) => {
    if (risk < 15) return Brand.successSoft;
    if (risk < 35) return 'rgba(245, 166, 35, 0.16)';
    if (risk < 50) return 'rgba(249, 115, 22, 0.16)';
    return Brand.dangerSoft;
  };

  const color = getColor(item.risk);
  const bgColor = getBgColor(item.risk);

  return (
    <View style={[styles.card, { borderColor: Brand.cardBorder }]}>
      <View style={styles.row}>
        <Text style={styles.exchangeName}>{item.exchange}</Text>
        <View style={[styles.riskBadge, { backgroundColor: bgColor }]}>
          <Text style={[styles.riskText, { color }]}>{item.risk.toFixed(1)}%</Text>
        </View>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${Math.min(item.risk, 100)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.card,
    borderRadius: Radius.md,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    width: '48%',
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exchangeName: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.text,
    fontFamily: Fonts.default.sans,
  },
  riskBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  riskText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.default.mono,
  },
  barBg: {
    height: 4,
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.pill,
    marginTop: Spacing.two,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
});
