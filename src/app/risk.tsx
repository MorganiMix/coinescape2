// src/app/risk.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchRealRisks, RiskItem } from '@/constants/mockData';
import { useRiskTicker } from '@/hooks/useRiskTicker';
import RiskCard from '@/components/RiskCard';
import { Brand, Spacing, Fonts } from '@/constants/theme'; // ← CHANGED

export default function RiskScreen() {
  const router = useRouter();
  const [baseline, setBaseline] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const displayRisks = useRiskTicker(baseline);

  useEffect(() => {
    loadRisks();
  }, []);

  const loadRisks = async () => {
    setLoading(true);
    const data = await fetchRealRisks();
    setBaseline(data.risks);
    setLoading(false);
  };

  useEffect(() => {
    if (!loading) {
      const refresh = setInterval(() => {
        loadRisks();
      }, 30000);
      return () => clearInterval(refresh);
    }
  }, [loading]);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back to Settings</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.title}>⚠️ Exchange Risk Monitor</Text>
        <View style={styles.liveBadge}>
          <Text style={styles.liveDot}>●</Text>
          <Text style={styles.liveText}>Live · 1s</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Brand.accent} />
          <Text style={styles.loadingText}>Loading risk data...</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={displayRisks}
            keyExtractor={item => item.exchange}
            renderItem={({ item }) => <RiskCard item={item} />}
            contentContainerStyle={styles.list}
            numColumns={2}
            columnWrapperStyle={{ justifyContent: 'space-between' }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No risk data available.</Text>
            }
          />
          <Text style={styles.footer}>
            Risk = estimated probability of forced shutdown within 12 months.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bg,
    paddingTop: Spacing.four,
  },
  backButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.one,
  },
  backText: {
    color: Brand.accent,
    fontSize: 16,
    fontFamily: Fonts.sans,
    fontWeight: '600',
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
    fontFamily: Fonts.sans,
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
    fontFamily: Fonts.mono,
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
    fontFamily: Fonts.sans,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Brand.textSecondary,
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
  },
  emptyText: {
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: Spacing.five,
    fontFamily: Fonts.sans,
  },
});
