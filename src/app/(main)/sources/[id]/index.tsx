import { SourceNotFound } from "@/components/sources/source-not-found";
import { MeasuredPage } from "@/components/ui/measured-page";
import { VirtualRows } from "@/components/ui/virtual-rows";
import { usePagerHeights } from "@/hooks/use-pager-heights";
import { useNearEnd } from "@/hooks/use-near-end";
import { usePinnedTabs } from "@/components/library/pinned-tabs";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Haptics from "expo-haptics";
import Animated, { useSharedValue } from "react-native-reanimated";
import PagerView from "react-native-pager-view";
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";

import { HomePlaceholderLayout } from "@/components/manga/home-placeholder-layout";
import {
  MangaRefreshStatus,
  useRefreshStatus,
} from "@/components/manga/manga-refresh-status";
import { HomeSection } from "@/components/manga/home-section";
import { IncognitoModeBanner } from "@/components/settings/incognito-mode-banner";
import {
  LibraryCategoryTabs,
  type LibraryCategoryTab,
} from "@/components/library/library-category-tabs";
import { SourceHomeAlertBanner } from "@/components/sources/source-home-alert-banner";
import { SourceListingPanel } from "@/components/sources/source-listing-panel";
import { SourceOverflowMenu } from "@/components/sources/source-overflow-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { MangaGridSkeleton } from "@/components/ui/skeleton";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { LiquidGlassScrollComponent } from "@/components/ui/liquid-glass-scroll-root";
import { ScreenContent } from "@/components/ui/screen-content";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { SourceCoverHeadersProvider } from "@/context/source-cover-context";
import { useSources } from "@/context/sources-context";
import { usePageScrollHandler } from "@/hooks/use-page-scroll-handler";
import { useSourceHome } from "@/hooks/use-source-home";
import { sourceWebsiteUrl } from "@/hooks/use-source-filters";
import { useSourceRunner } from "@/hooks/use-source-runner";
import { useTheme } from "@/hooks/use-theme";
import type { FilterValue, Manga } from "@/parsers/shared/types";
import { IllustrationSourceScreen } from "@/components/sources/illustration-source-screen";
import { isIllustrationSourceRoute } from "@/services/illustration-mode";
import { findInstalledSource, sourceRouteId } from "@/services/sources";
import { mangaHref, sourceSearchHref } from "@/utils/manga-route";

export const SOURCE_HOME_TAB_ID = "__home__";

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

function decodeSourceRouteId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

const HOME_SECTION_ESTIMATE = 280;

type HomeRow = { key: string; component: HomeComponent };

const homeRowKey = (row: HomeRow) => row.key;

function RealSourceHomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const sourceRoute = decodeSourceRouteId(rawId ?? "");
  const { installed } = useSources();
  const source = findInstalledSource(installed, sourceRoute);
  const {
    runner,
    error: runnerError,
    isLoading: runnerLoading,
  } = useSourceRunner(source);
  const {
    home,
    listings,
    isLoading,
    isRefreshing,
    loadError: homeLoadError,
    hasCachedContent,
    refresh,
    dismissError,
  } = useSourceHome({ source, runner });
  const [selectedTabId, setSelectedTabId] = useState(SOURCE_HOME_TAB_ID);
  const [activatedTabs, setActivatedTabs] = useState<Set<string>>(
    () => new Set([SOURCE_HOME_TAB_ID]),
  );
  const pagerRef = useRef<PagerView>(null);
  const progress = useSharedValue(0);

  const sourceKey = source ? sourceRouteId(source) : null;

  const openManga = useCallback(
    (manga: Manga) => {
      if (!sourceKey) return;
      router.navigate(mangaHref(sourceKey, manga));
    },
    [router, sourceKey],
  );

  const openSearch = useCallback(() => {
    router.navigate(sourceSearchHref(sourceRoute));
  }, [router, sourceRoute]);

  const openSearchWithFilters = useCallback(
    (filters: FilterValue[]) => {
      router.navigate(sourceSearchHref(sourceRoute, "", filters));
    },
    [router, sourceRoute],
  );

  const openSettings = useCallback(() => {
    router.navigate(`/sources/${encodeURIComponent(sourceRoute)}/settings`);
  }, [router, sourceRoute]);

  const activateTab = useCallback((id: string) => {
    setActivatedTabs((previous) =>
      previous.has(id) ? previous : new Set(previous).add(id),
    );
  }, []);

  const websiteUrl = useMemo(() => sourceWebsiteUrl(source), [source]);

  const categoryTabs = useMemo<LibraryCategoryTab[]>(() => {
    const tabs: LibraryCategoryTab[] = [
      { id: SOURCE_HOME_TAB_ID, label: t("source_tab_home") },
    ];
    for (const listing of listings) {
      tabs.push({ id: listing.id, label: listing.name ?? listing.id });
    }
    return tabs;
  }, [listings]);

  const pagerKey = useMemo(
    () => categoryTabs.map((tab) => tab.id).join("|"),
    [categoryTabs],
  );

  const selectedIndex = Math.max(
    0,
    categoryTabs.findIndex((tab) => tab.id === selectedTabId),
  );

  const openListing = useCallback(
    (listing: { id: string }) => {
      const index = categoryTabs.findIndex((tab) => tab.id === listing.id);
      if (index < 0) return;
      activateTab(listing.id);
      pagerRef.current?.setPage(index);
    },
    [categoryTabs, activateTab],
  );

  const pageScrollHandler = usePageScrollHandler({
    onPageScroll: (event) => {
      "worklet";
      progress.value = event.position + event.offset;
    },
  });

  const handleTabPress = useCallback(
    (index: number) => {
      const tab = categoryTabs[index];
      if (tab) activateTab(tab.id);
      if (Math.abs(index - selectedIndex) > 1) {
        pagerRef.current?.setPageWithoutAnimation(index);
      } else {
        pagerRef.current?.setPage(index);
      }
    },
    [categoryTabs, selectedIndex, activateTab],
  );

  const handlePageSelected = useCallback(
    (index: number) => {
      const tab = categoryTabs[index];
      if (!tab) return;
      setSelectedTabId(tab.id);
      activateTab(tab.id);
      void Haptics.selectionAsync();
    },
    [categoryTabs, activateTab],
  );

  const homeComponents = home?.components ?? EMPTY_COMPONENTS;

  const err = runnerError ?? homeLoadError;
  const combinedError = err?.includes("HTTP 403") ? "Try to disable VPN" : err;
  const hasHomeContent = homeComponents.length > 0;
  const showBlockingError =
    Boolean(combinedError) &&
    !hasCachedContent &&
    !hasHomeContent &&
    !isLoading &&
    !runnerLoading;
  const showInlineError =
    Boolean(combinedError) && (hasCachedContent || hasHomeContent);
  const showHomePlaceholder =
    (isLoading || runnerLoading) && !hasCachedContent && !hasHomeContent;

  const showHeaderSpinner = isRefreshing || showHomePlaceholder;

  const alertBanner = useMemo(
    () =>
      showInlineError && combinedError ? (
        <SourceHomeAlertBanner
          message={combinedError}
          onDismiss={dismissError}
        />
      ) : null,
    [showInlineError, combinedError, dismissError],
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={false}
        onRefresh={refresh}
        tintColor={colors.secondaryLabel}
      />
    ),
    [refresh, colors.tint],
  );

  const refreshStatus = useRefreshStatus(showHeaderSpinner, combinedError ?? null);

  const headerRight = useCallback(
    () => (
      <View style={styles.headerActions}>
        <MangaRefreshStatus status={refreshStatus} />
        <HeaderIconButton icon="search" onPress={openSearch} />
        <SourceOverflowMenu
          onOpenSettings={openSettings}
          websiteUrl={websiteUrl}
        />
      </View>
    ),
    [refreshStatus, openSearch, openSettings, websiteUrl],
  );

  const sourceName = source?.manifest.info.name;
  const screenOptions = useMemo(
    () => ({ title: sourceName, headerRight }),
    [sourceName, headerRight],
  );

  const sourceId = source?.id;

  const renderHomeRow = useCallback(
    (row: HomeRow) => (
      <HomeSection
        component={row.component}
        sourceId={sourceId}
        onPressManga={openManga}
        onPressListing={openListing}
        onApplyHomeFilters={openSearchWithFilters}
      />
    ),
    [sourceId, openManga, openListing, openSearchWithFilters],
  );

  const homeRows = useMemo<HomeRow[]>(
    () =>
      homeComponents.map((component, index) => ({
        key: sectionKeyExtractor(component, index),
        component,
      })),
    [homeComponents],
  );

  const loadMoreRef = useRef(new Map<string, () => void>());
  const registerLoadMore = useCallback(
    (id: string, loadMore: (() => void) | null) => {
      if (loadMore) loadMoreRef.current.set(id, loadMore);
      else loadMoreRef.current.delete(id);
    },
    [],
  );
  const handleScroll = useNearEnd(() => {
    const id = categoryTabs[selectedIndex]?.id;
    if (id) loadMoreRef.current.get(id)?.();
  });

  const { pagerHeight, onHeight: handlePageHeight } = usePagerHeights(
    categoryTabs.map((tab) => tab.id),
    selectedIndex,
  );
  const { onScroll: handlePinnedScroll, spacer, renderTabs } = usePinnedTabs(
    categoryTabs.length > 1,
    { onScrollJS: handleScroll },
  );

  if (!source) {
    return (
      <>
        <Stack.Screen options={{ title: t("sources") }} />
        <SourceNotFound />
      </>
    );
  }

  let homeBody: ReactNode;
  if (showHomePlaceholder) {
    homeBody = (
      <MeasuredPage pageId={SOURCE_HOME_TAB_ID} onHeight={handlePageHeight}>
        <HomePlaceholderLayout />
      </MeasuredPage>
    );
  } else if (hasHomeContent) {
    homeBody = (
      <VirtualRows
        rows={homeRows}
        rowHeight={HOME_SECTION_ESTIMATE}
        keyOf={homeRowKey}
        renderRow={renderHomeRow}
        pageId={SOURCE_HOME_TAB_ID}
        onHeight={handlePageHeight}
        style={styles.home}
      />
    );
  } else if (listings[0] && runner) {
    homeBody = (
      <SourceListingPanel
        runner={runner}
        listing={listings[0]}
        sourceId={source.id}
        onPressManga={openManga}
        pageId={SOURCE_HOME_TAB_ID}
        onHeight={handlePageHeight}
        registerLoadMore={registerLoadMore}
      />
    );
  } else if (runnerLoading) {
    homeBody = (
      <MeasuredPage pageId={SOURCE_HOME_TAB_ID} onHeight={handlePageHeight}>
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      </MeasuredPage>
    );
  } else {
    homeBody = (
      <MeasuredPage pageId={SOURCE_HOME_TAB_ID} onHeight={handlePageHeight}>
        <EmptyState
          icon="book-outline"
          title={t("sources_browse_empty")}
          description={t("sources_try_search")}
        />
      </MeasuredPage>
    );
  }

  const hasTabs = categoryTabs.length > 1;

  const body = showBlockingError ? null : (
    <View style={styles.flex}>
      <LiquidGlassScrollComponent
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustsScrollIndicatorInsets
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        onScroll={handlePinnedScroll}
        scrollEventThrottle={16}
      >
        <IncognitoModeBanner />
        {alertBanner}
        {spacer}
        <AnimatedPagerView
          ref={pagerRef}
          key={pagerKey}
          style={{ height: pagerHeight }}
          initialPage={selectedIndex}
          onPageScroll={pageScrollHandler}
          onPageSelected={(event) =>
            handlePageSelected(event.nativeEvent.position)
          }
          scrollEnabled={hasTabs}
          offscreenPageLimit={1}
        >
          <View
            key={SOURCE_HOME_TAB_ID}
            collapsable={false}
            style={styles.flex}
          >
            {homeBody}
          </View>
          {listings.map((listing) => (
            <View key={listing.id} collapsable={false} style={styles.flex}>
              {activatedTabs.has(listing.id) && runner ? (
                <SourceListingPanel
                  runner={runner}
                  listing={listing}
                  sourceId={source.id}
                  onPressManga={openManga}
                  pageId={listing.id}
                  onHeight={handlePageHeight}
                  registerLoadMore={registerLoadMore}
                />
              ) : (
                <MeasuredPage pageId={listing.id} onHeight={handlePageHeight}>
                  <MangaGridSkeleton columns={3} rows={4} />
                </MeasuredPage>
              )}
            </View>
          ))}
        </AnimatedPagerView>
        {renderTabs(
          <LibraryCategoryTabs
            fullWidth
            key={pagerKey}
            tabs={categoryTabs}
            progress={progress}
            onPress={handleTabPress}
          />,
        )}
      </LiquidGlassScrollComponent>
    </View>
  );

  return (
    <SourceCoverHeadersProvider source={source}>
      <>
        <Stack.Screen options={screenOptions} />
        <ScreenContent
          padded={false}
          centerContent={showBlockingError}
          scrollable={false}
        >
          {showBlockingError ? (
            <EmptyState
              icon="alert-circle-outline"
              title={t("sources_load_error_title")}
              description={combinedError!}
            />
          ) : (
            body
          )}
        </ScreenContent>
      </>
    </SourceCoverHeadersProvider>
  );
}

type HomeComponent = NonNullable<
  ReturnType<typeof useSourceHome>["home"]
>["components"][number];

const EMPTY_COMPONENTS: HomeComponent[] = [];

function sectionKeyExtractor(component: HomeComponent, index: number): string {
  return `${component.title ?? "section"}-${index}`;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  home: {
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  pageSpacer: {
    height: Spacing.sm,
  },
  emptyHome: {
    flexGrow: 1,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingRight: Spacing.xs,
  },
  refreshIndicator: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function SourceHomeScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  if (isIllustrationSourceRoute(rawId ?? "")) return <IllustrationSourceScreen />;
  return <RealSourceHomeScreen />;
}
