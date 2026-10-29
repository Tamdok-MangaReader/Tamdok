import { memo, useMemo } from "react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SFSymbolIcon } from "@/components/ui/sf-symbol-icon";
import { LongPressScalePressable } from "@/components/ui/long-press-scale-pressable";
import { ThemedText } from "@/components/ui/themed-text";
import { StarRating } from "@/components/manga/star-rating";
import { useCoverDisplay } from "@/hooks/use-cover-display";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import { useSourceCoverHeaders } from "@/context/source-cover-context";
import { useTheme } from "@/hooks/use-theme";
import { coverImageSource } from "@/utils/cover-image-source";
import { IMAGE_CACHE_POLICY } from "@/utils/image-memory";
import { ParsedRating } from "@/utils/manga-description";

type MangaCoverProps = {
  rating?: ParsedRating;
  isRatingCompact?: boolean;
  title: string;
  cover?: string;
  width: number;
  inLibrary?: boolean;
  unreadCount?: number;
  downloadedCount?: number;
  showBookmark?: boolean;
  showStatus?: boolean;
  mangaStatus?: string;
  scaleBadges?: boolean;
  showTitleOverlay?: boolean;
  updateFailed?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

const GRADIENT_COLORS = ["rgba(0,0,0,0.01)", "rgba(0,0,0,0.72)"] as const;
const BADGE_REFERENCE_WIDTH = 112;
const LONG_PRESS_DELAY = 240;

const STATUS_META = {
  ongoing: { bg: "rgba(150,150,150,0.9)", icon: "play.fill", whiteIcon: true },
  completed: { bg: "rgba(1,200,100,0.9)", icon: "checkmark", whiteIcon: false },
  hiatus: { bg: "rgba(230,210,30,0.9)", icon: "pause.fill", whiteIcon: false },
  other: { bg: "rgba(255,40,20,0.9)", icon: "xmark", whiteIcon: false },
} as const;

function getStatusMeta(status: string) {
  switch (status) {
    case "ongoing":
      return STATUS_META.ongoing;
    case "completed":
      return STATUS_META.completed;
    case "hiatus":
      return STATUS_META.hiatus;
    default:
      return STATUS_META.other;
  }
}

function formatCount(value: number): string {
  return value > 99 ? "99+" : String(value);
}

function coverBadgeScale(width: number): number {
  return Math.min(1.7, Math.max(0.72, width / BADGE_REFERENCE_WIDTH));
}

export const MangaCover = memo(function MangaCover({
  title,
  cover,
  width,
  rating,
  inLibrary = false,
  unreadCount = 0,
  downloadedCount = 0,
  showBookmark = true,
  showStatus = false,
  mangaStatus = "null",
  scaleBadges = false,
  showTitleOverlay = true,
  updateFailed = false,
  isRatingCompact = true,
  onPress,
  onLongPress,
}: MangaCoverProps) {
  const { colors, radius } = useTheme();
  const coverHeaders = useSourceCoverHeaders();

  const imageSource = useMemo(
    () => (cover ? coverImageSource(cover, coverHeaders) : undefined),
    [cover, coverHeaders],
  );

  const height = Math.round(width * 1.45);
  const showUnread = inLibrary && unreadCount > 0;
  const showDownloaded = inLibrary && downloadedCount > 0;
  const showBookmarkBadge = showBookmark && inLibrary;
  const coverDisplay = useCoverDisplay();
  const showStatusBadge = showStatus && coverDisplay.showStatusBadge && !updateFailed;

  const pressableStyle = useMemo(() => [styles.pressable, { width }], [width]);

  const coverStyle = useMemo(
    () => [
      styles.cover,
      {
        width,
        height,
        borderRadius: radius.sm,
        backgroundColor: colors.secondaryFill,
      },
    ],
    [width, height, radius.sm, colors.secondaryFill],
  );

  const countStyles = useMemo(() => {
    if (!showUnread && !showDownloaded) return null;
    const scale = scaleBadges ? coverBadgeScale(width) : 1;
    const size = Math.round(20 * scale);
    const inset = Math.max(4, Math.round(Spacing.xs * scale));
    return {
      row: [
        styles.countRow,
        { top: inset, left: inset, gap: Math.max(3, Math.round(4 * scale)) },
      ],
      badge: {
        minWidth: size,
        height: size,
        borderRadius: size / 2,
        paddingHorizontal: Math.max(4, Math.round(6 * scale)),
      },
      text: { fontSize: Math.max(9, Math.round(11 * scale)) },
    };
  }, [showUnread, showDownloaded, scaleBadges, width]);

  const statusMeta = useMemo(
    () => (showStatusBadge ? getStatusMeta(mangaStatus) : null),
    [showStatusBadge, mangaStatus],
  );

  const statusBadgeStyle = useMemo(
    () =>
      statusMeta
        ? [styles.statusBadge, { backgroundColor: statusMeta.bg }]
        : null,
    [statusMeta],
  );

  const coverBody = (
    <View style={coverStyle}>
      {imageSource ? (
        <Image
          source={imageSource}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={cover}
          cachePolicy={IMAGE_CACHE_POLICY}
          allowDownscaling
          transition={0}
        />
      ) : (
        <ThemedText
          variant="caption2"
          color="tertiaryLabel"
          style={styles.placeholder}
        >
          {title.slice(0, 1)}
        </ThemedText>
      )}

      {showBookmarkBadge ? (
        <View style={styles.badges}>
          <View
            style={[styles.bookmarkBadge, { backgroundColor: colors.tint }]}
          >
            <SFSymbolIcon
              name="bookmark.fill"
              size={11}
              color={colors.onTint}
              fallback="bookmark"
            />
          </View>
        </View>
      ) : null}

      {countStyles ? (
        <View style={countStyles.row}>
          {showUnread ? (
            <View
              style={[styles.countBadge, styles.unreadBadge, countStyles.badge]}
            >
              <Text style={[styles.countText, countStyles.text]}>
                {formatCount(unreadCount)}
              </Text>
            </View>
          ) : null}
          {showDownloaded ? (
            <View
              style={[
                styles.countBadge,
                styles.downloadedBadge,
                countStyles.badge,
              ]}
            >
              <Text style={[styles.countText, countStyles.text]}>
                {formatCount(downloadedCount)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {updateFailed ? (
        <View
          style={styles.updateFailedBadge}
          accessibilityRole="image"
          accessibilityLabel={t("library_update_failed")}
        >
          <SFSymbolIcon
            name="exclamationmark.triangle.fill"
            size={14}
            color="#FFFFFF"
            fallback="warning"
          />
        </View>
      ) : null}

      {statusMeta ? (
        <View style={statusBadgeStyle}>
          <SFSymbolIcon
            name={statusMeta.icon}
            size={11}
            color={statusMeta.whiteIcon ? colors.white : colors.black}
            fallback="bookmark"
          />
        </View>
      ) : null}

      {showTitleOverlay ? (
        <>
          <LinearGradient
            colors={GRADIENT_COLORS}
            style={styles.titleGradient}
            pointerEvents="none"
          />
          <View
            style={[
              styles.titleWrap,
              updateFailed ? styles.titleWrapWithWarn : null,
            ]}
          >
            <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
              {title}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );

  const content = (
    <>
      {coverBody}
      {rating && coverDisplay.showRating ? (
        <View style={styles.ratingWrap}>
          <StarRating rating={rating} compact={isRatingCompact} />
        </View>
      ) : null}
    </>
  );

  const interactive = !!(onPress || onLongPress);
  const pressableProps = {
    style: pressableStyle,
    onPress,
    onLongPress,
    delayLongPress: LONG_PRESS_DELAY,
    disabled: !interactive,
    accessibilityRole: (interactive ? "button" : "image") as "button" | "image",
    accessibilityLabel: title,
  };

  if (onLongPress) {
    return (
      <LongPressScalePressable {...pressableProps} squeezeScale={0.92}>
        {content}
      </LongPressScalePressable>
    );
  }

  return <Pressable {...pressableProps}>{content}</Pressable>;
});

const styles = StyleSheet.create({
  pressable: { flexGrow: 0, flexShrink: 0 },
  cover: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: { fontSize: 24, fontWeight: "700" },
  badges: {
    position: "absolute",
    flexDirection: "column",
    gap: Spacing.xs,
    top: Spacing.xs,
    right: Spacing.xs,
    zIndex: 2,
  },
  bookmarkBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  statusBadge: {
    position: "absolute",
    right: Spacing.xs,
    bottom: Spacing.xs,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  countRow: {
    position: "absolute",
    top: Spacing.xs,
    left: Spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 2,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadge: { backgroundColor: "#FF3B30" },
  downloadedBadge: { backgroundColor: "#007AFF" },
  updateFailedBadge: {
    position: "absolute",
    right: Spacing.xs,
    bottom: Spacing.xs,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF3B30",
    zIndex: 3,
  },
  countText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  titleGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "52%",
    zIndex: 2,
  },
  titleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    zIndex: 2,
  },
  titleWrapWithWarn: { paddingRight: Spacing.sm + 22 + Spacing.xs },
  title: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
  },
  ratingWrap: { paddingHorizontal: 2 },
});
