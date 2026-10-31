import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  // Smaller icon and spacing for places where the full-height variant would dominate the screen.
  compact?: boolean;
};

export function EmptyState({ icon, title, description, compact }: EmptyStateProps) {
  const { colors, radius } = useTheme();

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={[styles.iconWrap, compact && styles.iconWrapCompact, { borderRadius: radius.lg, backgroundColor: colors.quaternaryFill }]}>
        <Ionicons name={icon} size={compact ? 28 : 48} color={colors.tint} />
      </View>
      <ThemedText variant='title3' style={styles.title}>
        {title}
      </ThemedText>
      {!!description && (
        <ThemedText variant='subheadline' color='secondaryLabel' style={styles.description}>
          {description}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.sm,
  },
  containerCompact: {
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  iconWrapCompact: {
    width: 52,
    height: 52,
    marginBottom: Spacing.xs,
  },
  iconWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    textAlign: 'center',
    fontWeight: '600',
  },
  description: {
    textAlign: 'center',
    maxWidth: 280,
  },
});
