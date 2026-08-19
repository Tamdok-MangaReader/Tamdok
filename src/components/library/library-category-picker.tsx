import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/card';
import { GlassSurface } from '@/components/ui/glass-surface';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';
import { ALL_CATEGORY_ID, type LibraryCategory } from '@/services/library';

type LibraryCategoryPickerProps = {
  visible: boolean;
  categories: LibraryCategory[];
  selectedIds: string[];
  onChange: (categoryIds: string[]) => void;
  onClose: () => void;
  onConfirm: (categoryIds: string[]) => void;
};

function categoryLabel(category: LibraryCategory): string {
  if (category.id === ALL_CATEGORY_ID) return t('library_category_all');
  return category.name;
}

export function LibraryCategoryPicker({
  visible,
  categories,
  selectedIds,
  onChange,
  onClose,
  onConfirm,
}: LibraryCategoryPickerProps) {
  const { colors, radius } = useTheme();
  const userCategories = categories.filter((category) => category.id !== ALL_CATEGORY_ID);

  const toggleCategory = (categoryId: string) => {
    onChange(
      selectedIds.includes(categoryId)
        ? selectedIds.filter((id) => id !== categoryId)
        : [...selectedIds, categoryId],
    );
  };

  return (
    <Modal visible={visible} animationType='slide' presentationStyle='pageSheet' onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: colors.systemBackground }]}>
        <View style={styles.header}>
          <GlassSurface borderRadius={radius.pill} interactive>
            <Pressable style={styles.headerButton} onPress={onClose}>
              <ThemedText variant='headline'>{t('cancel')}</ThemedText>
            </Pressable>
          </GlassSurface>
          <ThemedText variant='headline'>{t('manga_edit_categories')}</ThemedText>
          <GlassSurface borderRadius={radius.pill} interactive>
            <Pressable style={styles.headerButton} onPress={() => onConfirm(selectedIds)}>
              <ThemedText variant='headline' color='tint'>
                {t('done')}
              </ThemedText>
            </Pressable>
          </GlassSurface>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText variant='footnote' color='secondaryLabel'>
            {t('library_category_picker_hint')}
          </ThemedText>
          {userCategories.length === 0 ? (
            <Card style={styles.emptyCard}>
              <ThemedText variant='body' color='secondaryLabel'>
                {t('library_category_picker_empty')}
              </ThemedText>
            </Card>
          ) : (
            <Card style={styles.card}>
              {userCategories.map((category, index) => {
                const selected = selectedIds.includes(category.id);
                return (
                  <Pressable
                    key={category.id}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { opacity: 0.72 },
                      index < userCategories.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
                    ]}
                    onPress={() => toggleCategory(category.id)}>
                    <ThemedText variant='body'>{categoryLabel(category)}</ThemedText>
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={selected ? colors.tint : colors.tertiaryLabel}
                    />
                  </Pressable>
                );
              })}
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xxxl,
  },
  card: {
    overflow: 'hidden',
  },
  emptyCard: {
    padding: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
