import { GlassView } from 'expo-glass-effect';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type GlassEffectStyle = 'clear' | 'regular';

type GlassDestructiveButtonProps = {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Full-width destructive action with Liquid Glass surface and red label text.
 */
export function GlassDestructiveButton({ label, onPress, style }: GlassDestructiveButtonProps) {
  const { colors, radius, isDark, isGlass } = useTheme();
  const effectStyle: GlassEffectStyle = isDark ? 'clear' : 'regular';

  if (isGlass) {
    return (
      <GlassView
        style={[styles.surface, { borderRadius: radius.pill }, style]}
        glassEffectStyle={effectStyle}
        colorScheme={isDark ? 'dark' : 'light'}
        isInteractive>
        <Pressable style={styles.pressable} onPress={onPress} accessibilityRole='button' accessibilityLabel={label}>
          <ThemedText variant='headline' color='destructive'>
            {label}
          </ThemedText>
        </Pressable>
      </GlassView>
    );
  }

  return (
    <View style={[styles.surface, { borderRadius: radius.pill, backgroundColor: colors.secondaryFill }, style]}>
      <Pressable style={styles.pressable} onPress={onPress} accessibilityRole='button' accessibilityLabel={label}>
        <ThemedText variant='headline' color='destructive'>
          {label}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    overflow: 'hidden',
  },
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
});
