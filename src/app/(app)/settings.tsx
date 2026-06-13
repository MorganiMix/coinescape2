import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AssetBadge } from '@/components/AssetBadge';
import { ExchangeSelector } from '@/components/ExchangeSelector';
import { NavMenu } from '@/components/NavMenu';
import { SavedAddressPicker } from '@/components/SavedAddressPicker';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Screen } from '@/components/ui/Screen';
import { StatusDot } from '@/components/ui/StatusDot';
import { TextField } from '@/components/ui/TextField';
import { Brand, Spacing } from '@/constants/theme';
import { ASSET_META, ExchangeId } from '@/domain/types';
import { REQUIRES_PASSPHRASE, REQUIRES_TOTP, isLiveSupported } from '@/exchange';
import { useAppStore } from '@/store/AppStore';

interface CredDraft {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  totpSecret: string;
}
const EMPTY_DRAFT: CredDraft = { apiKey: '', apiSecret: '', passphrase: '', totpSecret: '' };

const FALLBACK_ASSETS = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'USDT', 'USDC', 'XRP'];

export default function SettingsScreen() {
  const {
    exchanges,
    connectExchange,
    disconnectExchange,
    connectedExchanges,
    selectedExchangeId,
    setSelectedExchangeId,
    allocationsForExchange,
    enabledCountForExchange,
    toggleAsset,
    updateAllocation,
    applySavedAddress,
    savedAddresses,
    isFetchingAddresses,
    fetchWithdrawAddresses,
  } = useAppStore();

  const [drafts, setDrafts] = useState<Record<string, CredDraft>>({});
  const [connecting, setConnecting] = useState<Record<string, boolean>>({});
  // Which asset's saved-address picker is open (null = closed).
  const [pickerAsset, setPickerAsset] = useState<string | null>(null);

  const draftFor = (id: string): CredDraft => drafts[id] ?? EMPTY_DRAFT;
  const patchDraft = (id: string, patch: Partial<CredDraft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...draftFor(id), ...patch } }));

  const handleConnect = async (id: string, name: string) => {
    const draft = draftFor(id);
    const apiKey = draft.apiKey.trim();
    const apiSecret = draft.apiSecret.trim();
    const passphrase = draft.passphrase.trim();
    // Strip authenticator-app grouping spaces from the base32 2FA seed.
    const totpSecret = draft.totpSecret.replace(/\s/g, '');

    if (!isLiveSupported(id)) {
      Alert.alert('Not supported', `Live connection for ${name} is not available yet.`);
      return;
    }
    if (apiKey.length < 6 || apiSecret.length < 6) {
      Alert.alert(
        'Missing credentials',
        'Enter both the API key and secret (with WITHDRAW permission enabled).'
      );
      return;
    }
    if (REQUIRES_PASSPHRASE.has(id) && passphrase.length === 0) {
      Alert.alert('Passphrase required', `${name} requires the API passphrase you set when creating the key.`);
      return;
    }
    if (REQUIRES_TOTP.has(id) && totpSecret.length === 0) {
      Alert.alert(
        '2FA secret required',
        `${name} requires a 2FA code on every API withdrawal. Enter your Deribit 2FA secret (the base32 seed shown when you set up your authenticator) so panic withdrawals can complete automatically.`
      );
      return;
    }

    setConnecting((c) => ({ ...c, [id]: true }));
    try {
      const result = await connectExchange(id, {
        apiKey,
        apiSecret,
        passphrase: REQUIRES_PASSPHRASE.has(id) ? passphrase : undefined,
        totpSecret: REQUIRES_TOTP.has(id) ? totpSecret : undefined,
      });
      if (!result.ok) {
        Alert.alert('Connection failed', result.error ?? 'Could not verify these API credentials.');
        return;
      }
      setDrafts((d) => ({ ...d, [id]: EMPTY_DRAFT }));
      setSelectedExchangeId(id);
      // Warm the address book for the saved-address picker.
      fetchWithdrawAddresses(id).catch(() => {});
      if (result.canWithdraw === false) {
        Alert.alert(
          'Connected — but no WITHDRAW permission',
          `${name} is connected for balances, but this API key cannot withdraw. Emergency withdrawals will fail until you enable the WITHDRAW permission on the key.`
        );
      }
    } finally {
      setConnecting((c) => ({ ...c, [id]: false }));
    }
  };

  // ----- Per-exchange emergency coin selection -----
  const selectedExchange = connectedExchanges.find((ex) => ex.id === selectedExchangeId) ?? null;
  const exchangeAssets =
    selectedExchange && selectedExchange.supportedAssets.length > 0
      ? selectedExchange.supportedAssets
      : FALLBACK_ASSETS;
  const exchangeAllocations = selectedExchangeId
    ? allocationsForExchange(selectedExchangeId)
    : {};

  const openPicker = (asset: string) => {
    if (!selectedExchangeId) return;
    setPickerAsset(asset);
    // Fetch (or refresh) the address book lazily when the picker opens.
    if (!savedAddresses[selectedExchangeId]) {
      fetchWithdrawAddresses(selectedExchangeId).catch(() => {});
    }
  };

  // Enabled coins on the selected exchange that still lack a destination.
  const missingDestinations = selectedExchangeId
    ? exchangeAssets.filter((asset) => {
        const cfg = exchangeAllocations[asset];
        if (!cfg?.enabled) return false;
        const hasAddress = (cfg.address ?? '').trim().length > 0;
        const hasKraken = (cfg.krakenKey ?? '').trim().length > 0;
        return !hasAddress && !hasKraken;
      })
    : [];

  const handleSave = () => {
    if (connectedExchanges.length === 0) {
      Alert.alert('No exchanges connected', 'Connect an exchange before configuring an escape.');
      return;
    }
    const totalEnabled = connectedExchanges.reduce(
      (n, ex) => n + enabledCountForExchange(ex.id),
      0
    );
    if (totalEnabled === 0) {
      Alert.alert('No coins selected', 'Enable at least one coin on a connected exchange and set its recipient.');
      return;
    }
    if (missingDestinations.length > 0) {
      Alert.alert(
        'Missing recipient',
        `Add a recipient (saved address or Kraken wallet name) for: ${missingDestinations.join(', ')}.`
      );
      return;
    }
    Alert.alert('Saved', 'Emergency settings stored securely.');
  };

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <ThemedText type="subtitle" style={styles.pageTitle}>
            API & Emergency Settings
          </ThemedText>
          <NavMenu />
        </View>

        {/* Exchange API config */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          EXCHANGE API CONFIGURATION
        </ThemedText>
        <View style={styles.group}>
          {exchanges.map((ex) => (
            <Card key={ex.id} style={styles.exchangeCard}>
              <View style={styles.exchangeHead}>
                <View style={styles.exchangeLeft}>
                  <StatusDot status={ex.connectionStatus} />
                  <ThemedText style={styles.exchangeName}>{ex.name}</ThemedText>
                </View>
                <ThemedText
                  type="small"
                  style={{ color: ex.isConnected ? Brand.success : Brand.textMuted }}>
                  {ex.isConnected ? 'Connected' : 'Disconnected'}
                </ThemedText>
              </View>

              {ex.isConnected ? (
                <View style={styles.connectedRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    API Key {ex.apiKeyMasked}
                  </ThemedText>
                  <Pressable onPress={() => disconnectExchange(ex.id)} hitSlop={6}>
                    <ThemedText type="small" style={{ color: Brand.danger, fontWeight: '700' }}>
                      Disconnect
                    </ThemedText>
                  </Pressable>
                </View>
              ) : isLiveSupported(ex.id) ? (
                <View style={styles.connectForm}>
                  <TextField
                    placeholder={`${ex.name} API key`}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={draftFor(ex.id).apiKey}
                    onChangeText={(t) => patchDraft(ex.id, { apiKey: t })}
                  />
                  <TextField
                    placeholder={`${ex.name} API secret`}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureToggle
                    value={draftFor(ex.id).apiSecret}
                    onChangeText={(t) => patchDraft(ex.id, { apiSecret: t })}
                  />
                  {REQUIRES_PASSPHRASE.has(ex.id) && (
                    <TextField
                      placeholder="API passphrase"
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureToggle
                      value={draftFor(ex.id).passphrase}
                      onChangeText={(t) => patchDraft(ex.id, { passphrase: t })}
                    />
                  )}
                  {REQUIRES_TOTP.has(ex.id) && (
                    <>
                      <TextField
                        label="2FA secret (base32)"
                        placeholder="e.g. JBSWY3DPEHPK3PXP"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        secureToggle
                        value={draftFor(ex.id).totpSecret}
                        onChangeText={(t) => patchDraft(ex.id, { totpSecret: t })}
                      />
                      <ThemedText type="small" themeColor="textSecondary" style={styles.totpHint}>
                        {ex.name} requires a 2FA code on every API withdrawal. Paste the base32 seed
                        shown when you set up your authenticator (not the 6-digit code) — it&apos;s
                        stored encrypted and used to generate the code automatically during a panic.
                      </ThemedText>
                    </>
                  )}
                  <GradientButton
                    label={connecting[ex.id] ? 'Testing…' : 'Connect & Test'}
                    variant="outline"
                    disabled={connecting[ex.id]}
                    style={styles.connectBtn}
                    onPress={() => handleConnect(ex.id, ex.name)}
                  />
                </View>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Live connection for {ex.name} is coming soon.
                </ThemedText>
              )}
            </Card>
          ))}
        </View>

        {/* Emergency coin selection — scoped to the selected exchange */}
        <View style={styles.sectionHeadRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
            EMERGENCY COIN SELECTION
          </ThemedText>
          {selectedExchangeId && (
            <ThemedText type="small" themeColor="textSecondary">
              {enabledCountForExchange(selectedExchangeId)} selected
            </ThemedText>
          )}
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionHint}>
          Pick an exchange, then enable the coins that should escape from it and choose a recipient
          for each. Destinations are saved per exchange — the full balance of every enabled coin is
          withdrawn during a panic.
        </ThemedText>

        {/* Exchange selector */}
        <ExchangeSelector
          exchanges={connectedExchanges}
          selectedId={selectedExchangeId}
          onSelect={(id: ExchangeId) => setSelectedExchangeId(id)}
          enabledCountFor={enabledCountForExchange}
        />

        {!selectedExchange ? null : (
          <View style={styles.group}>
            {exchangeAssets.map((asset) => {
              const cfg = exchangeAllocations[asset];
              const enabled = cfg?.enabled ?? false;
              const address = (cfg?.address ?? '').trim();
              const krakenKey = (cfg?.krakenKey ?? '').trim();
              const hasDest = address.length > 0 || krakenKey.length > 0;
              return (
                <Card key={asset} style={[styles.coinCard, enabled && styles.coinCardActive]}>
                  <Pressable
                    style={styles.coinHead}
                    onPress={() => toggleAsset(selectedExchange.id, asset)}
                    hitSlop={4}>
                    <AssetBadge asset={asset} size={30} />
                    <View style={styles.coinNameWrap}>
                      <ThemedText style={styles.coinSymbol}>{asset}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {ASSET_META[asset]?.name ?? asset}
                      </ThemedText>
                    </View>
                    <View style={[styles.checkbox, enabled && styles.checkboxOn]}>
                      {enabled && <ThemedText style={styles.checkMark}>✓</ThemedText>}
                    </View>
                  </Pressable>

                  {enabled && (
                    <View style={styles.destControls}>
                      {/* Saved-address picker entry point */}
                      <Pressable
                        onPress={() => openPicker(asset)}
                        style={({ pressed }) => [styles.pickerBtn, pressed && styles.pressed]}>
                        <View style={styles.flex}>
                          <ThemedText type="small" themeColor="textSecondary" style={styles.pickerLabel}>
                            Recipient on {selectedExchange.name}
                          </ThemedText>
                          <ThemedText style={styles.pickerValue} numberOfLines={1}>
                            {krakenKey
                              ? `Kraken key · ${krakenKey}`
                              : address
                                ? address
                                : 'Choose a saved address →'}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.pickerChev}>›</ThemedText>
                      </Pressable>

                      <ThemedText type="small" themeColor="textSecondary" style={styles.orHint}>
                        …or enter a destination manually:
                      </ThemedText>
                      <TextField
                        label="Recipient address"
                        placeholder="0x… or bc1…"
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={cfg?.address ?? ''}
                        onChangeText={(t) => updateAllocation(selectedExchange.id, asset, { address: t })}
                      />
                      <TextField
                        label="Kraken wallet name (optional)"
                        placeholder="Whitelisted withdrawal key on Kraken"
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={cfg?.krakenKey ?? ''}
                        onChangeText={(t) => updateAllocation(selectedExchange.id, asset, { krakenKey: t })}
                      />
                      {!hasDest && (
                        <ThemedText type="small" style={styles.missingHint}>
                          No recipient set — this coin will be skipped during a panic.
                        </ThemedText>
                      )}
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}

        {/* Global irreversibility warning */}
        <View style={styles.addrWarn}>
          <ThemedText style={styles.warnIcon}>⚠️</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            Use self-custody wallets you control. Funds sent during a panic are irreversible.
          </ThemedText>
        </View>

        <GradientButton
          label="Save & Secure Settings"
          variant="accent"
          icon={<ThemedText style={{ fontSize: 16 }}>🔒</ThemedText>}
          onPress={handleSave}
          style={{ marginTop: Spacing.two }}
        />
      </ScrollView>

      {/* Saved-address picker sheet */}
      {selectedExchange && (
        <SavedAddressPicker
          visible={pickerAsset != null}
          asset={pickerAsset ?? ''}
          exchangeName={selectedExchange.name}
          addresses={savedAddresses[selectedExchange.id] ?? []}
          loading={!!isFetchingAddresses[selectedExchange.id]}
          onPick={(addr) => {
            if (pickerAsset) applySavedAddress(selectedExchange.id, pickerAsset, addr);
          }}
          onClose={() => setPickerAsset(null)}
          onRefresh={() => fetchWithdrawAddresses(selectedExchange.id).catch(() => {})}
        />
      )}
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
  sectionLabel: { letterSpacing: 1, fontWeight: '700', marginTop: Spacing.two },
  sectionHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  group: { gap: Spacing.two },
  exchangeCard: { gap: Spacing.three },
  exchangeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exchangeLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  exchangeName: { fontSize: 16, fontWeight: '700' },
  connectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  connectForm: { gap: Spacing.two },
  connectBtn: { minHeight: 44 },
  totpHint: { lineHeight: 16 },
  coinCard: { gap: Spacing.three },
  coinCardActive: { borderColor: Brand.accent },
  coinHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  coinNameWrap: { flex: 1 },
  coinSymbol: { fontSize: 15, fontWeight: '700' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Brand.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Brand.accent, borderColor: Brand.accent },
  checkMark: { color: Brand.bg, fontWeight: '900', fontSize: 13 },
  destControls: {
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.cardBorder,
    paddingTop: Spacing.three,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  pressed: { opacity: 0.7 },
  pickerLabel: { marginBottom: 1 },
  pickerValue: { fontSize: 14, fontWeight: '600' },
  pickerChev: { fontSize: 22, color: Brand.textMuted },
  orHint: { marginTop: Spacing.one },
  missingHint: { color: Brand.warning },
  sectionHint: { lineHeight: 16, marginTop: 2 },
  addrWarn: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three, alignItems: 'flex-start' },
  warnIcon: { fontSize: 14 },
});
