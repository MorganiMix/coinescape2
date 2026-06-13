import { StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Gradient } from '@/components/ui/Gradient';
import { Brand, Gradients } from '@/constants/theme';

/** Compact "CE" mark used in headers and the sign-in screen. */
export function Logo({ size = 56, showWordmark = false }: { size?: number; showWordmark?: boolean }) {
  const ring: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };
  return (
    <View style={styles.row}>
      <Gradient colors={Gradients.accent} direction="diagonal" style={[styles.ring, ring]}>
        <View style={[styles.inner, { borderRadius: size / 2 - 3 }]}>
          <ThemedText style={[styles.mark, { fontSize: size * 0.34 }]}>CE</ThemedText>
        </View>
      </Gradient>
      {showWordmark && (
        <ThemedText type="subtitle" style={styles.wordmark}>
          Coin Escape
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ring: { alignItems: 'center', justifyContent: 'center', padding: 3 },
  inner: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: Brand.bg,
    margin: 0,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { fontWeight: '800', color: Brand.accent, letterSpacing: 1 },
  wordmark: { fontSize: 22, lineHeight: 26 },
});
