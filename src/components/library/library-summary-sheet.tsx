import Animated, { FadeIn } from "react-native-reanimated";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import { SwipeDismissSheet } from "@/components/ui/swipe-dismiss-sheet";
import { MODAL_HEADER_HEIGHT, ModalHeader } from "@/components/ui/modal-header";
import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import { useSourceCoverHeaders } from "@/context/source-cover-context";
import { useSources } from "@/context/sources-context";
import { Modal, useWindowDimensions } from "@/hooks/use-duo-layout";
import { useTheme } from "@/hooks/use-theme";
import type { LibraryEntry } from "@/services/library";
import { findInstalledSource } from "@/services/sources";
import { coverImageSource } from "@/utils/cover-image-source";
import { useStoredCoverHeaders } from "@/utils/cover-headers-store";
import { IMAGE_CACHE_POLICY } from "@/utils/image-memory";
import { peekMangaDetailCache } from "@/services/manga-detail-cache";
import { getMangaChapterProgress } from "@/services/manga-tracking";
import {
  chapterTitleForDisplay,
  formatChapterLabel,
} from "@/utils/chapter-label";

export type LibrarySummaryItem = { entry: LibraryEntry; unread: number };

type LibrarySummarySheetProps = {
  visible: boolean;
  items: LibrarySummaryItem[];
  categories: { id: string; name: string }[];
  excludedCategoryIds: string[];
  onToggleCategory: (categoryId: string) => void;
  onClose: () => void;
  onOpenManga: (entry: LibraryEntry) => void;
};

const MAX_CHAPTER_LINES = 40;
const EMPTY_LABELS: string[] = [];

const SummaryCard = memo(function SummaryCard({
  id,
  entry,
  unread,
  open,
  labels,
  onToggle,
  onOpenManga,
}: {
  id: string;
  entry: LibraryEntry;
  unread: number;
  open: boolean;
  labels: string[];
  onToggle: (id: string) => void;
  onOpenManga: (entry: LibraryEntry) => void;
}) {
  const { colors, radius } = useTheme();
  const { installed } = useSources();
  const source = findInstalledSource(installed, entry.sourceId);
  const contextHeaders = useSourceCoverHeaders();
  const storedHeaders = useStoredCoverHeaders(source?.id ?? entry.sourceId);
  const coverHeaders = contextHeaders ?? storedHeaders;
  const coverSource = useMemo(
    () => (entry.cover ? coverImageSource(entry.cover, coverHeaders) : undefined),
    [entry.cover, coverHeaders],
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.tertiaryFill, borderRadius: radius.md },
      ]}
    >
      <Pressable
        style={({ pressed }) => [styles.cardHeader, pressed && styles.pressed]}
        onPress={() => onToggle(id)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View
          style={[
            styles.cover,
            { borderRadius: radius.sm, backgroundColor: colors.secondaryFill },
          ]}
        >
          {coverSource ? (
            <Image
              source={coverSource}
              recyclingKey={entry.cover}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy={IMAGE_CACHE_POLICY}
              allowDownscaling
            />
          ) : (
            <ThemedText variant="title3" color="tertiaryLabel">
              {entry.title.slice(0, 1)}
            </ThemedText>
          )}
        </View>
        <View style={styles.cardTitle}>
          <ThemedText variant="headline" numberOfLines={2}>
            {entry.title}
          </ThemedText>
          <View style={styles.metaLine}>
            {source ? (
              <View
                style={[styles.chip, { backgroundColor: colors.secondaryFill }]}
              >
                <ThemedText
                  variant="caption1"
                  color="secondaryLabel"
                  numberOfLines={1}
                >
                  {source.manifest.info.name}
                </ThemedText>
              </View>
            ) : null}
            <View style={[styles.chip, { backgroundColor: colors.tint }]}>
              <ThemedText variant="caption1" color="onTint" numberOfLines={1}>
                {t("library_summary_unread", { count: String(unread) })}
              </ThemedText>
            </View>
          </View>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => onOpenManga(entry)}
          accessibilityRole="button"
          accessibilityLabel={entry.title}
        >
          <SFSymbolIcon
            name="arrow.up.right.square"
            fallback="open-outline"
            size={22}
            color={colors.tint}
          />
        </Pressable>
        <Ionicons
          name={open ? "chevron-down" : "chevron-forward"}
          size={16}
          color={colors.tertiaryLabel}
        />
      </Pressable>
      {open && labels.length > 0 ? (
        <View style={[styles.chapters, { borderTopColor: colors.separator }]}>
          {labels.slice(0, MAX_CHAPTER_LINES).map((label, i) => (
            <View
              key={`${i}:${label}`}
              style={[
                styles.chapterRow,
                i > 0 && {
                  borderTopColor: colors.separator,
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <ThemedText variant="subheadline" numberOfLines={1}>
                {label}
              </ThemedText>
            </View>
          ))}
          {labels.length > MAX_CHAPTER_LINES ? (
            <ThemedText variant="footnote" color="tertiaryLabel" style={styles.more}>
              …
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

export function LibrarySummarySheet({
  visible,
  items,
  categories,
  excludedCategoryIds,
  onToggleCategory,
  onClose,
  onOpenManga,
}: LibrarySummarySheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [expanded, setExpanded] = useState<string | null>(null);
  // Read chapters of the expanded manga only; loaded when a row is opened.
  const [readKeys, setReadKeys] = useState<Map<string, Set<string>>>(
    () => new Map(),
  );

  useEffect(() => {
    if (!visible) {
      setExpanded(null);
      return;
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !expanded) return;
    const separator = expanded.indexOf(":");
    if (separator < 0) return;
    let cancelled = false;
    void getMangaChapterProgress(
      expanded.slice(0, separator),
      expanded.slice(separator + 1),
    ).then((progress) => {
      if (cancelled) return;
      const read = new Set(
        Object.values(progress)
          .filter((item) => item.page === -1)
          .map((item) => item.chapterKey),
      );
      setReadKeys((prev) => new Map(prev).set(expanded, read));
    });
    return () => {
      cancelled = true;
    };
  }, [visible, expanded]);

  const toggleCard = useCallback(
    (id: string) => setExpanded((current) => (current === id ? null : id)),
    [],
  );

  const unreadChapterLabels = (entry: LibraryEntry): string[] => {
    const chapters = peekMangaDetailCache(entry.sourceId, entry.mangaKey)?.manga
      .chapters;
    if (!chapters) return [];
    const read = readKeys.get(`${entry.sourceId}:${entry.mangaKey}`);
    return chapters
      .filter((chapter) => !read?.has(chapter.key))
      .map(
        (chapter) =>
          `${chapter.chapterNumber ? `${chapter.chapterNumber}. ` : ""}${
            chapterTitleForDisplay(chapter) || formatChapterLabel(chapter)
          }`,
      );
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
    >
      <Animated.View entering={FadeIn.duration(250)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <SwipeDismissSheet
        onClose={onClose}
        style={[
          styles.sheet,
          {
            height: Math.round(windowHeight * 0.8),
            backgroundColor: colors.secondarySystemBackground,
          },
        ]}
      >
        <ModalHeader
          title={t("library_summary")}
          closeLabel={t("done")}
          onClose={onClose}
        />
        <ScrollView
          contentContainerStyle={{
            paddingTop: MODAL_HEADER_HEIGHT + Spacing.md,
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xxl,
            gap: Spacing.sm,
          }}
          scrollIndicatorInsets={{ top: MODAL_HEADER_HEIGHT }}
        >
          {categories.length > 0 ? (
            <View style={styles.excludeBlock}>
              <ThemedText variant="footnote" color="secondaryLabel">
                {t("library_summary_exclude").toUpperCase()}
              </ThemedText>
              <View style={styles.pillWrap}>
                {categories.map((category) => {
                  const excluded = excludedCategoryIds.includes(category.id);
                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => onToggleCategory(category.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: excluded }}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: excluded
                            ? colors.tint
                            : colors.tertiaryFill,
                        },
                      ]}
                    >
                      <ThemedText
                        variant="subheadline"
                        color={excluded ? "onTint" : "label"}
                        numberOfLines={1}
                      >
                        {category.name}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          {items.length === 0 ? (
            <ThemedText
              variant="body"
              color="secondaryLabel"
              style={styles.empty}
            >
              {t("library_summary_empty")}
            </ThemedText>
          ) : (
            <>
              <ThemedText variant="footnote" color="secondaryLabel">
                {t("library_summary_total", { count: String(items.length) })}
              </ThemedText>
              {items.map(({ entry, unread }) => {
                const id = `${entry.sourceId}:${entry.mangaKey}`;
                const open = expanded === id;
                return (
                  <SummaryCard
                    key={id}
                    id={id}
                    entry={entry}
                    unread={unread}
                    open={open}
                    labels={open ? unreadChapterLabels(entry) : EMPTY_LABELS}
                    onToggle={toggleCard}
                    onOpenManga={onOpenManga}
                  />
                );
              })}
            </>
          )}
        </ScrollView>
      </SwipeDismissSheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  excludeBlock: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  pillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 999,
  },
  empty: {
    textAlign: "center",
    paddingTop: Spacing.xl,
  },
  card: {
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  cover: {
    width: 48,
    height: 68,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    flex: 1,
    gap: 6,
  },
  metaLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.xs,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    maxWidth: "100%",
  },
  chapters: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  chapterRow: {
    paddingVertical: Spacing.sm,
  },
  more: {
    paddingVertical: Spacing.xs,
  },
});
