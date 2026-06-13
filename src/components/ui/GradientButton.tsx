import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Gradient } from '@/components/ui/Gradient';
import { Brand, Gradients, Radius, Spacing } from '@/constants/theme';

type Variant = 'accent' | 'danger' | 'outline' | 'ghost';

export function GradientButton({
  label,
  onPress,
  variant = 'accent',
  disabled,
  loading,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}) {
  const isGradient = variant === 'accent' || variant === 'danger';
  const colors = variant === 'danger' ? Gradients.danger : Gradients.accent;
  const textColor =
    variant === 'outline' || variant === 'ghost' ? Brand.text : Brand.bg;

  const content = (
    <View style={styles.content}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon}
          <ThemedText style={[styles.label, { color: textColor }]}>{label}</ThemedText>
        </>
      )}
    </View>
  );

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}>
      {isGradient ? (
        <Gradient colors={colors} direction="diagonal" style={styles.fill}>
          {content}
        </Gradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    minHeight: 52,
    justifyContent: 'center',
  },
  fill: { flex: 1, justifyContent: 'center' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  label: { fontSize: 16, fontWeight: '700' },
  outline: {
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    backgroundColor: Brand.inputBg,
  },
  ghost: { backgroundColor: 'transparent', minHeight: 44 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
});
