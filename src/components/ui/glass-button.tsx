import { GlassView } from 'expo-glass-effect';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

type GlassEffectStyle = 'clear' | 'regular';

type GlassButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  wide?: boolean;
  glassStyle?: GlassEffectStyle;
  style?: StyleProp<ViewStyle>;
};

/**
 * Primary action button with native Liquid Glass on iOS 26+.
 * Falls back to a filled system button on other platforms.
 */
export function GlassButton({ label, onPress, disabled = false, wide = false, glassStyle, style }: GlassButtonProps) {
  const { colors, radius, isDark, isGlass } = useTheme();
  const effectStyle: GlassEffectStyle = glassStyle ?? (isDark ? 'clear' : 'regular');

  if (isGlass) {
    return (
      <GlassView
        style={[styles.glass, { borderRadius: radius.pill }, wide && styles.wide, style]}
        glassEffectStyle={effectStyle}
        isInteractive={!disabled}>
        <Pressable
          style={[styles.pressable, wide && styles.wide]}
          onPress={onPress}
          disabled={disabled}
          accessibilityRole='button'>
          <ThemedText variant='callout' color={disabled ? 'tertiaryLabel' : 'label'} style={styles.label}>
            {label}
          </ThemedText>
        </Pressable>
      </GlassView>
    );
  }

  return (
    <Pressable
      style={[
        styles.fallback,
        { borderRadius: radius.md, backgroundColor: disabled ? colors.quaternaryFill : colors.tint },
        wide && styles.wide,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole='button'>
      <ThemedText variant='callout' color='onTint' style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  glass: {
    overflow: 'hidden',
  },
  pressable: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wide: {
    width: '100%',
  },
  label: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
