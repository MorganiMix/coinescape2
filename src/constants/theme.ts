/**
 * Coin Escape design tokens.
 * The app is dark-first: a deep navy/charcoal canvas with teal-green accents
 * and a high-alert red used exclusively for the emergency panic action.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Brand palette shared regardless of color scheme. The app is intentionally
 * dark-only (it is a crisis tool), but we keep a `light`/`dark` map so the
 * existing `useTheme()`/`ThemedView` infrastructure keeps working.
 */
const palette = {
  // Backgrounds
  bg: '#0B1220', // app canvas (deep navy)
  bgGradientTop: '#0E1A2B',
  bgGradientBottom: '#070C15',
  card: '#121C2E', // elevated surface
  cardElevated: '#172439',
  cardBorder: '#1F2D44',
  inputBg: '#0E1726',

  // Text
  text: '#F4F7FB',
  textSecondary: '#8A97AC',
  textMuted: '#5E6B80',

  // Accents
  accent: '#16C79A', // teal-green primary
  accentDark: '#0E9E7A',
  accentSoft: 'rgba(22, 199, 154, 0.14)',
  info: '#3C9FFE',

  // Status
  success: '#16C79A',
  successSoft: 'rgba(22, 199, 154, 0.16)',
  warning: '#F5A623',
  danger: '#FF4D4F', // panic red
  dangerDark: '#C81E1F',
  dangerSoft: 'rgba(255, 77, 79, 0.16)',
  pending: '#3C9FFE',

  white: '#FFFFFF',
} as const;

export const Colors = {
  light: {
    text: palette.text,
    background: palette.bg,
    backgroundElement: palette.card,
    backgroundSelected: palette.cardElevated,
    textSecondary: palette.textSecondary,
  },
  dark: {
    text: palette.text,
    background: palette.bg,
    backgroundElement: palette.card,
    backgroundSelected: palette.cardElevated,
    textSecondary: palette.textSecondary,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Full brand palette for direct use in Coin Escape screens/components. */
export const Brand = palette;

/** Reusable gradient stops. */
export const Gradients = {
  background: [palette.bgGradientTop, palette.bgGradientBottom] as const,
  accent: ['#1FE3AE', '#0E9E7A'] as const,
  danger: ['#FF6B6B', '#C81E1F'] as const,
  panicRing: ['#FF4D4F', '#7A0E0F'] as const,
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
