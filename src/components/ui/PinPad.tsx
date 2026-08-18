/**
 * Cake-Wallet-style PIN pad: a row of progress dots over a 3x4 grid of round
 * keys, with the biometric shortcut and backspace flanking the zero.
 *
 * Presentational only — it owns the entry buffer and the shake animation, and
 * hands a completed PIN to `onSubmit`. Everything about *what* the PIN means
 * (unwrapping, lockouts, confirmation flows) lives in the caller.
 *
 * There is no on-screen keyboard anywhere in this flow: a numeric pad is faster
 * one-handed, can't be shoulder-surfed off a text field, and keeps the digits
 * out of the OS keyboard's autocorrect/clipboard machinery.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Vibration,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Radius, Spacing } from '@/constants/theme';

/**
 * Light haptic tick, if the app happens to ship expo-haptics.
 *
 * Lazily required so this stays a zero-dependency component — the same pattern
 * `crypto.ts` uses for react-native-quick-crypto. Falls back to a very short
 * Android vibration, and to nothing at all on iOS, where `Vibration` is a
 * full-strength buzz that would be obnoxious on every keypress.
 */
const tick: () => void = (() => {
  try {
    const haptics = require('expo-haptics');
    const style = haptics?.ImpactFeedbackStyle?.Light;
    const impact = haptics?.impactAsync;
    if (typeof impact === 'function') {
      return () => {
        void impact(style).catch(() => {});
      };
    }
  } catch {
    // Not installed — fall through.
  }
  if (Platform.OS === 'android') return () => Vibration.vibrate(8);
  return () => {};
})();

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export interface PinPadProps {
  /** How many digits to collect. */
  length: number;
  /** Heading above the dots. */
  title: string;
  /** Supporting line under the heading. */
  subtitle?: string;
  /**
   * Error text. Setting this while a submitted PIN is awaiting a verdict also
   * shakes the dots. Pass a fresh `key` to the pad (not a new error string) when
   * you want the buffer reset for an unrelated reason.
   */
  error?: string | null;
  /** Disables all keys (during an unwrap, or while locked out). */
  disabled?: boolean;
  /** Called with the completed PIN once `length` digits are entered. */
  onSubmit: (pin: string) => void;
  /** Called on any keypress, so the caller can clear a stale error. */
  onEdit?: () => void;
  /** Renders the bottom-left biometric key when provided. */
  onBiometric?: () => void;
  /** Label for the biometric key (e.g. "Face ID"). */
  biometricLabel?: string;
  /** Optional action rendered under the pad (e.g. "Forgot PIN?"). */
  footer?: React.ReactNode;
}

export function PinPad({
  length,
  title,
  subtitle,
  error,
  disabled,
  onSubmit,
  onEdit,
  onBiometric,
  biometricLabel,
  footer,
}: PinPadProps) {
  /**
   * The buffer is emptied the moment a full PIN is submitted, and `pending`
   * keeps the dots looking full until the caller reports back.
   *
   * Doing it this way — rather than clearing the buffer when an error arrives —
   * is what makes two *identical* consecutive failures behave correctly. A
   * naive "did the error string change?" check silently ignores the second
   * "Incorrect PIN." in a row, leaving stale dots and no shake.
   */
  const [entry, setEntry] = useState('');
  const [pending, setPending] = useState(false);
  /** Bumped per failed attempt; drives the shake effect. */
  const [shakeSeq, setShakeSeq] = useState(0);
  // In state rather than a ref: the value is read during render (to build the
  // transform), and refs must not be touched there.
  const [shake] = useState(() => new Animated.Value(0));

  // The caller reported a failure for the attempt we were waiting on. Adjusted
  // during render rather than in an effect so the dots empty in the same commit
  // the error text appears in.
  if (pending && error) {
    setPending(false);
    setShakeSeq(shakeSeq + 1);
  }

  // The shake is a side effect on an external (animation) system, so it does
  // belong in an effect.
  useEffect(() => {
    if (shakeSeq === 0) return;
    Vibration.vibrate(Platform.OS === 'android' ? 40 : 400);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.6, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeSeq, shake]);

  // NB: the haptic tick and the auto-submit are deliberately OUTSIDE any
  // `setState` updater callback. React may invoke an updater more than once for
  // a single dispatch (StrictMode does exactly this in development), and a
  // submit fired from inside one would attempt the unlock twice — burning two
  // entries from the failed-attempt allowance for a single wrong PIN.
  const press = useCallback(
    (digit: string) => {
      if (disabled || pending || entry.length >= length) return;
      onEdit?.();
      tick();
      const next = entry + digit;
      if (next.length === length) {
        setEntry('');
        setPending(true);
        // Deferred a tick so this commit paints the last dot before the caller,
        // which may block for ~250ms deriving the key, takes over the thread.
        setTimeout(() => onSubmit(next), 0);
        return;
      }
      setEntry(next);
    },
    [disabled, pending, entry, length, onEdit, onSubmit]
  );

  const backspace = useCallback(() => {
    if (disabled || pending || entry.length === 0) return;
    onEdit?.();
    tick();
    setEntry(entry.slice(0, -1));
  }, [disabled, pending, entry, onEdit]);

  const filled = pending ? length : entry.length;
  const translateX = shake.interpolate({
    inputRange: [-1, 1],
    outputRange: [-12, 12],
  });

  return (
    <View style={styles.wrap}>
      <ThemedText type="subtitle" style={styles.title}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          {subtitle}
        </ThemedText>
      ) : null}

      <Animated.View style={[styles.dots, { transform: [{ translateX }] }]}>
        {Array.from({ length }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < filled && styles.dotFilled,
              error != null && styles.dotError,
            ]}
          />
        ))}
      </Animated.View>

      <View style={styles.errorSlot}>
        {error ? (
          <ThemedText type="small" style={styles.errorText}>
            {error}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.grid}>
        {KEYS.map((k) => (
          <Key key={k} label={k} onPress={() => press(k)} disabled={disabled} />
        ))}

        {onBiometric ? (
          <Key
            label="⊙"
            hint={biometricLabel}
            variant="aux"
            onPress={onBiometric}
            disabled={disabled}
          />
        ) : (
          <View style={styles.key} />
        )}

        <Key label="0" onPress={() => press('0')} disabled={disabled} />

        <Key
          label="⌫"
          variant="aux"
          onPress={backspace}
          disabled={disabled || filled === 0}
        />
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

function Key({
  label,
  hint,
  variant = 'digit',
  onPress,
  disabled,
}: {
  label: string;
  hint?: string;
  variant?: 'digit' | 'aux';
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ?? label}
      style={({ pressed }) => [
        styles.key,
        variant === 'digit' && styles.keyDigit,
        pressed && !disabled && styles.keyPressed,
        disabled && styles.keyDisabled,
      ]}>
      <ThemedText
        style={[styles.keyLabel, variant === 'aux' && styles.keyLabelAux]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const KEY_SIZE = 72;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.two },
  title: { textAlign: 'center', fontSize: 24, lineHeight: 30 },
  subtitle: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  dots: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.four,
    height: 18,
    alignItems: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Brand.textMuted,
  },
  dotFilled: { backgroundColor: Brand.accent, borderColor: Brand.accent },
  dotError: { borderColor: Brand.danger },
  // Fixed height so the pad doesn't jump when an error appears or clears.
  errorSlot: { height: 34, justifyContent: 'center', paddingHorizontal: Spacing.four },
  errorText: { color: Brand.danger, textAlign: 'center' },
  grid: {
    width: KEY_SIZE * 3 + Spacing.four * 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.four,
    justifyContent: 'center',
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDigit: {
    backgroundColor: Brand.card,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
  },
  keyPressed: { backgroundColor: Brand.cardElevated, opacity: 0.9 },
  keyDisabled: { opacity: 0.35 },
  keyLabel: { fontSize: 28, fontWeight: '500' },
  keyLabelAux: { fontSize: 24, color: Brand.textSecondary },
  footer: { marginTop: Spacing.three, alignItems: 'center' },
});
