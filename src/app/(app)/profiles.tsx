import { CameraView, useCameraPermissions } from 'expo-camera';
import { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { NavMenu } from '@/components/NavMenu';
import { PinUnlock } from '@/components/PinEntry';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { Brand, Fonts, Radius, Spacing } from '@/constants/theme';
import { peekTransferName } from '@/security';
import { useAppStore } from '@/store/AppStore';

export default function ProfilesScreen() {
  const {
    profiles,
    activeProfileId,
    maxProfiles,
    switchProfile,
    renameProfile,
    deleteProfile,
    createProfile,
    exportActiveProfile,
    importProfileFromText,
    connectedExchanges,
  } = useAppStore();

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create (uses an in-app modal — Alert.prompt is iOS-only, so it silently
  // failed on Android)
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  // Export → authorise with the vault PIN, then show the QR + its one-time code
  const [exportOpen, setExportOpen] = useState(false);
  const [exportQr, setExportQr] = useState<string | null>(null);
  /** The generated code the receiving phone must type. Never the vault PIN. */
  const [transferCode, setTransferCode] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Import → scan QR, then enter PIN
  const [permission, requestPermission] = useCameraPermissions();
  const [scanOpen, setScanOpen] = useState(false);
  const [scannedText, setScannedText] = useState<string | null>(null);
  const [scannedName, setScannedName] = useState<string | null>(null);
  /** Transfer-code pad, shown after a successful scan. */
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  // Guard against onBarcodeScanned firing repeatedly for the same frame.
  const scanLock = useRef(false);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId]
  );
  const slotsFull = profiles.length >= maxProfiles;

  const handleSwitch = async (id: string) => {
    if (id === activeProfileId) return;
    setBusyId(id);
    try {
      await switchProfile(id);
    } catch (e) {
      Alert.alert('Switch failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setRenameText(current);
  };

  const handleDelete = (id: string, name: string) => {
    if (profiles.length <= 1) {
      Alert.alert('Cannot delete', 'You must keep at least one profile.');
      return;
    }
    const isActive = id === activeProfileId;
    Alert.alert(
      `Delete “${name}”?`,
      `This permanently removes this profile’s connected exchanges, API keys and emergency coin selection.${
        isActive ? ' Another profile will become active.' : ''
      } This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyId(id);
            try {
              const result = await deleteProfile(id);
              if (!result.ok) {
                Alert.alert('Delete failed', result.error ?? 'Could not delete this profile.');
              }
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const name = renameText.trim();
    if (name.length === 0) {
      Alert.alert('Name required', 'Enter a profile name.');
      return;
    }
    try {
      await renameProfile(renamingId, name);
      setRenamingId(null);
      setRenameText('');
    } catch (e) {
      Alert.alert('Rename failed', e instanceof Error ? e.message : String(e));
    }
  };

  const handleCreate = () => {
    if (slotsFull) {
      Alert.alert('Profiles full', `You can keep at most ${maxProfiles} profiles.`);
      return;
    }
    setCreateName(`Profile ${profiles.length + 1}`);
    setCreateOpen(true);
  };

  const commitCreate = async () => {
    const name = createName.trim() || `Profile ${profiles.length + 1}`;
    setCreating(true);
    try {
      const result = await createProfile(name);
      if (!result.ok) {
        Alert.alert('Could not create profile', result.error ?? 'Unknown error');
        return;
      }
      setCreateOpen(false);
      setCreateName('');
    } finally {
      setCreating(false);
    }
  };

  // ---- Export → QR ----

  const openExport = () => {
    setExportQr(null);
    setTransferCode(null);
    setExportError(null);
    setExportOpen(true);
  };

  const closeExport = () => {
    setExportOpen(false);
    setExportQr(null);
    // Drop the code with the screen: it is single-use by design, and leaving it
    // in memory for a re-open would quietly turn it into a reusable password.
    setTransferCode(null);
    setExportError(null);
  };

  /**
   * Authorise the export with the vault PIN. The QR is then encrypted under a
   * freshly-generated one-time code (returned by the store), not under the PIN —
   * the QR leaves the device, and the PIN must not.
   */
  const handleGenerateQr = async (pin: string) => {
    setExporting(true);
    setExportError(null);
    try {
      const result = await exportActiveProfile(pin);
      if (!result.ok || !result.text || !result.code) {
        setExportError(result.error ?? 'Could not export this profile.');
        return;
      }
      setExportQr(result.text);
      setTransferCode(result.code);
    } finally {
      setExporting(false);
    }
  };

  // ---- Import → scan QR, then enter PIN ----

  const openScanner = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert(
          'Camera needed',
          'Allow camera access to scan a profile QR code. You can enable it in Settings.'
        );
        return;
      }
    }
    scanLock.current = false;
    setScannedText(null);
    setScannedName(null);
    setImportError(null);
    setScanOpen(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    // Read the (non-secret) profile name embedded in the payload so we can show
    // it before asking for the PIN. If it doesn't parse, it's not our QR.
    const name = peekTransferName(data);
    if (!name) {
      Alert.alert('Not a Coin Escape code', 'That QR code is not a Coin Escape profile transfer.', [
        { text: 'OK', onPress: () => (scanLock.current = false) },
      ]);
      return;
    }
    setScannedText(data);
    setScannedName(name);
    setScanOpen(false);
  };

  /**
   * @param code passed explicitly rather than read from state — it arrives from
   *   the PIN pad's submit callback, and a `setState` in the same tick would not
   *   be visible here yet.
   */
  const runImport = async (overwriteId: string | undefined, code: string) => {
    if (!scannedText) return;
    setImporting(true);
    try {
      const result = await importProfileFromText(scannedText, code, overwriteId);
      if (result.needsSlot) {
        // All slots full — ask which to overwrite.
        Alert.alert(
          'Choose a slot to overwrite',
          `All ${maxProfiles} profiles are in use. Pick one to replace with the imported profile.`,
          [
            ...profiles.map((p) => ({
              text: p.name + (p.id === activeProfileId ? ' (active)' : ''),
              onPress: () => void runImport(p.id, code),
            })),
            { text: 'Cancel', style: 'cancel' as const },
          ]
        );
        return;
      }
      if (!result.ok) {
        // Reopen the pad rather than dumping the user back to the card: a
        // mistyped digit is by far the likeliest cause.
        setImportError(result.error ?? 'Could not import this profile.');
        setImportOpen(true);
        return;
      }
      setScannedText(null);
      setScannedName(null);
      setImportError(null);
      Alert.alert('Imported', 'Profile imported and made active.');
    } finally {
      setImporting(false);
    }
  };

  const handleImportCode = (code: string) => {
    setImportOpen(false);
    void runImport(undefined, code);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets>
        <View style={styles.pageHeader}>
          <ThemedText type="subtitle" style={styles.pageTitle}>
            Profiles
          </ThemedText>
          <NavMenu />
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Keep up to {maxProfiles} independent exchange + coin setups and switch between them. Each
          profile has its own connected exchanges, API keys and emergency coin selection.
        </ThemedText>

        {/* Profile list */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          YOUR PROFILES ({profiles.length}/{maxProfiles})
        </ThemedText>
        <View style={styles.group}>
          {profiles.map((p) => {
            const active = p.id === activeProfileId;
            const renaming = renamingId === p.id;
            return (
              <Card key={p.id} style={[styles.profileCard, active && styles.profileCardActive]}>
                {renaming ? (
                  <View style={styles.renameRow}>
                    <TextField
                      containerStyle={styles.flex}
                      autoFocus
                      value={renameText}
                      onChangeText={setRenameText}
                      placeholder="Profile name"
                      maxLength={40}
                    />
                    <Pressable onPress={commitRename} hitSlop={6}>
                      <ThemedText style={{ color: Brand.accent, fontWeight: '700' }}>Save</ThemedText>
                    </Pressable>
                    <Pressable onPress={() => setRenamingId(null)} hitSlop={6}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Cancel
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.profileRow}>
                    <View style={styles.flex}>
                      <View style={styles.nameRow}>
                        <ThemedText style={styles.profileName}>{p.name}</ThemedText>
                        {active && (
                          <View style={styles.activeBadge}>
                            <ThemedText style={styles.activeBadgeText}>ACTIVE</ThemedText>
                          </View>
                        )}
                      </View>
                      {active && (
                        <ThemedText type="small" themeColor="textSecondary">
                          {connectedExchanges.length} exchange
                          {connectedExchanges.length === 1 ? '' : 's'} connected
                        </ThemedText>
                      )}
                    </View>
                    {!active && (
                      <Pressable onPress={() => handleSwitch(p.id)} hitSlop={6} disabled={busyId === p.id}>
                        <ThemedText style={{ color: Brand.accent, fontWeight: '700' }}>
                          {busyId === p.id ? 'Switching…' : 'Switch'}
                        </ThemedText>
                      </Pressable>
                    )}
                    <Pressable onPress={() => startRename(p.id, p.name)} hitSlop={6}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Rename
                      </ThemedText>
                    </Pressable>
                    {profiles.length > 1 && (
                      <Pressable
                        onPress={() => handleDelete(p.id, p.name)}
                        hitSlop={6}
                        disabled={busyId === p.id}>
                        <ThemedText type="small" style={{ color: Brand.danger, fontWeight: '700' }}>
                          {busyId === p.id ? '…' : 'Delete'}
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                )}
              </Card>
            );
          })}
        </View>

        {!slotsFull && (
          <GradientButton
            label="+ New profile"
            variant="outline"
            onPress={handleCreate}
            style={styles.newBtn}
          />
        )}

        {/* Export → QR */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          TRANSFER ACTIVE PROFILE
        </ThemedText>
        <Card style={styles.group}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Shows “{activeProfile?.name ?? 'the active profile'}” as an encrypted QR code. You set a
            You confirm with your PIN, then the app shows a one-time 6-digit transfer code — the
            receiving phone scans the QR and enters that code. The code is the only thing that can
            decrypt it, so read it out separately. Your own PIN never leaves this device.
          </ThemedText>
          <GradientButton
            label="Show transfer QR"
            variant="accent"
            onPress={openExport}
          />
        </Card>

        {/* Import → scan */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          IMPORT FROM QR
        </ThemedText>
        <Card style={styles.group}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Scan a transfer QR from another phone, then enter the 6-digit code shown next to it.
            It imports into a free slot, or asks which profile to overwrite when all {maxProfiles}{' '}
            are in use.
          </ThemedText>
          {scannedName && (
            <View style={styles.scannedBox}>
              <ThemedText type="small" themeColor="textSecondary">
                Scanned profile
              </ThemedText>
              <ThemedText style={styles.profileName}>{scannedName}</ThemedText>
            </View>
          )}
          <GradientButton
            label={scannedText ? 'Rescan QR' : 'Scan QR code'}
            variant={scannedText ? 'outline' : 'accent'}
            onPress={openScanner}
          />
          {scannedText && (
            <GradientButton
              label={importing ? 'Decrypting…' : 'Enter transfer code'}
              variant="accent"
              disabled={importing}
              onPress={() => {
                setImportError(null);
                setImportOpen(true);
              }}
            />
          )}
        </Card>
      </ScrollView>

      {/* New-profile modal (cross-platform name input) */}
      <Modal
        visible={createOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Tap outside the card to dismiss. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateOpen(false)} />
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>New profile</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Name your new (empty) profile. The current one is saved and you’ll switch to the new
              one.
            </ThemedText>
            <TextField
              autoFocus
              value={createName}
              onChangeText={setCreateName}
              placeholder="Profile name"
              maxLength={40}
              onSubmitEditing={commitCreate}
              returnKeyType="done"
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCreateOpen(false)} hitSlop={6} disabled={creating}>
                <ThemedText type="small" themeColor="textSecondary">
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable onPress={commitCreate} hitSlop={6} disabled={creating}>
                <ThemedText style={{ color: Brand.accent, fontWeight: '700' }}>
                  {creating ? 'Creating…' : 'Create'}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Export → QR modal */}
      <Modal
        visible={exportOpen}
        transparent
        animationType="fade"
        onRequestClose={closeExport}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeExport} />
          <View style={styles.modalCard}>
            {exportQr && transferCode ? (
              <>
                <ThemedText style={styles.modalTitle}>
                  Transfer “{activeProfile?.name ?? 'Profile'}”
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                  Scan this on the other phone, then type the code below. Both expire when you close
                  this screen.
                </ThemedText>
                <View style={styles.qrWrap}>
                  <QRCode value={exportQr} size={240} backgroundColor="white" />
                </View>
                <View style={styles.codeWrap}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Transfer code
                  </ThemedText>
                  <ThemedText style={styles.codeText}>
                    {transferCode.replace(/(\d{3})(\d{3})/, '$1 $2')}
                  </ThemedText>
                </View>
                <View style={styles.modalActions}>
                  <Pressable onPress={closeExport} hitSlop={6}>
                    <ThemedText style={{ color: Brand.accent, fontWeight: '700' }}>Done</ThemedText>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <PinUnlock
                  title="Confirm it’s you"
                  subtitle="Enter your PIN to export this profile’s credentials."
                  busy={exporting}
                  error={exportError}
                  onSubmit={handleGenerateQr}
                  onEditError={() => setExportError(null)}
                />
                <View style={styles.modalActions}>
                  <Pressable onPress={closeExport} hitSlop={6} disabled={exporting}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Cancel
                    </ThemedText>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Import → transfer-code pad */}
      <Modal
        visible={importOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setImportOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setImportOpen(false)} />
          <View style={styles.modalCard}>
            <PinUnlock
              title="Transfer code"
              subtitle={`Enter the 6-digit code shown on the other phone${
                scannedName ? ` for “${scannedName}”` : ''
              }.`}
              busy={importing}
              error={importError}
              onSubmit={handleImportCode}
              onEditError={() => setImportError(null)}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setImportOpen(false)} hitSlop={6} disabled={importing}>
                <ThemedText type="small" themeColor="textSecondary">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Import → camera scanner modal */}
      <Modal
        visible={scanOpen}
        animationType="slide"
        onRequestClose={() => setScanOpen(false)}>
        <View style={styles.scannerRoot}>
          {permission?.granted && (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              onBarcodeScanned={handleBarcodeScanned}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            />
          )}
          <View style={styles.scannerOverlay} pointerEvents="box-none">
            <View style={styles.scannerFrame} />
            <ThemedText style={styles.scannerHint}>
              Point at the transfer QR on the other phone
            </ThemedText>
            <Pressable style={styles.scannerCancel} onPress={() => setScanOpen(false)} hitSlop={8}>
              <ThemedText style={{ color: Brand.text, fontWeight: '700' }}>Cancel</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  flex: { flex: 1 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  pageTitle: { flex: 1, fontSize: 24, lineHeight: 30 },
  hint: { lineHeight: 16 },
  sectionLabel: { letterSpacing: 1, fontWeight: '700', marginTop: Spacing.two },
  group: { gap: Spacing.two },
  profileCard: { gap: Spacing.two },
  profileCardActive: { borderColor: Brand.accent },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  profileName: { fontSize: 16, fontWeight: '700' },
  activeBadge: {
    backgroundColor: Brand.accentSoft,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  activeBadgeText: { fontSize: 10, fontWeight: '800', color: Brand.accent, letterSpacing: 1 },
  newBtn: { marginTop: Spacing.one },
  scannedBox: {
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    padding: Spacing.three,
    gap: 2,
  },
  qrWrap: {
    alignSelf: 'center',
    backgroundColor: 'white',
    padding: Spacing.three,
    borderRadius: Radius.md,
    marginVertical: Spacing.two,
  },
  scannerRoot: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  scannerFrame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: Brand.accent,
    borderRadius: Radius.lg,
    backgroundColor: 'transparent',
  },
  scannerHint: { color: Brand.text, textAlign: 'center', paddingHorizontal: Spacing.four },
  scannerCancel: {
    position: 'absolute',
    bottom: Spacing.six,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: Radius.lg,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    backgroundColor: Brand.cardElevated,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Brand.cardBorder,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  codeWrap: { alignItems: 'center', gap: Spacing.one },
  // Monospaced-ish and widely spaced: this gets read aloud or copied by eye
  // onto another phone, so the digits need to be unmistakable.
  codeText: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 6,
    color: Brand.accent,
    fontFamily: Fonts.mono,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.four,
    marginTop: Spacing.two,
  },
});
