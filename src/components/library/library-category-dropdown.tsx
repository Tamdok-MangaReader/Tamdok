import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';
import { ALL_CATEGORY_ID, isAllCategory, type LibraryCategory } from '@/services/library';

export type CategoryDropdownAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LibraryCategoryDropdownProps = {
  visible: boolean;
  anchor: CategoryDropdownAnchor | null;
  categories: LibraryCategory[];
  selectedIds: string[];
  inLibrary?: boolean;
  onToggleCategory: (categoryId: string) => void;
  onClose: () => void;
};

function categoryLabel(category: LibraryCategory): string {
  if (category.id === ALL_CATEGORY_ID) return t('library_category_all');
  return category.name;
}

function orderedCategories(categories: LibraryCategory[]): LibraryCategory[] {
  return [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function LibraryCategoryDropdown({
  visible,
  anchor,
  categories,
  selectedIds,
  inLibrary = false,
  onToggleCategory,
  onClose,
}: LibraryCategoryDropdownProps) {
  const { colors, radius } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const visibleCategories = orderedCategories(categories);

  if (!visible || !anchor) return null;

  const panelWidth = Math.min(windowWidth - Spacing.lg * 2, Math.max(anchor.width, 280));
  const panelLeft = Math.min(Math.max(Spacing.lg, anchor.x), windowWidth - panelWidth - Spacing.lg);
  const preferredTop = anchor.y + anchor.height + Spacing.sm;
  const maxTop = windowHeight - 240;
  const panelTop = Math.min(preferredTop, maxTop);

  return (
    <Modal visible transparent animationType='fade' onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.panelWrap, { top: panelTop, left: panelLeft, width: panelWidth }]}
          onPress={(event) => event.stopPropagation()}>
          <GlassSurface borderRadius={radius.md} style={styles.panel}>
            <ThemedText variant='footnote' color='secondaryLabel' style={styles.hint}>
              {t('library_category_picker_hint')}
            </ThemedText>
            {visibleCategories.length === 0 ? (
              <ThemedText variant='body' color='tertiaryLabel' style={styles.empty}>
                {t('library_category_picker_empty')}
              </ThemedText>
            ) : (
              <View style={styles.list}>
                {visibleCategories.map((category, index) => {
                  const selected = isAllCategory(category.id)
                    ? inLibrary && selectedIds.every((id) => isAllCategory(id))
                    : selectedIds.includes(category.id);
                  return (
                    <Pressable
                      key={category.id}
                      style={({ pressed }) => [
                        styles.row,
                        index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                        pressed && { backgroundColor: colors.quaternaryFill },
                      ]}
                      onPress={() => onToggleCategory(category.id)}
                      accessibilityRole='button'>
                      <ThemedText variant='body'>{categoryLabel(category)}</ThemedText>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? colors.tint : colors.tertiaryLabel}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </GlassSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  panelWrap: {
    position: 'absolute',
    zIndex: 10,
  },
  panel: {
    overflow: 'hidden',
  },
  hint: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  empty: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  list: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
});
