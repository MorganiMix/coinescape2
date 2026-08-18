/**
 * Stateful wrappers around {@link PinPad}: choosing a new PIN, and entering an
 * existing one.
 *
 * Split from the pad itself so the pad stays a dumb keypad and the multi-step
 * choreography (enter → confirm → mismatch → start over, or the lockout
 * countdown) lives in one place that both sign-in and Settings reuse.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PinPad } from '@/components/ui/PinPad';
import { Brand, Spacing } from '@/constants/theme';
import { PIN_LENGTH, checkPinStrength } from '@/security';

/**
 * Seconds remaining until `until` (epoch ms), ticking down live. 0 when there
 * is nothing to wait for.
 */
function useCountdown(until: number): number {
  // Tick a clock and derive the remaining time during render, rather than
  // storing `remaining` and recomputing it in an effect: that way a change to
  // `until` is reflected in the very next render instead of one frame later.
  //
  // The clock is re-read whenever `until` changes, not just on the interval. A
  // component that has been mounted for ten idle minutes has a ten-minute-stale
  // `now`, and without this a lockout starting at that moment would render an
  // absurd wait for a full second before the first tick corrected it.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until <= 0) return;
    const snap = () => setNow(Date.now());
    // The extra zero-delay snap matters: `now` is only advanced while a lockout
    // is running, so a screen that has been idle for ten minutes holds a
    // ten-minute-stale clock. Without correcting it immediately, a lockout
    // starting now would render an absurd wait until the first interval tick.
    // A timer callback rather than the effect body, which must not setState.
    const immediate = setTimeout(snap, 0);
    const id = setInterval(snap, 1000);
    return () => {
      clearTimeout(immediate);
      clearInterval(id);
    };
  }, [until]);

  if (until <= 0) return 0;
  return Math.max(0, Math.ceil((until - now) / 1000));
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

// ─────────────────────────────── create ─────────────────────────────────────

export function PinCreate({
  title = 'Create your PIN',
  subtitle = `This ${PIN_LENGTH}-digit PIN unlocks your vault on this device.`,
  confirmTitle = 'Confirm your PIN',
  busy,
  error,
  onComplete,
  onEditError,
  footer,
}: {
  title?: string;
  subtitle?: string;
  confirmTitle?: string;
  busy?: boolean;
  /** Error raised by the caller (e.g. the write failed). */
  error?: string | null;
  onComplete: (pin: string) => void;
  /** Called on keypress so the caller can clear its own error. */
  onEditError?: () => void;
  footer?: React.ReactNode;
}) {
  const [first, setFirst] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  /**
   * Bumped only when advancing from "choose" to "confirm", and used as the pad's
   * `key`. Advancing is a success, so the pad has no error to react to and needs
   * a remount to clear its dots. A mismatch deliberately does NOT bump it: the
   * pad stays mounted, sees the new error against its pending attempt, and gets
   * to shake.
   */
  const [round, setRound] = useState(0);

  const handleSubmit = useCallback(
    (pin: string) => {
      if (first === null) {
        // Reject weak PINs before the user types it a second time — being told
        // "pick another PIN" after confirming is needlessly annoying.
        const weak = checkPinStrength(pin);
        if (weak) {
          setLocalError(weak);
          return;
        }
        setLocalError(null);
        setFirst(pin);
        setRound(round + 1);
        return;
      }

      if (pin !== first) {
        // Send them back to the start: keeping the first entry after a mismatch
        // means confirming against a PIN they may have mistyped originally.
        setFirst(null);
        setLocalError('Those PINs didn’t match. Start again.');
        return;
      }

      setLocalError(null);
      onComplete(pin);
    },
    [first, round, onComplete]
  );

  return (
    <PinPad
      key={round}
      length={PIN_LENGTH}
      title={first === null ? title : confirmTitle}
      subtitle={first === null ? subtitle : 'Enter the same PIN once more.'}
      error={localError ?? error ?? null}
      disabled={busy}
      onSubmit={handleSubmit}
      onEdit={() => {
        if (localError) setLocalError(null);
        onEditError?.();
      }}
      footer={footer}
    />
  );
}

// ──────────────────────────────── enter ─────────────────────────────────────

export function PinUnlock({
  title = 'Enter your PIN',
  subtitle,
  busy,
  error,
  /** Epoch ms the vault is locked until; 0 when not locked out. */
  lockedUntil = 0,
  onSubmit,
  onEditError,
  onBiometric,
  biometricLabel,
  footer,
}: {
  title?: string;
  subtitle?: string;
  busy?: boolean;
  error?: string | null;
  lockedUntil?: number;
  onSubmit: (pin: string) => void;
  onEditError?: () => void;
  onBiometric?: () => void;
  biometricLabel?: string;
  footer?: React.ReactNode;
}) {
  const waiting = useCountdown(lockedUntil);
  const locked = waiting > 0;

  return (
    <PinPad
      length={PIN_LENGTH}
      title={title}
      subtitle={locked ? undefined : subtitle}
      error={locked ? null : error ?? null}
      disabled={busy || locked}
      onSubmit={onSubmit}
      onEdit={onEditError}
      onBiometric={locked ? undefined : onBiometric}
      biometricLabel={biometricLabel}
      footer={
        locked ? (
          <View style={styles.lockBox}>
            <ThemedText type="smallBold" style={styles.lockTitle}>
              Too many incorrect attempts
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.lockText}>
              Try again in {formatWait(waiting)}. Your vault is safe — nothing
              has been deleted.
            </ThemedText>
          </View>
        ) : (
          footer
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  lockBox: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
  lockTitle: { color: Brand.danger },
  lockText: { textAlign: 'center', lineHeight: 18 },
});
