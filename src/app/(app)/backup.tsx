// src/app/(app)/backup.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Brand, Spacing, Fonts, Radius } from '@/constants/theme';
import { exportBackup, importBackup } from '@/security/backup';

export default function BackupScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'export' | 'import'>('export');

  const handleExport = async () => {
    if (!password || password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const vaultJSON = JSON.stringify({
        vault: 'Your vault data goes here',
        timestamp: new Date().toISOString(),
      });

      const path = await exportBackup(vaultJSON, password);
      const filename = 'coin-escape-backup.backup';

      // Android: Use Sharing API (works better)
      if (Platform.OS === 'android') {
        // Check if sharing is available
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(path, {
            mimeType: 'application/json',
            dialogTitle: 'Save Backup',
            UTI: 'public.json',
          });
        } else {
          // Fallback: Share API
          await Share.share({
            title: 'Coin Escape Backup',
            message: 'Your encrypted vault backup is attached.',
            url: path,
          });
        }
      } else {
        // iOS: Use Share API
        await Share.share({
          title: 'Coin Escape Backup',
          message: 'Your encrypted vault backup is attached.',
          url: path,
        });
      }

      Alert.alert('✅ Backup Created!', 'Your encrypted backup has been saved. Store it safely!');
    } catch (error: any) {
      console.error('Export error:', error);
      Alert.alert('❌ Backup Failed', error?.message || 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!password) {
      Alert.alert('Error', 'Please enter your recovery password');
      return;
    }

    setLoading(true);
    try {
      // Android: Accept .backup files
      const result = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === 'android' 
          ? ['application/json', 'application/octet-stream', '*/*']
          : ['public.json', 'public.data'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setLoading(false);
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name || '';
      
      // Check if it's a .backup file
      if (!fileName.endsWith('.backup') && !fileName.endsWith('.json')) {
        Alert.alert('⚠️ Invalid File', 'Please select a .backup file');
        setLoading(false);
        return;
      }

      const decrypted = await importBackup(fileUri, password);
      
      Alert.alert('✅ Vault Restored!', 'Your vault has been restored successfully.');
      router.back();
    } catch (error: any) {
      console.error('Import error:', error);
      Alert.alert('❌ Restore Failed', 'Invalid password or corrupted backup file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>🔐 Backup Vault</Text>
      <Text style={styles.subtitle}>
        {mode === 'export'
          ? 'Create an encrypted backup of your vault'
          : 'Restore your vault from a backup file'}
      </Text>

      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'export' && styles.modeBtnActive]}
          onPress={() => setMode('export')}
        >
          <Text style={[styles.modeText, mode === 'export' && styles.modeTextActive]}>
            Export
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'import' && styles.modeBtnActive]}
          onPress={() => setMode('import')}
        >
          <Text style={[styles.modeText, mode === 'import' && styles.modeTextActive]}>
            Import
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Recovery Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter recovery password"
          placeholderTextColor={Brand.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {mode === 'export' && (
          <>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Confirm recovery password"
              placeholderTextColor={Brand.textMuted}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <Text style={styles.hint}>
              ⚠️ This password cannot be recovered if lost. Store it safely!
            </Text>
          </>
        )}

        {mode === 'import' && (
          <Text style={styles.hint}>
            📁 Select your .backup file and enter the recovery password to restore.
          </Text>
        )}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={mode === 'export' ? handleExport : handleImport}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Brand.bg} />
          ) : (
            <Text style={styles.primaryBtnText}>
              {mode === 'export' ? '📤 Export Backup' : '📥 Restore Vault'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {mode === 'export'
            ? '🔐 Your vault is encrypted. The password is never stored.'
            : '🔄 Your vault remains encrypted on this device until you restore.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bg,
    padding: Spacing.four,
  },
  backButton: {
    paddingVertical: Spacing.two,
    marginBottom: Spacing.two,
  },
  backText: {
    color: Brand.accent,
    fontSize: 16,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Brand.text,
    fontFamily: Fonts.sans,
    marginBottom: Spacing.one,
  },
  subtitle: {
    fontSize: 16,
    color: Brand.textSecondary,
    fontFamily: Fonts.sans,
    marginBottom: Spacing.four,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Brand.card,
    borderRadius: Radius.md,
    padding: Spacing.one,
    marginBottom: Spacing.four,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: Brand.accent,
  },
  modeText: {
    color: Brand.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  modeTextActive: {
    color: Brand.bg,
  },
  form: {
    flex: 1,
  },
  label: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    marginBottom: Spacing.one,
  },
  input: {
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    padding: Spacing.three,
    color: Brand.text,
    fontSize: 16,
    fontFamily: Fonts.sans,
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
  },
  hint: {
    color: Brand.textMuted,
    fontSize: 13,
    fontFamily: Fonts.sans,
    marginBottom: Spacing.three,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: Brand.accent,
    borderRadius: Radius.md,
    padding: Spacing.four,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  primaryBtnText: {
    color: Brand.bg,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  footer: {
    paddingTop: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: Brand.cardBorder,
  },
  footerText: {
    color: Brand.textMuted,
    fontSize: 12,
    fontFamily: Fonts.sans,
    textAlign: 'center',
    lineHeight: 18,
  },
});
