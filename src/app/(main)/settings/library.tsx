import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, View, type View as ViewType } from 'react-native';
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';

import { InlinePillGrid, InlinePillToggleGrid } from '@/components/library/inline-pill-grid';
import { SwipeableRow, SwipeableRowsProvider, type SwipeAction } from '@/components/sources/swipeable-row';
import { Card, CardSeparator } from '@/components/ui/card';
import {
  InlineActionMenu,
  type InlineActionMenuAnchor,
  type InlineActionMenuItem,
} from '@/components/ui/inline-action-menu';
import { LongPressScalePressable } from '@/components/ui/long-press-scale-pressable';
import { ScreenContent } from '@/components/ui/screen-content';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useMangaDataRefresh } from '@/hooks/use-manga-data';
import { useTheme } from '@/hooks/use-theme';
import { getAppSettings, updateAppSettings, type LibraryDisplaySettings, type LibrarySortMode } from '@/services/app-settings';
import {
  ALL_CATEGORY_ID,
  LIBRARY_SORT_MODES,
  addLibraryCategory,
  getDefaultCategoryId,
  getExcludedCategoryIds,
  getLibraryCategories,
  getLibraryUpdateSettings,
  isAllCategory,
  isAllCategoryLocked,
  removeLibraryCategory,
  renameLibraryCategory,
  reorderLibraryCategories,
  setCategoryExcludedFromUpdates,
  setDefaultCategoryId,
  updateLibraryUpdateSettings,
  type LibraryCategory,
  type LibraryUpdateInterval,
} from '@/services/library';

const UPDATE_INTERVAL_OPTIONS: LibraryUpdateInterval[] = ['never', '1h', '6h', '12h', '24h', '48h'];

function intervalLabel(interval: LibraryUpdateInterval): string {
  return t(`library_update_interval_${interval}` as 'library_update_interval_never');
}

function promptText(title: string, message: string | undefined, onSubmit: (value: string) => void) {
  if (Platform.OS === 'ios') {
    Alert.prompt(title, message, (value) => {
      if (value?.trim()) onSubmit(value.trim());
    });
    return;
  }
  Alert.alert(title, message, [{ text: t('cancel'), style: 'cancel' }]);
}

function categoryLabel(category: LibraryCategory): string {
  if (isAllCategory(category.id)) return t('library_category_all');
  return category.name;
}

export default function LibrarySettingsScreen() {
  const { colors } = useTheme();
  const refreshTick = useMangaDataRefresh();
  const [categories, setCategories] = useState<LibraryCategory[]>([]);
  const [defaultCategoryId, setDefaultCategoryIdState] = useState(ALL_CATEGORY_ID);
  const [excludedCategoryIds, setExcludedCategoryIds] = useState<string[]>([]);
  const [updateOnWifiOnly, setUpdateOnWifiOnlyState] = useState(false);
  const [updateInterval, setUpdateIntervalState] = useState<LibraryUpdateInterval>('12h');
  const [skipUnreadChapters, setSkipUnreadChaptersState] = useState(false);
  const [skipCompletedStatus, setSkipCompletedStatusState] = useState(false);
  const [skipUnreadManga, setSkipUnreadMangaState] = useState(false);
  const [refreshMetadata, setRefreshMetadataState] = useState(true);
  const [backgroundRefresh, setBackgroundRefreshState] = useState(false);
  const [showUnreadBadges, setShowUnreadBadges] = useState(true);
  const [showDownloadedBadges, setShowDownloadedBadges] = useState(true);
  const [sortMode, setSortMode] = useState<LibrarySortMode>('unread');
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<InlineActionMenuAnchor | null>(null);
  const [menuCategory, setMenuCategory] = useState<LibraryCategory | null>(null);
  const rowRefs = useRef<Record<string, ViewType | null>>({});

  const allLocked = isAllCategoryLocked(defaultCategoryId);

  const load = useCallback(async () => {
    const [nextCategories, nextDefault, nextExcluded, appSettings, updateSettings] = await Promise.all([
      getLibraryCategories(),
      getDefaultCategoryId(),
      getExcludedCategoryIds(),
      getAppSettings(),
      getLibraryUpdateSettings(),
    ]);
    setCategories(nextCategories);
    setDefaultCategoryIdState(nextDefault);
    setExcludedCategoryIds(nextExcluded);
    setUpdateOnWifiOnlyState(updateSettings.updateOnWifiOnly);
    setUpdateIntervalState(updateSettings.updateInterval);
    setSkipUnreadChaptersState(updateSettings.skipUnreadChapters);
    setSkipCompletedStatusState(updateSettings.skipCompletedStatus);
    setSkipUnreadMangaState(updateSettings.skipUnreadManga);
    setRefreshMetadataState(updateSettings.refreshMetadata);
    setBackgroundRefreshState(updateSettings.backgroundRefresh);
    setShowUnreadBadges(appSettings.libraryDisplay.showUnreadBadges);
    setShowDownloadedBadges(appSettings.libraryDisplay.showDownloadedBadges);
    setSortMode(appSettings.libraryDisplay.sortMode ?? 'unread');
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const defaultOptions = useMemo(
    () => categories.map((category) => ({ id: category.id, label: categoryLabel(category) })),
    [categories],
  );

  const updateCategories = useMemo(
    () => categories.filter((category) => !isAllCategory(category.id)),
    [categories],
  );

  const updateOptions = useMemo(
    () => updateCategories.map((category) => ({ id: category.id, label: categoryLabel(category) })),
    [updateCategories],
  );

  const intervalOptions = useMemo(
    () => UPDATE_INTERVAL_OPTIONS.map((interval) => ({ id: interval, label: intervalLabel(interval) })),
    [],
  );

  const sortOptions = useMemo(
    () => LIBRARY_SORT_MODES.map((mode) => ({ id: mode, label: t(`library_sort_${mode}` as 'library_sort_unread') })),
    [],
  );

  const includedCategoryIds = useMemo(
    () => updateCategories.filter((category) => !excludedCategoryIds.includes(category.id)).map((category) => category.id),
    [excludedCategoryIds, updateCategories],
  );

  const patchUpdateSettings = (patch: Parameters<typeof updateLibraryUpdateSettings>[0]) => {
    void updateLibraryUpdateSettings(patch);
  };

  const patchLibraryDisplay = (next: Partial<LibraryDisplaySettings>) => {
    void getAppSettings().then((settings) =>
      updateAppSettings({
        libraryDisplay: { ...settings.libraryDisplay, ...next },
      }),
    );
  };

  const addCategory = () => {
    promptText(t('library_add_category'), t('library_add_category_hint'), async (name) => {
      await addLibraryCategory(name);
      await load();
    });
  };

  const renameCategory = (category: LibraryCategory) => {
    if (isAllCategory(category.id)) return;
    promptText(t('library_rename_category'), category.name, async (name) => {
      await renameLibraryCategory(category.id, name);
      await load();
    });
  };

  const deleteCategory = (category: LibraryCategory) => {
    if (isAllCategory(category.id)) return;
    Alert.alert(t('library_delete_category'), category.name, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('library_delete_category_action'),
        style: 'destructive',
        onPress: () => void removeLibraryCategory(category.id).then(load),
      },
    ]);
  };

  const setPrimaryCategory = (category: LibraryCategory) => {
    void setDefaultCategoryId(category.id).then(load);
  };

  const openCategoryMenu = (category: LibraryCategory) => {
    const ref = rowRefs.current[category.id];
    ref?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setMenuCategory(category);
      setMenuVisible(true);
    });
  };

  const closeCategoryMenu = () => {
    setMenuVisible(false);
    setMenuAnchor(null);
    setMenuCategory(null);
  };

  const menuItems: InlineActionMenuItem[] = useMemo(() => {
    if (!menuCategory) return [];
    const isAll = isAllCategory(menuCategory.id);
    const isPrimary = menuCategory.id === defaultCategoryId;
    const items: InlineActionMenuItem[] = [];
    if (!isPrimary) {
      items.push({
        key: 'primary',
        label: t('library_set_primary'),
        sfSymbol: 'star.fill',
        fallbackIcon: 'star-outline',
        onPress: () => setPrimaryCategory(menuCategory),
      });
    }
    if (!isAll) {
      items.push(
        {
          key: 'rename',
          label: t('library_rename_category'),
          sfSymbol: 'pencil',
          fallbackIcon: 'create-outline',
          onPress: () => renameCategory(menuCategory),
        },
        {
          key: 'delete',
          label: t('library_delete_category_action'),
          sfSymbol: 'trash',
          fallbackIcon: 'trash-outline',
          destructive: true,
          onPress: () => deleteCategory(menuCategory),
        },
      );
    }
    return items;
  }, [menuCategory, defaultCategoryId]);

  const renderCategoryItem = ({ item, drag, isActive, getIndex }: RenderItemParams<LibraryCategory>) => {
    const isAll = isAllCategory(item.id);
    const allIsDefault = allLocked;
    const canDrag = !isAll || !allIsDefault;
    const canShowMenu = !isAll || !allIsDefault;
    const isPrimary = item.id === defaultCategoryId;
    const index = getIndex() ?? 0;

    const deleteAction: SwipeAction = {
      key: 'delete',
      label: t('library_delete_category_action'),
      icon: 'trash-outline',
      sfSymbol: 'trash',
      color: colors.destructive,
      onPress: () => deleteCategory(item),
    };

    return (
      <ScaleDecorator>
        <View style={isActive ? styles.categoryItemDragging : undefined}>
          <SwipeableRow rowId={item.id} actions={[deleteAction]} fullSwipeActionKey='delete' enabled={!isAll}>
            <LongPressScalePressable
              ref={(ref) => {
                rowRefs.current[item.id] = ref;
              }}
              style={styles.categoryPressable}
              disabled={!canShowMenu}
              onPress={canShowMenu ? () => openCategoryMenu(item) : undefined}
              onLongPress={canShowMenu ? () => openCategoryMenu(item) : undefined}>
              <View style={styles.categoryRow}>
                <View style={styles.categoryText}>
                  <ThemedText variant='body'>{categoryLabel(item)}</ThemedText>
                  {isPrimary ? (
                    <ThemedText variant='footnote' color='tint'>
                      {t('library_default_category')}
                    </ThemedText>
                  ) : isAll && allIsDefault ? (
                    <ThemedText variant='footnote' color='tertiaryLabel'>
                      {t('library_category_locked')}
                    </ThemedText>
                  ) : null}
                </View>
                {canDrag ? (
                  <Pressable onPressIn={drag} hitSlop={8} accessibilityRole='button'>
                    <Ionicons name='reorder-three-outline' size={22} color={colors.secondaryLabel} />
                  </Pressable>
                ) : null}
              </View>
            </LongPressScalePressable>
          </SwipeableRow>
          {index < categories.length - 1 ? <CardSeparator /> : null}
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('library_settings_title'),
          headerRight: () => (
            <ThemedText variant='body' color='tint' onPress={addCategory} style={{ paddingHorizontal: 8 }}>
              {t('add')}
            </ThemedText>
          ),
        }}
      />
      <ScreenContent>
        <SectionLabel isFirst>{t('library_categories')}</SectionLabel>
        <SwipeableRowsProvider>
          <Card style={styles.categoriesCard}>
            {categories.length === 0 ? (
              <ThemedText variant='body' color='secondaryLabel' style={styles.emptyRow}>
                {t('library_category_picker_empty')}
              </ThemedText>
            ) : (
              <DraggableFlatList
                data={categories}
                keyExtractor={(item) => item.id}
                renderItem={renderCategoryItem}
                scrollEnabled={false}
                onDragEnd={({ data }) => {
                  setCategories(data);
                  void reorderLibraryCategories(data.map((category) => category.id));
                }}
              />
            )}
          </Card>
        </SwipeableRowsProvider>
        <ThemedText variant='footnote' color='tertiaryLabel' style={styles.sectionHint}>
          {t('library_settings_footer')}
        </ThemedText>

        <SectionLabel>{t('library_default_category_section')}</SectionLabel>
        <Card style={styles.inlineCard}>
          <InlinePillGrid
            options={defaultOptions}
            selectedId={defaultCategoryId}
            onSelect={(categoryId) => void setDefaultCategoryId(categoryId).then(load)}
          />
        </Card>

        <SectionLabel>{t('library_display_section')}</SectionLabel>
        <Card style={styles.inlineCard}>
          <View style={styles.sortBlock}>
            <ThemedText variant='body'>{t('library_sort_section')}</ThemedText>
            <InlinePillGrid
              options={sortOptions}
              selectedId={sortMode}
              preserveOrder
              onSelect={(mode) => {
                const next = mode as LibrarySortMode;
                setSortMode(next);
                patchLibraryDisplay({ sortMode: next });
              }}
            />
          </View>
        </Card>
        <Card>
          <SwitchRow
            label={t('library_show_unread_badges')}
            value={showUnreadBadges}
            onChange={(value) => {
              setShowUnreadBadges(value);
              patchLibraryDisplay({ showUnreadBadges: value });
            }}
            isFirst
          />
          <CardSeparator />
          <SwitchRow
            label={t('library_show_downloaded_badges')}
            value={showDownloadedBadges}
            onChange={(value) => {
              setShowDownloadedBadges(value);
              patchLibraryDisplay({ showDownloadedBadges: value });
            }}
            isLast
          />
        </Card>

        <SectionLabel>{t('library_updates_section')}</SectionLabel>
        <Card>
          <SwitchRow
            label={t('library_update_wifi_only')}
            hint={t('library_update_wifi_only_hint')}
            value={updateOnWifiOnly}
            onChange={(value) => {
              setUpdateOnWifiOnlyState(value);
              patchUpdateSettings({ updateOnWifiOnly: value });
              patchLibraryDisplay({ updateOnWifiOnly: value });
            }}
            isFirst
          />
          <CardSeparator />
          <View style={styles.inlineSection}>
            <ThemedText variant='body'>{t('library_update_interval')}</ThemedText>
            <ThemedText variant='footnote' color='secondaryLabel'>
              {t('library_update_interval_hint')}
            </ThemedText>
            <InlinePillGrid
              options={intervalOptions}
              selectedId={updateInterval}
              onSelect={(interval) => {
                const next = interval as LibraryUpdateInterval;
                setUpdateIntervalState(next);
                patchUpdateSettings({ updateInterval: next });
              }}
            />
          </View>
          <CardSeparator />
          <View style={styles.inlineSection}>
            <ThemedText variant='body'>{t('library_skip_titles_section')}</ThemedText>
            <ThemedText variant='footnote' color='secondaryLabel'>
              {t('library_skip_titles_hint')}
            </ThemedText>
          </View>
          <SwitchRow
            label={t('library_skip_unread_chapters')}
            value={skipUnreadChapters}
            onChange={(value) => {
              setSkipUnreadChaptersState(value);
              patchUpdateSettings({ skipUnreadChapters: value });
            }}
          />
          <CardSeparator />
          <SwitchRow
            label={t('library_skip_completed_status')}
            value={skipCompletedStatus}
            onChange={(value) => {
              setSkipCompletedStatusState(value);
              patchUpdateSettings({ skipCompletedStatus: value });
            }}
          />
          <CardSeparator />
          <SwitchRow
            label={t('library_skip_unread_manga')}
            value={skipUnreadManga}
            onChange={(value) => {
              setSkipUnreadMangaState(value);
              patchUpdateSettings({ skipUnreadManga: value });
            }}
          />
          <CardSeparator />
          <SwitchRow
            label={t('library_refresh_metadata')}
            hint={t('library_refresh_metadata_hint')}
            value={refreshMetadata}
            onChange={(value) => {
              setRefreshMetadataState(value);
              patchUpdateSettings({ refreshMetadata: value });
            }}
          />
          <CardSeparator />
          <SwitchRow
            label={t('library_background_refresh')}
            hint={t('library_background_refresh_hint')}
            value={backgroundRefresh}
            onChange={(value) => {
              setBackgroundRefreshState(value);
              patchUpdateSettings({ backgroundRefresh: value });
            }}
            isLast
          />
        </Card>

        {updateOptions.length > 0 ? (
          <>
          <SectionLabel>{t('categories_updates_section')}</SectionLabel>
          <Card style={styles.inlineCard}>
            <ThemedText variant='footnote' color='secondaryLabel' style={styles.updateCategoriesHint}>
              {t('library_updates_categories_hint')}
            </ThemedText>
            <InlinePillToggleGrid
              options={updateOptions}
              selectedIds={includedCategoryIds}
              onToggle={(categoryId) => {
                const included = includedCategoryIds.includes(categoryId);
                const nextExcluded = included
                  ? [...excludedCategoryIds, categoryId]
                  : excludedCategoryIds.filter((id) => id !== categoryId);
                setExcludedCategoryIds(nextExcluded);
                void setCategoryExcludedFromUpdates(categoryId, included);
              }}
            />
          </Card>
          <ThemedText variant='footnote' color='secondaryLabel' style={styles.sectionHint}>
          {t('library_updates_hint')}
        </ThemedText>
          </>
        ) : (
          <ThemedText variant='body' color='secondaryLabel' style={styles.emptyRow}>
            {t('library_category_picker_empty')}
          </ThemedText>
        )}
      </ScreenContent>

      <InlineActionMenu
        visible={menuVisible}
        anchor={menuAnchor}
        title={menuCategory ? categoryLabel(menuCategory) : undefined}
        items={menuItems}
        onClose={closeCategoryMenu}
      />
    </>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  onChange,
  isFirst,
  isLast,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <View
      style={[
        styles.switchRow,
        isFirst && { paddingTop: Spacing.lg },
        isLast && { paddingBottom: Spacing.lg },
      ]}>
      <View style={styles.switchText}>
        <ThemedText variant='body'>{label}</ThemedText>
        {hint ? (
          <ThemedText variant='footnote' color='secondaryLabel'>
            {hint}
          </ThemedText>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  categoriesCard: {
    overflow: 'hidden',
    paddingVertical: 0,
  },
  categoryItemDragging: {
    opacity: 0.92,
  },
  categoryPressable: {
    width: '100%',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  categoryText: {
    flex: 1,
    gap: 2,
  },
  inlineCard: {
    padding: Spacing.lg,
  },
  sortBlock: {
    gap: Spacing.sm,
  },
  inlineSection: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  sectionHint: {
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  updateCategoriesHint: {
    marginBottom: Spacing.sm,
  },
  emptyRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
