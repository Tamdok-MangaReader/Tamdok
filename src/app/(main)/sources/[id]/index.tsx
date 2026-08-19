import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { HomePlaceholderLayout } from '@/components/manga/home-placeholder-layout';
import { HomeSection } from '@/components/manga/home-section';
import { IncognitoModeBanner } from '@/components/settings/incognito-mode-banner';
import { SourceCategoryTabs, type SourceCategoryTab } from '@/components/sources/source-category-tabs';
import { SourceHomeAlertBanner } from '@/components/sources/source-home-alert-banner';
import { SourceListingPanel } from '@/components/sources/source-listing-panel';
import { SourceOverflowMenu } from '@/components/sources/source-overflow-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { HeaderIconButton } from '@/components/ui/header-icon-button';
import { LiquidGlassScrollRoot } from '@/components/ui/liquid-glass-scroll-root';
import { ScreenContent } from '@/components/ui/screen-content';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { SourceCoverHeadersProvider } from '@/context/source-cover-context';
import { useSources } from '@/context/sources-context';
import { useSourceHome } from '@/hooks/use-source-home';
import { sourceWebsiteUrl } from '@/hooks/use-source-filters';
import { useSourceRunner } from '@/hooks/use-source-runner';
import { useTheme } from '@/hooks/use-theme';
import type { FilterValue, Manga } from '@/parsers/shared/types';
import { findInstalledSource, sourceRouteId } from '@/services/sources';
import { mangaHref, sourceSearchHref } from '@/utils/manga-route';

export const SOURCE_HOME_TAB_ID = '__home__';

function decodeSourceRouteId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export default function SourceHomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const sourceRoute = decodeSourceRouteId(rawId ?? '');
  const { installed } = useSources();
  const source = findInstalledSource(installed, sourceRoute);
  const { runner, error: runnerError, isLoading: runnerLoading } = useSourceRunner(source);
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

  const openManga = useCallback(
    (manga: Manga) => {
      if (!source) return;
      router.push(mangaHref(sourceRouteId(source), manga));
    },
    [router, source],
  );

  const openSearch = () => {
    router.push(sourceSearchHref(sourceRoute));
  };

  const openSearchWithFilters = useCallback(
    (filters: FilterValue[]) => {
      router.push(sourceSearchHref(sourceRoute, '', filters));
    },
    [router, sourceRoute],
  );

  const openSettings = () => {
    router.push(`/sources/${encodeURIComponent(sourceRoute)}/settings`);
  };

  const websiteUrl = useMemo(() => sourceWebsiteUrl(source), [source]);

  const categoryTabs = useMemo<SourceCategoryTab[]>(() => {
    const tabs: SourceCategoryTab[] = [{ id: SOURCE_HOME_TAB_ID, label: t('source_tab_home') }];
    for (const listing of listings) {
      tabs.push({ id: listing.id, label: listing.name ?? listing.id });
    }
    return tabs;
  }, [listings]);

  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === selectedTabId),
    [listings, selectedTabId],
  );

  const combinedError = runnerError ?? homeLoadError;
  const showHome = selectedTabId === SOURCE_HOME_TAB_ID;
  const hasHomeContent = Boolean(home && home.components.length > 0);
  const showBlockingError =
    Boolean(combinedError) && !hasCachedContent && !hasHomeContent && !isLoading && !runnerLoading;
  const showInlineError = Boolean(combinedError) && (hasCachedContent || hasHomeContent);
  const showHomePlaceholder = (isLoading || runnerLoading) && !hasCachedContent && !hasHomeContent;
  const showCategoryTabs = categoryTabs.length > 1;

  const categoryTabsElement = showCategoryTabs ? (
    <SourceCategoryTabs tabs={categoryTabs} selectedId={selectedTabId} onSelect={setSelectedTabId} />
  ) : null;

  const refreshControl = (
    <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.tint} />
  );

  const lazyIndicator = isRefreshing ? (
    <View style={styles.refreshIndicator}>
      <ActivityIndicator size='small' />
    </View>
  ) : null;

  const alertBanner = showInlineError ? (
    <SourceHomeAlertBanner message={combinedError!} onDismiss={dismissError} />
  ) : null;

  const homeChrome = (
    <View style={styles.homeChrome}>
      <IncognitoModeBanner />
      {alertBanner}
      {categoryTabsElement}
    </View>
  );

  if (!source) {
    return (
      <>
        <Stack.Screen options={{ title: t('sources') }} />
        <ScreenContent centerContent>
          <EmptyState icon='alert-circle-outline' title={t('sources_not_found')} />
        </ScreenContent>
      </>
    );
  }

  return (
    <SourceCoverHeadersProvider source={source}>
      <>
        <Stack.Screen
          options={{
            title: source.manifest.info.name,
            headerRight: () => (
              <View style={styles.headerActions}>
                {lazyIndicator}
                <HeaderIconButton icon='search' onPress={openSearch} />
                <SourceOverflowMenu onOpenSettings={openSettings} websiteUrl={websiteUrl} />
              </View>
            ),
          }}
        />
        <ScreenContent padded={false} centerContent={showBlockingError} scrollable={false}>
          {showBlockingError ? (
            <EmptyState icon='alert-circle-outline' title={t('sources_load_error_title')} description={combinedError!} />
          ) : (
            <View style={styles.flex}>
              {showHome ? (
                showHomePlaceholder ? (
                  <LiquidGlassScrollRoot style={styles.scroll}>
                    <ScrollView
                      style={styles.scroll}
                      contentContainerStyle={styles.home}
                      contentInsetAdjustmentBehavior='automatic'
                      showsVerticalScrollIndicator={false}
                      refreshControl={refreshControl}>
                      {homeChrome}
                      <HomePlaceholderLayout />
                    </ScrollView>
                  </LiquidGlassScrollRoot>
                ) : hasHomeContent ? (
                  <LiquidGlassScrollRoot style={styles.scroll}>
                    <ScrollView
                      style={styles.scroll}
                      contentContainerStyle={styles.home}
                      contentInsetAdjustmentBehavior='automatic'
                      showsVerticalScrollIndicator={false}
                      refreshControl={refreshControl}>
                      {homeChrome}
                      {home!.components.map((component, index) => (
                        <HomeSection
                          key={`${component.title ?? 'section'}-${index}`}
                          component={component}
                          sourceId={source?.id}
                          onPressManga={openManga}
                          onPressListing={(listing) => setSelectedTabId(listing.id)}
                          onApplyHomeFilters={openSearchWithFilters}
                        />
                      ))}
                    </ScrollView>
                  </LiquidGlassScrollRoot>
                ) : listings.length > 0 && runner ? (
                  <SourceListingPanel
                    runner={runner}
                    listing={listings[0]!}
                    sourceId={source?.id}
                    onPressManga={openManga}
                    listHeader={homeChrome}
                    refreshControl={refreshControl}
                  />
                ) : runnerLoading ? (
                  <View style={styles.flex}>
                    {homeChrome}
                    <View style={styles.loading}>
                      <ActivityIndicator />
                    </View>
                  </View>
                ) : (
                  <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.emptyHome}
                    contentInsetAdjustmentBehavior='automatic'
                    refreshControl={refreshControl}>
                    {homeChrome}
                    <EmptyState icon='book-outline' title={t('sources_browse_empty')} description={t('sources_try_search')} />
                  </ScrollView>
                )
              ) : selectedListing && runner ? (
                <SourceListingPanel
                  runner={runner}
                  listing={selectedListing}
                  sourceId={source?.id}
                  onPressManga={openManga}
                  listHeader={homeChrome}
                  refreshControl={refreshControl}
                />
              ) : runnerLoading ? (
                <View style={styles.flex}>
                  {homeChrome}
                  <View style={styles.loading}>
                    <ActivityIndicator />
                  </View>
                </View>
              ) : (
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.emptyHome}
                  contentInsetAdjustmentBehavior='automatic'
                  refreshControl={refreshControl}>
                  {homeChrome}
                  <EmptyState icon='book-outline' title={t('sources_browse_empty')} description={t('sources_try_search')} />
                </ScrollView>
              )}
            </View>
          )}
        </ScreenContent>
      </>
    </SourceCoverHeadersProvider>
  );
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingRight: Spacing.xs,
  },
  refreshIndicator: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
