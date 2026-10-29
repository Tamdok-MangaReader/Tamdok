import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";

import { VirtualMangaGrid } from "@/components/manga/virtual-manga-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { MangaGridSkeleton } from "@/components/ui/skeleton";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import type { Listing, Manga } from "@/parsers/shared/types";
import type { SourceRunner } from "@/parsers/shared/source-runner";

type SourceListingPanelProps = {
  runner: SourceRunner;
  listing: Listing;
  sourceId?: string;
  onPressManga: (manga: Manga) => void;
  pageId: string;
  onHeight: (pageId: string, height: number) => void;
  registerLoadMore: (pageId: string, loadMore: (() => void) | null) => void;
};

export function SourceListingPanel({
  runner,
  listing,
  sourceId,
  onPressManga,
  pageId,
  onHeight,
  registerLoadMore,
}: SourceListingPanelProps) {
  const [entries, setEntries] = useState<Manga[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!runner?.getMangaList) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await runner.getMangaList(listing, nextPage);
        lastAddedRef.current = result.entries.length > 0;
        setEntries((current) =>
          append ? [...current, ...result.entries] : result.entries,
        );
        setHasNextPage(result.hasNextPage);
        setPage(nextPage);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
        if (!append) setEntries([]);
      } finally {
        setIsLoading(false);
      }
    },
    [runner, listing],
  );

  useEffect(() => {
    void load(1, false);
  }, [listing.id, load]);

  const stateRef = useRef({ isLoading, hasNextPage, page, load });
  stateRef.current = { isLoading, hasNextPage, page, load };

  useEffect(() => {
    registerLoadMore(pageId, () => {
      const state = stateRef.current;
      if (!state.isLoading && state.hasNextPage) {
        void state.load(state.page + 1, true);
      }
    });
    return () => registerLoadMore(pageId, null);
  }, [pageId, registerLoadMore]);

  const { height: windowHeight } = useWindowDimensions();
  const contentHeightRef = useRef(0);
  const lastAddedRef = useRef(true);

  const fillIfShort = useCallback(() => {
    const state = stateRef.current;
    const height = contentHeightRef.current;
    if (
      state.isLoading ||
      !state.hasNextPage ||
      !lastAddedRef.current ||
      height <= 0 ||
      height >= windowHeight
    ) {
      return;
    }
    void state.load(state.page + 1, true);
  }, [windowHeight]);

  const reportHeight = useCallback(
    (id: string, height: number) => {
      contentHeightRef.current = height;
      onHeight(id, height);
      fillIfShort();
    },
    [onHeight, fillIfShort],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) =>
      reportHeight(pageId, event.nativeEvent.layout.height),
    [reportHeight, pageId],
  );

  useEffect(() => {
    if (!isLoading) fillIfShort();
  }, [isLoading, entries.length, fillIfShort]);

  if (!runner?.getMangaList) {
    return (
      <View collapsable={false} onLayout={handleLayout}>
        <EmptyState
          icon="alert-circle-outline"
          title={t("sources_listing_unsupported")}
        />
      </View>
    );
  }

  if (error && entries.length === 0) {
    return (
      <View collapsable={false} onLayout={handleLayout} style={styles.center}>
        <ThemedText variant="body" color="destructive">
          {error}
        </ThemedText>
      </View>
    );
  }

  if (isLoading && entries.length === 0) {
    return (
      <View collapsable={false} onLayout={handleLayout}>
        <MangaGridSkeleton columns={3} rows={4} />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View collapsable={false} onLayout={handleLayout} style={styles.center}>
        <EmptyState icon="book-outline" title={t("sources_browse_empty")} />
      </View>
    );
  }

  return (
    <VirtualMangaGrid
      entries={entries}
      sourceId={sourceId}
      pageId={pageId}
      onHeight={reportHeight}
      onPressManga={onPressManga}
      showRating={entries[0] && entries[0].rating !== undefined}
      footer={
        isLoading ? (
          <ActivityIndicator style={{ paddingVertical: Spacing.lg }} />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    paddingVertical: Spacing.xxxl,
    alignItems: "center",
    justifyContent: "center",
  },
});
