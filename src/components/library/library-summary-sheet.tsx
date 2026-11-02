import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SwipeDismissSheet } from "@/components/ui/swipe-dismiss-sheet";
import { MODAL_HEADER_HEIGHT, ModalHeader } from "@/components/ui/modal-header";
import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import { Modal, useWindowDimensions } from "@/hooks/use-duo-layout";
import { useTheme } from "@/hooks/use-theme";
import type { LibraryEntry } from "@/services/library";
import { peekMangaDetailCache } from "@/services/manga-detail-cache";
import { getReadChapterKeysByManga } from "@/services/manga-tracking";
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
  const [readKeys, setReadKeys] = useState<Map<string, Set<string>>>(
    () => new Map(),
  );

  useEffect(() => {
    if (!visible) {
      setExpanded(null);
      return;
    }
    let cancelled = false;
    void getReadChapterKeysByManga().then((map) => {
      if (!cancelled) setReadKeys(map);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

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
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
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
                const labels = open ? unreadChapterLabels(entry) : [];
                return (
                  <View
                    key={id}
                    style={[
                      styles.card,
                      { backgroundColor: colors.tertiaryFill },
                    ]}
                  >
                    <Pressable
                      style={styles.cardHeader}
                      onPress={() => setExpanded(open ? null : id)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                    >
                      <View style={styles.cardTitle}>
                        <ThemedText variant="headline" numberOfLines={2}>
                          {entry.title}
                        </ThemedText>
                        <ThemedText variant="footnote" color="tint">
                          {t("library_summary_unread", {
                            count: String(unread),
                          })}
                        </ThemedText>
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
                    </Pressable>
                    {open && labels.length > 0 ? (
                      <View style={styles.chapters}>
                        {labels.slice(0, MAX_CHAPTER_LINES).map((label, i) => (
                          <ThemedText
                            key={`${i}:${label}`}
                            variant="footnote"
                            color="secondaryLabel"
                            numberOfLines={1}
                          >
                            {label}
                          </ThemedText>
                        ))}
                        {labels.length > MAX_CHAPTER_LINES ? (
                          <ThemedText variant="footnote" color="tertiaryLabel">
                            …
                          </ThemedText>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
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
    borderRadius: 14,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  cardTitle: {
    flex: 1,
    gap: 2,
  },
  chapters: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: 4,
  },
});
