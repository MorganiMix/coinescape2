import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Radius, Spacing } from '@/constants/theme';

export function TextField({
  label,
  secureToggle,
  containerStyle,
  ...props
}: TextInputProps & { label?: string; secureToggle?: boolean; containerStyle?: any }) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
      )}
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <TextInput
          placeholderTextColor={Brand.textMuted}
          style={styles.input}
          secureTextEntry={secureToggle ? hidden : props.secureTextEntry}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        {secureToggle && (
          <Pressable hitSlop={8} onPress={() => setHidden((h) => !h)}>
            <ThemedText type="small" themeColor="textSecondary">
              {hidden ? 'Show' : 'Hide'}
            </ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one, alignSelf: 'stretch' },
  label: { marginLeft: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.cardBorder,
    paddingHorizontal: Spacing.three,
  },
  fieldFocused: { borderColor: Brand.accent },
  input: {
    flex: 1,
    color: Brand.text,
    fontSize: 15,
    paddingVertical: Spacing.three,
  },
});
