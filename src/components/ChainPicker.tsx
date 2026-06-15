import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { ChainOption } from '@/exchange';

/**
 * Bottom-sheet picker over the withdrawal networks/chains available for an asset
 * on an exchange (fetched live from the exchange API). Selecting a chain sets it
 * as the destination network for the (exchange, asset). A top "Exchange default"
 * row clears the override so the exchange picks the asset's default network.
 *
 * Mirrors SavedAddressPicker's structure for visual consistency.
 */
export function ChainPicker({
  visible,
  asset,
  exchangeName,
  chains,
  selectedId,
  loading,
  onPick,
  onClose,
  onRefresh,
}: {
  visible: boolean;
  asset: string;
  exchangeName: string;
  chains: ChainOption[];
  /** Currently-selected chain id, or '' / undefined for the exchange default. */
  selectedId?: string;
  loading: boolean;
  /** Called with the chain id, or '' to clear the override (exchange default). */
  onPick: (id: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const usingDefault = !selectedId;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <View style={styles.head}>
            <View style={styles.flex}>
              <ThemedText style={styles.title}>Network for {asset}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Available on {exchangeName}
              </ThemedText>
            </View>
            <Pressable onPress={onRefresh} hitSlop={8} disabled={loading}>
              <ThemedText type="small" style={{ color: Brand.accent, fontWeight: '700' }}>
                {loading ? '…' : 'Refresh'}
              </ThemedText>
            </Pressable>
          </View>

          {/* Exchange-default row (clears any chosen override). */}
          <Pressable
            onPress={() => {
              onPick('');
              onClose();
            }}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
            <View style={styles.flex}>
              <ThemedText style={styles.itemLabel}>Exchange default (automatic)</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Let {exchangeName} pick the network
              </ThemedText>
            </View>
            {usingDefault && <ThemedText style={styles.check}>✓</ThemedText>}
          </Pressable>

          <View style={styles.sep} />

          {loading && chains.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator color={Brand.accent} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerHint}>
                Fetching networks…
              </ThemedText>
            </View>
          ) : chains.length === 0 ? (
            <View style={styles.center}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerHint}>
                No networks reported for {asset} on {exchangeName}. The exchange default will be used.
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={chains}
              keyExtractor={(item, i) => `${item.id}-${i}`}
              style={styles.list}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              renderItem={({ item }) => {
                const active = selectedId === item.id;
                return (
                  <Pressable
                    onPress={() => {
                      onPick(item.id);
                      onClose();
                    }}
                    style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
                    <View style={styles.flex}>
                      <View style={styles.itemTop}>
                        <ThemedText style={styles.itemLabel} numberOfLines={1}>
                          {item.label}
                        </ThemedText>
                        {item.isDefault && (
                          <View style={styles.defaultTag}>
                            <ThemedText style={styles.defaultText}>default</ThemedText>
                          </View>
                        )}
                      </View>
                    </View>
                    {active && <ThemedText style={styles.check}>✓</ThemedText>}
                  </Pressable>
                );
              }}
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
  check: { fontSize: 16, fontWeight: '800', color: Brand.accent },
  defaultTag: {
    backgroundColor: Brand.successSoft,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  defaultText: { fontSize: 10, fontWeight: '800', color: Brand.success },
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
