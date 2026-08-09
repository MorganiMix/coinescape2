// src/app/(tabs)/news.tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { MOCK_NEWS } from '@/constants/mockData';
import NewsCard from '@/components/NewsCard';

export default function NewsScreen() {
  const [filter, setFilter] = useState<string>('All');
  const exchanges = ['All', 'Binance', 'Coinbase', 'Kraken', 'Bybit', 'OKX', 'KuCoin'];
  const filtered = filter === 'All' ? MOCK_NEWS : MOCK_NEWS.filter(item => item.exchange === filter);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔥 Today's Major News</Text>
      <Text style={styles.date}>{new Date().toLocaleDateString()}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        {exchanges.map(ex => (
          <TouchableOpacity
            key={ex}
            onPress={() => setFilter(ex)}
            style={[styles.filterBtn, filter === ex && styles.filterBtnActive]}
          >
            <Text style={[styles.filterText, filter === ex && styles.filterTextActive]}>{ex}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <NewsCard item={item} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f9fafb' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827' },
  date: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  filterContainer: { flexDirection: 'row', marginBottom: 16, maxHeight: 40 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#e5e7eb', marginRight: 8 },
  filterBtnActive: { backgroundColor: '#2563eb' },
  filterText: { color: '#111827', fontSize: 14 },
  filterTextActive: { color: '#ffffff' },
});
