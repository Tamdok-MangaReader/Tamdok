import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

type GlassButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  wide?: boolean;
  glassStyle?: 'clear' | 'regular';
  style?: StyleProp<ViewStyle>;
};

/** Material filled button (pill shape, ripple). */
export function GlassButton({ label, onPress, disabled = false, wide = false, style }: GlassButtonProps) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      style={[
        styles.button,
        { borderRadius: radius.pill, backgroundColor: disabled ? colors.quaternaryFill : colors.tint },
        wide && styles.wide,
        style,
      ]}
      android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button">
      <ThemedText variant="callout" color={disabled ? 'tertiaryLabel' : 'onTint'} style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wide: { width: '100%' },
  label: { fontWeight: '600', textAlign: 'center' },
});
