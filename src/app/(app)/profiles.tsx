import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { NavMenu } from '@/components/NavMenu';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { Brand, Radius, Spacing } from '@/constants/theme';
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

  // Export
  const [exportPassword, setExportPassword] = useState('');
  const [exportText, setExportText] = useState('');
  const [exporting, setExporting] = useState(false);

  // Import
  const [importText, setImportText] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [importing, setImporting] = useState(false);

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

  const handleExport = async () => {
    if (exportPassword.length === 0) {
      Alert.alert('Password required', 'Enter your account password to encrypt the export.');
      return;
    }
    setExporting(true);
    setExportText('');
    try {
      const result = await exportActiveProfile(exportPassword);
      if (!result.ok || !result.text) {
        Alert.alert('Export failed', result.error ?? 'Could not export this profile.');
        return;
      }
      setExportText(result.text);
      setExportPassword('');
    } finally {
      setExporting(false);
    }
  };

  const runImport = async (overwriteId?: string) => {
    setImporting(true);
    try {
      const result = await importProfileFromText(importText, importPassword, overwriteId);
      if (result.needsSlot) {
        // All slots full — ask which to overwrite.
        Alert.alert(
          'Choose a slot to overwrite',
          `All ${maxProfiles} profiles are in use. Pick one to replace with the imported profile.`,
          [
            ...profiles.map((p) => ({
              text: p.name + (p.id === activeProfileId ? ' (active)' : ''),
              onPress: () => runImport(p.id),
            })),
            { text: 'Cancel', style: 'cancel' as const },
          ]
        );
        return;
      }
      if (!result.ok) {
        Alert.alert('Import failed', result.error ?? 'Could not import this profile.');
        return;
      }
      setImportText('');
      setImportPassword('');
      Alert.alert('Imported', 'Profile imported and made active.');
    } finally {
      setImporting(false);
    }
  };

  const handleImport = () => {
    if (importText.trim().length === 0) {
      Alert.alert('Nothing to import', 'Paste an exported profile file first.');
      return;
    }
    if (importPassword.length === 0) {
      Alert.alert('Password required', 'Enter the username’s password the file was exported with.');
      return;
    }
    runImport();
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

        {/* Export */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          EXPORT ACTIVE PROFILE
        </ThemedText>
        <Card style={styles.group}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Exports “{activeProfile?.name ?? 'the active profile'}” as an encrypted file. The API
            keys are encrypted with your username + password — only that exact combination can
            decrypt them on import. Re-enter your account password to confirm.
          </ThemedText>
          <TextField
            label="Account password"
            placeholder="Your account password"
            secureToggle
            autoCapitalize="none"
            autoCorrect={false}
            value={exportPassword}
            onChangeText={setExportPassword}
          />
          <GradientButton
            label={exporting ? 'Encrypting…' : 'Generate export'}
            variant="accent"
            disabled={exporting}
            onPress={handleExport}
          />
          {exportText.length > 0 && (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                Long-press the text below to select all and copy it, then save it somewhere safe.
              </ThemedText>
              {/*
                Keep the input EDITABLE so Android allows long-press selection
                (a non-editable TextInput is not focusable/selectable on Android),
                but swallow edits so the exported text can't actually be changed.
                Tapping selects-all and hides the soft keyboard.
              */}
              <TextInput
                style={styles.codeBox}
                value={exportText}
                multiline
                onChangeText={() => {}}
                selectTextOnFocus
                contextMenuHidden={false}
                showSoftInputOnFocus={false}
                scrollEnabled
              />
            </>
          )}
        </Card>

        {/* Import */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          IMPORT PROFILE
        </ThemedText>
        <Card style={styles.group}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Paste an exported profile below and enter the username + password it was exported with.
            It imports into a free slot, or asks which profile to overwrite when all {maxProfiles}{' '}
            are in use.
          </ThemedText>
          <TextInput
            style={styles.codeBox}
            value={importText}
            onChangeText={setImportText}
            multiline
            placeholder="Paste exported profile JSON here…"
            placeholderTextColor={Brand.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="Password (the file’s export password)"
            placeholder="Password the file was exported with"
            secureToggle
            autoCapitalize="none"
            autoCorrect={false}
            value={importPassword}
            onChangeText={setImportPassword}
          />
          <GradientButton
            label={importing ? 'Decrypting…' : 'Import profile'}
            variant="accent"
            disabled={importing}
            onPress={handleImport}
          />
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
  codeBox: {
    minHeight: 120,
    maxHeight: 220,
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    color: Brand.text,
    fontSize: 12,
    fontFamily: 'Courier',
    padding: Spacing.three,
    textAlignVertical: 'top',
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.four,
    marginTop: Spacing.two,
  },
});
