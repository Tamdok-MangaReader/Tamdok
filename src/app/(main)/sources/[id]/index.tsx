import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  memo,
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { HomePlaceholderLayout } from "@/components/manga/home-placeholder-layout";
import { HomeSection } from "@/components/manga/home-section";
import { IncognitoModeBanner } from "@/components/settings/incognito-mode-banner";
import {
  SourceCategoryTabs,
  type SourceCategoryTab,
} from "@/components/sources/source-category-tabs";
import { SourceHomeAlertBanner } from "@/components/sources/source-home-alert-banner";
import { SourceListingPanel } from "@/components/sources/source-listing-panel";
import { SourceOverflowMenu } from "@/components/sources/source-overflow-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import {
  LiquidGlassScrollComponent,
  LiquidGlassScrollRoot,
} from "@/components/ui/liquid-glass-scroll-root";
import { ScreenContent } from "@/components/ui/screen-content";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { SourceCoverHeadersProvider } from "@/context/source-cover-context";
import { useSources } from "@/context/sources-context";
import { useSourceHome } from "@/hooks/use-source-home";
import { sourceWebsiteUrl } from "@/hooks/use-source-filters";
import { useSourceRunner } from "@/hooks/use-source-runner";
import { useTheme } from "@/hooks/use-theme";
import type { FilterValue, Manga } from "@/parsers/shared/types";
import { findInstalledSource, sourceRouteId } from "@/services/sources";
import { mangaHref, sourceSearchHref } from "@/utils/manga-route";

export const SOURCE_HOME_TAB_ID = "__home__";

function decodeSourceRouteId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

const renderScrollComponent = (
  props: ComponentProps<typeof LiquidGlassScrollComponent>,
) => <LiquidGlassScrollComponent {...props} />;

const LoadingHome = memo(function LoadingHome({
  chrome,
}: {
  chrome: ReactElement;
}) {
  return (
    <View style={styles.flex}>
      {chrome}
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    </View>
  );
});

const EmptyHome = memo(function EmptyHome({
  chrome,
  refreshControl,
}: {
  chrome: ReactElement;
  refreshControl: ReactElement<ComponentProps<typeof RefreshControl>>;
}) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.emptyHome}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={refreshControl}
    >
      {chrome}
      <EmptyState
        icon="book-outline"
        title={t("sources_browse_empty")}
        description={t("sources_try_search")}
      />
    </ScrollView>
  );
});

const PlaceholderHome = memo(function PlaceholderHome({
  chrome,
  refreshControl,
}: {
  chrome: ReactElement;
  refreshControl: ReactElement<ComponentProps<typeof RefreshControl>>;
}) {
  return (
    <LiquidGlassScrollRoot style={styles.scroll}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.home}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {chrome}
        <HomePlaceholderLayout />
      </ScrollView>
    </LiquidGlassScrollRoot>
  );
});

export default function SourceHomeScreen() {
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

  const openListing = useCallback(
    (listing: { id: string }) => setSelectedTabId(listing.id),
    [],
  );

  const websiteUrl = useMemo(() => sourceWebsiteUrl(source), [source]);

  const categoryTabs = useMemo<SourceCategoryTab[]>(() => {
    const tabs: SourceCategoryTab[] = [
      { id: SOURCE_HOME_TAB_ID, label: t("source_tab_home") },
    ];
    for (const listing of listings) {
      tabs.push({ id: listing.id, label: listing.name ?? listing.id });
    }
    return tabs;
  }, [listings]);

  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === selectedTabId),
    [listings, selectedTabId],
  );

  const homeComponents = home?.components ?? EMPTY_COMPONENTS;

  const err = runnerError ?? homeLoadError;
  const combinedError = err?.includes("HTTP 403") ? "Try to disable VPN" : err;
  const showHome = selectedTabId === SOURCE_HOME_TAB_ID;
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
  const showCategoryTabs = categoryTabs.length > 1;

  const categoryTabsElement = useMemo(
    () =>
      showCategoryTabs ? (
        <SourceCategoryTabs
          tabs={categoryTabs}
          selectedId={selectedTabId}
          onSelect={setSelectedTabId}
        />
      ) : null,
    [showCategoryTabs, categoryTabs, selectedTabId],
  );

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

  const homeChrome = useMemo(
    () => (
      <View style={styles.homeChrome}>
        <IncognitoModeBanner />
        {alertBanner}
        {categoryTabsElement}
      </View>
    ),
    [alertBanner, categoryTabsElement],
  );

  const listingChrome = useMemo(
    () => (
      <View style={styles.listingChrome}>
        <IncognitoModeBanner />
        {alertBanner}
        {categoryTabsElement}
      </View>
    ),
    [alertBanner, categoryTabsElement],
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={false}
        onRefresh={refresh}
        tintColor={colors.tint}
      />
    ),
    [refresh, colors.tint],
  );

  const headerRight = useCallback(
    () => (
      <View style={styles.headerActions}>
        {isRefreshing ? (
          <View style={styles.refreshIndicator}>
            <ActivityIndicator size="small" />
          </View>
        ) : null}
        <HeaderIconButton icon="search" onPress={openSearch} />
        <SourceOverflowMenu
          onOpenSettings={openSettings}
          websiteUrl={websiteUrl}
        />
      </View>
    ),
    [isRefreshing, openSearch, openSettings, websiteUrl],
  );

  const sourceName = source?.manifest.info.name;
  const screenOptions = useMemo(
    () => ({ title: sourceName, headerRight }),
    [sourceName, headerRight],
  );

  const sourceId = source?.id;

  const renderSection = useCallback(
    ({ item }: { item: HomeComponent }) => (
      <HomeSection
        component={item}
        sourceId={sourceId}
        onPressManga={openManga}
        onPressListing={openListing}
        onApplyHomeFilters={openSearchWithFilters}
      />
    ),
    [sourceId, openManga, openListing, openSearchWithFilters],
  );

  if (!source) {
    return (
      <>
        <Stack.Screen options={{ title: t("sources") }} />
        <ScreenContent centerContent>
          <EmptyState
            icon="alert-circle-outline"
            title={t("sources_not_found")}
          />
        </ScreenContent>
      </>
    );
  }

  let body: ReactNode;
  if (showBlockingError) {
    body = null;
  } else if (showHome && showHomePlaceholder) {
    body = (
      <PlaceholderHome chrome={homeChrome} refreshControl={refreshControl} />
    );
  } else if (showHome && hasHomeContent) {
    body = (
      <FlatList
        style={styles.scroll}
        data={homeComponents}
        keyExtractor={sectionKeyExtractor}
        renderItem={renderSection}
        ListHeaderComponent={homeChrome}
        contentContainerStyle={styles.home}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        renderScrollComponent={renderScrollComponent}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
      />
    );
  } else {
    const listing = showHome ? listings[0] : selectedListing;
    if (listing && runner) {
      body = (
        <SourceListingPanel
          runner={runner}
          listing={listing}
          sourceId={source.id}
          onPressManga={openManga}
          listHeader={listingChrome}
          refreshControl={refreshControl}
        />
      );
    } else if (runnerLoading) {
      body = <LoadingHome chrome={homeChrome} />;
    } else {
      body = <EmptyHome chrome={homeChrome} refreshControl={refreshControl} />;
    }
  }

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
            <View style={styles.flex}>{body}</View>
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
  homeChrome: {
    gap: Spacing.xs,
    paddingTop: Spacing.md,
  },
  listingChrome: {
    gap: Spacing.xs,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
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
