// src/app/(tabs)/news.tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { MOCK_NEWS } from '@/constants/mockData';
import NewsCard from '@/components/NewsCard';
import { Brand, Radius, Spacing, Fonts } from '@/constants/Colors';

export default function NewsScreen() {
  const [filter, setFilter] = useState<string>('All');
  const exchanges = ['All', 'Binance', 'Coinbase', 'Kraken', 'Bybit', 'OKX', 'KuCoin'];
  const filtered = filter === 'All' ? MOCK_NEWS : MOCK_NEWS.filter(item => item.exchange === filter);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📰 Today's Major News</Text>
        <Text style={styles.date}>{new Date().toLocaleDateString()}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        {exchanges.map(ex => (
          <TouchableOpacity
            key={ex}
            onPress={() => setFilter(ex)}
            style={[styles.filterBtn, filter === ex && styles.filterBtnActive]}
          >
            <Text style={[styles.filterText, filter === ex && styles.filterTextActive]}>
              {ex}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <NewsCard item={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
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
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Brand.text,
    fontFamily: Fonts.default.sans,
  },
  date: {
    fontSize: 14,
    color: Brand.textMuted,
    fontFamily: Fonts.default.sans,
    marginTop: Spacing.half,
  },
  filterContainer: {
    paddingHorizontal: Spacing.four,
    marginVertical: Spacing.two,
    maxHeight: 44,
  },
  filterBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Brand.card,
    marginRight: Spacing.two,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
  },
  filterBtnActive: {
    backgroundColor: Brand.accent,
    borderColor: Brand.accent,
  },
  filterText: {
    color: Brand.textSecondary,
    fontSize: 14,
    fontFamily: Fonts.default.sans,
  },
  filterTextActive: {
    color: Brand.bg,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
});
