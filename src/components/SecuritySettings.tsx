/**
 * Settings → SECURITY: change the vault PIN, toggle the biometric shortcut,
 * and lock the session on demand.
 *
 * Kept in its own component because the change-PIN flow is a small state
 * machine of its own (verify current → choose new → confirm), and settings.tsx
 * is already long.
 */
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { PinCreate, PinUnlock } from '@/components/PinEntry';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { WeakPinError, WrongPinError } from '@/security';
import { useAppStore } from '@/store/AppStore';

type Stage = null | 'verify' | 'choose';

export function SecuritySettings() {
  const {
    biometricEnabled,
    biometricAvailable,
    biometricLabel,
    pinLockedUntil,
    verifyPin,
    changeVaultPin,
    setBiometricEnabled,
    signOut,
  } = useAppStore();

  const [stage, setStage] = useState<Stage>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const closeChange = () => {
    setStage(null);
    setCurrentPin('');
    setError(null);
  };

  const handleVerify = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      if (!(await verifyPin(pin))) {
        setError('That PIN is not correct.');
        return;
      }
      setCurrentPin(pin);
      setStage('choose');
    } finally {
      setBusy(false);
    }
  };

  const handleChoose = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      await changeVaultPin(currentPin, pin);
      closeChange();
      Alert.alert('PIN changed', 'Your new PIN is active from now on.');
    } catch (e) {
      if (e instanceof WeakPinError || e instanceof WrongPinError) setError(e.message);
      else setError('Could not change your PIN. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleBiometric = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = !biometricEnabled;
      const res = await setBiometricEnabled(next);
      if (!res.ok) {
        Alert.alert(
          `Couldn’t enable ${biometricLabel}`,
          res.error ?? 'The authentication prompt was dismissed.'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
        SECURITY
      </ThemedText>
      <Card style={styles.group}>
        <Pressable
          onPress={() => {
            setError(null);
            setStage('verify');
          }}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
          <View style={styles.rowText}>
            <ThemedText style={styles.rowTitle}>Change PIN</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Your 6-digit PIN unlocks the vault on this device.
            </ThemedText>
          </View>
          <ThemedText style={styles.chevron}>›</ThemedText>
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          onPress={biometricAvailable ? handleToggleBiometric : undefined}
          disabled={!biometricAvailable || busy}
          style={({ pressed }) => [
            styles.row,
            pressed && biometricAvailable && styles.rowPressed,
            !biometricAvailable && styles.rowDisabled,
          ]}>
          <View style={styles.rowText}>
            <ThemedText style={styles.rowTitle}>Unlock with {biometricLabel}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {biometricAvailable
                ? // Say the quiet part out loud: this is precisely the failure
                  // that used to lock people out of their own vault.
                  `A shortcut, not a replacement. If your device forgets ${biometricLabel} — which it does whenever you add a fingerprint or face — your PIN still works and this repairs itself.`
                : `No ${biometricLabel} is set up on this device. Your PIN is all you need.`}
            </ThemedText>
          </View>
          <View style={[styles.pill, biometricEnabled && styles.pillOn]}>
            <ThemedText type="small" style={styles.pillText}>
              {biometricEnabled ? 'On' : 'Off'}
            </ThemedText>
          </View>
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
          <View style={styles.rowText}>
            <ThemedText style={styles.rowTitle}>Lock now</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Ends this session immediately. Unsaved coin changes are discarded.
            </ThemedText>
          </View>
          <ThemedText style={styles.chevron}>›</ThemedText>
        </Pressable>
      </Card>

      <Modal
        visible={stage !== null}
        transparent
        animationType="fade"
        onRequestClose={closeChange}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeChange} />
          <View style={styles.modalCard}>
            {stage === 'verify' ? (
              <PinUnlock
                title="Enter your current PIN"
                busy={busy}
                error={error}
                lockedUntil={pinLockedUntil}
                onSubmit={handleVerify}
                onEditError={() => setError(null)}
              />
            ) : (
              <PinCreate
                title="Choose a new PIN"
                subtitle="Six digits. Your saved exchanges are unaffected."
                busy={busy}
                error={error}
                onComplete={handleChoose}
                onEditError={() => setError(null)}
              />
            )}
            <View style={styles.modalActions}>
              <Pressable onPress={closeChange} hitSlop={6} disabled={busy}>
                <ThemedText type="small" themeColor="textSecondary">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { letterSpacing: 1, fontWeight: '700', marginTop: Spacing.two },
  group: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowPressed: { opacity: 0.7 },
  rowDisabled: { opacity: 0.55 },
  rowText: { flex: 1, gap: Spacing.half },
  rowTitle: { fontSize: 16, fontWeight: '700' },
  chevron: { fontSize: 22, color: Brand.textMuted },
  divider: { height: 1, backgroundColor: Brand.cardBorder, marginVertical: Spacing.one },
  pill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
    backgroundColor: Brand.inputBg,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
  },
  pillOn: { backgroundColor: Brand.accentSoft, borderColor: Brand.accent },
  pillText: { fontWeight: '700' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Brand.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'center', paddingTop: Spacing.two },
});
