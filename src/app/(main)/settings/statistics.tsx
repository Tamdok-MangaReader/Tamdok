import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Card, CardSeparator } from "@/components/ui/card";
import { ScreenContent } from "@/components/ui/screen-content";
import { SectionLabel } from "@/components/ui/section-label";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useSources } from "@/context/sources-context";
import { useMangaDataRefresh } from "@/hooks/use-manga-data";
import { useTheme } from "@/hooks/use-theme";
import { getLibraryEntries } from "@/services/library";
import { getReadingActivity } from "@/services/manga-tracking";
import { computeReadingStats, type ReadingStats } from "@/services/reading-stats";
import { findInstalledSource } from "@/services/sources";

const CHART_HEIGHT = 96;

function Tile({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.tertiaryFill }]}>
      <ThemedText variant="title2" style={styles.tileValue}>
        {value}
      </ThemedText>
      <ThemedText variant="footnote" color="secondaryLabel" numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

function BarChart({
  values,
  labels,
  highlightLast,
}: {
  values: number[];
  labels: string[];
  highlightLast?: boolean;
}) {
  const { colors } = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View style={styles.chart}>
      {values.map((value, index) => {
        const height = value > 0 ? Math.max(4, (value / max) * CHART_HEIGHT) : 3;
        const active = value > 0;
        return (
          <View key={index} style={styles.barColumn}>
            <ThemedText variant="caption2" color="secondaryLabel">
              {active ? value : ""}
            </ThemedText>
            <View style={styles.barTrack}>
              <View
                style={{
                  height,
                  borderRadius: 4,
                  backgroundColor: active
                    ? highlightLast && index === values.length - 1
                      ? colors.tint
                      : colors.tint + "B3"
                    : colors.quaternaryFill,
                }}
              />
            </View>
            <ThemedText variant="caption2" color="tertiaryLabel" numberOfLines={1}>
              {labels[index]}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

function RankRow({
  title,
  count,
  max,
  isLast,
}: {
  title: string;
  count: number;
  max: number;
  isLast: boolean;
}) {
  const { colors } = useTheme();
  return (
    <>
      <View style={styles.rankRow}>
        <View style={styles.rankMeta}>
          <ThemedText variant="body" numberOfLines={1} style={styles.rankTitle}>
            {title}
          </ThemedText>
          <View style={[styles.rankTrack, { backgroundColor: colors.quaternaryFill }]}>
            <View
              style={[
                styles.rankFill,
                { backgroundColor: colors.tint, width: `${Math.max(4, (count / max) * 100)}%` },
              ]}
            />
          </View>
        </View>
        <ThemedText variant="body" color="secondaryLabel" style={styles.rankCount}>
          {count}
        </ThemedText>
      </View>
      {isLast ? null : <CardSeparator />}
    </>
  );
}

export default function StatisticsScreen() {
  const { installed } = useSources();
  const refreshTick = useMangaDataRefresh();
  const [stats, setStats] = useState<ReadingStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [activity, library] = await Promise.all([
        getReadingActivity(),
        getLibraryEntries(),
      ]);
      // Library titles win over history ones: history may only hold the manga key for imported data.
      const titles = new Map(activity.titles);
      for (const entry of library) {
        titles.set(`${entry.sourceId}:${entry.mangaKey}`, entry.title);
      }
      if (!cancelled) setStats(computeReadingStats(activity.reads, titles));
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const dailyLabels = useMemo(
    () => stats?.daily.map((day) => String(day.date.getDate())) ?? [],
    [stats],
  );
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        // 1 Jan 2024 is a Monday.
        new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" }),
      ),
    [],
  );

  const sourceRows = useMemo(
    () =>
      (stats?.bySource ?? []).slice(0, 5).map((row) => ({
        key: row.sourceId,
        title:
          findInstalledSource(installed, row.sourceId)?.manifest.info.name ??
          row.sourceId,
        count: row.count,
      })),
    [stats, installed],
  );

  return (
    <>
      <Stack.Screen options={{ title: t("stats_title") }} />
      <ScreenContent>
        {stats == null ? null : stats.total === 0 ? (
          <Card style={styles.empty}>
            <ThemedText variant="body" color="secondaryLabel" style={styles.emptyText}>
              {t("stats_empty")}
            </ThemedText>
          </Card>
        ) : (
          <>
            <SectionLabel isFirst>{t("stats_chapters_read")}</SectionLabel>
            <View style={styles.tileGrid}>
              <Tile value={stats.today} label={t("stats_today")} />
              <Tile value={stats.last7} label={t("stats_7_days")} />
              <Tile value={stats.last30} label={t("stats_30_days")} />
              <Tile value={stats.total} label={t("stats_all_time")} />
            </View>

            <SectionLabel>{t("stats_habits")}</SectionLabel>
            <View style={styles.tileGrid}>
              <Tile value={stats.currentStreak} label={t("stats_streak")} />
              <Tile value={stats.longestStreak} label={t("stats_longest_streak")} />
              <Tile value={stats.activeDays} label={t("stats_active_days")} />
              <Tile value={stats.titlesRead} label={t("stats_titles")} />
            </View>

            <SectionLabel>{t("stats_last_days", { count: String(stats.daily.length) })}</SectionLabel>
            <Card style={styles.chartCard}>
              <BarChart
                values={stats.daily.map((day) => day.count)}
                labels={dailyLabels}
                highlightLast
              />
            </Card>

            <SectionLabel>{t("stats_weekdays")}</SectionLabel>
            <Card style={styles.chartCard}>
              <BarChart values={stats.weekdays} labels={weekdayLabels} />
            </Card>

            <SectionLabel>{t("stats_top_titles")}</SectionLabel>
            <Card>
              {stats.topManga.map((row, index) => (
                <RankRow
                  key={`${row.sourceId}:${row.mangaKey}`}
                  title={row.title}
                  count={row.count}
                  max={stats.topManga[0].count}
                  isLast={index === stats.topManga.length - 1}
                />
              ))}
            </Card>

            <SectionLabel>{t("stats_sources")}</SectionLabel>
            <Card>
              {sourceRows.map((row, index) => (
                <RankRow
                  key={row.key}
                  title={row.title}
                  count={row.count}
                  max={sourceRows[0].count}
                  isLast={index === sourceRows.length - 1}
                />
              ))}
            </Card>
          </>
        )}
      </ScreenContent>
    </>
  );
}

const styles = StyleSheet.create({
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  tile: {
    width: "48.5%",
    flexGrow: 1,
    borderRadius: 14,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: 2,
  },
  tileValue: {
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  chartCard: {
    padding: Spacing.lg,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  barColumn: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  barTrack: {
    height: CHART_HEIGHT,
    width: "100%",
    justifyContent: "flex-end",
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rankMeta: {
    flex: 1,
    gap: 6,
  },
  rankTitle: {
    flexShrink: 1,
  },
  rankTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  rankFill: {
    height: 4,
    borderRadius: 2,
  },
  rankCount: {
    fontVariant: ["tabular-nums"],
    minWidth: 28,
    textAlign: "right",
  },
  empty: {
    padding: Spacing.xl,
  },
  emptyText: {
    textAlign: "center",
  },
});
