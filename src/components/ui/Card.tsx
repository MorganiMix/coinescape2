import { StyleSheet, View, type ViewProps } from 'react-native';

import { Brand, Radius, Spacing } from '@/constants/theme';

export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.card,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Brand.cardBorder,
    padding: Spacing.three,
  },
});
