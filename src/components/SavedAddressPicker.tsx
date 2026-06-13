import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { SavedAddress } from '@/domain/types';

/** Truncate a long on-chain address to head…tail for display. */
function shortAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

/**
 * Bottom-sheet picker over an exchange's saved / whitelisted withdrawal
 * addresses, filtered to the asset being configured. Tapping an entry applies
 * it as the destination for the (exchange, asset). Falls back gracefully when
 * the exchange exposes no address book (manual entry remains available below
 * in the parent form).
 */
export function SavedAddressPicker({
  visible,
  asset,
  exchangeName,
  addresses,
  loading,
  onPick,
  onClose,
  onRefresh,
}: {
  visible: boolean;
  asset: string;
  exchangeName: string;
  addresses: SavedAddress[];
  loading: boolean;
  onPick: (addr: SavedAddress) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  // Show entries that are generic (asset == null) or match the asset symbol.
  const filtered = addresses.filter((a) => a.asset == null || a.asset === asset);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <View style={styles.head}>
            <View style={styles.flex}>
              <ThemedText style={styles.title}>Saved {asset} addresses</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Whitelisted on {exchangeName}
              </ThemedText>
            </View>
            <Pressable onPress={onRefresh} hitSlop={8} disabled={loading}>
              <ThemedText type="small" style={{ color: Brand.accent, fontWeight: '700' }}>
                {loading ? '…' : 'Refresh'}
              </ThemedText>
            </Pressable>
          </View>

          {loading && filtered.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator color={Brand.accent} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerHint}>
                Fetching address book…
              </ThemedText>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.center}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerHint}>
                No saved {asset} addresses found on {exchangeName}. Enter a recipient manually, or
                add one to the exchange&apos;s withdrawal whitelist first.
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item, i) => `${item.label}-${item.address}-${i}`}
              style={styles.list}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onPick(item);
                    onClose();
                  }}
                  style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
                  <View style={styles.flex}>
                    <View style={styles.itemTop}>
                      <ThemedText style={styles.itemLabel} numberOfLines={1}>
                        {item.label}
                      </ThemedText>
                      {item.verified && (
                        <View style={styles.verifiedTag}>
                          <ThemedText style={styles.verifiedText}>✓ verified</ThemedText>
                        </View>
                      )}
                    </View>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {item.krakenKey
                        ? `Kraken key · ${item.krakenKey}`
                        : item.address
                          ? shortAddress(item.address)
                          : '—'}
                      {item.network ? ` · ${item.network}` : ''}
                      {item.memo ? ` · memo ${item.memo}` : ''}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.chev}>›</ThemedText>
                </Pressable>
              )}
            />
          )}

          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}>
            <ThemedText style={styles.closeText}>Close</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Brand.cardElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    maxHeight: '75%',
    gap: Spacing.three,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Brand.cardBorder,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { fontSize: 17, fontWeight: '700' },
  list: { flexGrow: 0 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: Brand.cardBorder },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
  pressed: { opacity: 0.7 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  itemLabel: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  verifiedTag: {
    backgroundColor: Brand.successSoft,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  verifiedText: { fontSize: 10, fontWeight: '800', color: Brand.success },
  chev: { fontSize: 22, color: Brand.textMuted },
  center: { paddingVertical: Spacing.four, alignItems: 'center', gap: Spacing.two },
  centerHint: { textAlign: 'center', lineHeight: 18 },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    backgroundColor: Brand.inputBg,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
  },
  closeText: { fontSize: 15, fontWeight: '700', color: Brand.text },
});
