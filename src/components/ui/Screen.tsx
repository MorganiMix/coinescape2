import { StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Gradient } from '@/components/ui/Gradient';
import { Gradients } from '@/constants/theme';

export function Screen({
  children,
  edges = ['top', 'bottom'],
  style,
}: {
  children: React.ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
}) {
  return (
    <Gradient colors={Gradients.background} style={styles.gradient}>
      <SafeAreaView edges={edges} style={[styles.safe, style]}>
        {children}
      </SafeAreaView>
    </Gradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
});
