import { useRouter, useSegments } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useAppStore } from '@/store/AppStore';

type RouteName = 'panic' | 'settings' | 'profiles' | 'guide';

const ITEMS: { name: RouteName; label: string; glyph: string }[] = [
  { name: 'panic', label: 'Panic', glyph: '🛑' },
  { name: 'settings', label: 'Settings', glyph: '⚙️' },
  { name: 'profiles', label: 'Profiles', glyph: '💾' },
  { name: 'guide', label: 'Setup Guide', glyph: '📘' },
];

/**
 * Top-right corner navigation menu. Replaces the bottom tab bar — tapping the
 * button opens a dropdown anchored to the top-right that switches routes and
 * offers sign-out.
 */
export function NavMenu() {
  const router = useRouter();
  const segments = useSegments();
  const { signOut } = useAppStore();
  const [open, setOpen] = useState(false);

  const current = (segments[segments.length - 1] as RouteName) ?? 'panic';

  const go = (name: RouteName) => {
    setOpen(false);
    router.replace(`/(app)/${name}`);
  };

  const handleSignOut = () => {
    setOpen(false);
    signOut();
    router.replace('/sign-in');
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
        <View style={styles.bars}>
          <View style={styles.bar} />
          <View style={styles.bar} />
          <View style={styles.bar} />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            {ITEMS.map((item) => {
              const active = current === item.name;
              return (
                <Pressable
                  key={item.name}
                  onPress={() => go(item.name)}
                  style={({ pressed }) => [
                    styles.item,
                    active && styles.itemActive,
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText style={styles.glyph}>{item.glyph}</ThemedText>
                  <ThemedText style={[styles.itemLabel, active && { color: Brand.accent }]}>
                    {item.label}
                  </ThemedText>
                  {active && <View style={styles.activeDot} />}
                </Pressable>
              );
            })}

            <View style={styles.divider} />

            <Pressable
              onPress={handleSignOut}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <ThemedText style={styles.glyph}>↩︎</ThemedText>
              <ThemedText style={[styles.itemLabel, { color: Brand.danger }]}>Sign Out</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Brand.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Brand.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: { gap: 4 },
  bar: { width: 18, height: 2, borderRadius: 1, backgroundColor: Brand.text },
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  menu: {
    position: 'absolute',
    top: Spacing.six,
    right: Spacing.three,
    minWidth: 200,
    backgroundColor: Brand.cardElevated,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Brand.cardBorder,
    padding: Spacing.one,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
  },
  itemActive: { backgroundColor: Brand.accentSoft },
  glyph: { fontSize: 16, width: 22, textAlign: 'center' },
  itemLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.accent },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Brand.cardBorder, marginVertical: 2 },
});
