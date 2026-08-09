// src/components/RiskCard.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RiskItem } from '@/constants/mockData';

export default function RiskCard({ item }: { item: RiskItem }) {
  const getColor = (risk: number) => {
    if (risk < 15) return '#22c55e';
    if (risk < 35) return '#eab308';
    if (risk < 50) return '#f97316';
    return '#dc2626';
  };

  const color = getColor(item.risk);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.exchangeName}>{item.exchange}</Text>
        <Text style={[styles.riskText, { color }]}>{item.risk.toFixed(1)}%</Text>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${Math.min(item.risk, 100)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, width: '48%', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exchangeName: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  riskText: { fontSize: 18, fontWeight: 'bold' },
  barBg: { height: 6, backgroundColor: '#e5e7eb', borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
});
