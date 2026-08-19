import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
};

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  const { colors, radius } = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { borderRadius: radius.lg, backgroundColor: colors.quaternaryFill }]}>
        <Ionicons name={icon} size={48} color={colors.tint} />
      </View>
      <ThemedText variant='title3' style={styles.title}>
        {title}
      </ThemedText>
      {description && (
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
