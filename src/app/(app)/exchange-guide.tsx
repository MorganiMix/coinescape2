import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ExchangeConnectForm } from '@/components/ExchangeConnectForm';
import { IpChangeWarning } from '@/components/IpChangeWarning';
import { NavMenu } from '@/components/NavMenu';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Screen } from '@/components/ui/Screen';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { ConnectionStatus } from '@/domain/types';
import { guideFor } from '@/domain/exchangeGuides';
import { isLiveSupported } from '@/exchange';
import { useAppStore } from '@/store/AppStore';

export default function ExchangeGuideScreen() {
  const router = useRouter();
  const { exchange } = useLocalSearchParams<{ exchange?: string }>();
  const id = exchange ?? 'other';
  const guide = guideFor(id);
  const { exchanges, currentIp, refreshCurrentIp } = useAppStore();

  const exchangeState = exchanges.find((ex) => ex.id === id);
  const isConnected = exchangeState?.isConnected ?? false;
  // Offer the inline connect form for real, live-supported exchanges (not the
  // generic "other" placeholder).
  const canConnectHere = id !== 'other' && isLiveSupported(id);

  // Current external IP comes from the store (single source, also drives the
  // IP-change warning). `ip` mirrors it; `ipLoading` is true until first result.
  const ip = currentIp;
  const [ipLoading, setIpLoading] = useState(currentIp == null);

  const loadIp = useCallback(async () => {
    setIpLoading(true);
    try {
      await refreshCurrentIp();
    } finally {
      setIpLoading(false);
    }
  }, [refreshCurrentIp]);

  // Refresh once on mount (store may already have it from another screen).
  useEffect(() => {
    let active = true;
    (async () => {
      await refreshCurrentIp().catch(() => {});
      if (active) setIpLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refreshCurrentIp]);

  const goSettings = () => {
    // Deep-link into Settings with the card auto-expanded (to pick coins).
    router.replace({ pathname: '/(app)/settings', params: { exchange: id } });
  };

  // No dedicated guide for this id (e.g. "Other") — send the user to Settings.
  if (!guide) {
    return (
      <Screen>
        <View style={styles.emptyWrap}>
          <ThemedText type="subtitle" style={styles.title}>
            No guide for this exchange
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyHint}>
            Connect it directly in Settings using its API key and secret.
          </ThemedText>
          <GradientButton label="Open Settings" variant="accent" onPress={goSettings} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets>
        <View style={styles.header}>
          <View style={styles.flex}>
            <ThemedText type="subtitle" style={styles.title}>
              Connect {guide.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {guide.intro}
            </ThemedText>
          </View>
          <NavMenu />
        </View>

        <Pressable
          onPress={() => router.replace('/(app)/guide')}
          style={({ pressed }) => [styles.backLink, pressed && { opacity: 0.6 }]}
          hitSlop={6}>
          <ThemedText type="small" style={styles.backLinkText}>
            ‹ All exchange guides
          </ThemedText>
        </Pressable>

        {/* Permissions callout */}
        <View style={styles.permCard}>
          <ThemedText style={styles.permIcon}>🔐</ThemedText>
          <View style={styles.flex}>
            <ThemedText style={styles.permTitle}>Permissions</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {guide.permissionNote}
            </ThemedText>
          </View>
        </View>

        {/* Current external IP — for exchanges that support IP whitelisting. */}
        <View style={styles.ipCard}>
          <View style={styles.ipHeadRow}>
            <ThemedText style={styles.ipTitle}>🌐 Your current IP address</ThemedText>
            <Pressable onPress={loadIp} hitSlop={6} disabled={ipLoading}>
              <ThemedText type="small" style={styles.ipRefresh}>
                {ipLoading ? '…' : 'Refresh'}
              </ThemedText>
            </Pressable>
          </View>
          {ipLoading ? (
            <View style={styles.ipRow}>
              <ActivityIndicator size="small" color={Brand.accent} />
              <ThemedText type="small" themeColor="textSecondary">
                Detecting…
              </ThemedText>
            </View>
          ) : ip ? (
            <TextInput
              style={styles.ipValue}
              value={ip}
              editable={false}
              selectTextOnFocus
              showSoftInputOnFocus={false}
            />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Couldn’t detect your IP. Check your connection and tap Refresh.
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.ipHint}>
            If {guide.name} lets you restrict an API key to specific IPs, whitelist this address.
            Note it can change on mobile networks or when you switch Wi-Fi.
          </ThemedText>
        </View>

        {/* Warn if this exchange's key was set up from a different IP. */}
        <IpChangeWarning id={id} name={guide.name} />

        {/* Steps */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          STEPS
        </ThemedText>
        <Card style={styles.stepsCard}>
          {guide.steps.map((step, i) => (
            <View key={i} style={[styles.stepRow, i < guide.steps.length - 1 && styles.stepDivider]}>
              <View style={styles.stepNum}>
                <ThemedText style={styles.stepNumText}>{i + 1}</ThemedText>
              </View>
              <ThemedText style={styles.stepBody}>{step}</ThemedText>
            </View>
          ))}
        </Card>

        {/* What you'll paste */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          WHAT YOU&apos;LL ENTER
        </ThemedText>
        <Card style={styles.fieldsCard}>
          {guide.credentialFields.map((f) => (
            <View key={f} style={styles.fieldRow}>
              <ThemedText style={styles.fieldDot}>•</ThemedText>
              <ThemedText style={styles.fieldText}>{f}</ThemedText>
            </View>
          ))}
        </Card>

        {guide.tip && (
          <View style={styles.tipCard}>
            <ThemedText style={styles.tipIcon}>💡</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {guide.tip}
            </ThemedText>
          </View>
        )}

        {/* Connect inline — no need to go back to Settings just to paste keys. */}
        {canConnectHere && (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              CONNECT {guide.name.toUpperCase()}
            </ThemedText>
            {isConnected ? (
              <Card style={styles.connectedCard}>
                <ThemedText style={styles.connectedText}>
                  ✓ {guide.name} is connected
                  {exchangeState?.connectionStatus === ConnectionStatus.ERROR ? ' (needs attention)' : ''}
                </ThemedText>
                <GradientButton
                  label="Choose coins to withdraw"
                  variant="accent"
                  onPress={goSettings}
                  style={styles.cta}
                />
              </Card>
            ) : (
              <Card>
                <ExchangeConnectForm
                  id={id}
                  name={guide.name}
                  onConnected={() => {
                    // After connecting, jump to Settings to pick coins.
                    goSettings();
                  }}
                />
              </Card>
            )}
          </>
        )}

        {!canConnectHere && (
          <GradientButton
            label="Open Settings"
            variant="accent"
            onPress={goSettings}
            style={styles.cta}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.one },
  title: { fontSize: 24, lineHeight: 28 },
  backLink: { alignSelf: 'flex-start' },
  backLinkText: { color: Brand.accent, fontWeight: '700' },
  sectionLabel: { letterSpacing: 1, fontWeight: '700', marginTop: Spacing.two },
  permCard: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
    backgroundColor: Brand.accentSoft,
    borderRadius: Radius.md,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  permIcon: { fontSize: 16 },
  permTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  ipCard: {
    backgroundColor: Brand.card,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Brand.cardBorder,
    padding: Spacing.three,
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  ipHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ipTitle: { fontSize: 14, fontWeight: '700' },
  ipRefresh: { color: Brand.accent, fontWeight: '700' },
  ipRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  ipValue: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: Brand.text,
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  ipHint: { lineHeight: 16 },
  stepsCard: { gap: 0 },
  stepRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start', paddingVertical: Spacing.two + 2 },
  stepDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Brand.cardBorder },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Brand.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { fontSize: 13, fontWeight: '800', color: Brand.accent },
  stepBody: { flex: 1, fontSize: 15, lineHeight: 20 },
  fieldsCard: { gap: Spacing.two },
  fieldRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  fieldDot: { color: Brand.accent, fontSize: 16, fontWeight: '900' },
  fieldText: { fontSize: 15, fontWeight: '600' },
  tipCard: {
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    padding: Spacing.three,
    marginTop: Spacing.two,
    alignItems: 'flex-start',
  },
  tipIcon: { fontSize: 16 },
  cta: { marginTop: Spacing.three },
  emptyWrap: { flex: 1, justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  emptyHint: { lineHeight: 18 },
  connectedCard: { gap: Spacing.two },
  connectedText: { fontSize: 15, fontWeight: '700', color: Brand.success },
});
