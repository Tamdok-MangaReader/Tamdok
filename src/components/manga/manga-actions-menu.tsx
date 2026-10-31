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
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { FullWindowOverlay } from "react-native-screens";

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
import {
  readMangaDetailCache,
  writeMangaDetailCache,
} from "@/services/manga-detail-cache";
import {
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

type Anchor = { x: number; y: number; width: number; height: number };

type RenderCover = (onLongPress: () => void) => ReactElement;

type MangaActionsMenuProps = {
  sourceId: string | undefined;
  manga: Manga;
  renderCover: RenderCover;
};

const MENU_WIDTH = 270;
const EDGE = 12;
const GAP = 10;
const NOOP = () => {};

export const MangaActionsMenu = memo(function MangaActionsMenu({
  sourceId,
  manga,
  renderCover,
}: MangaActionsMenuProps) {
  const ref = useRef<MeasurableView>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const effectiveSourceId = sourceId ?? manga.sourceId;

  const handleLongPress = useCallback(() => {
    if (Platform.OS !== "ios" || !effectiveSourceId) return;
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
}: {
  label: string;
  sfSymbol: string;
  fallback: React.ComponentProps<typeof SFSymbolIcon>["fallback"];
  destructive?: boolean;
  showDivider?: boolean;
  trailing?: "up" | "down";
  checked?: boolean;
  inset?: boolean;
  onPress: () => void;
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
          name={trailing === "up" ? "chevron.up" : "chevron.down"}
          fallback="chevron-down"
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
  onClose,
}: {
  anchor: Anchor;
  sourceId: string;
  manga: Manga;
  renderCover: RenderCover;
  onClose: () => void;
}) {
  const { radius } = useTheme();
  const { installed } = useSources();
  const router = useRouter();
  const { entries, categories } = useLibraryMenuSnapshot();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [menuHeight, setMenuHeight] = useState(0);
  const [markOpen, setMarkOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(1.05, { damping: 16, stiffness: 220 });
  }, [scale]);

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

  const downloadAll = async () => {
    const chapters = await loadChapters();
    if (!chapters) {
      Alert.alert(t("manga_menu_chapters_failed"));
      return;
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

  const share = () => {
    if (!pageUrl) return;
    setTimeout(() => {
      void Share.share({ url: pageUrl, message: pageUrl, title: manga.title });
    }, 350);
  };

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
            {entry ? (
              <>
                <MenuRow
                  label={t("manga_edit_categories")}
                  sfSymbol="folder"
                  fallback="folder-outline"
                  trailing={categoriesOpen ? "up" : "down"}
                  onPress={() => setCategoriesOpen((value) => !value)}
                />
                {categoriesOpen
                  ? userCategories.length === 0
                    ? (
                        <MenuRow
                          label={t("library_category_all")}
                          sfSymbol="circle"
                          fallback="ellipse-outline"
                          showDivider
                          inset
                          checked
                          onPress={NOOP}
                        />
                      )
                    : userCategories.map((category) => (
                        <MenuRow
                          key={category.id}
                          label={category.name}
                          sfSymbol="circle"
                          fallback="ellipse-outline"
                          showDivider
                          inset
                          checked={entry.categoryIds.includes(category.id)}
                          onPress={() => toggleCategory(category.id)}
                        />
                      ))
                  : null}
              </>
            ) : (
              <>
                <MenuRow
                  label={t("manga_add_to_library")}
                  sfSymbol="plus.circle"
                  fallback="add-circle-outline"
                  onPress={() => run(() => addToLibrary([]))}
                />
                {userCategories.length > 0 ? (
                  <>
                    <MenuRow
                      label={t("manga_menu_add_to_category")}
                      sfSymbol="folder.badge.plus"
                      fallback="folder-outline"
                      showDivider
                      trailing={categoriesOpen ? "up" : "down"}
                      onPress={() => setCategoriesOpen((value) => !value)}
                    />
                    {categoriesOpen
                      ? userCategories.map((category) => (
                          <MenuRow
                            key={category.id}
                            label={category.name}
                            sfSymbol="folder"
                            fallback="folder-outline"
                            showDivider
                            inset
                            onPress={() =>
                              run(() => addToLibrary([category.id]))
                            }
                          />
                        ))
                      : null}
                  </>
                ) : null}
              </>
            )}
            <MenuRow
              label={t("library_mark_chapters")}
              sfSymbol="checkmark.rectangle.stack"
              fallback="checkmark-done-outline"
              showDivider
              trailing={markOpen ? "up" : "down"}
              onPress={() => setMarkOpen((value) => !value)}
            />
            {markOpen ? (
              <>
                <MenuRow
                  label={t("manga_mark_all_read")}
                  sfSymbol="checkmark.circle"
                  fallback="checkmark-circle-outline"
                  showDivider
                  inset
                  onPress={() => run(() => void markChapters(true))}
                />
                <MenuRow
                  label={t("manga_mark_all_unread")}
                  sfSymbol="circle"
                  fallback="ellipse-outline"
                  showDivider
                  inset
                  onPress={() => run(() => void markChapters(false))}
                />
              </>
            ) : null}
            {entry ? (
              <MenuRow
                label={t("manga_download_all")}
                sfSymbol="arrow.down.circle"
                fallback="download-outline"
                showDivider
                onPress={() => run(() => void downloadAll())}
              />
            ) : null}
            {entry && (entry.downloadedCount ?? 0) > 0 ? (
              <MenuRow
                label={t("manga_remove_downloads")}
                sfSymbol="trash.slash"
                fallback="trash-outline"
                showDivider
                onPress={() =>
                  run(() => void removeMangaDownloads(sourceId, manga.key))
                }
              />
            ) : null}
            {entry ? (
              <MenuRow
                label={t("manga_transfer")}
                sfSymbol="arrow.left.arrow.right"
                fallback="swap-horizontal-outline"
                showDivider
                onPress={() =>
                  run(() =>
                    router.navigate(
                      mangaTransferHref(
                        sourceId,
                        manga.key,
                        manga.title,
                        manga.cover,
                      ),
                    ),
                  )
                }
              />
            ) : null}
            {pageUrl ? (
              <MenuRow
                label={t("manga_share")}
                sfSymbol="square.and.arrow.up"
                fallback="share-outline"
                showDivider
                onPress={() => run(share)}
              />
            ) : null}
            {entry ? (
              <MenuRow
                label={t("manga_remove_from_library")}
                sfSymbol="trash"
                fallback="trash-outline"
                destructive
                showDivider
                onPress={() => run(remove)}
              />
            ) : null}
          </ScrollView>
        </GlassSurface>
      </View>
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
