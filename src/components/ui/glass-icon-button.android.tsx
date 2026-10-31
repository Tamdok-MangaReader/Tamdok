import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type GlassIconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  disabled?: boolean;
  glassStyle?: 'clear' | 'regular';
  tintColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** Round tonal icon button with Material ripple. */
export function GlassIconButton({
  icon,
  onPress,
  size = 44,
  iconSize = 22,
  iconColor,
  disabled = false,
  tintColor,
  style,
  accessibilityLabel,
}: GlassIconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[
        styles.button,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tintColor ?? colors.secondaryFill },
        disabled && styles.disabled,
        style,
      ]}
      android_ripple={{ color: colors.quaternaryFill, borderless: false, radius: size / 2 }}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}>
      <Ionicons name={icon} size={iconSize} color={iconColor ?? colors.label} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  disabled: { opacity: 0.5 },
});
