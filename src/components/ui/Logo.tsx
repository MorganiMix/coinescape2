import { StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Gradient } from '@/components/ui/Gradient';
import { Brand } from '@/constants/theme';

/** Crimson / high-alert gradient for the escape arrow + motion lines. */
const ESCAPE = ['#FF7A3C', '#E5142B'] as const;
/** Platinum coin body. */
const COIN = ['#FFFFFF', '#C9D2DE'] as const;

/**
 * "Coin Escape" mark — a platinum coin breaking up-and-out of a charcoal
 * exchange bracket, trailed by a crimson motion arrow pointing to safety
 * (up + right). Built from plain Views/Gradients so it stays razor-sharp at
 * any size with no native SVG dependency.
 */
export function Logo({ size = 56, showWordmark = false }: { size?: number; showWordmark?: boolean }) {
  const frame: ViewStyle = { width: size, height: size, borderRadius: size * 0.26 };
  // Geometry scales off `size`.
  const coinSize = size * 0.5;
  const bracketThickness = Math.max(2, size * 0.07);
  const bracketArm = size * 0.3;

  return (
    <View style={styles.row}>
      <View style={[styles.frame, frame]}>
        {/* Charcoal / gunmetal exchange box (the thing being escaped) */}
        <Gradient
          colors={['#2A3647', '#161E2B']}
          direction="diagonal"
          style={[StyleSheet.absoluteFill, { borderRadius: size * 0.26 }]}
        />

        {/* Bottom-left corner brackets = the centralized exchange "cage" */}
        <View
          style={[
            styles.bracketCorner,
            {
              left: size * 0.16,
              bottom: size * 0.16,
              width: bracketArm,
              height: bracketThickness,
              borderRadius: bracketThickness / 2,
            },
          ]}
        />
        <View
          style={[
            styles.bracketCorner,
            {
              left: size * 0.16,
              bottom: size * 0.16,
              width: bracketThickness,
              height: bracketArm,
              borderRadius: bracketThickness / 2,
            },
          ]}
        />

        {/* Crimson motion / trajectory arrow — launching up & to the right */}
        <View
          style={[
            styles.trail,
            {
              width: size * 0.5,
              height: bracketThickness,
              borderRadius: bracketThickness / 2,
              left: size * 0.12,
              top: size * 0.6,
            },
          ]}>
          <Gradient colors={ESCAPE} direction="horizontal" style={StyleSheet.absoluteFill} />
        </View>
        {/* Arrowhead at the trajectory's tip (up-right) */}
        <View
          style={[
            styles.arrowHead,
            {
              right: size * 0.16,
              top: size * 0.16,
              borderLeftWidth: size * 0.14,
              borderBottomWidth: size * 0.14,
            },
          ]}
        />

        {/* The escaping platinum coin, breaking out to the upper-right */}
        <Gradient
          colors={COIN}
          direction="diagonal"
          style={[
            styles.coin,
            {
              width: coinSize,
              height: coinSize,
              borderRadius: coinSize / 2,
              right: size * 0.12,
              top: size * 0.12,
            },
          ]}>
          <ThemedText style={[styles.mark, { fontSize: coinSize * 0.42 }]}>CE</ThemedText>
        </Gradient>
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
  frame: { overflow: 'hidden', position: 'relative' },
  bracketCorner: { position: 'absolute', backgroundColor: '#46566B' },
  trail: { position: 'absolute', overflow: 'hidden', opacity: 0.95 },
  arrowHead: {
    position: 'absolute',
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftColor: '#E5142B',
    borderBottomColor: 'transparent',
    borderTopColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
  },
  coin: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  mark: { fontWeight: '900', color: '#1A2230', letterSpacing: 0.5 },
  wordmarkWrap: { gap: -2 },
  word: { fontSize: 20, lineHeight: 22, fontWeight: '800', letterSpacing: 1.5, color: Brand.text },
  wordEscape: { color: Brand.danger, fontStyle: 'italic' },
});
