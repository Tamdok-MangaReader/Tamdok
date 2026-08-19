import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SourceHomeAlertBannerProps = {
  message: string;
  onDismiss?: () => void;
};

export function SourceHomeAlertBanner({ message, onDismiss }: SourceHomeAlertBannerProps) {
  const { colors, radius } = useTheme();

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: colors.secondaryFill,
          borderColor: colors.separator,
          borderRadius: radius.md,
        },
      ]}>
      <Ionicons name='alert-circle-outline' size={18} color={colors.destructive} style={styles.icon} />
      <ThemedText variant='footnote' color='label' style={styles.message}>
        {message}
      </ThemedText>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole='button' accessibilityLabel='Dismiss'>
          <Ionicons name='close' size={18} color={colors.tertiaryLabel} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    flexShrink: 0,
  },
  message: {
    flex: 1,
  },
});
