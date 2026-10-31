import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  compact?: boolean;
};

/** Material empty state: round tonal icon container, centered text. */
export function EmptyState({ icon, title, description, compact }: EmptyStateProps) {
  const { colors } = useTheme();
  const size = compact ? 52 : 88;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View
        style={[
          styles.iconWrap,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.tint + '26' },
        ]}>
        <Ionicons name={icon} size={compact ? 26 : 40} color={colors.tint} />
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
  container: { alignItems: 'center', paddingHorizontal: Spacing.xxl, gap: Spacing.sm },
  containerCompact: { gap: Spacing.xs, paddingVertical: Spacing.md },
  iconWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  title: { textAlign: 'center', fontWeight: '600' },
  description: { textAlign: 'center' },
});
