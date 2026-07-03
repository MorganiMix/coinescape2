import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, UIManager, View } from 'react-native';

import { AssetBadge } from '@/components/AssetBadge';
import { ExchangeSelector } from '@/components/ExchangeSelector';
import { ExchangeConnectForm } from '@/components/ExchangeConnectForm';
import { IpChangeWarning } from '@/components/IpChangeWarning';
import { NavMenu } from '@/components/NavMenu';
import { setLeaveGuard } from '@/components/navGuard';
import { ChainPicker } from '@/components/ChainPicker';
import { SavedAddressPicker } from '@/components/SavedAddressPicker';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Screen } from '@/components/ui/Screen';
import { StatusDot } from '@/components/ui/StatusDot';
import { TextField } from '@/components/ui/TextField';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { ASSET_META, ConnectionStatus, ExchangeId } from '@/domain/types';
import { EXCHANGE_GUIDES } from '@/domain/exchangeGuides';
import { hasAddressBook, hasChainSelection } from '@/exchange';
import { useAppStore } from '@/store/AppStore';

const FALLBACK_ASSETS = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'USDT', 'USDC', 'XRP'];

/** Compact coin amount (more decimals for sub-1 balances). */
function fmtAmount(amount: number): string {
  return amount.toLocaleString(undefined, { maximumFractionDigits: amount >= 1 ? 4 : 6 });
}

function fmtUsd(value: number): string {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 100 ? 2 : 0,
  });
}

export default function SettingsScreen() {
  const {
    exchanges,
    reconnectExchange,
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
    heldAssetsForExchange,
    liveBalances,
    priceUsd,
    refreshBalances,
    chainOptions,
    isFetchingChains,
    fetchChains,
    profiles,
    activeProfileId,
    allocations,
    allocationsDirty,
    saveAllocationsNow,
    revertAllocations,
    refreshCurrentIp,
  } = useAppStore();
  const router = useRouter();
  // Optional deep-link param from the home page: `?exchange=<id>` opens and
  // expands that exchange's API configuration directly.
  const { exchange: exchangeParam } = useLocalSearchParams<{ exchange?: string }>();
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;

  const [reconnecting, setReconnecting] = useState<Record<string, boolean>>({});
  // Which exchange's API-config card is expanded (null = all collapsed).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Which asset's saved-address picker is open (null = closed).
  const [pickerAsset, setPickerAsset] = useState<string | null>(null);
  // Which asset's chain/network picker is open (null = closed).
  const [chainPickerAsset, setChainPickerAsset] = useState<string | null>(null);

  // Enable smooth expand/collapse on Android.
  useEffect(() => {
    if (
      Platform.OS === 'android' &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Re-detect the current external IP on entry so IP-change warnings are fresh.
  useEffect(() => {
    void refreshCurrentIp();
  }, [refreshCurrentIp]);

  const toggleExpanded = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  // React to the deep-link param `?exchange=<id>`. Seeding LOCAL expand state
  // during render (for a value that changed since the last render) is fine, but
  // the cross-component side-effects — selecting the exchange in the store and
  // consuming the nav param — must run after commit, in an effect, to avoid
  // "update a component while rendering a different component" warnings.
  const [lastExchangeParam, setLastExchangeParam] = useState<string | null>(null);
  if (exchangeParam && exchangeParam !== lastExchangeParam) {
    setLastExchangeParam(exchangeParam);
    setExpandedId(exchangeParam);
  }
  useEffect(() => {
    if (!exchangeParam) return;
    if (connectedExchanges.some((ex) => ex.id === exchangeParam)) {
      setSelectedExchangeId(exchangeParam);
    }
    // Consume the param so returning to Settings via the menu doesn't re-expand.
    router.setParams({ exchange: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchangeParam]);

  const handleReconnect = async (id: string, name: string) => {
    setReconnecting((c) => ({ ...c, [id]: true }));
    try {
      const result = await reconnectExchange(id);
      if (!result.ok) {
        Alert.alert(
          'Reconnect failed',
          result.error ??
            `Could not re-establish the connection to ${name}. You may need to disconnect and enter fresh API credentials.`
        );
        return;
      }
      // Pull fresh balances now that the link is back up.
      refreshBalances().catch(() => {});
      if (result.canWithdraw === false) {
        Alert.alert(
          'Reconnected — but no WITHDRAW permission',
          `${name} is reconnected for balances, but this API key cannot withdraw. Emergency withdrawals will fail until you enable the WITHDRAW permission on the key.`
        );
      } else {
        Alert.alert('Reconnected', `${name} is connected again.`);
      }
    } finally {
      setReconnecting((c) => ({ ...c, [id]: false }));
    }
  };

  // ----- Per-exchange emergency coin selection -----
  const selectedExchange = connectedExchanges.find((ex) => ex.id === selectedExchangeId) ?? null;

  // Refresh live balances when the screen mounts / the connected set changes, so
  // the held-coin list and USD figures are populated.
  useEffect(() => {
    if (connectedExchanges.length > 0) refreshBalances().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedExchanges.length]);

  // Coins to offer: the exchange's featured/supported set PLUS every coin with a
  // non-zero balance on that exchange (so funds in unlisted coins aren't missed).
  const heldAssets = selectedExchangeId ? heldAssetsForExchange(selectedExchangeId) : [];
  // Stable string key for the held set so memos don't re-run on array identity.
  const heldKey = heldAssets.join(',');
  // Live balance for the selected exchange (amount per asset), for display + USD.
  const exchangeBalances = selectedExchangeId ? liveBalances[selectedExchangeId] ?? {} : {};

  const exchangeAssets = useMemo(() => {
    const featured =
      selectedExchange && selectedExchange.supportedAssets.length > 0
        ? selectedExchange.supportedAssets
        : FALLBACK_ASSETS;
    // Held coins first (these have balances), then the remaining featured coins.
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const a of [...heldKey.split(',').filter(Boolean), ...featured]) {
      if (!seen.has(a)) {
        seen.add(a);
        ordered.push(a);
      }
    }
    return ordered;
  }, [selectedExchange, heldKey]);

  // Number of coins held and their total USD value on the selected exchange.
  const heldSummary = useMemo(() => {
    const held = heldKey.split(',').filter(Boolean);
    let usd = 0;
    let priced = true;
    for (const asset of held) {
      const amount = exchangeBalances[asset] ?? 0;
      if (amount <= 0) continue;
      const v = priceUsd(asset, amount);
      if (v == null) priced = false;
      else usd += v;
    }
    return { count: held.length, usd, priced };
    // exchangeBalances is keyed by selectedExchangeId; heldKey + that id capture it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldKey, selectedExchangeId, priceUsd]);

  const exchangeAllocations = selectedExchangeId
    ? allocationsForExchange(selectedExchangeId)
    : {};
  // Whether the selected exchange exposes a readable saved-address book. When
  // false (Coinbase, OKX, KuCoin) the UI prompts for manual address entry.
  const exchangeHasAddressBook = selectedExchange ? hasAddressBook(selectedExchange.id) : false;
  // Whether the selected exchange exposes a per-asset network/chain list.
  const exchangeHasChainSelection = selectedExchange ? hasChainSelection(selectedExchange.id) : false;

  const openPicker = (asset: string) => {
    if (!selectedExchangeId) return;
    setPickerAsset(asset);
    // Fetch (or refresh) the address book lazily when the picker opens.
    if (!savedAddresses[selectedExchangeId]) {
      fetchWithdrawAddresses(selectedExchangeId).catch(() => {});
    }
  };

  const openChainPicker = (asset: string) => {
    if (!selectedExchangeId) return;
    setChainPickerAsset(asset);
    // Lazily fetch the available chains for this (exchange, asset) if not cached.
    if (!chainOptions[selectedExchangeId]?.[asset]) {
      fetchChains(selectedExchangeId, asset).catch(() => {});
    }
  };

  /** Human label for the currently-selected chain id, or null for default. */
  const chainLabelFor = (asset: string, networkId?: string): string | null => {
    if (!networkId) return null;
    const opts = selectedExchangeId ? chainOptions[selectedExchangeId]?.[asset] : undefined;
    const match = opts?.find((c) => c.id === networkId);
    return match?.label ?? networkId;
  };

  /**
   * Enabled coins across ALL connected exchanges that still lack a recipient,
   * labelled "EXCHANGE · ASSET". Used to validate a Save — every enabled coin
   * must have a destination before we persist.
   */
  const missingRecipientsAll = useMemo(() => {
    const out: string[] = [];
    for (const ex of connectedExchanges) {
      const cfgs = allocations.byExchange[ex.id] ?? {};
      for (const [asset, cfg] of Object.entries(cfgs)) {
        if (!cfg?.enabled) continue;
        const hasAddress = (cfg.address ?? '').trim().length > 0;
        const hasKraken = (cfg.krakenKey ?? '').trim().length > 0;
        if (!hasAddress && !hasKraken) out.push(`${ex.name} · ${asset}`);
      }
    }
    return out;
  }, [connectedExchanges, allocations]);

  /**
   * Validate + persist the coin selection. Saving with NO coins selected is
   * allowed, but any ENABLED coin must have a recipient — otherwise we block
   * (returning false) so the caller can keep the user on the page.
   */
  const saveSettings = useCallback(async (): Promise<boolean> => {
    if (missingRecipientsAll.length > 0) {
      Alert.alert(
        'Missing recipient',
        `Add a recipient (saved address or Kraken wallet name) for: ${missingRecipientsAll.join(
          ', '
        )}.`
      );
      return false;
    }
    await saveAllocationsNow();
    return true;
  }, [missingRecipientsAll, saveAllocationsNow]);

  const handleSave = async () => {
    if (await saveSettings()) {
      Alert.alert('Saved', 'Emergency settings stored securely.');
    }
  };

  // ── Unsaved-changes guard ────────────────────────────────────────────────
  // Keep the latest dirty/save/revert in a ref so the guard registered once can
  // always see current values without re-registering on every keystroke.
  const leaveStateRef = useRef({ allocationsDirty, saveSettings, revertAllocations });
  useEffect(() => {
    leaveStateRef.current = { allocationsDirty, saveSettings, revertAllocations };
  }, [allocationsDirty, saveSettings, revertAllocations]);

  const promptSaveThen = useCallback((proceed: () => void): boolean => {
    const { allocationsDirty: dirty, saveSettings: save, revertAllocations: revert } =
      leaveStateRef.current;
    if (!dirty) return false; // nothing to save — let navigation happen
    Alert.alert(
      'Save your changes?',
      'You have unsaved changes to your emergency coin selection.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: "Don't save",
          style: 'destructive',
          onPress: () => {
            revert();
            proceed();
          },
        },
        {
          text: 'Save',
          onPress: async () => {
            // Block leaving if validation fails (missing recipient) — stay put.
            if (await save()) proceed();
          },
        },
      ]
    );
    return true; // intercepted — we'll navigate ourselves after the choice
  }, []);

  // Register the leave-guard for NavMenu-driven navigation + sign-out.
  useEffect(() => setLeaveGuard(promptSaveThen), [promptSaveThen]);

  /** Run an in-page navigation through the unsaved-changes guard. */
  const guardedNav = useCallback(
    (nav: () => void) => {
      if (!promptSaveThen(nav)) nav();
    },
    [promptSaveThen]
  );

  // Android hardware back: intercept the same way.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      return promptSaveThen(() => {
        // On "Don't save"/"Save" we revert/persist, then go home.
        router.replace('/(app)/panic');
      });
    });
    return () => sub.remove();
  }, [promptSaveThen, router]);

  // Safety net: if this screen unmounts while still dirty (e.g. an unguarded
  // navigation path), discard the unsaved edits so a panic never uses them.
  useEffect(() => {
    return () => {
      if (leaveStateRef.current.allocationsDirty) {
        leaveStateRef.current.revertAllocations();
      }
    };
  }, []);

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
            API & Emergency Settings
          </ThemedText>
          <NavMenu />
        </View>

        {/* Active-profile indicator → Profiles screen */}
        {activeProfile && (
          <Pressable
            onPress={() => guardedNav(() => router.replace('/(app)/profiles'))}
            style={({ pressed }) => [styles.profileBar, pressed && { opacity: 0.7 }]}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              Active profile: <ThemedText style={styles.profileBarName}>{activeProfile.name}</ThemedText>
            </ThemedText>
            <ThemedText type="small" style={{ color: Brand.accent, fontWeight: '700' }}>
              Manage ›
            </ThemedText>
          </Pressable>
        )}

        {/* Exchange API config */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          EXCHANGE API CONFIGURATION
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionHint}>
          Tap an exchange to show its API key configuration.
        </ThemedText>
        <View style={styles.group}>
          {exchanges.map((ex) => {
            const expanded = expandedId === ex.id;
            return (
            <Card key={ex.id} style={styles.exchangeCard}>
              <Pressable
                onPress={() => toggleExpanded(ex.id)}
                style={({ pressed }) => [styles.exchangeHead, pressed && styles.pressed]}
                hitSlop={4}>
                <View style={styles.exchangeLeft}>
                  <StatusDot status={ex.connectionStatus} />
                  <ThemedText style={styles.exchangeName}>{ex.name}</ThemedText>
                </View>
                <View style={styles.exchangeHeadRight}>
                  <ThemedText
                    type="small"
                    style={{
                      color:
                        ex.connectionStatus === ConnectionStatus.ERROR
                          ? Brand.danger
                          : ex.isConnected
                            ? Brand.success
                            : Brand.textMuted,
                    }}>
                    {ex.connectionStatus === ConnectionStatus.ERROR
                      ? 'Disconnected'
                      : ex.connectionStatus === ConnectionStatus.CONNECTING
                        ? 'Connecting…'
                        : ex.isConnected
                          ? 'Connected'
                          : 'Not linked'}
                  </ThemedText>
                  <ThemedText style={[styles.chevron, expanded && styles.chevronOpen]}>
                    ›
                  </ThemedText>
                </View>
              </Pressable>

              {!expanded ? null : ex.isConnected ? (
                <View style={styles.connectedWrap}>
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
                  <IpChangeWarning id={ex.id} name={ex.name} />
                  {/* Recovery: the exchange dropped the link (key marked ERROR).
                      Reconnect re-validates the stored credentials — no re-entry. */}
                  {ex.connectionStatus === ConnectionStatus.ERROR && (
                    <>
                      <View style={styles.reconnectNotice}>
                        <ThemedText style={styles.reconnectIcon}>⚠️</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                          {ex.name} dropped the connection. Reconnect to re-establish it using your
                          stored API key.
                        </ThemedText>
                      </View>
                      <GradientButton
                        label={reconnecting[ex.id] ? 'Reconnecting…' : 'Reconnect'}
                        variant="accent"
                        disabled={reconnecting[ex.id]}
                        style={styles.connectBtn}
                        onPress={() => handleReconnect(ex.id, ex.name)}
                      />
                    </>
                  )}
                </View>
              ) : (
                <View style={styles.connectForm}>
                  {EXCHANGE_GUIDES[ex.id] && (
                    <Pressable
                      onPress={() =>
                        guardedNav(() =>
                          router.push({ pathname: '/(app)/exchange-guide', params: { exchange: ex.id } })
                        )
                      }
                      style={({ pressed }) => [styles.guideLink, pressed && styles.pressed]}
                      hitSlop={4}>
                      <ThemedText style={styles.guideLinkIcon}>📘</ThemedText>
                      <ThemedText type="small" style={styles.guideLinkText}>
                        How to connect {ex.name} →
                      </ThemedText>
                    </Pressable>
                  )}
                  <ExchangeConnectForm
                    id={ex.id}
                    name={ex.name}
                    onConnected={(id) => {
                      setSelectedExchangeId(id);
                      // Warm the address book for exchanges that expose one.
                      if (hasAddressBook(id)) fetchWithdrawAddresses(id).catch(() => {});
                    }}
                  />
                </View>
              )}
            </Card>
            );
          })}
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

        {/* Held-balance summary: coins detected + their total USD (CoinGecko). */}
        {selectedExchange && heldSummary.count > 0 && (
          <View style={styles.heldSummary}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {heldSummary.count} {heldSummary.count === 1 ? 'coin' : 'coins'} with a balance on{' '}
              {selectedExchange.name}
            </ThemedText>
            <ThemedText style={styles.heldSummaryUsd}>
              {heldSummary.priced ? '' : '~'}
              {fmtUsd(heldSummary.usd)}
            </ThemedText>
          </View>
        )}

        {!selectedExchange ? null : (
          <View style={styles.group}>
            {exchangeAssets.map((asset) => {
              const cfg = exchangeAllocations[asset];
              const enabled = cfg?.enabled ?? false;
              const address = (cfg?.address ?? '').trim();
              const krakenKey = (cfg?.krakenKey ?? '').trim();
              const hasDest = address.length > 0 || krakenKey.length > 0;
              const balance = exchangeBalances[asset] ?? 0;
              const balanceUsd = balance > 0 ? priceUsd(asset, balance) : null;
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
                    {balance > 0 && (
                      <View style={styles.coinBalance}>
                        <ThemedText style={styles.coinBalanceAmount} numberOfLines={1}>
                          {fmtAmount(balance)} {asset}
                        </ThemedText>
                        {balanceUsd != null && (
                          <ThemedText type="small" themeColor="textSecondary">
                            {fmtUsd(balanceUsd)}
                          </ThemedText>
                        )}
                      </View>
                    )}
                    <View style={[styles.checkbox, enabled && styles.checkboxOn]}>
                      {enabled && <ThemedText style={styles.checkMark}>✓</ThemedText>}
                    </View>
                  </Pressable>

                  {enabled && (
                    <View style={styles.destControls}>
                      {/* Saved-address picker — only when the exchange exposes a
                          readable address-book API. Otherwise tell the user to
                          enter the (already-whitelisted) address manually. */}
                      {exchangeHasAddressBook ? (
                        <>
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
                        </>
                      ) : (
                        <View style={styles.manualNotice}>
                          <ThemedText style={styles.manualNoticeIcon}>✍️</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                            {selectedExchange.name} doesn&apos;t share its saved-address list over the
                            API. Enter the recipient address manually below — make sure it&apos;s one
                            you&apos;ve already whitelisted on {selectedExchange.name}.
                          </ThemedText>
                        </View>
                      )}
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
                      {/* Network/chain selector — only for chain-capable exchanges. */}
                      {exchangeHasChainSelection && (
                        <Pressable
                          onPress={() => openChainPicker(asset)}
                          style={({ pressed }) => [styles.pickerBtn, pressed && styles.pressed]}>
                          <View style={styles.flex}>
                            <ThemedText type="small" themeColor="textSecondary" style={styles.pickerLabel}>
                              Network for {asset}
                            </ThemedText>
                            <ThemedText style={styles.pickerValue} numberOfLines={1}>
                              {chainLabelFor(asset, cfg?.network) ?? 'Exchange default →'}
                            </ThemedText>
                          </View>
                          <ThemedText style={styles.pickerChev}>›</ThemedText>
                        </Pressable>
                      )}
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
          label={allocationsDirty ? 'Save & Secure Settings' : 'Settings Saved'}
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

      {/* Network/chain picker sheet */}
      {selectedExchange && (
        <ChainPicker
          visible={chainPickerAsset != null}
          asset={chainPickerAsset ?? ''}
          exchangeName={selectedExchange.name}
          chains={
            chainPickerAsset
              ? chainOptions[selectedExchange.id]?.[chainPickerAsset] ?? []
              : []
          }
          selectedId={
            chainPickerAsset
              ? exchangeAllocations[chainPickerAsset]?.network
              : undefined
          }
          loading={
            chainPickerAsset
              ? !!isFetchingChains[`${selectedExchange.id}:${chainPickerAsset}`]
              : false
          }
          onPick={(id) => {
            if (chainPickerAsset) {
              // Empty id clears the override (store undefined, not '') so the
              // engine/adapters treat it as "no chain" → exchange default.
              updateAllocation(selectedExchange.id, chainPickerAsset, {
                network: id || undefined,
              });
            }
          }}
          onClose={() => setChainPickerAsset(null)}
          onRefresh={() => {
            if (chainPickerAsset) fetchChains(selectedExchange.id, chainPickerAsset).catch(() => {});
          }}
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
  profileBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  profileBarName: { color: Brand.text, fontWeight: '700' },
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
  exchangeHeadRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chevron: { fontSize: 22, color: Brand.textMuted, transform: [{ rotate: '90deg' }] },
  chevronOpen: { transform: [{ rotate: '270deg' }] },
  exchangeLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  exchangeName: { fontSize: 16, fontWeight: '700' },
  connectedWrap: { gap: Spacing.two },
  connectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reconnectNotice: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.danger,
    padding: Spacing.two,
  },
  reconnectIcon: { fontSize: 14 },
  connectForm: { gap: Spacing.two },
  guideLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.accentSoft,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  guideLinkIcon: { fontSize: 14 },
  guideLinkText: { color: Brand.accent, fontWeight: '700', flex: 1 },
  connectBtn: { minHeight: 44 },
  totpHint: { lineHeight: 16 },
  coinCard: { gap: Spacing.three },
  coinCardActive: { borderColor: Brand.accent },
  coinHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  coinNameWrap: { flex: 1 },
  coinSymbol: { fontSize: 15, fontWeight: '700' },
  coinBalance: { alignItems: 'flex-end' },
  coinBalanceAmount: { fontSize: 14, fontWeight: '600' },
  heldSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  heldSummaryUsd: { fontSize: 15, fontWeight: '800', color: Brand.accent },
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
  manualNotice: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    padding: Spacing.two,
  },
  manualNoticeIcon: { fontSize: 14 },
  sectionHint: { lineHeight: 16, marginTop: 2 },
  addrWarn: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three, alignItems: 'flex-start' },
  warnIcon: { fontSize: 14 },
});
