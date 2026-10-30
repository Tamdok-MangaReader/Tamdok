import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { useSharedValue } from "react-native-reanimated";
import PagerView from "react-native-pager-view";
import {
  Fragment,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { FlatList } from "react-native-gesture-handler";
import DraggableFlatList, {
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  LibraryCategoryTabs,
  type LibraryCategoryTab,
} from "@/components/library/library-category-tabs";
import { IncognitoModeBanner } from "@/components/settings/incognito-mode-banner";
import { SourceInstalledActions } from "@/components/sources/source-actions-menu";
import { SearchDismissRow } from "@/components/sources/search-dismiss-row";
import {
  SourceListItem,
  installedSourceSubtitle,
} from "@/components/sources/source-list-item";
import {
  SwipeableRow,
  SwipeableRowsProvider,
  type SwipeAction,
} from "@/components/sources/swipeable-row";
import { usePagerHeights } from "@/hooks/use-pager-heights";
import { usePinnedTabs } from "@/components/library/pinned-tabs";
import { getAppSettings } from "@/services/app-settings";
import { subscribeAppSettings } from "@/utils/app-settings-events";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LiquidGlassScrollComponent } from "@/components/ui/liquid-glass-scroll-root";
import { ScreenContent } from "@/components/ui/screen-content";
import { SectionLabel } from "@/components/ui/section-label";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useSources } from "@/context/sources-context";
import { useNavigationTheme } from "@/hooks/use-navigation-theme";
import { usePageScrollHandler } from "@/hooks/use-page-scroll-handler";
import { useTheme } from "@/hooks/use-theme";
import type { InstalledSource } from "@/parsers/shared/types";
import { getSourceLayoutKey, sourceRouteId } from "@/services/sources";
import { isSearchActive, matchesInstalledSource } from "@/utils/source-search";

type SourceListRow =
  | { kind: "header"; id: string; title: string; isFirst: boolean }
  | { kind: "source"; id: string; source: InstalledSource };

type SourcesListItem = SourceListRow | InstalledSource;
type SourcesCategoryId = "all" | "pinned" | "aidoku" | "tamdok" | "nsfw";
type UpdateVersion = ComponentProps<typeof SourceListItem>["updateAvailable"];

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

type SourcesCategoryPage = {
  id: SourcesCategoryId;
  rows: SourceListRow[];
};

const EMPTY_SWIPE_ACTIONS: SwipeAction[] = [];
const REORDER_ROW_HEIGHT = 76;

function isNsfwSource(source: InstalledSource): boolean {
  return (source.manifest.info.contentRating ?? 0) >= 3;
}
const SOURCE_ROW_ESTIMATE = 72;
const PIN_SWIPE_COLOR = "#E5B800";

const LIST_FOOTER = <View style={{ height: Spacing.lg }} />;

const renderScrollComponent = (
  props: ComponentProps<typeof LiquidGlassScrollComponent>,
) => <LiquidGlassScrollComponent {...props} />;

const itemKeyExtractor = (item: SourcesListItem) => item.id;

const reorderItemLayout = (
  _: ArrayLike<SourcesListItem> | null | undefined,
  index: number,
) => ({
  length: REORDER_ROW_HEIGHT,
  offset: REORDER_ROW_HEIGHT * index,
  index,
});

const HeaderRow = memo(function HeaderRow({
  title,
  isFirst,
  visible,
  searchActive,
}: {
  title: string;
  isFirst: boolean;
  visible: boolean;
  searchActive: boolean;
}) {
  return (
    <SearchDismissRow visible={visible} searchActive={searchActive}>
      <SectionLabel isFirst={isFirst}>{title}</SectionLabel>
    </SearchDismissRow>
  );
});

type SourceRowProps = {
  source: InstalledSource;
  pinned: boolean;
  updateVersion: UpdateVersion;
  visible: boolean;
  searchActive: boolean;
  swipeLeading: boolean;
  swipeTrailing: boolean;
  onOpen: (source: InstalledSource) => void;
  onOpenSettings: (source: InstalledSource) => void;
  onPin: (source: InstalledSource) => void;
  onUnpin: (source: InstalledSource) => void;
  onReorder: () => void;
  onDelete: (source: InstalledSource) => void;
};

const SourceRow = memo(function SourceRow({
  source,
  pinned,
  updateVersion,
  visible,
  searchActive,
  swipeLeading,
  swipeTrailing,
  onOpen,
  onOpenSettings,
  onPin,
  onUnpin,
  onReorder,
  onDelete,
}: SourceRowProps) {
  const leadingActions = useMemo<SwipeAction[]>(
    () =>
      swipeLeading
        ? [
            {
              key: "pin",
              label: pinned ? t("sources_unpin") : t("sources_pin"),
              icon: pinned ? "pin-outline" : "pin",
              sfSymbol: pinned ? "pin.slash.fill" : "pin.fill",
              color: PIN_SWIPE_COLOR,
              onPress: () => (pinned ? onUnpin(source) : onPin(source)),
            },
          ]
        : EMPTY_SWIPE_ACTIONS,
    [swipeLeading, pinned, source, onPin, onUnpin],
  );

  const trailingActions = useMemo<SwipeAction[]>(
    () =>
      swipeTrailing
        ? [
            {
              key: "settings",
              label: t("settings"),
              icon: "settings-outline",
              color: "#8E8E93",
              onPress: () => onOpenSettings(source),
            },
          ]
        : EMPTY_SWIPE_ACTIONS,
    [swipeTrailing, source, onOpenSettings],
  );

  const handlePress = useCallback(() => onOpen(source), [onOpen, source]);
  const handlePin = useCallback(() => onPin(source), [onPin, source]);
  const handleUnpin = useCallback(() => onUnpin(source), [onUnpin, source]);
  const handleDelete = useCallback(() => onDelete(source), [onDelete, source]);
  const subtitle = useMemo(() => installedSourceSubtitle(source), [source]);

  return (
    <SearchDismissRow visible={visible} searchActive={searchActive}>
      <View style={styles.listRow}>
        <Card style={[styles.card, styles.swipeCard]}>
          <SwipeableRow
            rowId={getSourceLayoutKey(source)}
            leadingActions={leadingActions}
            fullSwipeLeadingActionKey="pin"
            actions={trailingActions}
            fullSwipeActionKey="settings"
          >
            <SourceInstalledActions
              source={source}
              isPinned={pinned}
              onPress={handlePress}
              onPin={handlePin}
              onUnpin={handleUnpin}
              onReorder={onReorder}
              onDelete={handleDelete}
            >
              <SourceListItem
                title={source.manifest.info.name}
                subtitle={subtitle}
                iconUri={source.iconUri}
                rating={source.manifest.info.contentRating}
                showChevron
                updateAvailable={updateVersion}
              />
            </SourceInstalledActions>
          </SwipeableRow>
        </Card>
      </View>
    </SearchDismissRow>
  );
});

const ReorderRow = memo(function ReorderRow({
  source,
  updateVersion,
  drag,
  isActive,
}: {
  source: InstalledSource;
  updateVersion: UpdateVersion;
  drag: () => void;
  isActive: boolean;
}) {
  const { colors } = useTheme();
  const subtitle = useMemo(() => installedSourceSubtitle(source), [source]);

  return (
    <View style={[styles.reorderItem, isActive && styles.reorderItemActive]}>
      <Card style={[styles.card, isActive && styles.cardDragging]}>
        <SourceListItem
          title={source.manifest.info.name}
          subtitle={subtitle}
          iconUri={source.iconUri}
          updateAvailable={updateVersion}
          rating={source.manifest.info.contentRating}
          trailing={
            <Pressable
              onPressIn={drag}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("sources_reorder")}
            >
              <Ionicons
                name="reorder-three-outline"
                size={22}
                color={colors.secondaryLabel}
              />
            </Pressable>
          }
        />
      </Card>
    </View>
  );
});

const DragPlaceholder = memo(function DragPlaceholder({
  source,
}: {
  source: InstalledSource;
}) {
  return (
    <View style={styles.reorderItem}>
      <Card style={[styles.card, styles.dragPlaceholder]}>
        <SourceListItem
          title={source.manifest.info.name}
          subtitle={installedSourceSubtitle(source)}
          iconUri={source.iconUri}
          rating={source.manifest.info.contentRating}
          trailing={<View style={styles.reorderHandleSpacer} />}
        />
      </Card>
    </View>
  );
});

type SourcesPageProps = {
  pageId: string;
  onHeight: (id: string, height: number) => void;
  rows: SourceListRow[];
  query: string;
  searchActive: boolean;
  swipeLeading: boolean;
  swipeTrailing: boolean;
  isPinned: ReturnType<typeof useSources>["isPinned"];
  getSourceUpdate: ReturnType<typeof useSources>["getSourceUpdate"];
  onOpen: (source: InstalledSource) => void;
  onOpenSettings: (source: InstalledSource) => void;
  onPin: (source: InstalledSource) => void;
  onUnpin: (source: InstalledSource) => void;
  onReorder: () => void;
  onDelete: (source: InstalledSource) => void;
};

const SourcesPage = memo(function SourcesPage({
  pageId,
  onHeight,
  rows,
  query,
  searchActive,
  swipeLeading,
  swipeTrailing,
  isPinned,
  getSourceUpdate,
  onOpen,
  onOpenSettings,
  onPin,
  onUnpin,
  onReorder,
  onDelete,
}: SourcesPageProps) {
  const { visibilityById, matchingCount } = useMemo(() => {
    if (!searchActive) {
      return { visibilityById: null, matchingCount: rows.length };
    }
    const map = new Map<string, boolean>();
    let count = 0;
    let headerId: string | null = null;
    let anyMatch = false;
    for (const row of rows) {
      if (row.kind === "header") {
        if (headerId) map.set(headerId, anyMatch);
        headerId = row.id;
        anyMatch = false;
        continue;
      }
      const matches = matchesInstalledSource(row.source, query);
      map.set(row.id, matches);
      if (matches) {
        count++;
        anyMatch = true;
      }
    }
    if (headerId) map.set(headerId, anyMatch);
    return { visibilityById: map, matchingCount: count };
  }, [rows, searchActive, query]);

  const renderItem = useCallback(
    ({ item }: { item: SourceListRow }) => {
      const visible = visibilityById?.get(item.id) ?? true;

      if (item.kind === "header") {
        return (
          <HeaderRow
            title={item.title}
            isFirst={item.isFirst}
            visible={visible}
            searchActive={searchActive}
          />
        );
      }

      return (
        <SourceRow
          source={item.source}
          pinned={isPinned(item.source)}
          updateVersion={getSourceUpdate(item.source.id)?.availableVersion}
          visible={visible}
          searchActive={searchActive}
          swipeLeading={swipeLeading}
          swipeTrailing={swipeTrailing}
          onOpen={onOpen}
          onOpenSettings={onOpenSettings}
          onPin={onPin}
          onUnpin={onUnpin}
          onReorder={onReorder}
          onDelete={onDelete}
        />
      );
    },
    [
      visibilityById,
      searchActive,
      swipeLeading,
      swipeTrailing,
      isPinned,
      getSourceUpdate,
      onOpen,
      onOpenSettings,
      onPin,
      onUnpin,
      onReorder,
      onDelete,
    ],
  );

  const contentContainerStyle = useMemo(
    () => [styles.listContent, searchActive && styles.listContentSearching],
    [searchActive],
  );

  const handleEmptyLayout = useCallback(
    (event: LayoutChangeEvent) =>
      onHeight(pageId, event.nativeEvent.layout.height),
    [onHeight, pageId],
  );

  const renderRow = useCallback(
    (item: SourceListRow) => renderItem({ item }),
    [renderItem],
  );

  if (searchActive && matchingCount === 0) {
    return (
      <View collapsable={false} style={styles.root}>
        <View collapsable={false} onLayout={handleEmptyLayout}>
          <EmptyState
            icon="search-outline"
            title={t("source_search_empty_title")}
            description={t("source_search_empty_desc")}
          />
        </View>
      </View>
    );
  }

  return (
    <View collapsable={false} style={styles.root}>
      <View
        collapsable={false}
        onLayout={handleEmptyLayout}
        style={contentContainerStyle}
      >
        {rows.map((row) => (
          <Fragment key={itemKeyExtractor(row)}>{renderRow(row)}</Fragment>
        ))}
        {LIST_FOOTER}
      </View>
    </View>
  );
});

function buildCategoryRows(
  category: SourcesCategoryId,
  installed: InstalledSource[],
  isPinned: (source: InstalledSource) => boolean,
): SourceListRow[] {
  const toRows = (
    title: string,
    key: string,
    data: InstalledSource[],
    isFirst: boolean,
  ) => {
    const rows: SourceListRow[] = [];
    if (title) {
      rows.push({ kind: "header", id: `header-${key}`, title, isFirst });
    }
    for (const source of data) {
      rows.push({ kind: "source", id: getSourceLayoutKey(source), source });
    }
    return rows;
  };

  if (category === "nsfw") {
    return toRows("", "nsfw", installed, true);
  }
  if (category === "pinned") {
    return toRows(
      "",
      "pinned",
      installed.filter((source) => isPinned(source)),
      true,
    );
  }
  if (category === "aidoku" || category === "tamdok") {
    return toRows(
      "",
      category,
      installed.filter((source) => source.kind === category),
      true,
    );
  }

  const pinned = installed.filter((source) => isPinned(source));
  const unpinned = installed.filter((source) => !isPinned(source));
  const rows: SourceListRow[] = [];
  if (pinned.length > 0) {
    rows.push(...toRows(t("sources_pinned"), "pinned", pinned, true));
  }
  if (unpinned.length > 0) {
    rows.push(
      ...toRows(
        pinned.length > 0 ? t("sources_all") : t("sources"),
        "all",
        unpinned,
        pinned.length === 0,
      ),
    );
  }
  return rows;
}

export default function SourcesScreen() {
  const router = useRouter();
  const { colors, radius, isDark } = useTheme();
  const { stackSearchBarProps } = useNavigationTheme();
  const insets = useSafeAreaInsets();
  const {
    visibleInstalled: installed,
    isLoading,
    isPinned,
    pinSource,
    unpinSource,
    reorderSources,
    uninstall,
    getSourceUpdate,
  } = useSources();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedCategory, setSelectedCategory] =
    useState<SourcesCategoryId>("all");
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [reorderData, setReorderData] = useState(installed);
  const listRef = useRef<FlatList<SourcesListItem>>(null);
  const pagerRef = useRef<PagerView>(null);
  const progress = useSharedValue(0);
  const isEmpty = !isLoading && installed.length === 0;
  const searchActive = isSearchActive(deferredQuery);

  const latest = useRef({
    router,
    installed,
    pinSource,
    unpinSource,
    reorderSources,
    uninstall,
  });
  latest.current = {
    router,
    installed,
    pinSource,
    unpinSource,
    reorderSources,
    uninstall,
  };

  const openSource = useCallback((source: InstalledSource) => {
    latest.current.router.navigate(
      `/sources/${encodeURIComponent(sourceRouteId(source))}`,
    );
  }, []);

  const openSourceSettings = useCallback((source: InstalledSource) => {
    latest.current.router.navigate(
      `/settings/source/${encodeURIComponent(sourceRouteId(source))}`,
    );
  }, []);

  const handlePin = useCallback(
    (source: InstalledSource) => void latest.current.pinSource(source),
    [],
  );
  const handleUnpin = useCallback(
    (source: InstalledSource) => void latest.current.unpinSource(source),
    [],
  );

  const confirmUninstall = useCallback((source: InstalledSource) => {
    Alert.alert(
      t("sources_uninstall_title"),
      t("sources_uninstall_confirm", { name: source.manifest.info.name }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("sources_uninstall_action"),
          style: "destructive",
          onPress: () => void latest.current.uninstall(source),
        },
      ],
    );
  }, []);

  const enterReorderMode = useCallback(() => {
    setReorderData([...latest.current.installed]);
    setIsReorderMode(true);
  }, []);

  const exitReorderMode = useCallback(() => setIsReorderMode(false), []);

  const [separateNsfw, setSeparateNsfw] = useState(false);
  const [nsfwKillSwitch, setNsfwKillSwitch] = useState(false);
  useEffect(() => {
    const load = () =>
      void getAppSettings().then((settings) => {
        setSeparateNsfw(settings.privacy.separateNsfwSources);
        setNsfwKillSwitch(settings.privacy.nsfwKillSwitch);
      });
    load();
    return subscribeAppSettings(load);
  }, []);

  const nsfwSources = useMemo(
    () => (separateNsfw ? installed.filter(isNsfwSource) : []),
    [installed, separateNsfw],
  );
  const mainSources = useMemo(
    () =>
      separateNsfw ? installed.filter((s) => !isNsfwSource(s)) : installed,
    [installed, separateNsfw],
  );

  const hasPinned = useMemo(
    () => mainSources.some((source) => isPinned(source)),
    [mainSources, isPinned],
  );
  const hasAidoku = useMemo(
    () => mainSources.some((source) => source.kind === "aidoku"),
    [mainSources],
  );
  const hasTamdok = useMemo(
    () => mainSources.some((source) => source.kind === "tamdok"),
    [mainSources],
  );
  const hasNsfw = nsfwSources.length > 0 && !nsfwKillSwitch;
  const showKindTabs = hasAidoku && hasTamdok;

  const categoryTabs = useMemo<LibraryCategoryTab[]>(() => {
    const tabs: LibraryCategoryTab[] = [{ id: "all", label: t("sources") }];
    if (hasPinned) tabs.push({ id: "pinned", label: t("sources_pinned") });
    if (hasNsfw) tabs.push({ id: "nsfw", label: t("sources_tab_nsfw") });
    if (showKindTabs) {
      tabs.push({ id: "aidoku", label: t("sources_tab_aidoku") });
      tabs.push({ id: "tamdok", label: t("sources_tab_tamdok") });
    }
    return tabs;
  }, [hasPinned, showKindTabs, hasNsfw]);

  useEffect(() => {
    if (!categoryTabs.some((tab) => tab.id === selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [categoryTabs, selectedCategory]);

  const pagerKey = useMemo(
    () => categoryTabs.map((tab) => tab.id).join("|"),
    [categoryTabs],
  );

  const selectedPageIndex = Math.max(
    0,
    categoryTabs.findIndex((tab) => tab.id === selectedCategory),
  );

  const pages = useMemo<SourcesCategoryPage[]>(
    () =>
      categoryTabs.map((tab) => ({
        id: tab.id as SourcesCategoryId,
        rows: buildCategoryRows(
          tab.id as SourcesCategoryId,
          tab.id === "nsfw" ? nsfwSources : mainSources,
          isPinned,
        ),
      })),
    [categoryTabs, mainSources, nsfwSources, isPinned],
  );

  const { pagerHeight, onHeight: handlePageHeight } = usePagerHeights(
    pages.map((page) => page.id),
    selectedPageIndex,
  );
  const { spacerHeight, renderOverlay } = usePinnedTabs(
    categoryTabs.length > 1,
  );

  const pageScrollHandler = usePageScrollHandler({
    onPageScroll: (event) => {
      "worklet";
      progress.value = event.position + event.offset;
    },
  });

  const handleTabPress = useCallback(
    (index: number) => {
      if (Math.abs(index - selectedPageIndex) > 1) {
        pagerRef.current?.setPageWithoutAnimation(index);
      } else {
        pagerRef.current?.setPage(index);
      }
    },
    [selectedPageIndex],
  );

  const handlePageSelected = useCallback(
    (index: number) => {
      const tab = categoryTabs[index];
      if (!tab) return;
      setSelectedCategory(tab.id as SourcesCategoryId);
      void Haptics.selectionAsync();
    },
    [categoryTabs],
  );

  useEffect(() => {
    if (!isReorderMode) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [isReorderMode]);

  const renderReorderItem = useCallback(
    (params: RenderItemParams<SourcesListItem>) => {
      const source = params.item as InstalledSource;
      return (
        <ReorderRow
          source={source}
          updateVersion={getSourceUpdate(source.id)?.availableVersion}
          drag={params.drag}
          isActive={params.isActive}
        />
      );
    },
    [getSourceUpdate],
  );

  const renderPlaceholder = useCallback(
    ({ item }: { item: SourcesListItem }) => (
      <DragPlaceholder source={item as InstalledSource} />
    ),
    [],
  );

  const handleDragEnd = useCallback(({ data }: { data: SourcesListItem[] }) => {
    const next = data as InstalledSource[];
    setReorderData(next);
    void latest.current.reorderSources(
      next.map((source) => getSourceLayoutKey(source)),
    );
  }, []);

  const reorderContentStyle = useMemo(
    () => [
      styles.reorderListContent,
      {
        paddingTop: Spacing.xs,
        paddingBottom: BottomTabInset + insets.bottom,
      },
    ],
    [insets.bottom],
  );

  const renderDoneButton = useCallback(
    () => (
      <Pressable
        onPress={exitReorderMode}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t("done")}
      >
        <Ionicons name="checkmark" size={24} color={colors.tint} />
      </Pressable>
    ),
    [exitReorderMode, colors.tint],
  );

  const screenOptions = useMemo(
    () => ({
      headerLargeTitle: false,
      headerTransparent: !isReorderMode,
      headerStyle: isReorderMode
        ? { backgroundColor: colors.groupedBackground }
        : undefined,
      headerShadowVisible: isReorderMode,
      headerRight: isReorderMode ? renderDoneButton : undefined,
    }),
    [isReorderMode, colors.groupedBackground, renderDoneButton],
  );

  const handleSearchText = useCallback(
    (event: { nativeEvent: { text: string } }) =>
      setQuery(event.nativeEvent.text),
    [],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <Stack.Title>
        {isReorderMode ? t("sources_reorder") : t("sources")}
      </Stack.Title>
      {!isReorderMode && (
        <Stack.SearchBar
          key={isDark ? "sources-search-dark" : "sources-search-light"}
          placeholder={t("sources_search_placeholder")}
          {...stackSearchBarProps}
          placement="integratedButton"
          tintColor={colors.tint}
          hideWhenScrolling
          onChangeText={handleSearchText}
          onSearchButtonPress={handleSearchText}
        />
      )}
      {isLoading || isEmpty ? (
        <ScreenContent centerContent={isLoading || isEmpty}>
          {isLoading ? (
            <ActivityIndicator color={colors.tint} />
          ) : (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="globe-outline"
                title={t("sources_empty_title")}
                description={t("sources_empty_settings_hint")}
              />
              <Pressable
                style={[
                  styles.settingsButton,
                  { backgroundColor: colors.tint, borderRadius: radius.md },
                ]}
                onPress={() => router.navigate("/settings/sources")}
              >
                <ThemedText variant="headline" color="onTint">
                  {t("section_sources")}
                </ThemedText>
              </Pressable>
            </View>
          )}
        </ScreenContent>
      ) : isReorderMode ? (
        <ThemedView color="groupedBackground" style={styles.root}>
          <DraggableFlatList<SourcesListItem>
            ref={listRef}
            containerStyle={styles.listContainer}
            data={reorderData}
            keyExtractor={itemKeyExtractor}
            renderItem={renderReorderItem}
            activationDistance={12}
            dragItemOverflow
            enableLayoutAnimationExperimental={false}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustsScrollIndicatorInsets={false}
            renderScrollComponent={renderScrollComponent}
            contentContainerStyle={reorderContentStyle}
            getItemLayout={reorderItemLayout}
            renderPlaceholder={renderPlaceholder}
            onDragEnd={handleDragEnd}
          />
        </ThemedView>
      ) : (
        <ThemedView color="groupedBackground" style={styles.root}>
          <LiquidGlassScrollComponent
            contentInsetAdjustmentBehavior="automatic"
            automaticallyAdjustsScrollIndicatorInsets
            showsVerticalScrollIndicator={false}
          >
            <IncognitoModeBanner />
            <View style={{ height: spacerHeight }} />
            <SwipeableRowsProvider>
              <AnimatedPagerView
                ref={pagerRef}
                key={pagerKey}
                style={{ height: pagerHeight }}
                initialPage={selectedPageIndex}
                onPageScroll={pageScrollHandler}
                onPageSelected={(event) =>
                  handlePageSelected(event.nativeEvent.position)
                }
                scrollEnabled={categoryTabs.length > 1}
                offscreenPageLimit={1}
              >
                {pages.map((page, index) => (
                  <SourcesPage
                    key={page.id}
                    pageId={page.id}
                    onHeight={handlePageHeight}
                    rows={page.rows}
                    query={deferredQuery}
                    searchActive={searchActive}
                    swipeLeading={index === 0}
                    swipeTrailing={index === pages.length - 1}
                    isPinned={isPinned}
                    getSourceUpdate={getSourceUpdate}
                    onOpen={openSource}
                    onOpenSettings={openSourceSettings}
                    onPin={handlePin}
                    onUnpin={handleUnpin}
                    onReorder={enterReorderMode}
                    onDelete={confirmUninstall}
                  />
                ))}
              </AnimatedPagerView>
            </SwipeableRowsProvider>
          </LiquidGlassScrollComponent>
          {renderOverlay(
            <LibraryCategoryTabs
              key={pagerKey}
              tabs={categoryTabs}
              progress={progress}
              onPress={handleTabPress}
            />,
          )}
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
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
  },
  reorderItem: {
    width: "100%",
    height: REORDER_ROW_HEIGHT,
    justifyContent: "center",
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
    width: "100%",
    overflow: "hidden",
  },
  swipeCard: {
    backgroundColor: "transparent",
  },
  cardDragging: {
    opacity: 0.98,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  dragPlaceholder: {
    opacity: 0.35,
  },
  emptyWrap: {
    width: "100%",
    maxWidth: 360,
    gap: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  settingsButton: {
    width: "100%",
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
