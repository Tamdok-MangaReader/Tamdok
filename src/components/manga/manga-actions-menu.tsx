import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { FullWindowOverlay } from '@/components/ui/full-window-overlay';

import { GlassSurface } from "@/components/ui/glass-surface";
import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t } from "@/constants/locales";
import { useSources } from "@/context/sources-context";
import { useTheme } from "@/hooks/use-theme";
import type { Chapter, Manga } from "@/parsers/shared/types";
import { processQueuedDownloads } from "@/services/download-processor";
import {
  queueChapterDownloads,
  removeMangaDownloads,
} from "@/services/downloads";
import {
  addMangaToLibraryWithCategories,
  chapterKeysForLibraryEntry,
  isAllCategory,
  removeFromLibrary,
  toggleMangaLibraryCategory,
  updateLibraryEntryMetadata,
} from "@/services/library";
import {
  libraryMenuKey,
  useLibraryMenuSnapshot,
} from "@/services/library-menu-store";
import { refreshLibraryEntries } from "@/services/library-refresh";
import {
  readMangaDetailCache,
  writeMangaDetailCache,
} from "@/services/manga-detail-cache";
import {
  getMangaChapterProgress,
  markAllChaptersRead,
  markAllChaptersUnread,
} from "@/services/manga-tracking";
import { findInstalledSource, getOrCreateSourceRunner } from "@/services/sources";
import { chaptersOldestFirst, formatChapterLabel } from "@/utils/chapter-label";
import { mangaTransferHref } from "@/utils/manga-route";
import { resolveMangaPageUrl } from "@/utils/manga-url";

type MeasurableView = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

type MenuItem = {
  key: string;
  label: string;
  sf: string;
  fallback: React.ComponentProps<typeof SFSymbolIcon>["fallback"];
  destructive?: boolean;
  checked?: boolean;
  onPress: () => void;
  children?: MenuItem[];
};

type Anchor = { x: number; y: number; width: number; height: number };

type RenderCover = (onLongPress: () => void) => ReactElement;

type MangaActionsMenuProps = {
  sourceId: string | undefined;
  manga: Manga;
  renderCover: RenderCover;
  /** Library only: starts multi-select with this title selected. */
  onSelect?: (manga: Manga) => void;
};

const MENU_WIDTH = 270;
const EDGE = 12;
const GAP = 10;
const NOOP = () => {};

export const MangaActionsMenu = memo(function MangaActionsMenu({
  sourceId,
  manga,
  renderCover,
  onSelect,
}: MangaActionsMenuProps) {
  const ref = useRef<MeasurableView>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const effectiveSourceId = sourceId ?? manga.sourceId;

  const handleLongPress = useCallback(() => {
    if (!effectiveSourceId) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ref.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  }, [effectiveSourceId]);

  const handleClose = useCallback(() => setAnchor(null), []);

  return (
    <>
      <View ref={ref as never} collapsable={false}>
        {renderCover(handleLongPress)}
      </View>
      {anchor && effectiveSourceId ? (
        <MangaMenuOverlay
          anchor={anchor}
          sourceId={effectiveSourceId}
          manga={manga}
          renderCover={renderCover}
          onSelect={onSelect}
          onClose={handleClose}
        />
      ) : null}
    </>
  );
});

function MenuRow({
  label,
  sfSymbol,
  fallback,
  destructive,
  showDivider,
  trailing,
  checked,
  inset,
  onPress,
  onLayout,
}: {
  label: string;
  sfSymbol: string;
  fallback: React.ComponentProps<typeof SFSymbolIcon>["fallback"];
  destructive?: boolean;
  showDivider?: boolean;
  trailing?: "up" | "down" | "right";
  checked?: boolean;
  inset?: boolean;
  onPress: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { colors } = useTheme();
  const color = destructive ? colors.destructive : colors.label;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        inset && styles.rowInset,
        showDivider && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.separator,
        },
        pressed && { backgroundColor: colors.quaternaryFill },
      ]}
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="button"
    >
      <SFSymbolIcon name={sfSymbol} fallback={fallback} size={18} color={color} />
      <ThemedText
        variant="body"
        color={destructive ? "destructive" : "label"}
        style={styles.label}
        numberOfLines={1}
      >
        {label}
      </ThemedText>
      {checked != null ? (
        <SFSymbolIcon
          name={checked ? "checkmark.circle.fill" : "circle"}
          fallback={checked ? "checkbox-outline" : "square-outline"}
          size={18}
          color={checked ? colors.tint : colors.tertiaryLabel}
        />
      ) : trailing ? (
        <SFSymbolIcon
          name={
            trailing === "up"
              ? "chevron.up"
              : trailing === "right"
                ? "chevron.right"
                : "chevron.down"
          }
          fallback={trailing === "right" ? "chevron-forward" : "chevron-down"}
          size={16}
          color={colors.tertiaryLabel}
        />
      ) : null}
    </Pressable>
  );
}

function MangaMenuOverlay({
  anchor,
  sourceId,
  manga,
  renderCover,
  onSelect,
  onClose,
}: {
  anchor: Anchor;
  sourceId: string;
  manga: Manga;
  renderCover: RenderCover;
  onSelect?: (manga: Manga) => void;
  onClose: () => void;
}) {
  const { radius, colors } = useTheme();
  const { installed } = useSources();
  const router = useRouter();
  const { entries, categories } = useLibraryMenuSnapshot();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [menuHeight, setMenuHeight] = useState(0);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [groupTop, setGroupTop] = useState(0);
  const [subHeight, setSubHeight] = useState(0);
  const rowTops = useRef<Record<string, number>>({});
  const groupProgress = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(1.05, { damping: 16, stiffness: 220 });
  }, [scale]);

  useEffect(() => {
    groupProgress.value = openGroup
      ? withSpring(1, { damping: 20, stiffness: 260 })
      : 0;
    if (!openGroup) setSubHeight(0);
  }, [openGroup, groupProgress]);

  // The parent menu recedes while its submenu floats above it.
  // Opacity is never animated on a glass surface: it turns the blur transparent.
  const mainStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - groupProgress.value * 0.04 }],
  }));
  const dimStyle = useAnimatedStyle(() => ({
    opacity: groupProgress.value,
  }));
  const subStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.88 + groupProgress.value * 0.12 }],
  }));

  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const entry = entries.get(libraryMenuKey(sourceId, manga.key));
  const userCategories = useMemo(
    () => categories.filter((category) => !isAllCategory(category.id)),
    [categories],
  );

  const pageUrl = useMemo(() => {
    const source = findInstalledSource(installed, sourceId);
    return resolveMangaPageUrl(manga, source?.manifest.info.url);
  }, [installed, sourceId, manga]);

  const loadChapters = useCallback(async (): Promise<Chapter[] | null> => {
    try {
      const cached = await readMangaDetailCache(sourceId, manga.key);
      if (cached?.manga.chapters?.length) return cached.manga.chapters;
      const source = findInstalledSource(installed, sourceId);
      if (!source) return null;
      const runner = await getOrCreateSourceRunner(source);
      const updated = await runner.getMangaUpdate(manga, true, true);
      await writeMangaDetailCache(sourceId, manga.key, {
        manga: updated,
        cachedAt: Date.now(),
      });
      return updated.chapters ?? [];
    } catch {
      return null;
    }
  }, [sourceId, manga, installed]);

  const run = (action: () => void) => {
    void Haptics.selectionAsync();
    onClose();
    action();
  };

  const markChapters = async (read: boolean) => {
    let keys: string[] | null = null;
    if (entry) {
      const known = chapterKeysForLibraryEntry(entry);
      if (known.length > 0) keys = known;
    }
    if (!keys) {
      const chapters = await loadChapters();
      if (!chapters) {
        Alert.alert(t("manga_menu_chapters_failed"));
        return;
      }
      keys = chapters.map((chapter) => chapter.key);
    }
    if (keys.length === 0) {
      Alert.alert(t("library_mark_chapters"), t("library_no_chapters_to_mark"));
      return;
    }
    if (read) {
      await markAllChaptersRead(sourceId, manga.key, keys, {
        mangaTitle: manga.title,
        cover: manga.cover,
      });
    } else {
      await markAllChaptersUnread(sourceId, manga.key, keys);
    }
    if (entry) {
      await updateLibraryEntryMetadata(sourceId, manga.key, {
        unreadCount: read ? 0 : keys.length,
      });
    }
  };

  const downloadChapters = async (unreadOnly: boolean) => {
    const loaded = await loadChapters();
    if (!loaded) {
      Alert.alert(t("manga_menu_chapters_failed"));
      return;
    }
    let chapters = loaded;
    if (unreadOnly) {
      const progress = await getMangaChapterProgress(sourceId, manga.key);
      chapters = loaded.filter((chapter) => progress[chapter.key]?.page !== -1);
    }
    await queueChapterDownloads(
      chaptersOldestFirst(chapters).map((chapter) => ({
        sourceId,
        mangaKey: manga.key,
        chapterKey: chapter.key,
        mangaTitle: manga.title,
        chapterTitle: formatChapterLabel(chapter),
      })),
    );
    void processQueuedDownloads(installed);
  };

  const addToLibrary = (categoryIds: string[]) => {
    void addMangaToLibraryWithCategories(
      sourceId,
      manga.key,
      { title: manga.title, cover: manga.cover },
      categoryIds,
    );
  };

  const toggleCategory = (categoryId: string) => {
    void Haptics.selectionAsync();
    void toggleMangaLibraryCategory(sourceId, manga.key, categoryId, {
      title: manga.title,
      cover: manga.cover,
      unreadCount: entry?.unreadCount,
      downloadedCount: entry?.downloadedCount,
      knownChapterKeys: entry?.knownChapterKeys,
      status: entry?.status,
    });
  };

  const remove = () => {
    Alert.alert(t("manga_remove_from_library"), manga.title, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("manga_remove_from_library"),
        style: "destructive",
        onPress: () => void removeFromLibrary(sourceId, manga.key),
      },
    ]);
  };

  const refresh = () => {
    void refreshLibraryEntries(installed, undefined, undefined, {
      onlyKeys: [`${sourceId}:${manga.key}`],
    });
  };

  const share = () => {
    if (!pageUrl) return;
    setTimeout(() => {
      void Share.share({ url: pageUrl, message: pageUrl, title: manga.title });
    }, 350);
  };

  const items: MenuItem[] = [];
  if (onSelect) {
    items.push({
      key: "select",
      label: t("library_select"),
      sf: "checkmark.circle",
      fallback: "checkbox-outline",
      onPress: () => run(() => onSelect(manga)),
    });
  }
  if (entry) {
    items.push({
      key: "categories",
      label: t("manga_edit_categories"),
      sf: "folder",
      fallback: "folder-outline",
      onPress: NOOP,
      children:
        userCategories.length === 0
          ? [
              {
                key: "all",
                label: t("library_category_all"),
                sf: "circle",
                fallback: "ellipse-outline",
                checked: true,
                onPress: NOOP,
              },
            ]
          : userCategories.map((category) => ({
              key: category.id,
              label: category.name,
              sf: "circle",
              fallback: "ellipse-outline" as const,
              checked: entry.categoryIds.includes(category.id),
              onPress: () => toggleCategory(category.id),
            })),
    });
  } else {
    items.push({
      key: "add",
      label: t("manga_add_to_library"),
      sf: "plus.circle",
      fallback: "add-circle-outline",
      onPress: () => run(() => addToLibrary([])),
    });
    if (userCategories.length > 0) {
      items.push({
        key: "add-category",
        label: t("manga_menu_add_to_category"),
        sf: "folder.badge.plus",
        fallback: "folder-outline",
        onPress: NOOP,
        children: userCategories.map((category) => ({
          key: category.id,
          label: category.name,
          sf: "folder",
          fallback: "folder-outline" as const,
          onPress: () => run(() => addToLibrary([category.id])),
        })),
      });
    }
  }
  items.push({
    key: "mark",
    label: t("library_mark_chapters"),
    sf: "checkmark.rectangle.stack",
    fallback: "checkmark-done-outline",
    onPress: NOOP,
    children: [
      {
        key: "mark-read",
        label: t("manga_mark_all_read"),
        sf: "checkmark.circle",
        fallback: "checkmark-circle-outline",
        onPress: () => run(() => void markChapters(true)),
      },
      {
        key: "mark-unread",
        label: t("manga_mark_all_unread"),
        sf: "circle",
        fallback: "ellipse-outline",
        onPress: () => run(() => void markChapters(false)),
      },
    ],
  });
  if (entry) {
    items.push({
      key: "download",
      label: t("manga_download_chapters"),
      sf: "arrow.down.circle",
      fallback: "download-outline",
      onPress: NOOP,
      children: [
        {
          key: "download-all",
          label: t("manga_download_all_chapters"),
          sf: "square.stack",
          fallback: "download-outline",
          onPress: () => run(() => void downloadChapters(false)),
        },
        {
          key: "download-unread",
          label: t("manga_download_unread_chapters"),
          sf: "circle",
          fallback: "ellipse-outline",
          onPress: () => run(() => void downloadChapters(true)),
        },
      ],
    });
    if ((entry.downloadedCount ?? 0) > 0) {
      items.push({
        key: "remove-downloads",
        label: t("manga_remove_downloads"),
        sf: "trash.slash",
        fallback: "trash-outline",
        onPress: () =>
          run(() => void removeMangaDownloads(sourceId, manga.key)),
      });
    }
    const more: MenuItem[] = [
      {
        key: "transfer",
        label: t("manga_transfer"),
        sf: "arrow.left.arrow.right",
        fallback: "swap-horizontal-outline",
        onPress: () =>
          run(() =>
            router.navigate(
              mangaTransferHref(sourceId, manga.key, manga.title, manga.cover),
            ),
          ),
      },
      {
        key: "refresh",
        label: t("library_refresh"),
        sf: "arrow.clockwise",
        fallback: "refresh-outline",
        onPress: () => run(refresh),
      },
    ];
    if (pageUrl) {
      more.push({
        key: "share",
        label: t("manga_share"),
        sf: "square.and.arrow.up",
        fallback: "share-outline",
        onPress: () => run(share),
      });
    }
    more.push({
      key: "remove",
      label: t("manga_remove_from_library"),
      sf: "trash",
      fallback: "trash-outline",
      destructive: true,
      onPress: () => run(remove),
    });
    items.push({
      key: "more",
      label: t("reader_more"),
      sf: "ellipsis.circle",
      fallback: "ellipsis-horizontal-circle-outline",
      onPress: NOOP,
      children: more,
    });
  } else if (pageUrl) {
    items.push({
      key: "share",
      label: t("manga_share"),
      sf: "square.and.arrow.up",
      fallback: "share-outline",
      onPress: () => run(share),
    });
  }
  const activeGroup = items.find((item) => item.key === openGroup);

  const menuLeft = Math.min(
    Math.max(anchor.x + anchor.width / 2 - MENU_WIDTH / 2, EDGE),
    windowWidth - EDGE - MENU_WIDTH,
  );
  const spaceBelow = windowHeight - (anchor.y + anchor.height) - GAP - EDGE;
  const placeBelow = menuHeight === 0 || menuHeight <= spaceBelow;
  const menuTop = placeBelow
    ? anchor.y + anchor.height + GAP
    : Math.max(EDGE, anchor.y - GAP - menuHeight);
  const maxMenuHeight = placeBelow
    ? Math.max(160, spaceBelow)
    : Math.max(160, anchor.y - GAP - EDGE);

  // Submenu floats over its parent row, nudged inward so the layering reads.
  const subLeft = Math.min(menuLeft + 14, windowWidth - EDGE - MENU_WIDTH);
  const subTop = Math.max(
    EDGE,
    Math.min(menuTop + groupTop, windowHeight - EDGE - subHeight),
  );

  const onMenuLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    setMenuHeight((prev) => (prev === next ? prev : next));
  };

  const content = (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.lifted,
          {
            left: anchor.x,
            top: anchor.y,
            width: anchor.width,
            height: anchor.height,
            borderRadius: radius.sm,
          },
          liftStyle,
        ]}
      >
        {renderCover(NOOP)}
      </Animated.View>
      <View
        style={[
          styles.menuWrap,
          {
            left: menuLeft,
            top: menuTop,
            width: MENU_WIDTH,
            maxHeight: maxMenuHeight,
            opacity: menuHeight === 0 ? 0 : 1,
          },
        ]}
      >
        <Animated.View style={mainStyle}>
        <GlassSurface
          borderRadius={radius.md}
          style={styles.card}
          glassStyle="regular"
        >
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            onLayout={onMenuLayout}
          >
            {items.map((item, index) => (
              <MenuRow
                key={item.key}
                label={item.label}
                sfSymbol={item.sf}
                fallback={item.fallback}
                destructive={item.destructive}
                showDivider={index > 0}
                trailing={item.children ? "right" : undefined}
                onLayout={(event) => {
                  rowTops.current[item.key] = event.nativeEvent.layout.y;
                }}
                onPress={
                  item.children
                    ? () => {
                        void Haptics.selectionAsync();
                        setGroupTop(rowTops.current[item.key] ?? 0);
                        setOpenGroup(item.key);
                      }
                    : item.onPress
                }
              />
            ))}
          </ScrollView>
        </GlassSurface>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.dim,
            { borderRadius: radius.md },
            dimStyle,
          ]}
        />
        </Animated.View>
      </View>
      {activeGroup ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpenGroup(null)}
          />
          <Animated.View
            style={[
              styles.menuWrap,
              {
                left: subLeft,
                top: subTop,
                width: MENU_WIDTH,
                maxHeight: windowHeight - EDGE * 2,
                opacity: subHeight === 0 ? 0 : 1,
              },
              styles.subShadow,
              subStyle,
            ]}
          >
            <View
              style={[
                styles.card,
                {
                  borderRadius: radius.md,
                  backgroundColor: colors.tertiarySystemBackground,
                },
              ]}
            >
              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                onLayout={(event) => {
                  const next = Math.round(event.nativeEvent.layout.height);
                  setSubHeight((prev) => (prev === next ? prev : next));
                }}
              >
                <MenuRow
                  label={activeGroup.label}
                  sfSymbol="chevron.left"
                  fallback="chevron-back"
                  onPress={() => setOpenGroup(null)}
                />
                {activeGroup.children?.map((item) => (
                  <MenuRow
                    key={item.key}
                    label={item.label}
                    sfSymbol={item.sf}
                    fallback={item.fallback}
                    destructive={item.destructive}
                    checked={item.checked}
                    showDivider
                    onPress={item.onPress}
                  />
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        </>
      ) : null}
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <FullWindowOverlay>{content}</FullWindowOverlay>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  lifted: {
    position: "absolute",
    overflow: "visible",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  menuWrap: {
    position: "absolute",
  },
  dim: {
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  subShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  card: {
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rowInset: {
    paddingLeft: Spacing.xxxl,
  },
  label: {
    flex: 1,
  },
});
