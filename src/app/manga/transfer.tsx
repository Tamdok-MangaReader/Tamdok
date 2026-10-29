import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  View,
} from "react-native";

import {
  DEFAULT_GLOBAL_SEARCH_FILTERS,
  filterInstalledForSearch,
} from "@/components/search/global-search-filter-bar";
import {
  GlobalSearchSourceSection,
  type SourceSearchGroup,
} from "@/components/search/global-search-source-section";
import { EmptyState } from "@/components/ui/empty-state";
import { LiquidGlassScrollComponent } from "@/components/ui/liquid-glass-scroll-root";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { SourceCoverHeadersProvider } from "@/context/source-cover-context";
import { useSources } from "@/context/sources-context";
import { useTheme } from "@/hooks/use-theme";
import type { InstalledSource, Manga } from "@/parsers/shared/types";
import {
  findMangaByKey,
  isSameSource,
  isTwinSource,
  loadOriginAltTitles,
  searchTransferCandidates,
  transferManga,
  type TransferOrigin,
} from "@/services/manga-transfer";
import { findInstalledSource, parseSourceRouteId } from "@/services/sources";
import { mangaHref } from "@/utils/manga-route";

function decodeParam(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

type SectionProps = {
  source: InstalledSource;
  origin: TransferOrigin;
  twin: boolean;
  onPick: (source: InstalledSource, manga: Manga) => void;
};

const noop = () => undefined;

const TransferSourceSection = memo(function TransferSourceSection({
  source,
  origin,
  twin,
  onPick,
}: SectionProps) {
  const [group, setGroup] = useState<SourceSearchGroup>({
    source,
    entries: [],
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const cancel = { cancelled: false };
    setGroup({ source, entries: [], status: "loading" });

    void (async () => {
      try {
        let entries: Manga[] = [];
        if (twin) {
          const direct = await findMangaByKey(
            source,
            origin.mangaKey,
            origin.title,
            cancel,
          );
          if (direct) entries = [direct];
        }
        if (entries.length === 0) {
          entries = await searchTransferCandidates(source, origin, cancel);
        }
        if (alive) setGroup({ source, entries, status: "done" });
      } catch (error) {
        if (!alive) return;
        setGroup({
          source,
          entries: [],
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      alive = false;
      cancel.cancelled = true;
    };
  }, [source, origin, twin, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return (
    <GlobalSearchSourceSection
      group={group}
      resetKey={origin.mangaKey}
      onPressSource={noop}
      onPressManga={onPick}
      onRetry={retry}
    />
  );
});

const OriginCard = memo(function OriginCard({
  origin,
  source,
  sourceName,
}: {
  origin: TransferOrigin;
  source: InstalledSource | undefined;
  sourceName: string;
}) {
  const { colors, radius } = useTheme();

  return (
    <SourceCoverHeadersProvider source={source}>
      <View style={styles.originWrap}>
        <ThemedText
          variant="footnote"
          color="secondaryLabel"
          style={styles.originLabel}
        >
          {t("manga_transfer_current")}
        </ThemedText>
        <View
          style={[
            styles.originCard,
            { backgroundColor: colors.secondaryFill, borderRadius: radius.md },
          ]}
        >
          <View
            style={[
              styles.originCover,
              {
                borderRadius: radius.sm,
                backgroundColor: colors.quaternaryFill,
              },
            ]}
          >
            {origin.cover ? (
              <Image
                source={{ uri: origin.cover }}
                style={styles.originImage}
                contentFit="cover"
                transition={150}
              />
            ) : null}
          </View>
          <View style={styles.originMeta}>
            <ThemedText variant="headline" numberOfLines={3}>
              {origin.title}
            </ThemedText>
            <ThemedText variant="footnote" color="secondaryLabel">
              {sourceName}
            </ThemedText>
          </View>
        </View>
        <ThemedText
          variant="footnote"
          color="secondaryLabel"
          style={styles.hint}
        >
          {t("manga_transfer_hint")}
        </ThemedText>
      </View>
    </SourceCoverHeadersProvider>
  );
});

export default function MangaTransferScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sourceId: string;
    mangaKey: string;
    title?: string;
    cover?: string;
  }>();
  const sourceRoute = decodeParam(params.sourceId);
  const mangaKey = decodeParam(params.mangaKey);
  const title = decodeParam(params.title) || mangaKey;
  const cover = decodeParam(params.cover) || undefined;
  const parsed = useMemo(() => parseSourceRouteId(sourceRoute), [sourceRoute]);
  const { installed } = useSources();
  const originSource = findInstalledSource(installed, sourceRoute);
  const originSourceId = originSource?.id ?? parsed.id;
  const originKind = originSource?.kind ?? parsed.kind;

  const [altTitles, setAltTitles] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadOriginAltTitles(originSourceId, mangaKey)
      .catch(() => [] as string[])
      .then((alts) => {
        if (alive) setAltTitles(alts);
      });
    return () => {
      alive = false;
    };
  }, [originSourceId, mangaKey]);

  const origin = useMemo<TransferOrigin | null>(
    () =>
      altTitles
        ? { sourceId: originSourceId, mangaKey, title, cover, altTitles }
        : null,
    [altTitles, originSourceId, mangaKey, title, cover],
  );

  const candidates = useMemo(() => {
    const filtered = filterInstalledForSearch(
      installed,
      DEFAULT_GLOBAL_SEARCH_FILTERS,
    ).filter((source) => !isSameSource(source, originSourceId, originKind));
    const twins: InstalledSource[] = [];
    const rest: InstalledSource[] = [];
    for (const source of filtered) {
      if (isTwinSource(source, originSourceId, originKind)) twins.push(source);
      else rest.push(source);
    }
    return { list: [...twins, ...rest], twinIds: new Set(twins.map((s) => `${s.kind}:${s.id}`)) };
  }, [installed, originSourceId, originKind]);

  const runTransfer = useCallback(
    async (source: InstalledSource, manga: Manga) => {
      if (!origin) return;
      setBusy(true);
      try {
        const result = await transferManga(origin, source, manga);
        router.replace(mangaHref(result.sourceRoute, result.manga));
      } catch (error) {
        setBusy(false);
        Alert.alert(
          t("manga_transfer_failed"),
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [origin, router],
  );

  const screenOptions = useMemo(
    () => ({
      title: t("manga_transfer"),
      headerRight: () => (
        <HeaderIconButton
          icon="close"
          accessibilityLabel={t("cancel")}
          onPress={() => router.back()}
        />
      ),
    }),
    [router],
  );

  const handlePick = useCallback(
    (source: InstalledSource, manga: Manga) => {
      Alert.alert(
        t("manga_transfer_confirm_title"),
        t("manga_transfer_confirm_message", {
          title: manga.title,
          source: source.manifest.info.name,
        }),
        [
          { text: t("cancel"), style: "cancel" },
          {
            text: t("manga_transfer"),
            onPress: () => void runTransfer(source, manga),
          },
        ],
      );
    },
    [runTransfer],
  );

  const renderItem = useCallback(
    ({ item }: { item: InstalledSource }) =>
      origin ? (
        <TransferSourceSection
          source={item}
          origin={origin}
          twin={candidates.twinIds.has(`${item.kind}:${item.id}`)}
          onPick={handlePick}
        />
      ) : null,
    [origin, candidates.twinIds, handlePick],
  );

  const header = useMemo(
    () =>
      origin ? (
        <OriginCard
          origin={origin}
          source={originSource}
          sourceName={originSource?.manifest.info.name ?? originSourceId}
        />
      ) : null,
    [origin, originSource, originSourceId],
  );

  return (
    <ThemedView color="groupedBackground" style={styles.root}>
      <Stack.Screen options={screenOptions} />
      <FlatList
        data={origin ? candidates.list : []}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={header ?? undefined}
        ListEmptyComponent={
          origin ? (
            <EmptyState
              icon="swap-horizontal-outline"
              title={t("manga_transfer_no_sources")}
            />
          ) : (
            <ActivityIndicator style={styles.loader} />
          )
        }
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustsScrollIndicatorInsets
        renderScrollComponent={renderScrollComponent}
        contentContainerStyle={styles.list}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        windowSize={5}
        updateCellsBatchingPeriod={50}
      />
      {busy ? (
        <View style={styles.busy} pointerEvents="auto">
          <ActivityIndicator size="large" />
          <ThemedText variant="callout" color="secondaryLabel">
            {t("manga_transfer_in_progress")}
          </ThemedText>
        </View>
      ) : null}
    </ThemedView>
  );
}

const keyExtractor = (source: InstalledSource) =>
  `${source.kind}:${source.id}`;

const renderScrollComponent = (
  props: React.ComponentProps<typeof LiquidGlassScrollComponent>,
) => <LiquidGlassScrollComponent {...props} />;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  loader: {
    paddingVertical: Spacing.xxxl,
  },
  originWrap: {
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  originLabel: {
    paddingHorizontal: Spacing.xs,
  },
  originCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  originCover: {
    width: 56,
    height: 80,
    overflow: "hidden",
  },
  originImage: {
    width: "100%",
    height: "100%",
  },
  originMeta: {
    flex: 1,
    gap: 4,
  },
  hint: {
    paddingHorizontal: Spacing.xs,
  },
  busy: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
});
