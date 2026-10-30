import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { MangaGrid, type MangaGridItem } from "@/components/manga/manga-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { ThemedView } from "@/components/ui/themed-view";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useSources } from "@/context/sources-context";
import {
  buildIllustrationCacheIndex,
  readIllustrationChunk,
  type IllustrationCacheIndex,
  type IllustrationCacheItem,
} from "@/services/illustration-cache";
import { ILLUSTRATION_SOURCE } from "@/services/illustration-mode";
import { sourceRouteId } from "@/services/sources";
import { mangaHref } from "@/utils/manga-route";

const CHUNK_SIZE = 36;
const FOOTER_STYLE = { paddingVertical: Spacing.lg } as const;

export function IllustrationSourceScreen() {
  const router = useRouter();
  const { installed } = useSources();
  const [items, setItems] = useState<IllustrationCacheItem[]>([]);
  const [ready, setReady] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const indexRef = useRef<IllustrationCacheIndex | null>(null);
  const cursorRef = useRef(0);
  const busyRef = useRef(false);
  const generationRef = useRef(0);

  const loadMore = useCallback(async () => {
    const index = indexRef.current;
    if (!index || busyRef.current || cursorRef.current >= index.files.length) {
      return;
    }
    busyRef.current = true;
    const generation = generationRef.current;
    setLoadingMore(true);
    try {
      const from = cursorRef.current;
      cursorRef.current = from + CHUNK_SIZE;
      const chunk = await readIllustrationChunk(
        index,
        from,
        CHUNK_SIZE,
        sourceRouteId,
      );
      if (generation !== generationRef.current) return;
      if (chunk.length > 0) setItems((previous) => previous.concat(chunk));
    } finally {
      if (generation === generationRef.current) setLoadingMore(false);
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    busyRef.current = false;
    cursorRef.current = 0;
    indexRef.current = null;
    setItems([]);
    setReady(false);

    void buildIllustrationCacheIndex(installed).then(async (index) => {
      if (generation !== generationRef.current) return;
      indexRef.current = index;
      setReady(true);
      await loadMore();
    });

    return () => {
      generationRef.current += 1;
    };
  }, [installed, loadMore]);

  const entries = useMemo<MangaGridItem[]>(
    () =>
      items.map((item) => ({
        key: item.key,
        title: item.title,
        cover: item.cover,
        url: item.url,
        sourceId: item.sourceId,
        inLibrary: false,
      })),
    [items],
  );

  const routeBySource = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(item.sourceId, item.sourceRoute);
    return map;
  }, [items]);

  const openManga = useCallback(
    (manga: MangaGridItem) => {
      const route = manga.sourceId ? routeBySource.get(manga.sourceId) : null;
      if (!route) return;
      router.navigate(mangaHref(route, manga));
    },
    [routeBySource, router],
  );

  const footer = useMemo(
    () =>
      loadingMore ? (
        <ActivityIndicator style={FOOTER_STYLE} />
      ) : null,
    [loadingMore],
  );

  return (
    <>
      <Stack.Screen options={{ title: ILLUSTRATION_SOURCE.manifest.info.name }} />
      <ThemedView color="groupedBackground" style={styles.root}>
        {!ready ? (
          <ActivityIndicator style={FOOTER_STYLE} />
        ) : entries.length === 0 && !loadingMore ? (
          <EmptyState icon="images-outline" title={t("illustration_empty")} />
        ) : (
          <View style={styles.gridWrap}>
            <MangaGrid
              entries={entries}
              onPressManga={openManga}
              onEndReached={loadMore}
              ListFooterComponent={footer}
            />
          </View>
        )}
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  gridWrap: {
    flex: 1,
    width: "100%",
  },
});
