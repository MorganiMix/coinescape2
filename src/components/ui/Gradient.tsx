import { View, type ViewProps } from 'react-native';

type Direction = 'vertical' | 'horizontal' | 'diagonal';

const ANGLE: Record<Direction, string> = {
  vertical: '180deg',
  horizontal: '90deg',
  diagonal: '135deg',
};

/**
 * Lightweight gradient surface built on RN's `experimental_backgroundImage`
 * CSS-gradient support — no native module required (drop-in for the cases
 * where we previously used expo-linear-gradient).
 */
export function Gradient({
  colors,
  direction = 'vertical',
  style,
  children,
  ...rest
}: ViewProps & {
  colors: readonly string[];
  direction?: Direction;
}) {
  const stops = colors.join(', ');
  return (
    <View
      style={[
        { experimental_backgroundImage: `linear-gradient(${ANGLE[direction]}, ${stops})` },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}
