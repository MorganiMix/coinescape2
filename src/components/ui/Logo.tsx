import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Radius } from '@/constants/theme';

/**
 * "Coin Escape" mark — a running figure escaping through an open doorway
 * with a Bitcoin in hand, taken from the source PNG `assets/images/icon.png`
 * (generated from `coin-escape-icon.svg` by `scripts/generate-icons.js`).
 *
 * Kept as a raster render rather than rebuilt from Views so the figure stays
 * crisp at any size without pulling in a native SVG dependency. If the SVG
 * source changes, re-run the generator to refresh `icon.png` and the Logo
 * picks it up on the next bundle.
 *
 * Visibility: the source PNG carries a near-black (#0f0f0f) canvas, which
 * blends into the dark navy app background (#0B1220 → #070C15). To make the
 * mark pop on dark, the frame is wrapped in a teal accent border + soft
 * outer glow so the silhouette is always readable at small sizes.
 */
export function Logo({ size = 56, showWordmark = false }: { size?: number; showWordmark?: boolean }) {
  const frame: ViewStyle = {
    width: size,
    height: size,
    borderRadius: Radius.lg,
    padding: Math.max(2, Math.round(size * 0.06)),
  };
  const innerRadius = frame.borderRadius as number;

  return (
    <View style={styles.row}>
      <View style={styles.frameOuter}>
        <View style={[styles.frameInner, frame]}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={[styles.icon, { borderRadius: innerRadius }]}
            resizeMode="cover"
          />
        </View>
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

const FRAME_BORDER = Math.max(1.5, 2);
const FRAME_GLOW = 10;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Outer wrapper hosts the glow + accent ring so they don't get clipped
  // by the rounded frame's overflow:hidden.
  frameOuter: {
    padding: FRAME_BORDER,
    borderRadius: Radius.lg + FRAME_BORDER + 2,
    borderWidth: FRAME_BORDER,
    borderColor: Brand.accent,
    // Soft teal glow so the dark canvas reads against the navy app background.
    shadowColor: Brand.accent,
    shadowOpacity: 0.55,
    shadowRadius: FRAME_GLOW,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  // Inner frame holds the PNG with overflow hidden for the rounded silhouette.
  frameInner: {
    overflow: 'hidden',
    position: 'relative',
    // The PNG canvas is #0f0f0f; a slightly lifted charcoal helps the figure
    // read on top of the app's deeper navy gradient.
    backgroundColor: '#0f0f0f',
  },
  icon: {
    width: '100%',
    height: '100%',
  },
  wordmarkWrap: { gap: 0 },
  word: { fontSize: 20, lineHeight: 22, fontWeight: '800', letterSpacing: 1.5, color: Brand.text },
  wordEscape: { color: Brand.danger, fontStyle: 'italic' },
});