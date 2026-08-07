import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AssetBadge } from '@/components/AssetBadge';
import { IpChangeWarning } from '@/components/IpChangeWarning';
import { NavMenu } from '@/components/NavMenu';
import { ResultsSheet } from '@/components/ResultsSheet';
import { SwipeToConfirm } from '@/components/SwipeToConfirm';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { Gradient } from '@/components/ui/Gradient';
import { Logo } from '@/components/ui/Logo';
import { Screen } from '@/components/ui/Screen';
import { StatusDot } from '@/components/ui/StatusDot';
import { Brand, Gradients, Radius, Spacing } from '@/constants/theme';
import { ExecutionMode } from '@/domain/types';
import { WITHDRAWAL_BUFFER_FRACTION, usdValue } from '@/domain/withdrawalEngine';
import { useAppStore } from '@/store/AppStore';

/** Compact asset amount formatting (more decimals for high-value coins). */
function fmtAmount(asset: string, amount: number): string {
  const decimals = amount >= 1 ? 4 : 6;
  return amount.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function fmtUsd(value: number): string {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export default function PanicScreen() {
  const {
    connectedExchanges,
    exchanges,
    mode,
    setMode,
    isExecuting,
    runEmergencyWithdrawal,
    lastResults,
    clearResults,
    totalsUsdByAsset,
    refreshBalances,
    isRefreshingBalances,
    allocations,
    liveBalances,
    priceUsd,
    enabledCountForExchange,
    refreshCurrentIp,
  } = useAppStore();

  const [armed, setArmed] = useState(false);
  const router = useRouter();

  /** Open Settings focused on a specific exchange's API configuration. */
  const openExchangeConfig = (id: string) => {
    router.push({ pathname: '/(app)/settings', params: { exchange: id } });
  };

  /**
   * Tap handler for the panic ring. Guard the two states where there's nothing
   * to withdraw — no exchange connected, or no coin selected — by prompting the
   * user (with a shortcut to Settings) instead of silently doing nothing.
   * Otherwise arm/disarm the emergency withdrawal.
   */
  const handlePanicPress = () => {
    if (connectedExchanges.length === 0) {
      Alert.alert(
        'Please connect an exchange',
        'You need at least one connected exchange before you can run an emergency withdrawal.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Connect exchange', onPress: () => router.push('/(app)/settings') },
        ]
      );
      return;
    }
    if (totalEnabledCoins === 0) {
      Alert.alert(
        'Please choose at least one coin to withdraw',
        'Select the coins to rescue in Settings → Emergency Coin Selection before running a panic.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Choose coins', onPress: () => router.push('/(app)/settings') },
        ]
      );
      return;
    }
    setArmed((a) => !a);
  };

  // Auto-fetch real balances when the panic screen opens / exchanges change.
  useEffect(() => {
    if (connectedExchanges.length > 0) {
      refreshBalances().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedExchanges.length]);

  // Refresh the current external IP on entry so IP-change warnings are current.
  useEffect(() => {
    void refreshCurrentIp();
  }, [refreshCurrentIp]);

  // Only the coins the user has ENABLED (checked) in the emergency selection —
  // and only where there's an actual balance to move — are shown/summed here.
  // A panic withdraws exactly this set, so the preview matches what will happen.
  const balanceRows = useMemo(() => {
    const byAsset: Record<string, number> = {};
    for (const [exchangeId, assetCfgs] of Object.entries(allocations.byExchange)) {
      const bals = liveBalances[exchangeId];
      if (!bals) continue;
      for (const [asset, cfg] of Object.entries(assetCfgs)) {
        if (!cfg?.enabled) continue;
        const amount = bals[asset] ?? 0;
        if (amount > 0) byAsset[asset] = (byAsset[asset] ?? 0) + amount;
      }
    }
    return Object.entries(byAsset)
      .map(([asset, amount]) => {
        // CoinGecko-first pricing (same as elsewhere), falling back to the
        // exchange-reported total, then a local estimate.
        const usd = priceUsd(asset, amount, totalsUsdByAsset[asset] ?? null) ?? usdValue(asset, amount);
        const estimated = priceUsd(asset, amount, totalsUsdByAsset[asset] ?? null) == null;
        return { asset, amount, usd, estimated };
      })
      .sort((a, b) => b.usd - a.usd);
  }, [allocations, liveBalances, priceUsd, totalsUsdByAsset]);

  // Total coins the user has enabled (checked) across connected exchanges.
  const totalEnabledCoins = connectedExchanges.reduce(
    (n, ex) => n + enabledCountForExchange(ex.id),
    0
  );

  const totalUsd = useMemo(
    () => balanceRows.reduce((sum, r) => sum + r.usd, 0),
    [balanceRows]
  );

  const handleConfirm = async () => {
    await runEmergencyWithdrawal();
    setArmed(false);
  };

  const isDryRun = mode === ExecutionMode.DRY_RUN;

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingBalances}
            onRefresh={() => refreshBalances().catch(() => {})}
            tintColor={Brand.accent}
            colors={[Brand.accent]}
          />
        }>
        {/* Header */}
        <View style={styles.header}>
          <Logo size={40} showWordmark />
          <View style={styles.headerRight}>
            <View style={styles.secureBadge}>
              <ThemedText style={styles.secureIcon}>🔒</ThemedText>
              <ThemedText type="small" style={{ color: Brand.success, fontWeight: '700' }}>
                Secure
              </ThemedText>
            </View>
            <NavMenu />
          </View>
        </View>

        {/* Connected Exchanges */}
        <View style={styles.sectionHead}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
            CONNECTED EXCHANGES
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {connectedExchanges.length}/{exchanges.length}
          </ThemedText>
        </View>
        <Card style={styles.exchangeCard}>
          {exchanges.map((ex, i) => (
            <Pressable
              key={ex.id}
              onPress={() => openExchangeConfig(ex.id)}
              style={({ pressed }) => [
                styles.exchangeRow,
                i < exchanges.length - 1 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}>
              <View style={styles.exchangeLeft}>
                <StatusDot status={ex.connectionStatus} />
                <ThemedText style={styles.exchangeName}>{ex.name}</ThemedText>
              </View>
              <View style={styles.exchangeRight}>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  style={{ color: ex.isConnected ? Brand.success : Brand.textMuted }}>
                  {ex.isConnected ? ex.apiKeyMasked ?? 'Connected' : 'Tap here to link'}
                </ThemedText>
                <ThemedText style={styles.rowChevron}>›</ThemedText>
              </View>
            </Pressable>
          ))}
        </Card>

        {/* IP-change warnings for connected exchanges (compact, tappable to fix). */}
        {connectedExchanges.map((ex) => (
          <Pressable key={`ipwarn-${ex.id}`} onPress={() => openExchangeConfig(ex.id)}>
            <IpChangeWarning id={ex.id} name={ex.name} compact />
          </Pressable>
        ))}

        {/* Panic Button */}
        <View style={styles.panicWrap}>
          <Pressable
            onPress={handlePanicPress}
            style={({ pressed }) => [pressed && { transform: [{ scale: 0.97 }] }]}>
            <Gradient colors={Gradients.panicRing} direction="vertical" style={styles.panicRing}>
              <View style={styles.panicInner}>
                <ThemedText style={styles.panicTitle}>COIN ESCAPE</ThemedText>
                <ThemedText style={styles.panicSub}>
                  {connectedExchanges.length === 0
                    ? 'Tap to connect an exchange'
                    : totalEnabledCoins === 0
                      ? 'Tap to choose coins to withdraw'
                      : armed
                        ? 'Swipe below to confirm'
                        : 'Tap to arm emergency withdrawal'}
                </ThemedText>
              </View>
            </Gradient>
          </Pressable>
          {connectedExchanges.length === 0 && (
            <Pressable onPress={() => router.push('/(app)/settings')} hitSlop={6}>
              <ThemedText type="small" style={styles.warnText}>
                Connect an exchange in Settings to enable withdrawals.
              </ThemedText>
            </Pressable>
          )}
        </View>

        {/* Swipe confirm appears when armed */}
        {armed && connectedExchanges.length > 0 && (
          <SwipeToConfirm
            danger={!isDryRun}
            label={isDryRun ? 'Swipe to simulate' : 'Swipe to withdraw everything'}
            confirmedLabel={isDryRun ? 'Simulating…' : 'Executing…'}
            onConfirm={handleConfirm}
            disabled={isExecuting}
          />
        )}

        {/* Live Balances */}
        <View style={styles.sectionHead}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
            BALANCES TO WITHDRAW
          </ThemedText>
          {balanceRows.length > 0 && (
            <ThemedText type="small" style={{ color: Brand.accent, fontWeight: '700' }}>
              {fmtUsd(totalUsd)}
            </ThemedText>
          )}
        </View>
        {balanceRows.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.bufferHint}>
            Panic withdraws {Math.round(WITHDRAWAL_BUFFER_FRACTION * 100)}% of each balance, leaving a
            buffer for network/withdrawal fees.
          </ThemedText>
        )}
        <Card>
          {connectedExchanges.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Connect an exchange in Settings to load balances.
            </ThemedText>
          ) : isRefreshingBalances && balanceRows.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Fetching balances from exchanges…
            </ThemedText>
          ) : balanceRows.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No coins selected to withdraw. Enable coins in Settings → Emergency Coin Selection
              (only checked coins with a balance appear here).
            </ThemedText>
          ) : (
            <View style={styles.balanceList}>
              {balanceRows.map((row, i) => (
                <View
                  key={row.asset}
                  style={[styles.balanceRow, i < balanceRows.length - 1 && styles.rowDivider]}>
                  <View style={styles.balanceLeft}>
                    <AssetBadge asset={row.asset} size={30} />
                    <View>
                      <ThemedText style={styles.assetSymbol}>{row.asset}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {fmtAmount(row.asset, row.amount)} {row.asset}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.balanceRight}>
                    <ThemedText type="small" style={{ color: Brand.accent, fontWeight: '700' }}>
                      {fmtUsd(row.usd)}
                    </ThemedText>
                    {row.estimated && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.estTag}>
                        est.
                      </ThemedText>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Mode Selection */}
        <View style={styles.sectionHead}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
            MODE SELECTION
          </ThemedText>
        </View>
        <View style={styles.modeWrap}>
          <ModeOption
            title="Dry Run"
            description="Simulate withdrawals safely. No funds move."
            selected={isDryRun}
            accent={Brand.accent}
            onPress={() => setMode(ExecutionMode.DRY_RUN)}
          />
          <ModeOption
            title="Real Withdrawal"
            description="Live execution. Irreversible. Funds leave exchanges."
            selected={!isDryRun}
            accent={Brand.danger}
            onPress={() => setMode(ExecutionMode.REAL_WITHDRAWAL)}
          />
        </View>
      </ScrollView>

      <ResultsSheet results={lastResults} onClose={clearResults} />
    </Screen>
  );
}

function ModeOption({
  title,
  description,
  selected,
  accent,
  onPress,
}: {
  title: string;
  description: string;
  selected: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      <Card
        style={[
          styles.modeOption,
          selected && { borderColor: accent, backgroundColor: accent + '14' },
        ]}>
        <View
          style={[styles.radio, { borderColor: selected ? accent : Brand.cardBorder }]}>
          {selected && <View style={[styles.radioDot, { backgroundColor: accent }]} />}
        </View>
        <View style={styles.modeText}>
          <ThemedText style={[styles.modeTitle, selected && { color: accent }]}>{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        </View>
      </Card>
    </Pressable>
  );
}

const PANIC_SIZE = 240;

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Brand.successSoft,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  secureIcon: { fontSize: 12 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  sectionLabel: { letterSpacing: 1, fontWeight: '700' },
  exchangeCard: { paddingVertical: Spacing.one },
  exchangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two + 2,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Brand.cardBorder },
  rowPressed: { opacity: 0.6 },
  exchangeLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  exchangeRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowChevron: { fontSize: 20, color: Brand.textMuted },
  exchangeName: { fontSize: 15, fontWeight: '600' },
  panicWrap: { alignItems: 'center', marginVertical: Spacing.three, gap: Spacing.two },
  panicRing: {
    width: PANIC_SIZE,
    height: PANIC_SIZE,
    borderRadius: PANIC_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    shadowColor: Brand.danger,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  panicInner: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: PANIC_SIZE / 2,
    backgroundColor: Brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderWidth: 2,
    borderColor: 'rgba(255,77,79,0.35)',
  },
  panicTitle: { fontSize: 26, fontWeight: '900', color: Brand.danger, letterSpacing: 1, textAlign: 'center'  },
  panicSub: { fontSize: 13, color: Brand.textSecondary, textAlign: 'center' },
  warnText: { color: Brand.warning, textAlign: 'center' },
  bufferHint: { lineHeight: 16, marginTop: -Spacing.one },
  balanceList: { gap: 0 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two + 2,
  },
  balanceLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  balanceRight: { alignItems: 'flex-end' },
  estTag: { fontSize: 10, opacity: 0.7 },
  assetSymbol: { fontSize: 14, fontWeight: '700' },
  modeWrap: { gap: Spacing.two },
  modeOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  modeText: { flex: 1, gap: 2 },
  modeTitle: { fontSize: 16, fontWeight: '700' },
});
