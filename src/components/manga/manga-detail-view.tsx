import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsOpenDuo, useSystemRail } from "@/hooks/use-duo-layout";
import {
  NativeContextMenu,
  type NativeContextMenuItem,
} from "@/components/ui/native-context-menu";
import { ChapterListSkeleton } from "@/components/ui/skeleton";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PressableStateCallbackType,
  type TextStyle,
  type View as ViewType,
} from "react-native";

import { useHeaderHeight } from "@react-navigation/elements";
import { StarRating } from "@/components/manga/star-rating";
import { IncognitoModeBanner } from "@/components/settings/incognito-mode-banner";
import {
  LibraryCategoryDropdown,
  type CategoryDropdownAnchor,
} from "@/components/library/library-category-dropdown";
import { SourceHomeAlertBanner } from "@/components/sources/source-home-alert-banner";
import {
  SwipeableRow,
  SwipeableRowsProvider,
  type SwipeAction,
} from "@/components/sources/swipeable-row";
import { CoverPreview } from "@/components/manga/cover-preview";
import { MangaBackground } from "@/components/manga/manga-image-background";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassSurface } from "@/components/ui/glass-surface";
import { LiquidGlassScrollComponent } from "@/components/ui/liquid-glass-scroll-root";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import { t, getLocale, getExpoLocale } from "@/constants/locales";
import { useSourceCoverHeaders } from "@/context/source-cover-context";
import { useTheme } from "@/hooks/use-theme";
import type { Chapter, Manga } from "@/parsers/shared/types";
import { ALL_CATEGORY_ID, type LibraryCategory } from "@/services/library";
import type { DownloadEntry } from "@/services/downloads";
import {
  chapterTitleForDisplay,
  formatChapterLabel,
  formatChapterNumberValue,
} from "@/utils/chapter-label";
import { coverImageSource } from "@/utils/cover-image-source";
import { getSuggestiveAgeLabel } from "@/utils/age-rating";
import { IMAGE_CACHE_POLICY } from "@/utils/image-memory";
import {
  parseMangaDescription,
  parseRatingText,
} from "@/utils/manga-description";

const DESCRIPTION_PREVIEW_LINES = 4;
const TAG_PREVIEW_COUNT = 6;
const DOWNLOADED_COLOR = "#007AFF";
const COVER_WIDTH = 160;
const COVER_REFERENCE_WIDTH = 430;
const COVER_MIN_WIDTH = 110;

// Full size on Pro Max-class screens; narrower phones give the cover less room so the meta column stays readable.
function coverWidthFor(screenWidth: number) {
  const ratio = Math.min(1, screenWidth / COVER_REFERENCE_WIDTH);
  return Math.max(COVER_MIN_WIDTH, Math.round(COVER_WIDTH * ratio * ratio));
}

const EMPTY_CHAPTERS: Chapter[] = [];
// Header shows at most this many authors / artists.
const MAX_CREDITS = 2;
const EMPTY_TAGS: string[] = [];
const PRESSED_72 = { opacity: 0.72 } as const;
const PRESSED_85 = { opacity: 0.85 } as const;
const noopChapterLongPress = () => {};
const ROW_PAD_NUMBERED = { paddingHorizontal: Spacing.md } as const;
const ROW_PAD_DEFAULT = { paddingHorizontal: Spacing.lg } as const;
const DATE_TEXT_BASE: TextStyle = {
  fontWeight: "700",
  fontVariant: ["tabular-nums"],
};

const STATUS_PILL = {
  ongoing: { tint: "transparent", icon: "play.fill" },
  completed: { tint: "rgba(1,200,100,0.6)", icon: "checkmark" },
  hiatus: { tint: "rgba(230,210,30,0.6)", icon: "pause.fill" },
  other: { tint: "rgba(255,40,20,0.6)", icon: "x.circle.fill" },
} as const;

function getStatusPill(status: string) {
  switch (status) {
    case "ongoing":
      return STATUS_PILL.ongoing;
    case "completed":
      return STATUS_PILL.completed;
    case "hiatus":
      return STATUS_PILL.hiatus;
    default:
      return STATUS_PILL.other;
  }
}

const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
function formatUploadDate(timestampSeconds: number): string {
  const locale = getExpoLocale().regionCode || getLocale();
  let formatter = DATE_FORMATTERS.get(locale);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(locale);
    } catch {
      formatter = new Intl.DateTimeFormat();
    }
    DATE_FORMATTERS.set(locale, formatter);
  }
  return formatter.format(new Date(timestampSeconds * 1000));
}

const libraryPressableStyle = ({ pressed }: PressableStateCallbackType) => [
  styles.libraryButtonPressable,
  pressed && PRESSED_85,
];

// How far past the resting position the list must be pulled to trigger a refresh.
const PULL_TRIGGER_DISTANCE = 70;

const formatCount = (n: number) => (n > 99 ? "99+" : String(n));

const renderScrollComponent = (
  props: React.ComponentProps<typeof LiquidGlassScrollComponent>,
) => <LiquidGlassScrollComponent {...props} scrollsToTop={false} />;

function chapterKeyExtractor(chapter: Chapter): string {
  return chapter.key;
}

const ChapterDownloadIndicator = memo(function ChapterDownloadIndicator({
  entry,
}: {
  entry?: DownloadEntry;
}) {
  if (!entry) return null;

  if (entry.status === "downloading" || entry.status === "pending") {
    return (
      <ProgressRing
        progress={entry.progress}
        size={18}
        color={DOWNLOADED_COLOR}
      />
    );
  }
  if (entry.status === "completed") {
    return <Ionicons name="download" size={14} color={DOWNLOADED_COLOR} />;
  }
  if (entry.status === "failed") {
    return <Ionicons name="alert-circle" size={14} color="#FF3B30" />;
  }
  return null;
});

const DescriptionBlock = memo(function DescriptionBlock({
  text,
  altTitles,
}: {
  text: string;
  altTitles: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const fullText = useMemo(
    () => (altTitles.length > 0 ? `${text}\n\n${altTitles.join(", ")}` : text),
    [text, altTitles],
  );
  const canExpand = text.length > 180;

  return (
    <View style={styles.block}>
      <ThemedText variant="headline" style={styles.blockTitle}>
        {t("manga_description")}
      </ThemedText>
      <ThemedText
        variant="body"
        color="secondaryLabel"
        style={styles.description}
        numberOfLines={expanded ? undefined : DESCRIPTION_PREVIEW_LINES}
      >
        {fullText}
      </ThemedText>
      {canExpand ? (
        <Pressable onPress={toggle} hitSlop={8}>
          <ThemedText
            variant="subheadline"
            color="tint"
            style={styles.expandButton}
          >
            {expanded ? t("manga_show_less") : t("manga_show_more")}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
});

const TagsBlock = memo(function TagsBlock({
  tags,
  contentRating,
}: {
  tags: string[];
  contentRating?: string;
}) {
  const { radius } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const canExpand = tags.length > TAG_PREVIEW_COUNT;
  const visibleTags = useMemo(
    () => (expanded || !canExpand ? tags : tags.slice(0, TAG_PREVIEW_COUNT)),
    [expanded, canExpand, tags],
  );

  return (
    <View style={styles.block}>
      <ThemedText variant="headline" style={styles.blockTitle}>
        {t("manga_tags")}
      </ThemedText>
      <View style={styles.tagsWrap}>
        {contentRating && contentRating !== null && contentRating !== "safe" ? (
          <GlassSurface
            borderRadius={radius.pill}
            style={styles.typePill}
            tintColor={contentRating === "suggestive" ? "#FA9A10" : "#AA1A10"}
          >
            <ThemedText
              variant="footnote"
              color="label"
              style={styles.typeText}
            >
              {`${contentRating === "suggestive" ? getSuggestiveAgeLabel() : "NSFW"}`}
            </ThemedText>
          </GlassSurface>
        ) : null}
        {visibleTags.map((tag) => (
          <GlassSurface
            key={tag}
            borderRadius={radius.pill}
            glassStyle="regular"
          >
            <View style={styles.tagPill}>
              <ThemedText
                variant="subheadline"
                color="secondaryLabel"
                numberOfLines={1}
              >
                {tag}
              </ThemedText>
            </View>
          </GlassSurface>
        ))}
      </View>
      {canExpand ? (
        <Pressable onPress={toggle} hitSlop={8}>
          <ThemedText
            variant="subheadline"
            color="tint"
            style={styles.expandButton}
          >
            {expanded ? t("manga_show_less") : t("manga_show_more")}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
});

type HeaderProps = {
  manga: Manga;
  sourceName?: string;
  sourceKind?: "aidoku" | "tamdok";
  inLibrary: boolean;
  hasCustomCategories: boolean;
  libraryPickerOpen: boolean;
  canOpenInBrowser: boolean;
  isFavorite: boolean;
  continueLabel: string;
  chapterSelectMode: boolean;
  /** Unfolded Duo split: "info" = cover/description (left), "chapters" = continue button + chapter list header (right). */
  part?: "all" | "info" | "chapters";
  showBigMangaCover?: boolean;
  stretchCover?: boolean;
  inlineError?: string | null;
  retrying?: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  chaptersCount: number;
  unreadCount: number;
  downloadedCount: number;
  libraryButtonRef: RefObject<ViewType | null>;
  onDismissInlineError?: () => void;
  onContinueReading: () => void;
  onLibraryPress: () => void;
  onOpenInBrowser: () => void;
  onToggleFavorite: () => void;
  onSelectAllChapters?: () => void;
  onDeselectAllChapters?: () => void;
};

function MoreBadge({ count }: { count: number }) {
  const { radius } = useTheme();
  if (count <= 0) return null;
  return (
    <GlassSurface borderRadius={radius.pill}>
      <ThemedText
        variant="footnote"
        color="secondaryLabel"
        style={styles.moreBadgeText}
      >
        {`+${count}`}
      </ThemedText>
    </GlassSurface>
  );
}

const MangaDetailHeader = memo(function MangaDetailHeader({
  manga,
  sourceName,
  sourceKind,
  inLibrary,
  hasCustomCategories,
  libraryPickerOpen,
  canOpenInBrowser,
  isFavorite,
  continueLabel,
  chapterSelectMode,
  part = "all",
  showBigMangaCover,
  stretchCover = true,
  inlineError,
  retrying,
  isLoading,
  isRefreshing,
  chaptersCount,
  unreadCount,
  downloadedCount,
  libraryButtonRef,
  onDismissInlineError,
  onContinueReading,
  onLibraryPress,
  onOpenInBrowser,
  onToggleFavorite,
  onSelectAllChapters,
  onDeselectAllChapters,
}: HeaderProps) {
  const { colors, radius } = useTheme();
  const coverHeaders = useSourceCoverHeaders();
  const { width: windowWidth } = useWindowDimensions();
  // Folded Duo: the system rail eats one side; this screen is not wrapped by DuoScreenLayout, so keep the hero clear of it here.
  const rail = useSystemRail();
  const coverWidth = coverWidthFor(windowWidth - rail.left - rail.right);

  const parsed = useMemo(
    () => parseMangaDescription(manga.description),
    [manga.description],
  );
  const rating = useMemo(
    () => parseRatingText(manga.rating || parsed.ratingLine),
    [manga.rating, parsed],
  );
  const authors = useMemo(
    () => manga.authors?.filter(Boolean).slice(0, MAX_CREDITS).join(", "),
    [manga.authors],
  );
  const moreAuthors = Math.max(
    0,
    (manga.authors?.filter(Boolean).length ?? 0) - MAX_CREDITS,
  );
  const moreArtists = Math.max(
    0,
    (manga.artists?.filter(Boolean).length ?? 0) - MAX_CREDITS,
  );
  const artists = useMemo(
    () => manga.artists?.filter(Boolean).slice(0, MAX_CREDITS).join(", "),
    [manga.artists],
  );
  const altTitles = useMemo(
    () =>
      (manga.altTitles ?? parsed.altTitles ?? []).filter(
        (name) => name !== manga.title,
      ),
    [manga.altTitles, manga.title, parsed],
  );
  const descriptionText = parsed.summary ?? manga.description ?? "";
  const tags = manga.tags ?? EMPTY_TAGS;

  const coverSource = useMemo(
    () =>
      manga.cover ? coverImageSource(manga.cover, coverHeaders) : undefined,
    [manga.cover, coverHeaders],
  );

  const libraryButtonContent = (
    <>
      <View style={styles.libraryIconLeading} pointerEvents="none">
        <Ionicons
          name={inLibrary ? "bookmark" : "bookmark-outline"}
          size={18}
          color={inLibrary ? colors.tint : colors.onTint}
        />
      </View>
      <ThemedText
        variant="body"
        color={inLibrary ? "tint" : "onTint"}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        maxFontSizeMultiplier={1.3}
        style={styles.libraryButtonText}
      >
        {inLibrary ? t("manga_in_library") : t("manga_add_to_library")}
      </ThemedText>
      {hasCustomCategories ? (
        <View style={styles.libraryIconTrailing} pointerEvents="none">
          <Ionicons
            name={libraryPickerOpen ? "chevron-up" : "chevron-down"}
            size={14}
            color={inLibrary ? colors.tint : colors.onTint}
          />
        </View>
      ) : null}
    </>
  );

  const coverStyle = useMemo(
    () => [
      styles.cover,
      {
        width: coverWidth,
        // At least the poster ratio; grows with the info block next to it (unless stretching is off).
        ...(stretchCover ? { flex: 1 } : null),
        minHeight: Math.round(coverWidth * 1.45),
        borderRadius: radius.md,
        backgroundColor: colors.secondaryFill,
      },
    ],
    [radius.md, colors.secondaryFill, coverWidth],
  );

  const coverScale = useSharedValue(1);
  const coverPressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coverScale.value }],
  }));
  const handleCoverPressIn = useCallback(() => {
    coverScale.value = withTiming(0.94, { duration: 220 });
  }, [coverScale]);
  const handleCoverPressOut = useCallback(() => {
    coverScale.value = withSpring(1, { damping: 14, stiffness: 220 });
  }, [coverScale]);
  const [coverPreviewOpen, setCoverPreviewOpen] = useState(false);
  const handleCoverLongPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCoverPreviewOpen(true);
  }, []);
  const closeCoverPreview = useCallback(() => setCoverPreviewOpen(false), []);

  const statusPill =
    manga.status && manga.status !== "unknown"
      ? getStatusPill(manga.status)
      : null;

  const heroMeta = (
    <>
      <ThemedText variant="title2" numberOfLines={2}>
        {manga.title}
      </ThemedText>
      {sourceName ? (
        <View style={styles.sourceRow}>
          <ThemedText
            variant="subheadline"
            color="tint"
            style={showBigMangaCover ? styles.sourceNameBold : undefined}
          >
            {sourceName}
          </ThemedText>
          {sourceKind ? (
            <GlassSurface borderRadius={radius.pill}>
              <ThemedText
                variant="footnote"
                color="secondaryLabel"
                style={styles.kindBadge}
              >
                {sourceKind === "aidoku" ? "Aidoku" : "Tamdok"}
              </ThemedText>
            </GlassSurface>
          ) : null}
        </View>
      ) : null}
      {altTitles.length > 0 ? (
        <View style={styles.altTitles}>
          <ThemedText
            variant="callout"
            color={showBigMangaCover ? "secondaryLabel" : "tertiaryLabel"}
            numberOfLines={1}
            style={styles.creditText}
          >
            {altTitles[0]}
          </ThemedText>
          <MoreBadge count={altTitles.length - 1} />
        </View>
      ) : null}
      {authors ? (
        <View style={styles.creditRow}>
          <ThemedText variant="subheadline" color="secondaryLabel" numberOfLines={2} style={styles.creditText}>
            {authors}
          </ThemedText>
          <MoreBadge count={moreAuthors} />
        </View>
      ) : null}
      {artists && artists !== authors ? (
        <View style={styles.creditRow}>
          <ThemedText variant="footnote" color="secondaryLabel" numberOfLines={1} style={styles.creditText}>
            {artists}
          </ThemedText>
          <MoreBadge count={moreArtists} />
        </View>
      ) : null}
      {rating ? <StarRating rating={rating} bigger /> : null}
      <View style={styles.pills}>
        {statusPill && manga.status ? (
          <GlassSurface
            borderRadius={radius.pill}
            style={styles.statusPill}
            tintColor={statusPill.tint}
          >
            <SFSymbolIcon
              name={statusPill.icon}
              size={16}
              color={colors.secondaryLabel}
              fallback="globe-outline"
            />
            <ThemedText
              variant="footnote"
              color="secondaryLabel"
              style={styles.statusText}
            >
              {formatStatus(manga.status)}
            </ThemedText>
          </GlassSurface>
        ) : null}
        {manga.viewer ? (
          <GlassSurface borderRadius={radius.pill} style={styles.typePill}>
            <ThemedText
              variant="footnote"
              color="secondaryLabel"
              style={styles.typeText}
            >
              {manga.viewer === "webtoon" ? "Webtoon" : "Manga"}
            </ThemedText>
          </GlassSurface>
        ) : null}
      </View>
      {!chapterSelectMode ? (
        <View style={styles.librarySection}>
          <View style={styles.libraryRow}>
            <Pressable
              ref={libraryButtonRef}
              onPress={onLibraryPress}
              hitSlop={8}
              style={libraryPressableStyle}
            >
              {inLibrary ? (
                <GlassSurface
                  borderRadius={radius.pill}
                  style={[styles.libraryButton]}
                  interactive
                >
                  {libraryButtonContent}
                </GlassSurface>
              ) : (
                <View
                  style={[
                    styles.libraryButton,
                    {
                      borderRadius: radius.pill,
                      backgroundColor: inLibrary
                        ? colors.secondaryFill
                        : colors.tint,
                    },
                  ]}
                >
                  {libraryButtonContent}
                </View>
              )}
            </Pressable>
            {inLibrary ? (
              <Pressable
                style={styles.safariPressable}
                onPress={onToggleFavorite}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  isFavorite
                    ? t("manga_favorite_remove")
                    : t("manga_favorite_add")
                }
              >
                <GlassSurface
                  borderRadius={radius.pill}
                  style={styles.safariButton}
                  interactive
                >
                  <SFSymbolIcon
                    name={isFavorite ? "star.fill" : "star"}
                    size={18}
                    color={isFavorite ? "#F5B301" : colors.tint}
                    fallback={isFavorite ? "star" : "star-outline"}
                  />
                </GlassSurface>
              </Pressable>
            ) : canOpenInBrowser ? (
              <Pressable
                style={styles.safariPressable}
                onPress={onOpenInBrowser}
                hitSlop={8}
                accessibilityRole="button"
              >
                <GlassSurface
                  borderRadius={radius.pill}
                  style={styles.safariButton}
                  interactive
                >
                  <SFSymbolIcon
                    name="safari"
                    size={18}
                    color={colors.tint}
                    fallback="globe-outline"
                  />
                </GlassSurface>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </>
  );

  const progressNode = !chapterSelectMode && chaptersCount > 0 ? (
        <View style={styles.readingProgress}>
          <View style={styles.readingProgressCard}>
            <View style={styles.readingProgressHeader}>
              <ThemedText
                variant="caption1"
                color="secondaryLabel"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={styles.readingProgressLabel}
              >
                {t("manga_reading_progress", {
                  read: String(Math.max(0, chaptersCount - unreadCount)),
                  total: String(chaptersCount),
                })}
              </ThemedText>
              <ThemedText variant="caption1" color="tint" style={styles.readingProgressPercent}>
                {Math.round((Math.max(0, chaptersCount - unreadCount) / chaptersCount) * 100)}%
              </ThemedText>
            </View>
            <View
              style={[
                styles.readingProgressTrack,
                { backgroundColor: colors.secondaryFill },
              ]}
            >
              <View
                style={[
                  styles.readingProgressFill,
                  {
                    backgroundColor: colors.tint,
                    width: `${Math.max(2, Math.round((Math.max(0, chaptersCount - unreadCount) / chaptersCount) * 100))}%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>
      ) : null;

  const showCounts =
    inLibrary && !isLoading && (unreadCount > 0 || downloadedCount > 0);

  const heroNode = (
    <View
      style={[
        styles.hero,
        rail.left > 0 || rail.right > 0
          ? { paddingLeft: rail.left, paddingRight: rail.right }
          : null,
      ]}
    >
        <Pressable
          style={[styles.coverPressable, !stretchCover && styles.coverPressableFixed]}
          onLongPress={handleCoverLongPress}
          onPressIn={handleCoverPressIn}
          onPressOut={handleCoverPressOut}
          delayLongPress={250}
          disabled={!coverSource}
          accessibilityRole="imagebutton"
        >
          <Animated.View style={[coverStyle, coverPressStyle]}>
            {coverSource ? (
              <Image
                source={coverSource}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                recyclingKey={manga.cover}
                cachePolicy={IMAGE_CACHE_POLICY}
                allowDownscaling
                transition={200}
              />
            ) : (
              <ThemedText variant="title1" color="tertiaryLabel">
                {manga.title.slice(0, 1)}
              </ThemedText>
            )}
            {inLibrary ? (
              <View
                style={[styles.coverBookmark, { backgroundColor: colors.tint }]}
              >
                <SFSymbolIcon
                  name="bookmark.fill"
                  size={11}
                  color={colors.onTint}
                  fallback="bookmark"
                />
              </View>
            ) : null}
            {showCounts ? (
              <View style={styles.coverCountRow}>
                {unreadCount > 0 ? (
                  <View
                    style={[styles.coverCountBadge, styles.coverUnreadBadge]}
                  >
                    <ThemedText
                      variant="caption2"
                      style={styles.coverCountText}
                    >
                      {formatCount(unreadCount)}
                    </ThemedText>
                  </View>
                ) : null}
                {downloadedCount > 0 ? (
                  <View
                    style={[
                      styles.coverCountBadge,
                      styles.coverDownloadedBadge,
                    ]}
                  >
                    <ThemedText
                      variant="caption2"
                      style={styles.coverCountText}
                    >
                      {formatCount(downloadedCount)}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            ) : null}
          </Animated.View>
        </Pressable>

        {!showBigMangaCover ? (
          <View style={styles.heroMeta}>{heroMeta}</View>
        ) : (
          <GlassSurface
            glassStyle="regular"
            style={[styles.heroMeta, { padding: Spacing.sm }]}
          >
            {heroMeta}
          </GlassSurface>
        )}
      </View>
  );

  const descNode = (
    <>
      {descriptionText ? (
        <DescriptionBlock text={descriptionText} altTitles={altTitles} />
      ) : null}

      {tags.length > 0 ? (
        <TagsBlock tags={tags} contentRating={manga.contentRating} />
      ) : null}
    </>
  );
  const [headerWidth, setHeaderWidth] = useState(0);
  const windowOpen = useIsOpenDuo();
  const isOpenDuo =
    part === "all" &&
    Platform.OS === "ios" &&
    (headerWidth > 0 ? headerWidth >= OPEN_HEADER_MIN_WIDTH : windowOpen);
  const showInfo = part !== "chapters";
  const showChapters = part !== "info";

  return (
    <View
      style={styles.header}
      onLayout={(event) => setHeaderWidth(Math.round(event.nativeEvent.layout.width))}
    >
      {showInfo && showBigMangaCover && coverSource ? (
        <MangaBackground source={coverSource} />
      ) : null}
      {inlineError ? (
        <SourceHomeAlertBanner
          message={inlineError}
          onDismiss={onDismissInlineError}
        />
      ) : retrying ? (
        <SourceHomeAlertBanner message={t("source_connection_retrying")} loading />
      ) : null}
      <IncognitoModeBanner />

      <CoverPreview
        visible={coverPreviewOpen}
        source={coverSource}
        onClose={closeCoverPreview}
      />

      {!showInfo ? null : isOpenDuo ? (
        <View style={styles.openTop}>
          <View style={styles.openMeta}>{heroNode}</View>
          {showBigMangaCover ? (
            <GlassSurface
              glassStyle="regular"
              style={[styles.openDescription, { padding: Spacing.sm }]}
            >
              {descNode}
            </GlassSurface>
          ) : (
            <View style={styles.openDescription}>{descNode}</View>
          )}
        </View>
      ) : (
        <>
          {heroNode}
          {descNode}
        </>
      )}

      {showChapters && !chapterSelectMode && !isLoading && chaptersCount > 0 ? (
        <Pressable onPress={onContinueReading} style={libraryPressableStyle}>
          <View
            style={[
              styles.continueButton,
              { backgroundColor: colors.tint, borderRadius: radius.md },
            ]}
          >
            <ThemedText
              variant="headline"
              color="onTint"
              numberOfLines={2}
              ellipsizeMode="tail"
              style={styles.continueButtonText}
            >
              {continueLabel}
            </ThemedText>
          </View>
        </Pressable>
      ) : null}

      {showChapters ? (
      <View style={styles.chapterHeader}>
        <View style={styles.chapterTitleRow}>
          {isRefreshing && !chapterSelectMode ? (
            <ShimmerText variant="headline" style={styles.blockTitle}>
              {t("manga_loading")}
            </ShimmerText>
          ) : (
            <ThemedText variant="headline" style={styles.blockTitle}>
              {chapterSelectMode
                ? t("manga_select_chapters")
                : `${t("manga_chapters")}${chaptersCount > 0 ? ` (${chaptersCount})` : ""}`}
            </ThemedText>
          )}
        </View>
        {progressNode}
        {chapterSelectMode ? (
          <View style={styles.selectActions}>
            <Pressable onPress={onSelectAllChapters} hitSlop={8}>
              <ThemedText variant="footnote" color="tint">
                {t("manga_select_all")}
              </ThemedText>
            </Pressable>
            <Pressable onPress={onDeselectAllChapters} hitSlop={8}>
              <ThemedText variant="footnote" color="tint">
                {t("manga_deselect_all")}
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
      </View>
      ) : null}
    </View>
  );
});

type MangaDetailViewProps = {
  manga: Manga;
  sourceName?: string;
  sourceKind?: "aidoku" | "tamdok";
  chapters: Chapter[];
  readChapterKeys: Set<string>;
  bookmarkedChapterKeys?: Set<string>;
  chapterDownloads: Record<string, DownloadEntry>;
  downloadedChapterKeys: Set<string>;
  inLibrary: boolean;
  libraryCategories: LibraryCategory[];
  selectedCategoryIds: string[];
  libraryPickerOpen: boolean;
  canOpenInBrowser: boolean;
  isFavorite: boolean;
  continueLabel: string;
  chapterSelectMode?: boolean;
  contentBottomInset?: number;
  selectedChapterKeys?: Set<string>;
  showBigMangaCover?: boolean;
  stretchCover?: boolean;
  showChapterNumber?: boolean;
  inlineError?: string | null;
  retrying?: boolean;
  onDismissInlineError?: () => void;
  isLoading: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onOpenChapter: (chapter: Chapter) => void;
  onContinueReading: () => void;
  onToggleLibraryPicker: () => void;
  onToggleCategory: (categoryId: string) => void;
  onOpenInBrowser: () => void;
  onToggleFavorite: () => void;
  onMarkChapterRead: (chapter: Chapter) => void;
  onMarkChapterUnread: (chapter: Chapter) => void;
  onToggleChapterBookmark?: (chapter: Chapter) => void;
  onDownloadChapter?: (chapter: Chapter) => void;
  onRemoveChapterDownload?: (chapter: Chapter) => void;
  onToggleChapterSelected?: (chapter: Chapter) => void;
  onSelectAllChapters?: () => void;
  onDeselectAllChapters?: () => void;
};

export function MangaDetailView({
  manga,
  sourceName,
  sourceKind,
  chapters,
  readChapterKeys,
  bookmarkedChapterKeys,
  chapterDownloads,
  downloadedChapterKeys,
  inLibrary,
  libraryCategories,
  selectedCategoryIds,
  libraryPickerOpen,
  canOpenInBrowser,
  isFavorite,
  continueLabel,
  chapterSelectMode = false,
  contentBottomInset = 0,
  selectedChapterKeys,
  showBigMangaCover,
  stretchCover = true,
  showChapterNumber,
  inlineError,
  retrying = false,
  onDismissInlineError,
  isLoading,
  isRefreshing = false,
  onRefresh,
  onOpenChapter,
  onContinueReading,
  onToggleLibraryPicker,
  onToggleCategory,
  onOpenInBrowser,
  onToggleFavorite,
  onMarkChapterRead,
  onMarkChapterUnread,
  onToggleChapterBookmark,
  onDownloadChapter,
  onRemoveChapterDownload,
  onToggleChapterSelected,
  onSelectAllChapters,
  onDeselectAllChapters,
}: MangaDetailViewProps) {
  const { colors } = useTheme();
  const libraryButtonRef = useRef<ViewType>(null);
  const [dropdownAnchor, setDropdownAnchor] =
    useState<CategoryDropdownAnchor | null>(null);

  const unreadCount = useMemo(
    () =>
      chapters.reduce(
        (count, chapter) =>
          readChapterKeys.has(chapter.key) ? count : count + 1,
        0,
      ),
    [chapters, readChapterKeys],
  );
  const downloadedCount = downloadedChapterKeys.size;

  const hasCustomCategories = useMemo(
    () => libraryCategories.some((c) => c.id !== ALL_CATEGORY_ID),
    [libraryCategories],
  );

  const handlersRef = useRef({
    onOpenChapter,
    onToggleChapterSelected,
    onMarkChapterRead,
    onMarkChapterUnread,
    onToggleChapterBookmark,
    onDownloadChapter,
    onRemoveChapterDownload,
    onContinueReading,
    onOpenInBrowser,
    onToggleFavorite,
    onDismissInlineError,
    onSelectAllChapters,
    onDeselectAllChapters,
    onToggleCategory,
    onToggleLibraryPicker,
  });
  handlersRef.current = {
    onOpenChapter,
    onToggleChapterSelected,
    onMarkChapterRead,
    onMarkChapterUnread,
    onToggleChapterBookmark,
    onDownloadChapter,
    onRemoveChapterDownload,
    onContinueReading,
    onOpenInBrowser,
    onToggleFavorite,
    onDismissInlineError,
    onSelectAllChapters,
    onDeselectAllChapters,
    onToggleCategory,
    onToggleLibraryPicker,
  };

  const stableOpenChapter = useCallback(
    (c: Chapter) => handlersRef.current.onOpenChapter(c),
    [],
  );
  const stableToggleSelected = useCallback(
    (c: Chapter) => handlersRef.current.onToggleChapterSelected?.(c),
    [],
  );
  const stableMarkRead = useCallback(
    (c: Chapter) => handlersRef.current.onMarkChapterRead(c),
    [],
  );
  const stableMarkUnread = useCallback(
    (c: Chapter) => handlersRef.current.onMarkChapterUnread(c),
    [],
  );
  const stableToggleBookmark = useCallback(
    (c: Chapter) => handlersRef.current.onToggleChapterBookmark?.(c),
    [],
  );
  const stableDownload = useCallback(
    (c: Chapter) => handlersRef.current.onDownloadChapter?.(c),
    [],
  );
  const stableRemoveDownload = useCallback(
    (c: Chapter) => handlersRef.current.onRemoveChapterDownload?.(c),
    [],
  );
  const stableContinue = useCallback(
    () => handlersRef.current.onContinueReading(),
    [],
  );
  const stableOpenInBrowser = useCallback(
    () => handlersRef.current.onOpenInBrowser(),
    [],
  );
  const stableToggleFavorite = useCallback(
    () => handlersRef.current.onToggleFavorite(),
    [],
  );
  const stableDismissError = useCallback(
    () => handlersRef.current.onDismissInlineError?.(),
    [],
  );
  const stableSelectAll = useCallback(
    () => handlersRef.current.onSelectAllChapters?.(),
    [],
  );
  const stableDeselectAll = useCallback(
    () => handlersRef.current.onDeselectAllChapters?.(),
    [],
  );

  const closeLibraryPicker = useCallback(() => {
    setDropdownAnchor(null);
    if (libraryPickerOpen) handlersRef.current.onToggleLibraryPicker();
  }, [libraryPickerOpen]);

  const handleLibraryPickerPress = useCallback(() => {
    if (!hasCustomCategories) {
      handlersRef.current.onToggleCategory(ALL_CATEGORY_ID);
      return;
    }
    if (libraryPickerOpen) {
      closeLibraryPicker();
      return;
    }
    libraryButtonRef.current?.measureInWindow((x, y, width, height) => {
      setDropdownAnchor({ x, y, width, height });
      handlersRef.current.onToggleLibraryPicker();
    });
  }, [closeLibraryPicker, hasCustomCategories, libraryPickerOpen]);

  const total = chapters.length;

  const [chapterMenusReady, setChapterMenusReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setChapterMenusReady(true), 700);
    return () => clearTimeout(timer);
  }, []);

  const renderChapter: ListRenderItem<Chapter> = useCallback(
    ({ item, index }) => (
      <ChapterRow
        chapter={item}
        index={index}
        total={total}
        selectMode={chapterSelectMode}
        showChapterNumber={showChapterNumber}
        isSelected={selectedChapterKeys?.has(item.key) ?? false}
        isRead={readChapterKeys.has(item.key)}
        isBookmarked={bookmarkedChapterKeys?.has(item.key) ?? false}
        isDownloaded={downloadedChapterKeys.has(item.key)}
        downloadEntry={chapterDownloads[item.key]}
        isLast={index === total - 1}
        menuEnabled={chapterMenusReady}
        onOpen={stableOpenChapter}
        onToggleSelected={stableToggleSelected}
        onMarkRead={stableMarkRead}
        onMarkUnread={stableMarkUnread}
        onToggleBookmark={stableToggleBookmark}
        onDownload={stableDownload}
        onRemoveDownload={stableRemoveDownload}
      />
    ),
    [
      chapterMenusReady,
      bookmarkedChapterKeys,
      chapterDownloads,
      chapterSelectMode,
      downloadedChapterKeys,
      readChapterKeys,
      selectedChapterKeys,
      showChapterNumber,
      total,
      stableOpenChapter,
      stableToggleSelected,
      stableMarkRead,
      stableMarkUnread,
      stableToggleBookmark,
      stableDownload,
      stableRemoveDownload,
    ],
  );

  const duoRail = useSystemRail();
  // The unfolded display reports no rail, but the system may still reserve controls on a side: honour the raw safe-area insets too.
  const safeInsets = useSafeAreaInsets();
  const sideLeft = Math.max(duoRail.left, safeInsets.left);
  const sideRight = Math.max(duoRail.right, safeInsets.right);
  // Unfolded Duo: info on the left, continue button + chapters on the right.
  const split = useIsOpenDuo();

  const renderHeader = (part: "all" | "info" | "chapters") => (
    <MangaDetailHeader
      part={part}
      manga={manga}
      sourceName={sourceName}
      sourceKind={sourceKind}
      inLibrary={inLibrary}
      hasCustomCategories={hasCustomCategories}
      libraryPickerOpen={libraryPickerOpen}
      canOpenInBrowser={canOpenInBrowser}
      isFavorite={isFavorite}
      continueLabel={continueLabel}
      chapterSelectMode={chapterSelectMode}
      showBigMangaCover={showBigMangaCover}
      stretchCover={stretchCover}
      inlineError={inlineError}
      retrying={retrying}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      chaptersCount={total}
      unreadCount={unreadCount}
      downloadedCount={downloadedCount}
      libraryButtonRef={libraryButtonRef}
      onDismissInlineError={
        onDismissInlineError ? stableDismissError : undefined
      }
      onContinueReading={stableContinue}
      onLibraryPress={handleLibraryPickerPress}
      onOpenInBrowser={stableOpenInBrowser}
      onToggleFavorite={stableToggleFavorite}
      onSelectAllChapters={onSelectAllChapters ? stableSelectAll : undefined}
      onDeselectAllChapters={
        onDeselectAllChapters ? stableDeselectAll : undefined
      }
    />
  );
  const listHeader = renderHeader(split ? "chapters" : "all");

  const listEmpty = useMemo(
    () =>
      isLoading ? (
        <ChapterListSkeleton />
      ) : (
        <EmptyState icon="book-outline" title={t("manga_no_chapters")} />
      ),
    [isLoading],
  );

  const contentContainerStyle = useMemo(
    () => [
      styles.content,
      contentBottomInset > 0 && { paddingBottom: contentBottomInset },
    ],
    [contentBottomInset],
  );

  // The cover backdrop paints over the native spinner: with it the header shows progress and a long pull is detected below.
  const coverBackdrop = Boolean(showBigMangaCover) && !split;

  // Pull gesture for the cover-backdrop layout, where the native control is not visible.
  const navHeaderHeight = useHeaderHeight();
  const handlePullEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isRefreshing || !onRefresh) return;
      if (event.nativeEvent.contentOffset.y < -(navHeaderHeight + PULL_TRIGGER_DISTANCE)) {
        onRefresh();
      }
    },
    [isRefreshing, onRefresh, navHeaderHeight],
  );

  const refreshControl = useMemo(
    () =>
      onRefresh ? (
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.secondaryLabel}
        />
      ) : undefined,
    [onRefresh, isRefreshing, colors.secondaryLabel],
  );

  const chaptersList = (
    <FlatList
          style={split ? styles.splitFill : styles.root}
          data={isLoading ? EMPTY_CHAPTERS : chapters}
          keyExtractor={chapterKeyExtractor}
          renderItem={renderChapter}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={contentContainerStyle}
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustsScrollIndicatorInsets
          scrollsToTop={false}
          showsVerticalScrollIndicator={false}
          refreshControl={coverBackdrop ? undefined : refreshControl}
          onScrollEndDrag={coverBackdrop ? handlePullEnd : undefined}
          renderScrollComponent={split ? undefined : renderScrollComponent}
          initialNumToRender={14}
          maxToRenderPerBatch={12}
          updateCellsBatchingPeriod={30}
          windowSize={7}
          removeClippedSubviews={Platform.OS === "android"}
        />
  );

  return (
    <View style={styles.root}>
      <SwipeableRowsProvider>
        {split ? (
          <View style={styles.splitRow}>
            <ScrollView
              style={[styles.splitLeft, { paddingLeft: sideLeft }]}
              contentContainerStyle={contentContainerStyle}
              contentInsetAdjustmentBehavior="automatic"
              automaticallyAdjustsScrollIndicatorInsets
              scrollsToTop={false}
              showsVerticalScrollIndicator={false}
            >
              {renderHeader("info")}
            </ScrollView>
            <View
              style={[
                styles.splitRight,
                { paddingRight: sideRight },
              ]}
            >
              {chaptersList}
            </View>
          </View>
        ) : (
          chaptersList
        )}
      </SwipeableRowsProvider>
      <LibraryCategoryDropdown
        visible={libraryPickerOpen}
        anchor={dropdownAnchor}
        categories={libraryCategories}
        selectedIds={selectedCategoryIds}
        inLibrary={inLibrary}
        onToggleCategory={onToggleCategory}
        onClose={closeLibraryPicker}
      />
    </View>
  );
}

type ChapterRowProps = {
  chapter: Chapter;
  index: number;
  total: number;
  selectMode: boolean;
  isSelected: boolean;
  isRead: boolean;
  isBookmarked?: boolean;
  isDownloaded: boolean;
  downloadEntry?: DownloadEntry;
  isLast: boolean;
  menuEnabled?: boolean;
  showChapterNumber?: boolean;
  onOpen: (chapter: Chapter) => void;
  onToggleSelected?: (chapter: Chapter) => void;
  onMarkRead: (chapter: Chapter) => void;
  onMarkUnread: (chapter: Chapter) => void;
  onToggleBookmark: (chapter: Chapter) => void;
  onDownload: (chapter: Chapter) => void;
  onRemoveDownload: (chapter: Chapter) => void;
};

// All chapter rows share one width. It is measured once on the plain RN card and handed to the
// content hosted inside the native context menu, which otherwise sizes itself to the text and
// pushes the date off screen when a title is long.
let cachedChapterRowWidth = 0;

// Fixed width of the cover + meta block on the unfolded Duo; the description sits to its right.
const OPEN_META_WIDTH = 460;
// A header at least this wide (inside the screen padding) is the unfolded Duo; measured via layout so the arrangement flips in the same frame as the resize.
const OPEN_HEADER_MIN_WIDTH = 468;

// Download entries are rebuilt on every progress tick, so they are compared by value: only the rows
// whose own download changed re-render, not every row of the list.
function downloadEntryEqual(a?: DownloadEntry, b?: DownloadEntry): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.status === b.status &&
    a.progress === b.progress &&
    a.error === b.error
  );
}

function chapterRowPropsEqual(
  previous: ChapterRowProps,
  next: ChapterRowProps,
): boolean {
  const keys = Object.keys(next) as (keyof ChapterRowProps)[];
  for (const key of keys) {
    if (key === "downloadEntry") continue;
    if (previous[key] !== next[key]) return false;
  }
  return downloadEntryEqual(previous.downloadEntry, next.downloadEntry);
}

const ChapterRow = memo(function ChapterRow({
  chapter,
  index,
  total,
  selectMode,
  isSelected,
  isRead,
  isBookmarked = false,
  isDownloaded,
  downloadEntry,
  isLast,
  menuEnabled = false,
  onOpen,
  onToggleSelected,
  onMarkRead,
  onMarkUnread,
  onToggleBookmark,
  onDownload,
  onRemoveDownload,
  showChapterNumber,
}: ChapterRowProps) {
  const { colors, radius, isDark } = useTheme();
  const isLocked = chapter.locked === true;
  const status = downloadEntry?.status;
  const isDownloading = status === "downloading" || status === "pending";
  const isFailed = status === "failed";
  const isFirst = index === 0;
  const loneReadIcon =
    isRead && !isLocked && !isFailed && (isDownloading || !isDownloaded);

  const chapterNumberLabel = showChapterNumber
    ? formatChapterNumber(chapter, index, total)
    : null;
  const title = useMemo(
    () => chapterTitleForDisplay(chapter) ?? formatChapterLabel(chapter),
    [chapter],
  );
  const dateLabel = useMemo(
    () =>
      chapter.dateUploaded ? formatUploadDate(chapter.dateUploaded) : null,
    [chapter.dateUploaded],
  );

  const swipeActions = useMemo<SwipeAction[]>(
    () =>
      isRead
        ? [
            {
              key: "unread",
              label: t("manga_mark_unread"),
              icon: "eye-off",
              sfSymbol: "eye.slash.fill",
              color: "#FF9F0A",
              onPress: () => onMarkUnread(chapter),
            },
          ]
        : [
            {
              key: "read",
              label: t("manga_mark_read"),
              icon: "checkmark-circle",
              sfSymbol: "checkmark.circle.fill",
              color: "#34C759",
              onPress: () => onMarkRead(chapter),
            },
          ],
    [isRead, chapter, onMarkRead, onMarkUnread],
  );

  const leadingActions = useMemo<SwipeAction[]>(
    () => [
      {
        key: "bookmark",
        label: t(
          isBookmarked ? "reader_bookmark_remove" : "reader_bookmark_add",
        ),
        icon: isBookmarked ? "bookmark-outline" : "bookmark",
        sfSymbol: isBookmarked ? "bookmark.slash.fill" : "bookmark.fill",
        color: "#0A84FF",
        onPress: () => onToggleBookmark(chapter),
      },
    ],
    [isBookmarked, chapter, onToggleBookmark],
  );

  const handleFullSwipeLeading = useCallback(
    () => onToggleBookmark(chapter),
    [chapter, onToggleBookmark],
  );

  const handleFullSwipe = useCallback(
    () => (isRead ? onMarkUnread(chapter) : onMarkRead(chapter)),
    [isRead, chapter, onMarkRead, onMarkUnread],
  );

  const handlePress = useCallback(() => {
    if (selectMode) {
      onToggleSelected?.(chapter);
      return;
    }
    if (isLocked) return;
    onOpen(chapter);
  }, [selectMode, isLocked, chapter, onOpen, onToggleSelected]);

  const pressableStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.chapterRow,
      showChapterNumber ? ROW_PAD_NUMBERED : ROW_PAD_DEFAULT,
      pressed && PRESSED_72,
    ],
    [showChapterNumber],
  );

  const dateBadgeStyle = useMemo(
    () => [
      styles.dateUploaded,
      {
        backgroundColor: isRead ? colors.quaternaryFill : colors.tertiaryFill,
      },
    ],
    [isRead, colors.quaternaryFill, colors.tertiaryFill],
  );
  const dateTextStyle = useMemo(
    () => [
      DATE_TEXT_BASE,
      { color: isRead ? colors.tertiaryLabel : colors.secondaryLabel },
    ],
    [isRead, colors.tertiaryLabel, colors.secondaryLabel],
  );

  const cardStyle = useMemo(
    () => [
      styles.chapterCard,
      {
        backgroundColor: colors.secondarySystemBackground,
        borderBottomLeftRadius: isLast ? radius.md : 0,
        borderBottomRightRadius: isLast ? radius.md : 0,
        borderTopLeftRadius: isFirst ? radius.md : 0,
        borderTopRightRadius: isFirst ? radius.md : 0,
      },
    ],
    [colors.secondarySystemBackground, radius.md, isLast, isFirst],
  );
  const separatorStyle = useMemo(
    () => [styles.separator, { backgroundColor: colors.separator }],
    [colors.separator],
  );

  const row = (
    <Pressable
      style={pressableStyle}
      onPress={handlePress}
      onLongPress={menuEnabled && !selectMode ? noopChapterLongPress : undefined}
      delayLongPress={250}
      accessibilityRole="button"
    >
      {selectMode ? (
        <Ionicons
          name={isSelected ? "checkmark-circle" : "ellipse-outline"}
          size={22}
          color={isSelected ? colors.tint : colors.tertiaryLabel}
        />
      ) : (
        <View
          style={[
            styles.unreadDot,
            { backgroundColor: isRead ? "transparent" : colors.tint },
          ]}
        />
      )}
      {!selectMode && chapterNumberLabel ? (
        <ThemedText
          variant="footnote"
          color="secondaryLabel"
          style={styles.chapterNumber}
        >
          {chapterNumberLabel}
        </ThemedText>
      ) : null}
      <View style={styles.chapterMeta}>
        <View style={styles.chapterTitleRow}>
          {isBookmarked ? (
            <Ionicons name="bookmark" size={14} color={colors.tint} />
          ) : null}
          <ThemedText
            variant="body"
            numberOfLines={1}
            color={isRead ? "tertiaryLabel" : "label"}
            style={[
              styles.chapterTitle,
              isRead ? undefined : styles.unreadChapter,
            ]}
          >
            {title}
          </ThemedText>
        </View>
        {chapter.scanlators?.length ? (
          <ThemedText
            variant="caption1"
            color="tertiaryLabel"
            numberOfLines={1}
          >
            {chapter.scanlators.join(", ")}
          </ThemedText>
        ) : null}
        {isFailed && downloadEntry?.error ? (
          <ThemedText variant="caption1" color="destructive" numberOfLines={1}>
            {downloadEntry.error}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.sourceRowRightInfo}>
        {dateLabel || loneReadIcon ? (
          <View style={styles.dateRow}>
            {dateLabel ? (
              <View style={dateBadgeStyle}>
                <ThemedText variant="caption2" style={dateTextStyle}>
                  {dateLabel}
                </ThemedText>
              </View>
            ) : null}
            {loneReadIcon ? (
              <SFSymbolIcon
                name="eye.fill"
                fallback="eye-outline"
                size={14}
                color={colors.tertiaryLabel}
              />
            ) : null}
          </View>
        ) : null}
        <View style={styles.chapterIcons}>
          {isRead && !loneReadIcon ? (
            <SFSymbolIcon
              name="eye.fill"
              fallback="eye-outline"
              size={14}
              color={colors.tertiaryLabel}
            />
          ) : null}
          {isLocked ? (
            <SFSymbolIcon
              name="lock.fill"
              fallback="lock-closed-outline"
              size={14}
              color={colors.tertiaryLabel}
            />
          ) : null}
          {!isDownloading && isDownloaded ? (
            <Ionicons name="download" size={14} color={DOWNLOADED_COLOR} />
          ) : null}
          {isFailed ? (
            <Ionicons name="alert-circle" size={14} color="#FF3B30" />
          ) : null}
        </View>
      </View>
      {!selectMode && !isLocked ? (
        isDownloading ? (
          <ChapterDownloadIndicator entry={downloadEntry} />
        ) : (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.tertiaryLabel}
          />
        )
      ) : null}
    </Pressable>
  );

  const [rowWidth, setRowWidth] = useState(cachedChapterRowWidth);
  const handleCardLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (width > 0 && width !== cachedChapterRowWidth) {
      cachedChapterRowWidth = width;
      setRowWidth(width);
    }
  }, []);

  const canRemoveDownload = isDownloaded && !isDownloading;
  const canDownload = !isDownloaded && !isDownloading && !isLocked;

  const menuItems: NativeContextMenuItem[] = [
    {
      key: "bookmark",
      label: t(isBookmarked ? "reader_bookmark_remove" : "reader_bookmark_add"),
      systemImage: isBookmarked ? "bookmark.slash" : "bookmark",
      icon: isBookmarked ? "bookmark" : "bookmark-outline",
      onPress: () => onToggleBookmark(chapter),
    },
    {
      key: "read",
      label: t(isRead ? "manga_mark_unread" : "manga_mark_read"),
      systemImage: isRead ? "eye.slash" : "checkmark.circle",
      icon: isRead ? "eye-off-outline" : "checkmark-circle-outline",
      onPress: () => (isRead ? onMarkUnread(chapter) : onMarkRead(chapter)),
    },
  ];
  if (canDownload)
    menuItems.push({
      key: "download",
      label: t("chapter_download"),
      systemImage: "arrow.down.circle",
      icon: "download-outline",
      onPress: () => onDownload(chapter),
    });
  if (canRemoveDownload)
    menuItems.push({
      key: "remove",
      label: t("chapter_remove_download"),
      systemImage: "trash",
      icon: "trash-outline",
      destructive: true,
      onPress: () => onRemoveDownload(chapter),
    });

  const menuRow =
    menuEnabled && !selectMode ? (
      <NativeContextMenu items={menuItems}>
        <View
          style={{
            backgroundColor: colors.secondarySystemBackground,
            ...(rowWidth > 0 ? { width: rowWidth } : null),
          }}
        >
          {row}
        </View>
      </NativeContextMenu>
    ) : (
      row
    );

  return (
    <View style={cardStyle} onLayout={handleCardLayout}>
      <SwipeableRow
        rowId={chapter.key}
        enabled={!selectMode}
        actions={swipeActions}
        leadingActions={leadingActions}
        fullSwipeActionKey={isRead ? "unread" : "read"}
        fullSwipeLeadingActionKey="bookmark"
        onFullSwipe={handleFullSwipe}
        onFullSwipeLeading={handleFullSwipeLeading}
      >
        {menuRow}
      </SwipeableRow>
      {!isLast ? <View style={separatorStyle} /> : null}
    </View>
  );
}, chapterRowPropsEqual);

function formatStatus(status: NonNullable<Manga["status"]>): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatChapterNumber(
  chapter: Chapter,
  index: number,
  total: number,
): string {
  if (chapter.chapterNumber != null) {
    return `${formatChapterNumberValue(chapter.chapterNumber)}`;
  }
  return `${total - index}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },

  header: {
    gap: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  sourceNameBold: {
    fontWeight: "700",
  },
  splitRow: { flex: 1, flexDirection: "row" },
  splitLeft: { flex: 1 },
  splitRight: { flex: 1 },
  splitFill: { flex: 1 },
  openTop: {
    flexDirection: "row",
    gap: Spacing.xl,
    alignItems: "flex-start",
  },
  openMeta: {
    width: OPEN_META_WIDTH,
    flexShrink: 0,
  },
  openDescription: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xl,
  },
  hero: {
    flexDirection: "row",
    gap: Spacing.lg,
    alignItems: "stretch",
  },
  coverPressableFixed: {
    alignSelf: "flex-start",
  },
  coverPressable: {
    alignSelf: "stretch",
  },
  cover: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  coverView: {
    gap: Spacing.sm,
  },
  coverBookmark: {
    position: "absolute",
    top: Spacing.xs,
    right: Spacing.xs,
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  coverCountRow: {
    position: "absolute",
    top: Spacing.xs,
    left: Spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 2,
  },
  coverCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  coverUnreadBadge: {
    backgroundColor: "#FF3B30",
  },
  coverDownloadedBadge: {
    backgroundColor: "#007AFF",
  },
  coverCountText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  heroMeta: {
    flex: 1,
    gap: Spacing.xs,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flexWrap: "wrap",
  },
  sourceRowRightInfo: {
    flexDirection: "column",
    gap: Spacing.xs,
    alignItems: "flex-end",
    verticalAlign: "middle",
    flexShrink: 0,
  },
  kindBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: 2,
  },
  typePill: {
    paddingHorizontal: Spacing.sm,
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
  },
  statusText: {
    paddingVertical: 4,
  },
  typeText: {
    paddingVertical: 4,
  },
  readingProgress: {
    flex: 1,
    minWidth: 120,
  },
  readingProgressCard: {
    gap: 6,
  },
  readingProgressHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  readingProgressLabel: {
    flexShrink: 1,
  },
  readingProgressPercent: {
    fontWeight: "700",
  },
  readingProgressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  readingProgressFill: {
    height: 5,
    borderRadius: 3,
  },
  librarySection: {
    gap: Spacing.sm,
    alignSelf: "stretch",
  },
  libraryRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: Spacing.xs,
    alignSelf: "flex-start",
  },
  libraryButtonPressable: {
    flex: 1,
  },
  libraryButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    minHeight: 40,
  },
  libraryButtonText: {
    // A fixed lineHeight stays put while adjustsFontSizeToFit shrinks the glyphs, pushing the text down.
    lineHeight: undefined,
    flexShrink: 1,
    textAlign: "center",
    paddingHorizontal: 26,
  },
  libraryIconLeading: {
    position: "absolute",
    left: Spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  libraryIconTrailing: {
    position: "absolute",
    right: Spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  safariPressable: {
    // Square, as tall as the library button next to it.
    aspectRatio: 1,
  },
  safariButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  continueButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
  },
  continueButtonText: {
    textAlign: "center",
  },
  block: {
    gap: Spacing.sm,
  },
  blockTitle: {
    paddingHorizontal: Spacing.xs,
  },
  chapterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  chapterTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexShrink: 1,
  },
  selectActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  description: {
    lineHeight: 22,
    paddingHorizontal: Spacing.xs,
  },
  expandButton: {
    paddingHorizontal: Spacing.xs,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  tagPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    maxWidth: "100%",
  },
  chapterCard: {
    overflow: "hidden",
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: "transparent",
  },
  chapterNumber: {
    width: 35,
    textAlign: "center",
  },
  chapterMeta: {
    flex: 1,
    // Lets long titles shrink and truncate instead of pushing the date off screen.
    minWidth: 0,
    gap: 2,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chapterIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chapterTitle: {
    flex: 1,
    minWidth: 0,
  },
  unreadChapter: {
    fontWeight: "600",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.lg + 8 + Spacing.md,
    marginRight: Spacing.lg,
  },
  loading: {
    paddingVertical: Spacing.xl,
  },
  dateUploaded: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  pills: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    flex: 1,
  },
  altTitles: {
    display: "flex",
    flexDirection: "row",
    gap: Spacing.xs,
  },
  creditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  creditText: {
    flexShrink: 1,
  },
  moreBadgeText: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
  },
  caltTitleBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
