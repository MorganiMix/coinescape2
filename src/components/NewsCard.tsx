// src/components/NewsCard.tsx
import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { NewsItem } from '@/constants/mockData';

export default function NewsCard({ item }: { item: NewsItem }) {
  const getSeverityColor = (sev: string) => {
    if (sev === 'high') return '#dc2626';
    if (sev === 'medium') return '#eab308';
    return '#22c55e';
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.badge, { backgroundColor: getSeverityColor(item.severity) }]}>
          {item.exchange}
        </Text>
        <Text style={styles.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
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
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: 'bold', overflow: 'hidden' },
  time: { fontSize: 12, color: '#9ca3af' },
  headline: { fontSize: 16, fontWeight: '600', marginTop: 8, color: '#111827' },
  summary: { fontSize: 14, color: '#4b5563', marginTop: 4 },
  source: { fontSize: 13, color: '#2563eb', marginTop: 8 },
});
