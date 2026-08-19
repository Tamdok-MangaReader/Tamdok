import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { FilterValue, HomeFilterItem } from '@/parsers/shared/types';

type HomeFiltersSectionProps = {
  title?: string;
  subtitle?: string;
  items: HomeFilterItem[];
  onApplyFilters: (filters: FilterValue[]) => void;
};

export function HomeFiltersSection({ title, subtitle, items, onApplyFilters }: HomeFiltersSectionProps) {
  const { colors, radius } = useTheme();

  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      {(title || subtitle) && (
        <View style={styles.header}>
          {title ? <ThemedText variant='title3'>{title}</ThemedText> : null}
          {subtitle ? (
            <ThemedText variant='footnote' color='secondaryLabel'>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((item) => (
          <Pressable
            key={item.title}
            style={[styles.chip, { backgroundColor: colors.secondaryFill, borderRadius: radius.pill }]}
            onPress={() => onApplyFilters(item.filters)}>
            <ThemedText variant='subheadline' numberOfLines={1}>
              {item.title}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    gap: 2,
  },
  row: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxWidth: 220,
  },
});
