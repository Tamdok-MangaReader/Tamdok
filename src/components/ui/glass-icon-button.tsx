import { GlassView } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type GlassEffectStyle = 'clear' | 'regular';

type GlassIconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  disabled?: boolean;
  glassStyle?: GlassEffectStyle;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * Circular icon button with native Liquid Glass on iOS 26+.
 */
export function GlassIconButton({
  icon,
  onPress,
  size = 44,
  iconSize = 22,
  iconColor,
  disabled = false,
  glassStyle,
  style,
  accessibilityLabel,
}: GlassIconButtonProps) {
  const { colors, radius, isDark, isGlass } = useTheme();
  const tint = iconColor ?? colors.label;
  const effectStyle: GlassEffectStyle = glassStyle ?? (isDark ? 'clear' : 'regular');

  if (isGlass) {
    return (
      <GlassView
        style={[styles.glass, { width: size, height: size, borderRadius: size / 2 }, style]}
        glassEffectStyle={effectStyle}
        isInteractive={!disabled}>
        <Pressable
          style={[styles.pressable, { width: size, height: size, borderRadius: size / 2 }]}
          onPress={onPress}
          disabled={disabled}
          accessibilityRole='button'
          accessibilityLabel={accessibilityLabel}>
          <Ionicons name={icon} size={iconSize} color={tint} />
        </Pressable>
      </GlassView>
    );
  }

  return (
    <Pressable
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: radius.md, backgroundColor: colors.secondaryFill },
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel}>
      <Ionicons name={icon} size={iconSize} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  glass: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
