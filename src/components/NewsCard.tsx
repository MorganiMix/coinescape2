// src/components/NewsCard.tsx
import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { NewsItem } from '@/constants/mockData';
import { Brand, Radius, Spacing, Fonts } from '@/constants/theme'; // ← CHANGED

export default function NewsCard({ item }: { item: NewsItem }) {
  const getSeverityColor = (sev: string) => {
    if (sev === 'high') return Brand.danger;
    if (sev === 'medium') return Brand.warning;
    return Brand.success;
  };

  const getSeverityBg = (sev: string) => {
    if (sev === 'high') return Brand.dangerSoft;
    if (sev === 'medium') return 'rgba(245, 166, 35, 0.16)';
    return Brand.successSoft;
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: getSeverityBg(item.severity) }]}>
          <Text style={[styles.badgeText, { color: getSeverityColor(item.severity) }]}>
            {item.exchange}
          </Text>
        </View>
        <Text style={styles.time}>
          {new Date(item.timestamp).toLocaleTimeString()}
        </Text>
      </View>
      <Text style={styles.headline}>{item.headline}</Text>
      <Text style={styles.summary}>{item.summary}</Text>
      <TouchableOpacity onPress={() => Linking.openURL(item.url)}>
        <Text style={styles.source}>🔗 {item.source}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.card,
    borderRadius: Radius.md,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  time: {
    fontSize: 12,
    color: Brand.textMuted,
    fontFamily: Fonts.mono,
  },
  headline: {
    fontSize: 16,
    fontWeight: '600',
    color: Brand.text,
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
  },
  summary: {
    fontSize: 14,
    color: Brand.textSecondary,
    marginTop: Spacing.one,
    fontFamily: Fonts.sans,
    lineHeight: 20,
  },
  source: {
    fontSize: 13,
    color: Brand.accent,
    marginTop: Spacing.two,
    fontFamily: Fonts.sans,
  },
});
