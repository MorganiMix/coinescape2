// src/components/BackupCard.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Brand, Radius, Spacing, Fonts } from '@/constants/theme';

export default function BackupCard() {
  const router = useRouter();

  return (
    <TouchableOpacity 
      style={styles.card} 
      onPress={() => router.push('/backup')}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <Text style={styles.icon}>🔐</Text>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Backup Vault</Text>
          <Text style={styles.subtitle}>
            Create encrypted backup or restore from backup file
          </Text>
        </View>
        <Text style={styles.arrow}>→</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.card,
    borderRadius: Radius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    marginBottom: Spacing.three,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 28,
    marginRight: Spacing.three,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: Brand.text,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  subtitle: {
    color: Brand.textSecondary,
    fontSize: 13,
    fontFamily: Fonts.sans,
    marginTop: Spacing.half,
  },
  arrow: {
    color: Brand.accent,
    fontSize: 20,
    fontWeight: '300',
  },
});
