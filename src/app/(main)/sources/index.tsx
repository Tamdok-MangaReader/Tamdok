import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SourceCategoryTabs, type SourceCategoryTab } from '@/components/sources/source-category-tabs';
import { IncognitoModeBanner } from '@/components/settings/incognito-mode-banner';
import { SourceInstalledActions } from '@/components/sources/source-actions-menu';
import { SearchDismissRow } from '@/components/sources/search-dismiss-row';
import { SourceListItem, installedSourceSubtitle } from '@/components/sources/source-list-item';
import { SwipeableRow, SwipeableRowsProvider, type SwipeAction } from '@/components/sources/swipeable-row';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LiquidGlassScrollComponent } from '@/components/ui/liquid-glass-scroll-root';
import { ScreenContent } from '@/components/ui/screen-content';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useSources } from '@/context/sources-context';
import { useNavigationTheme } from '@/hooks/use-navigation-theme';
import { useTheme } from '@/hooks/use-theme';
import type { InstalledSource } from '@/parsers/shared/types';
import { getSourceLayoutKey, sourceRouteId } from '@/services/sources';
import { isSearchActive, matchesInstalledSource } from '@/utils/source-search';

type SourceSection = {
  key: string;
  title: string;
  data: InstalledSource[];
};

type SourceListRow =
  | { kind: 'header'; id: string; title: string; isFirst: boolean }
  | { kind: 'source'; id: string; source: InstalledSource };

type SourcesListItem = SourceListRow | InstalledSource;

const REORDER_ROW_HEIGHT = 76;

type SourcesCategoryId = 'all' | 'pinned' | 'aidoku' | 'tamdok';

export default function SourcesScreen() {
  const router = useRouter();
  const { colors, radius, isDark } = useTheme();
  const { stackSearchBarProps } = useNavigationTheme();
  const insets = useSafeAreaInsets();
  const { installed, isLoading, isPinned, pinSource, unpinSource, reorderSources, uninstall, getSourceUpdate } = useSources();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SourcesCategoryId>('all');
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [reorderData, setReorderData] = useState(installed);
  const listRef = useRef<FlatList<SourcesListItem>>(null);
  const isEmpty = !isLoading && installed.length === 0;
  const searchActive = isSearchActive(query);

  const sourceMatches = useCallback(
    (source: InstalledSource) => matchesInstalledSource(source, query),
    [query],
  );

  const hasPinned = useMemo(() => installed.some((source) => isPinned(source)), [installed, isPinned]);
  const hasAidoku = useMemo(() => installed.some((source) => source.kind === 'aidoku'), [installed]);
  const hasTamdok = useMemo(() => installed.some((source) => source.kind === 'tamdok'), [installed]);
  const showKindTabs = hasAidoku && hasTamdok;

  const categoryTabs = useMemo<SourceCategoryTab[]>(() => {
    const tabs: SourceCategoryTab[] = [{ id: 'all', label: t('sources') }];
    if (hasPinned) tabs.push({ id: 'pinned', label: t('sources_pinned') });
    if (showKindTabs) {
      tabs.push({ id: 'aidoku', label: t('sources_tab_aidoku') });
      tabs.push({ id: 'tamdok', label: t('sources_tab_tamdok') });
    }
    return tabs;
  }, [hasPinned, showKindTabs]);

  useEffect(() => {
    if (!categoryTabs.some((tab) => tab.id === selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [categoryTabs, selectedCategory]);

  const filteredByCategory = useMemo(() => {
    switch (selectedCategory) {
      case 'pinned':
        return installed.filter((source) => isPinned(source));
      case 'aidoku':
        return installed.filter((source) => source.kind === 'aidoku');
      case 'tamdok':
        return installed.filter((source) => source.kind === 'tamdok');
      default:
        return installed;
    }
  }, [installed, isPinned, selectedCategory]);

  const matchingSourceCount = useMemo(
    () => (searchActive ? filteredByCategory.filter(sourceMatches).length : filteredByCategory.length),
    [filteredByCategory, searchActive, sourceMatches],
  );

  useEffect(() => {
    if (!isReorderMode) {
      setReorderData(installed);
    }
  }, [installed, isReorderMode]);

  useEffect(() => {
    if (!isReorderMode) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [isReorderMode]);

  const sections = useMemo<SourceSection[]>(() => {
    if (selectedCategory !== 'all') {
      if (filteredByCategory.length === 0) return [];
      return [{ key: selectedCategory, title: '', data: filteredByCategory }];
    }

    const pinned = filteredByCategory.filter((source) => isPinned(source));
    const unpinned = filteredByCategory.filter((source) => !isPinned(source));
    const result: SourceSection[] = [];

    if (pinned.length > 0) {
      result.push({ key: 'pinned', title: t('sources_pinned'), data: pinned });
    }
    if (unpinned.length > 0) {
      result.push({
        key: 'all',
        title: pinned.length > 0 ? t('sources_all') : t('sources'),
        data: unpinned,
      });
    }

    return result;
  }, [filteredByCategory, isPinned, selectedCategory]);

  const listRows = useMemo<SourceListRow[]>(() => {
    const rows: SourceListRow[] = [];

    sections.forEach((section, sectionIndex) => {
      if (section.title) {
        rows.push({
          kind: 'header',
          id: `header-${section.key}`,
          title: section.title,
          isFirst: sectionIndex === 0,
        });
      }
      section.data.forEach((source) => {
        rows.push({ kind: 'source', id: getSourceLayoutKey(source), source });
      });
    });

    return rows;
  }, [sections]);

  const openSource = (source: InstalledSource) => {
    router.push(`/sources/${encodeURIComponent(sourceRouteId(source))}`);
  };

  const openSourceSettings = (source: InstalledSource) => {
    router.push(`/settings/source/${encodeURIComponent(sourceRouteId(source))}`);
  };

  const confirmUninstall = (source: InstalledSource) => {
    Alert.alert(
      t('sources_uninstall_title'),
      t('sources_uninstall_confirm', { name: source.manifest.info.name }),
      [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('sources_uninstall_action'),
        style: 'destructive',
        onPress: () => void uninstall(source),
      },
    ]);
  };

  const enterReorderMode = useCallback(() => {
    setReorderData([...installed]);
    setIsReorderMode(true);
  }, [installed]);

  const exitReorderMode = useCallback(() => {
    setIsReorderMode(false);
  }, []);

const PIN_SWIPE_COLOR = '#E5B800';

  const pinLeadingActions = (source: InstalledSource): SwipeAction[] => {
    const pinned = isPinned(source);
    return [
      {
        key: 'pin',
        label: pinned ? t('sources_unpin') : t('sources_pin'),
        icon: pinned ? 'pin-outline' : 'pin',
        sfSymbol: pinned ? 'pin.slash.fill' : 'pin.fill',
        color: PIN_SWIPE_COLOR,
        onPress: () => void (pinned ? unpinSource(source) : pinSource(source)),
      },
    ];
  };

  const settingsTrailingActions = (source: InstalledSource): SwipeAction[] => [
    {
      key: 'settings',
      label: t('settings'),
      icon: 'settings-outline',
      color: '#8E8E93',
      onPress: () => openSourceSettings(source),
    },
  ];

  const renderSourceActions = (source: InstalledSource) => (
    <SwipeableRow
      rowId={getSourceLayoutKey(source)}
      leadingActions={pinLeadingActions(source)}
      fullSwipeLeadingActionKey='pin'
      actions={settingsTrailingActions(source)}
      fullSwipeActionKey='settings'>
      <SourceInstalledActions
        source={source}
        isPinned={isPinned(source)}
        onPress={() => openSource(source)}
        onPin={() => void pinSource(source)}
        onUnpin={() => void unpinSource(source)}
        onReorder={enterReorderMode}
        onDelete={() => confirmUninstall(source)}>
        <SourceListItem
          title={source.manifest.info.name}
          subtitle={installedSourceSubtitle(source)}
          iconUri={source.iconUri}
          showChevron
          updateAvailable={getSourceUpdate(source.id)?.availableVersion}
        />
      </SourceInstalledActions>
    </SwipeableRow>
  );

  const renderSourceRow = (source: InstalledSource, drag?: () => void, isActive?: boolean) => (
    <Card style={[styles.card, isActive && styles.cardDragging]}>
      <SourceListItem
        title={source.manifest.info.name}
        subtitle={installedSourceSubtitle(source)}
        iconUri={source.iconUri}
        updateAvailable={getSourceUpdate(source.id)?.availableVersion}
        trailing={
          drag ? (
            <Pressable onPressIn={drag} hitSlop={8} accessibilityRole='button' accessibilityLabel={t('sources_reorder')}>
              <Ionicons name='reorder-three-outline' size={22} color={colors.secondaryLabel} />
            </Pressable>
          ) : undefined
        }
      />
    </Card>
  );

  const renderDragPlaceholder = ({ item }: { item: InstalledSource }) => (
    <View style={styles.reorderItem}>
      <Card style={[styles.card, styles.dragPlaceholder]}>
        <SourceListItem
          title={item.manifest.info.name}
          subtitle={installedSourceSubtitle(item)}
          iconUri={item.iconUri}
          trailing={<View style={styles.reorderHandleSpacer} />}
        />
      </Card>
    </View>
  );

  const renderDraggableItem = ({ item, drag, isActive }: RenderItemParams<InstalledSource>) => (
    <View style={[styles.reorderItem, isActive && styles.reorderItemActive]}>
      {renderSourceRow(item, drag, isActive)}
    </View>
  );

  const renderListRow = ({ item }: { item: SourceListRow }) => {
    if (item.kind === 'header') {
      const sectionKey = item.id.replace('header-', '');
      const section = sections.find((entry) => entry.key === sectionKey);
      const headerVisible = searchActive ? (section?.data.some(sourceMatches) ?? false) : true;

      return (
        <SearchDismissRow visible={headerVisible} searchActive={searchActive && !isReorderMode}>
          <SectionLabel isFirst={item.isFirst}>{item.title}</SectionLabel>
        </SearchDismissRow>
      );
    }

    return (
      <SearchDismissRow visible={sourceMatches(item.source)} searchActive={searchActive && !isReorderMode}>
        <View style={styles.listRow}>
          <Card style={[styles.card, styles.swipeCard]}>{renderSourceActions(item.source)}</Card>
        </View>
      </SearchDismissRow>
    );
  };

  const renderListHeader = useCallback(
    () =>
      !isReorderMode ? (
        <>
          <IncognitoModeBanner />
          <SourceCategoryTabs
            tabs={categoryTabs}
            selectedId={selectedCategory}
            onSelect={(id) => setSelectedCategory(id as SourcesCategoryId)}
          />
        </>
      ) : null,
    [categoryTabs, isReorderMode, selectedCategory],
  );

  const categoryEmpty =
    !isLoading && !isEmpty && !isReorderMode && !searchActive && filteredByCategory.length === 0;

  const listFooterHeight = Spacing.lg;

  const renderListFooter = useCallback(
    () => <View style={{ height: listFooterHeight }} />,
    [listFooterHeight],
  );

  const reorderItemLayout = (_: ArrayLike<SourcesListItem> | null | undefined, index: number) => ({
    length: REORDER_ROW_HEIGHT,
    offset: REORDER_ROW_HEIGHT * index,
    index,
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: !isReorderMode,
          headerTransparent: !isReorderMode,
          headerStyle: isReorderMode ? { backgroundColor: colors.groupedBackground } : undefined,
          headerShadowVisible: isReorderMode,
          headerRight: isReorderMode
            ? () => (
                <Pressable onPress={exitReorderMode} hitSlop={8} accessibilityRole='button' accessibilityLabel={t('done')}>
                  <Ionicons name='checkmark' size={24} color={colors.tint} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <Stack.Title>{isReorderMode ? t('sources_reorder') : t('sources')}</Stack.Title>
      {!isReorderMode && !isLoading && !isEmpty && (
        <Stack.SearchBar
          key={isDark ? 'sources-search-dark' : 'sources-search-light'}
          placeholder={t('sources_search_placeholder')}
          {...stackSearchBarProps}
          onChangeText={(event) => setQuery(event.nativeEvent.text)}
          onSearchButtonPress={(event) => setQuery(event.nativeEvent.text)}
        />
      )}
      {isLoading || isEmpty ? (
        <ScreenContent centerContent={isLoading || isEmpty}>
          {isLoading ? (
            <ActivityIndicator color={colors.tint} />
          ) : (
            <View style={styles.emptyWrap}>
              <EmptyState icon='globe-outline' title={t('sources_empty_title')} description={t('sources_empty_settings_hint')} />
              <Pressable
                style={[styles.settingsButton, { backgroundColor: colors.tint, borderRadius: radius.md }]}
                onPress={() => router.push('/settings/sources')}>
                <ThemedText variant='headline' color='onTint'>
                  {t('section_sources')}
                </ThemedText>
              </Pressable>
            </View>
          )}
        </ScreenContent>
      ) : categoryEmpty ? (
        <ScreenContent centerContent>
          <EmptyState icon='globe-outline' title={t('sources_category_empty_title')} description={t('sources_category_empty_desc')} />
        </ScreenContent>
      ) : searchActive && matchingSourceCount === 0 ? (
        <ScreenContent centerContent>
          <EmptyState icon='search-outline' title={t('source_search_empty_title')} description={t('source_search_empty_desc')} />
        </ScreenContent>
      ) : (
        <ThemedView color='groupedBackground' style={styles.root}>
          <SwipeableRowsProvider>
            <DraggableFlatList<SourcesListItem>
              ref={listRef}
              containerStyle={styles.listContainer}
              data={isReorderMode ? reorderData : listRows}
              keyExtractor={(item) => item.id}
              activationDistance={isReorderMode ? 12 : 10000}
              dragItemOverflow={isReorderMode}
              enableLayoutAnimationExperimental={false}
              contentInsetAdjustmentBehavior={isReorderMode ? 'never' : 'automatic'}
              automaticallyAdjustsScrollIndicatorInsets={!isReorderMode}
              renderScrollComponent={(props) => <LiquidGlassScrollComponent {...props} />}
              contentContainerStyle={
                isReorderMode
                  ? [styles.reorderListContent, { paddingTop: Spacing.xs, paddingBottom: BottomTabInset + insets.bottom }]
                  : [styles.listContent, searchActive && styles.listContentSearching]
              }
              ListHeaderComponent={isReorderMode ? undefined : renderListHeader}
              ListFooterComponent={isReorderMode ? undefined : renderListFooter}
              getItemLayout={isReorderMode ? reorderItemLayout : undefined}
              renderPlaceholder={
                isReorderMode
                  ? (params) => renderDragPlaceholder({ item: params.item as InstalledSource })
                  : undefined
              }
              onDragEnd={
                isReorderMode
                  ? ({ data }) => {
                      const next = data as InstalledSource[];
                      setReorderData(next);
                      void reorderSources(next.map((source) => getSourceLayoutKey(source)));
                    }
                  : undefined
              }
              renderItem={(params) => {
                if (isReorderMode) {
                  return renderDraggableItem(params as RenderItemParams<InstalledSource>);
                }
                return renderListRow({ item: params.item as SourceListRow });
              }}
            />
          </SwipeableRowsProvider>
        </ThemedView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    flexGrow: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    gap: Spacing.sm,
  },
  listContentSearching: {
    gap: 0,
  },
  reorderListContent: {
    flexGrow: 0,
    paddingHorizontal: Spacing.lg,
  },
  listRow: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
  reorderItem: {
    width: '100%',
    height: REORDER_ROW_HEIGHT,
    justifyContent: 'center',
  },
  reorderHandleSpacer: {
    width: 22,
    height: 22,
  },
  reorderItemActive: {
    zIndex: 10,
    elevation: 8,
  },
  card: {
    width: '100%',
    overflow: 'hidden',
  },
  swipeCard: {
    backgroundColor: 'transparent',
  },
  cardDragging: {
    opacity: 0.98,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  dragPlaceholder: {
    opacity: 0.35,
  },
  emptyWrap: {
    width: '100%',
    maxWidth: 360,
    gap: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  settingsButton: {
    width: '100%',
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
