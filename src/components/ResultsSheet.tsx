import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { AssetBadge } from '@/components/AssetBadge';
import { ThemedText } from '@/components/themed-text';
import { GradientButton } from '@/components/ui/GradientButton';
import { Brand, Radius, Spacing } from '@/constants/theme';
import {
  ExecutionMode,
  ExecutionResults,
  OperationStatus,
  TransactionStatus,
} from '@/domain/types';

const STATUS_COLOR: Record<OperationStatus, string> = {
  [OperationStatus.SUCCESS]: Brand.success,
  [OperationStatus.PARTIAL_SUCCESS]: Brand.warning,
  [OperationStatus.FAILED]: Brand.danger,
};

const STATUS_LABEL: Record<OperationStatus, string> = {
  [OperationStatus.SUCCESS]: 'All withdrawals succeeded',
  [OperationStatus.PARTIAL_SUCCESS]: 'Partial success',
  [OperationStatus.FAILED]: 'Withdrawals failed',
};

function rowIcon(status: TransactionStatus) {
  switch (status) {
    case TransactionStatus.SUCCESS:
      return { icon: '✓', color: Brand.success };
    case TransactionStatus.FAILED:
      return { icon: '✕', color: Brand.danger };
    default:
      return { icon: '⧗', color: Brand.pending };
  }
}

export function ResultsSheet({
  results,
  onClose,
}: {
  results: ExecutionResults | null;
  onClose: () => void;
}) {
  const visible = !!results;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {results && (
            <>
              <View style={styles.handle} />
              <View style={styles.headerRow}>
                <ThemedText type="subtitle" style={styles.title}>
                  {results.mode === ExecutionMode.DRY_RUN ? 'Simulation Results' : 'Withdrawal Complete'}
                </ThemedText>
                <View
                  style={[styles.badge, { backgroundColor: STATUS_COLOR[results.overallStatus] + '22' }]}>
                  <ThemedText style={[styles.badgeText, { color: STATUS_COLOR[results.overallStatus] }]}>
                    {STATUS_LABEL[results.overallStatus]}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.summaryRow}>
                <Stat label="Succeeded" value={`${results.successCount}`} color={Brand.success} />
                <Stat label="Failed" value={`${results.failureCount}`} color={Brand.danger} />
                <Stat
                  label="Value"
                  value={`$${results.totalProcessed.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}`}
                  color={Brand.accent}
                />
              </View>

              <ScrollView style={styles.list} contentContainerStyle={{ gap: Spacing.two }}>
                {results.individualResults.map((r, i) => {
                  const { icon, color } = rowIcon(r.status);
                  const failed = r.status === TransactionStatus.FAILED;
                  const pending = r.status === TransactionStatus.PENDING;
                  // Both failed and pending rows carry an explanatory message
                  // that should display in full (multi-line); success rows show
                  // the tx id on a single line.
                  const showMessage = failed || pending;
                  return (
                    <View key={`${r.exchangeId}-${r.asset}-${i}`} style={styles.resultRow}>
                      <AssetBadge asset={r.asset} size={32} />
                      <View style={styles.resultInfo}>
                        <ThemedText style={styles.resultTitle}>
                          {r.asset} · {capitalize(r.exchangeId)}
                        </ThemedText>
                        <ThemedText
                          type="small"
                          themeColor="textSecondary"
                          style={failed ? styles.errorText : pending ? styles.pendingText : undefined}
                          selectable={showMessage}
                          numberOfLines={showMessage ? undefined : 1}>
                          {showMessage
                            ? r.errorMessage ?? (pending ? 'Pending confirmation' : 'Failed')
                            : r.transactionId ?? '—'}
                        </ThemedText>
                      </View>
                      <View style={styles.resultRight}>
                        <ThemedText style={styles.amount}>{r.amount}</ThemedText>
                        <ThemedText style={[styles.statusIcon, { color }]}>{icon}</ThemedText>
                      </View>
                    </View>
                  );
                })}
                {results.individualResults.length === 0 && (
                  <ThemedText themeColor="textSecondary" style={styles.empty}>
                    No assets met the minimum withdrawal thresholds. Nothing to withdraw.
                  </ThemedText>
                )}
              </ScrollView>

              <GradientButton label="Done" onPress={onClose} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText style={[styles.statValue, { color }]}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Brand.cardElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Brand.cardBorder,
    alignSelf: 'center',
  },
  headerRow: { gap: Spacing.two },
  title: { fontSize: 24, lineHeight: 30 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: Spacing.two, paddingVertical: 4, borderRadius: Radius.sm },
  badgeText: { fontSize: 13, fontWeight: '700' },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: Brand.card,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '800' },
  list: { maxHeight: 320 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    backgroundColor: Brand.card,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  resultInfo: { flex: 1, gap: 2 },
  resultTitle: { fontSize: 15, fontWeight: '600' },
  errorText: { color: Brand.danger, lineHeight: 18 },
  pendingText: { color: Brand.warning, lineHeight: 18 },
  resultRight: { alignItems: 'flex-end', gap: 2 },
  amount: { fontSize: 14, fontWeight: '600' },
  statusIcon: { fontSize: 16, fontWeight: '900' },
  empty: { textAlign: 'center', paddingVertical: Spacing.four },
});
