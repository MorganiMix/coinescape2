import { ScrollView, StyleSheet, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { StatusDot } from '@/components/ui/StatusDot';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { Exchange, ExchangeId } from '@/domain/types';

/**
 * Horizontal chip selector over the connected exchanges. The active chip drives
 * which exchange's emergency coin set is edited below. Each chip carries the
 * exchange's live connection status dot and its enabled-coin count.
 */
export function ExchangeSelector({
  exchanges,
  selectedId,
  onSelect,
  enabledCountFor,
}: {
  exchanges: Exchange[];
  selectedId: ExchangeId | null;
  onSelect: (id: ExchangeId) => void;
  enabledCountFor: (id: ExchangeId) => number;
}) {
  if (exchanges.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          Connect an exchange above to configure which coins escape from it.
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {exchanges.map((ex) => {
        const active = ex.id === selectedId;
        const count = enabledCountFor(ex.id);
        return (
          <Pressable
            key={ex.id}
            onPress={() => onSelect(ex.id)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.pressed,
            ]}>
            <StatusDot status={ex.connectionStatus} size={8} />
            <ThemedText style={[styles.chipLabel, active && styles.chipLabelActive]}>
              {ex.name}
            </ThemedText>
            {count > 0 && (
              <View style={[styles.badge, active && styles.badgeActive]}>
                <ThemedText style={[styles.badgeText, active && styles.badgeTextActive]}>
                  {count}
                </ThemedText>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two, paddingVertical: Spacing.one, paddingRight: Spacing.three },
  empty: {
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Brand.cardBorder,
    padding: Spacing.three,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Brand.card,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
  },
  chipActive: { backgroundColor: Brand.accentSoft, borderColor: Brand.accent },
  pressed: { opacity: 0.75 },
  chipLabel: { fontSize: 14, fontWeight: '700', color: Brand.textSecondary },
  chipLabelActive: { color: Brand.accent },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: Brand.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeActive: { backgroundColor: Brand.accent },
  badgeText: { fontSize: 11, fontWeight: '800', color: Brand.textSecondary },
  badgeTextActive: { color: Brand.bg },
});
