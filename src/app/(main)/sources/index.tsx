import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import {
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
} from "react-native";
import { FlatList } from "react-native-gesture-handler";
import DraggableFlatList, {
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  SourceCategoryTabs,
  type SourceCategoryTab,
} from "@/components/sources/source-category-tabs";
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
import { useTheme } from "@/hooks/use-theme";
import type { InstalledSource } from "@/parsers/shared/types";
import { getSourceLayoutKey, sourceRouteId } from "@/services/sources";
import { isSearchActive, matchesInstalledSource } from "@/utils/source-search";

type SourceSection = {
  key: string;
  title: string;
  data: InstalledSource[];
};

type SourceListRow =
  | { kind: "header"; id: string; title: string; isFirst: boolean }
  | { kind: "source"; id: string; source: InstalledSource };

type SourcesListItem = SourceListRow | InstalledSource;
type SourcesCategoryId = "all" | "pinned" | "aidoku" | "tamdok";
type UpdateVersion = ComponentProps<typeof SourceListItem>["updateAvailable"];

const REORDER_ROW_HEIGHT = 76;
const PIN_SWIPE_COLOR = "#E5B800";

const NORMAL_LIST_PROPS = {
  initialNumToRender: 14,
  maxToRenderPerBatch: 8,
  windowSize: 9,
  updateCellsBatchingPeriod: 50,
} as const;

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
  onOpen,
  onOpenSettings,
  onPin,
  onUnpin,
  onReorder,
  onDelete,
}: SourceRowProps) {
  const leadingActions = useMemo<SwipeAction[]>(
    () => [
      {
        key: "pin",
        label: pinned ? t("sources_unpin") : t("sources_pin"),
        icon: pinned ? "pin-outline" : "pin",
        sfSymbol: pinned ? "pin.slash.fill" : "pin.fill",
        color: PIN_SWIPE_COLOR,
        onPress: () => (pinned ? onUnpin(source) : onPin(source)),
      },
    ],
    [pinned, source, onPin, onUnpin],
  );

  const trailingActions = useMemo<SwipeAction[]>(
    () => [
      {
        key: "settings",
        label: t("settings"),
        icon: "settings-outline",
        color: "#8E8E93",
        onPress: () => onOpenSettings(source),
      },
    ],
    [source, onOpenSettings],
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

export default function SourcesScreen() {
  const router = useRouter();
  const { colors, radius, isDark } = useTheme();
  const { stackSearchBarProps } = useNavigationTheme();
  const insets = useSafeAreaInsets();
  const {
    installed,
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

  const hasPinned = useMemo(
    () => installed.some((source) => isPinned(source)),
    [installed, isPinned],
  );
  const hasAidoku = useMemo(
    () => installed.some((source) => source.kind === "aidoku"),
    [installed],
  );
  const hasTamdok = useMemo(
    () => installed.some((source) => source.kind === "tamdok"),
    [installed],
  );
  const showKindTabs = hasAidoku && hasTamdok;

  const categoryTabs = useMemo<SourceCategoryTab[]>(() => {
    const tabs: SourceCategoryTab[] = [{ id: "all", label: t("sources") }];
    if (hasPinned) tabs.push({ id: "pinned", label: t("sources_pinned") });
    if (showKindTabs) {
      tabs.push({ id: "aidoku", label: t("sources_tab_aidoku") });
      tabs.push({ id: "tamdok", label: t("sources_tab_tamdok") });
    }
    return tabs;
  }, [hasPinned, showKindTabs]);

  useEffect(() => {
    if (!categoryTabs.some((tab) => tab.id === selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [categoryTabs, selectedCategory]);

  const handleSelectCategory = useCallback(
    (id: string) => setSelectedCategory(id as SourcesCategoryId),
    [],
  );

  const filteredByCategory = useMemo(() => {
    switch (selectedCategory) {
      case "pinned":
        return installed.filter((source) => isPinned(source));
      case "aidoku":
        return installed.filter((source) => source.kind === "aidoku");
      case "tamdok":
        return installed.filter((source) => source.kind === "tamdok");
      default:
        return installed;
    }
  }, [installed, isPinned, selectedCategory]);

  const sections = useMemo<SourceSection[]>(() => {
    if (selectedCategory !== "all") {
      if (filteredByCategory.length === 0) return [];
      return [{ key: selectedCategory, title: "", data: filteredByCategory }];
    }

    const pinned = filteredByCategory.filter((source) => isPinned(source));
    const unpinned = filteredByCategory.filter((source) => !isPinned(source));
    const result: SourceSection[] = [];

    if (pinned.length > 0) {
      result.push({ key: "pinned", title: t("sources_pinned"), data: pinned });
    }
    if (unpinned.length > 0) {
      result.push({
        key: "all",
        title: pinned.length > 0 ? t("sources_all") : t("sources"),
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
          kind: "header",
          id: `header-${section.key}`,
          title: section.title,
          isFirst: sectionIndex === 0,
        });
      }
      section.data.forEach((source) => {
        rows.push({ kind: "source", id: getSourceLayoutKey(source), source });
      });
    });
    return rows;
  }, [sections]);

  const { visibilityById, matchingSourceCount } = useMemo(() => {
    if (!searchActive) {
      return {
        visibilityById: null,
        matchingSourceCount: filteredByCategory.length,
      };
    }
    const map = new Map<string, boolean>();
    let count = 0;
    for (const section of sections) {
      let anyMatch = false;
      for (const source of section.data) {
        const matches = matchesInstalledSource(source, deferredQuery);
        map.set(getSourceLayoutKey(source), matches);
        if (matches) {
          anyMatch = true;
          count++;
        }
      }
      map.set(`header-${section.key}`, anyMatch);
    }
    return { visibilityById: map, matchingSourceCount: count };
  }, [searchActive, sections, filteredByCategory.length, deferredQuery]);

  useEffect(() => {
    if (!isReorderMode) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [isReorderMode]);

  const renderItem = useCallback(
    (params: RenderItemParams<SourcesListItem>) => {
      if (isReorderMode) {
        const source = params.item as InstalledSource;
        return (
          <ReorderRow
            source={source}
            updateVersion={getSourceUpdate(source.id)?.availableVersion}
            drag={params.drag}
            isActive={params.isActive}
          />
        );
      }

      const row = params.item as SourceListRow;
      const visible = visibilityById?.get(row.id) ?? true;

      if (row.kind === "header") {
        return (
          <HeaderRow
            title={row.title}
            isFirst={row.isFirst}
            visible={visible}
            searchActive={searchActive}
          />
        );
      }

      return (
        <SourceRow
          source={row.source}
          pinned={isPinned(row.source)}
          updateVersion={getSourceUpdate(row.source.id)?.availableVersion}
          visible={visible}
          searchActive={searchActive}
          onOpen={openSource}
          onOpenSettings={openSourceSettings}
          onPin={handlePin}
          onUnpin={handleUnpin}
          onReorder={enterReorderMode}
          onDelete={confirmUninstall}
        />
      );
    },
    [
      isReorderMode,
      visibilityById,
      searchActive,
      isPinned,
      getSourceUpdate,
      openSource,
      openSourceSettings,
      handlePin,
      handleUnpin,
      enterReorderMode,
      confirmUninstall,
    ],
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

  const listHeader = useMemo(
    () =>
      isReorderMode ? undefined : (
        <>
          <IncognitoModeBanner />
          <SourceCategoryTabs
            tabs={categoryTabs}
            selectedId={selectedCategory}
            onSelect={handleSelectCategory}
          />
        </>
      ),
    [isReorderMode, categoryTabs, selectedCategory, handleSelectCategory],
  );

  const contentContainerStyle = useMemo(
    () =>
      isReorderMode
        ? [
            styles.reorderListContent,
            {
              paddingTop: Spacing.xs,
              paddingBottom: BottomTabInset + insets.bottom,
            },
          ]
        : [styles.listContent, searchActive && styles.listContentSearching],
    [isReorderMode, searchActive, insets.bottom],
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
      headerLargeTitle: !isReorderMode,
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

  const categoryEmpty =
    !isLoading &&
    !isEmpty &&
    !isReorderMode &&
    !searchActive &&
    filteredByCategory.length === 0;

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <Stack.Title>
        {isReorderMode ? t("sources_reorder") : t("sources")}
      </Stack.Title>
      {!isReorderMode && !isLoading && !isEmpty && (
        <Stack.SearchBar
          key={isDark ? "sources-search-dark" : "sources-search-light"}
          placeholder={t("sources_search_placeholder")}
          {...stackSearchBarProps}
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
      ) : categoryEmpty ? (
        <ScreenContent centerContent>
          <EmptyState
            icon="globe-outline"
            title={t("sources_category_empty_title")}
            description={t("sources_category_empty_desc")}
          />
        </ScreenContent>
      ) : searchActive && matchingSourceCount === 0 ? (
        <ScreenContent centerContent>
          <EmptyState
            icon="search-outline"
            title={t("source_search_empty_title")}
            description={t("source_search_empty_desc")}
          />
        </ScreenContent>
      ) : (
        <ThemedView color="groupedBackground" style={styles.root}>
          <SwipeableRowsProvider>
            <DraggableFlatList<SourcesListItem>
              ref={listRef}
              containerStyle={styles.listContainer}
              data={isReorderMode ? reorderData : listRows}
              keyExtractor={itemKeyExtractor}
              renderItem={renderItem}
              activationDistance={isReorderMode ? 12 : 10000}
              dragItemOverflow={isReorderMode}
              enableLayoutAnimationExperimental={false}
              contentInsetAdjustmentBehavior={
                isReorderMode ? "never" : "automatic"
              }
              automaticallyAdjustsScrollIndicatorInsets={!isReorderMode}
              renderScrollComponent={renderScrollComponent}
              contentContainerStyle={contentContainerStyle}
              ListHeaderComponent={listHeader}
              ListFooterComponent={isReorderMode ? undefined : LIST_FOOTER}
              getItemLayout={isReorderMode ? reorderItemLayout : undefined}
              renderPlaceholder={isReorderMode ? renderPlaceholder : undefined}
              onDragEnd={isReorderMode ? handleDragEnd : undefined}
              {...(isReorderMode ? null : NORMAL_LIST_PROPS)}
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
