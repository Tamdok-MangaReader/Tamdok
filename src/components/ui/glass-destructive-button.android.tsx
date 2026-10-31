import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type GlassDestructiveButtonProps = {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Full-width tonal destructive button with ripple. */
export function GlassDestructiveButton({ label, onPress, style }: GlassDestructiveButtonProps) {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.surface, { borderRadius: radius.pill, backgroundColor: colors.secondaryFill }, style]}>
      <Pressable
        style={styles.pressable}
        android_ripple={{ color: colors.quaternaryFill }}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}>
        <ThemedText variant="headline" color="destructive">
          {label}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { overflow: 'hidden' },
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
});
