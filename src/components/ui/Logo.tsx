import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/theme';

/**
 * "Coin Escape" mark — a running figure escaping through an open doorway
 * with a Bitcoin in hand, taken from the source PNG `assets/images/icon.png`
 * (generated from `coin-escape-icon.svg` by `scripts/generate-icons.js`).
 *
 * Kept as a raster render rather than rebuilt from Views so the figure stays
 * crisp at any size without pulling in a native SVG dependency. If the SVG
 * source changes, re-run the generator to refresh `icon.png` and the Logo
 * picks it up on the next bundle.
 */
export function Logo({ size = 56, showWordmark = false }: { size?: number; showWordmark?: boolean }) {
  const radius = size * 0.26;
  const frame: ViewStyle = { width: size, height: size, borderRadius: radius };

  return (
    <View style={styles.row}>
      <View style={[styles.frame, frame]}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          resizeMode="cover"
          // The PNG carries its own dark (#0f0f0f) canvas that blends with
          // the dark app background, so no tint is applied.
        />
      </View>

      {showWordmark && (
        <View style={styles.wordmarkWrap}>
          <ThemedText type="subtitle" style={styles.word}>
            COIN
          </ThemedText>
          <ThemedText type="subtitle" style={[styles.word, styles.wordEscape]}>
            ESCAPE
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  frame: {
    overflow: 'hidden',
    position: 'relative',
    // Match the source SVG's dark canvas so the rounded frame doesn't show
    // a brighter halo against the navy app background.
    backgroundColor: '#0f0f0f',
  },
  wordmarkWrap: { gap: -2 },
  word: { fontSize: 20, lineHeight: 22, fontWeight: '800', letterSpacing: 1.5, color: Brand.text },
  wordEscape: { color: Brand.danger, fontStyle: 'italic' },
});