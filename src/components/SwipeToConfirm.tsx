import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Brand, Radius } from '@/constants/theme';

const THUMB = 56;
const PADDING = 4;
const TRACK_HEIGHT = THUMB + PADDING * 2;

/**
 * Swipe-to-confirm slider. The user must drag the thumb >=80% of the track
 * width to fire `onConfirm` (per the design's swipe-confirmation security
 * requirement). Releasing early springs back and cancels.
 */
export function SwipeToConfirm({
  label = 'Swipe to confirm',
  confirmedLabel = 'Releasing…',
  danger = true,
  onConfirm,
  disabled,
}: {
  label?: string;
  confirmedLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const translateX = useSharedValue(0);
  const maxTranslate = Math.max(0, trackWidth - THUMB - PADDING * 2);
  const accent = danger ? Brand.danger : Brand.accent;

  const fire = () => {
    setConfirmed(true);
    onConfirm();
  };

  const reset = () => {
    setConfirmed(false);
  };

  const pan = Gesture.Pan()
    .enabled(!disabled && !confirmed)
    .onUpdate((e) => {
      const x = Math.min(Math.max(0, e.translationX), maxTranslate);
      translateX.value = x;
    })
    .onEnd(() => {
      if (maxTranslate > 0 && translateX.value >= maxTranslate * 0.8) {
        translateX.value = withTiming(maxTranslate, { duration: 120 });
        runOnJS(fire)();
        // spring back shortly after firing so it can be reused
        translateX.value = withSpring(0, { damping: 18 }, () => {
          runOnJS(reset)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 18 });
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: translateX.value + THUMB + PADDING * 2,
  }));

  const labelStyle = useAnimatedStyle(() => {
    const progress = maxTranslate > 0 ? translateX.value / maxTranslate : 0;
    return { opacity: 1 - progress * 1.4 };
  });

  const trackStyle = useAnimatedStyle(() => {
    const progress = maxTranslate > 0 ? translateX.value / maxTranslate : 0;
    return {
      backgroundColor: interpolateColor(
        progress,
        [0, 1],
        [Brand.inputBg, danger ? Brand.dangerSoft : Brand.accentSoft]
      ),
    };
  });

  const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  return (
    <Animated.View style={[styles.track, trackStyle, disabled && styles.disabled]} onLayout={onLayout}>
      <Animated.View
        style={[styles.fill, fillStyle, { backgroundColor: danger ? Brand.dangerSoft : Brand.accentSoft }]}
      />
      <Animated.View style={[StyleSheet.absoluteFill, styles.labelWrap, labelStyle]} pointerEvents="none">
        <ThemedText style={[styles.label, { color: accent }]}>
          {confirmed ? confirmedLabel : label}
        </ThemedText>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.thumb, { backgroundColor: accent }, thumbStyle]}>
          <ThemedText style={styles.arrow}>›››</ThemedText>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  disabled: { opacity: 0.5 },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: Radius.pill,
  },
  labelWrap: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    margin: PADDING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { color: '#fff', fontSize: 18, fontWeight: '900' },
});
