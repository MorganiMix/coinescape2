// src/app/news.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchRealNews, NewsItem } from '@/constants/mockData';
import NewsCard from '@/components/NewsCard';
import { Brand, Radius, Spacing, Fonts } from '@/constants/theme'; // ← CHANGED

export default function NewsScreen() {
  const router = useRouter();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('All');
  const exchanges = ['All', 'Binance', 'Coinbase', 'Kraken', 'Bybit', 'OKX', 'KuCoin'];

  useEffect(() => {
    loadNews();
  }, []);

  const loadNews = async () => {
    setLoading(true);
    const data = await fetchRealNews();
    setNews(data.news);
    setLoading(false);
  };

  const filtered = filter === 'All' ? news : news.filter(item => item.exchange === filter);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back to Settings</Text>
      </TouchableOpacity>

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

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Brand.accent} />
          <Text style={styles.loadingText}>Loading news...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <NewsCard item={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No news found for this exchange.</Text>
          }
        />
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
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Brand.text,
    fontFamily: Fonts.sans,
  },
  date: {
    fontSize: 14,
    color: Brand.textMuted,
    fontFamily: Fonts.sans,
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
    fontFamily: Fonts.sans,
  },
  filterTextActive: {
    color: Brand.bg,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
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
