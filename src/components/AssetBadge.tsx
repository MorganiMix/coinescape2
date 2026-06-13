import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ASSET_META } from '@/domain/types';

/** Small circular token badge with the asset's first letter. */
export function AssetBadge({ asset, size = 28 }: { asset: string; size?: number }) {
  const meta = ASSET_META[asset];
  const color = meta?.color ?? '#3C9FFE';
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}>
      <ThemedText style={[styles.letter, { fontSize: size * 0.42 }]}>
        {asset.slice(0, 1)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontWeight: '800' },
});
