import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

import { GlassSurface } from '@/components/ui/glass-surface';
import { SFSymbolIcon } from '@/components/ui/sf-symbol-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';
import { ALL_CATEGORY_ID, isAllCategory, type LibraryCategory } from '@/services/library';

type LibraryMangaActionsMenuProps = {
  visible: boolean;
  title: string;
  categories: LibraryCategory[];
  selectedCategoryIds: string[];
  onMarkAllRead: () => void;
  onMarkAllUnread: () => void;
  onToggleCategory: (categoryId: string) => void;
  onDelete: () => void;
  onClose: () => void;
};

function MenuRow({
  label,
  sfSymbol,
  fallback,
  destructive,
  showDivider,
  trailing,
  selected,
  inset,
  onPress,
}: {
  label: string;
  sfSymbol: string;
  fallback: 'checkmark-done-outline' | 'checkmark-circle-outline' | 'ellipse-outline' | 'folder-outline' | 'trash-outline' | 'checkbox-outline' | 'square-outline';
  destructive?: boolean;
  showDivider?: boolean;
  trailing?: 'up' | 'down' | 'check';
  selected?: boolean;
  inset?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const color = destructive ? colors.destructive : colors.label;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        inset && styles.rowInset,
        showDivider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
        pressed && { backgroundColor: colors.quaternaryFill },
      ]}
      onPress={onPress}
      accessibilityRole='button'>
      <SFSymbolIcon name={sfSymbol} fallback={fallback} size={18} color={color} />
      <ThemedText variant='body' color={destructive ? 'destructive' : 'label'} style={styles.label}>
        {label}
      </ThemedText>
      {trailing === 'check' || selected ? (
        <SFSymbolIcon
          name={selected ? 'checkmark' : 'circle'}
          fallback={selected ? 'checkbox-outline' : 'square-outline'}
          size={16}
          color={selected ? colors.tint : colors.tertiaryLabel}
        />
      ) : trailing ? (
        <SFSymbolIcon
          name={trailing === 'up' ? 'chevron.up' : 'chevron.down'}
          fallback='chevron-down'
          size={16}
          color={colors.tertiaryLabel}
        />
      ) : null}
    </Pressable>
  );
}

export function LibraryMangaActionsMenu({
  visible,
  title,
  categories,
  selectedCategoryIds,
  onMarkAllRead,
  onMarkAllUnread,
  onToggleCategory,
  onDelete,
  onClose,
}: LibraryMangaActionsMenuProps) {
  const { radius } = useTheme();
  const [markExpanded, setMarkExpanded] = useState(false);
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const userCategories = categories.filter((category) => !isAllCategory(category.id) && category.id !== ALL_CATEGORY_ID);

  if (!visible) return null;

  const close = () => {
    setMarkExpanded(false);
    setCategoryExpanded(false);
    onClose();
  };

  const run = (action: () => void) => {
    void Haptics.selectionAsync();
    close();
    action();
  };

  const menu = (
    <Pressable style={styles.backdrop} onPress={close}>
      <View style={styles.anchor}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <GlassSurface borderRadius={radius.md} style={styles.card}>
            <ThemedText variant='footnote' color='secondaryLabel' style={styles.title} numberOfLines={2}>
              {title}
            </ThemedText>
            <MenuRow
              label={t('library_mark_chapters')}
              sfSymbol='checkmark.rectangle.stack'
              fallback='checkmark-done-outline'
              trailing={markExpanded ? 'up' : 'down'}
              onPress={() => setMarkExpanded((value) => !value)}
            />
            {markExpanded ? (
              <>
                <MenuRow
                  label={t('manga_mark_all_read')}
                  sfSymbol='checkmark.circle'
                  fallback='checkmark-circle-outline'
                  showDivider
                  inset
                  onPress={() => run(onMarkAllRead)}
                />
                <MenuRow
                  label={t('manga_mark_all_unread')}
                  sfSymbol='circle'
                  fallback='ellipse-outline'
                  showDivider
                  inset
                  onPress={() => run(onMarkAllUnread)}
                />
              </>
            ) : null}
            <MenuRow
              label={t('manga_edit_categories')}
              sfSymbol='folder'
              fallback='folder-outline'
              showDivider
              trailing={categoryExpanded ? 'up' : 'down'}
              onPress={() => setCategoryExpanded((value) => !value)}
            />
            {categoryExpanded
              ? userCategories.map((category) => (
                  <MenuRow
                    key={category.id}
                    label={category.name}
                    sfSymbol={selectedCategoryIds.includes(category.id) ? 'checkmark.circle.fill' : 'circle'}
                    fallback={selectedCategoryIds.includes(category.id) ? 'checkbox-outline' : 'square-outline'}
                    showDivider
                    inset
                    selected={selectedCategoryIds.includes(category.id)}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      onToggleCategory(category.id);
                    }}
                  />
                ))
              : null}
            <MenuRow
              label={t('manga_remove_from_library')}
              sfSymbol='trash'
              fallback='trash-outline'
              destructive
              showDivider
              onPress={() => {
                void Haptics.selectionAsync();
                onDelete();
              }}
            />
          </GlassSurface>
        </Pressable>
      </View>
    </Pressable>
  );

  if (Platform.OS === 'ios') {
    return (
      <Modal visible transparent animationType='fade' onRequestClose={close}>
        <FullWindowOverlay>{menu}</FullWindowOverlay>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType='fade' onRequestClose={close}>
      {menu}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  anchor: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  card: {
    overflow: 'hidden',
  },
  title: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rowInset: {
    paddingLeft: Spacing.xxxl,
  },
  label: {
    flex: 1,
  },
});
