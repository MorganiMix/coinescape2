// src/app/(tabs)/risk.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { MOCK_RISK_BASELINE } from '@/constants/mockData';
import { useRiskTicker } from '@/hooks/useRiskTicker';
import RiskCard from '@/components/RiskCard';

export default function RiskScreen() {
  const [baseline, setBaseline] = useState(MOCK_RISK_BASELINE);
  const displayRisks = useRiskTicker(baseline);

  // Refresh baseline every 30s (in case you replace mock with API later)
  useEffect(() => {
    const refresh = setInterval(() => {
      // In the future: fetch('/api/risks').then(res => setBaseline(res))
      setBaseline(MOCK_RISK_BASELINE);
    }, 30000);
    return () => clearInterval(refresh);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>⚠️ Exchange Risk Monitor</Text>
        <Text style={styles.liveBadge}>● Live · 1s</Text>
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
      <Text style={styles.footer}>Risk = estimated probability of forced shutdown within 12 months.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  liveBadge: { fontSize: 12, color: '#22c55e', fontWeight: '600' },
  list: { paddingBottom: 20 },
  footer: { fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 8, marginBottom: 20 },
});
