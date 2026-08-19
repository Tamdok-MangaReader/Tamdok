import { Pressable, StyleSheet, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';
import { ALL_CATEGORY_ID, type LibraryCategory } from '@/services/library';

type LibraryCategoryInlineProps = {
  categories: LibraryCategory[];
  selectedIds: string[];
  onToggleCategory: (categoryId: string) => void;
};

function categoryLabel(category: LibraryCategory): string {
  if (category.id === ALL_CATEGORY_ID) return t('library_category_all');
  return category.name;
}

export function LibraryCategoryInline({ categories, selectedIds, onToggleCategory }: LibraryCategoryInlineProps) {
  const { colors, radius } = useTheme();
  const userCategories = categories.filter((category) => category.id !== ALL_CATEGORY_ID);

  if (userCategories.length === 0) {
    return (
      <ThemedText variant='footnote' color='tertiaryLabel'>
        {t('library_category_picker_empty')}
      </ThemedText>
    );
  }

  return (
    <View style={styles.pillGrid}>
      {userCategories.map((category) => {
        const selected = selectedIds.includes(category.id);
        if (selected) {
          return (
            <Pressable
              key={category.id}
              style={[styles.pillActive, { borderRadius: radius.pill, backgroundColor: colors.tint }]}
              onPress={() => onToggleCategory(category.id)}
              accessibilityRole='button'>
              <ThemedText variant='subheadline' color='onTint' numberOfLines={1}>
                {categoryLabel(category)}
              </ThemedText>
            </Pressable>
          );
        }

        return (
          <GlassSurface key={category.id} borderRadius={radius.pill} interactive>
            <Pressable style={styles.pill} onPress={() => onToggleCategory(category.id)} accessibilityRole='button'>
              <ThemedText variant='subheadline' numberOfLines={1}>
                {categoryLabel(category)}
              </ThemedText>
            </Pressable>
          </GlassSurface>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pillActive: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});
