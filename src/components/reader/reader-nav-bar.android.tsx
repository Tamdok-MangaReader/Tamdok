import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useWindowDimensions } from "@/hooks/use-duo-layout";
import { READER_GLASS_TINT } from "@/utils/reader-glass";
import { useReader } from "@/components/reader/reader-context";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import {
  InlineActionMenu,
  type InlineActionMenuAnchor,
} from "@/components/ui/inline-action-menu";
import { GlassSurface } from "@/components/ui/glass-surface";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";

type ReaderNavBarProps = {
  visible: boolean;
};

const BUTTON_SIZE = 44;
const ICON_SIZE = 22;
const SIDE_GAP = Spacing.sm;

function TitlePill({
  title,
  subtitle,
  color,
  maxWidth,
}: {
  title: string;
  subtitle: string;
  color: string;
  maxWidth: number;
}) {
  return (
    <GlassSurface
      borderRadius={22}
      glassStyle="clear"
      tintColor={READER_GLASS_TINT}
      interactive
      style={[styles.titleSurface, { maxWidth }]}
    >
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <ThemedText
            variant="subheadline"
            numberOfLines={1}
            style={[styles.title, { color }]}
          >
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText
              variant="caption1"
              numberOfLines={1}
              style={[styles.subtitle, { color }]}
            >
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        <Ionicons name="chevron-down" size={16} color={color} />
      </View>
    </GlassSurface>
  );
}

export function ReaderNavBar({ visible }: ReaderNavBarProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { chrome, actions, foregroundColor, chapter } = useReader();
  const [menuAnchor, setMenuAnchor] = useState<InlineActionMenuAnchor | null>(
    null,
  );
  const menuButtonRef = useRef<View>(null);

  const openFallbackMenu = useCallback(() => {
    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
    });
  }, []);

  const closeFallbackMenu = useCallback(() => setMenuAnchor(null), []);

  if (!visible) return null;

  const scanlators = chapter.scanlators?.length
    ? chapter.scanlators.join(", ")
    : "";
  const titleMaxWidth =
    windowWidth - Spacing.sm * 2 - BUTTON_SIZE * 2 - SIDE_GAP * 2 - 8;
  const titleText = chrome.chapterTitle || chrome.mangaTitle;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(180)}
      style={[styles.root, { paddingTop: Math.max(insets.top, Spacing.sm) }]}
      pointerEvents="box-none"
    >
      <View style={styles.row} pointerEvents="box-none">
        <GlassIconButton
          icon="chevron-back"
          onPress={actions.closeReader}
          iconColor={foregroundColor}
          glassStyle="clear"
          tintColor={READER_GLASS_TINT}
          size={BUTTON_SIZE}
          iconSize={ICON_SIZE}
          accessibilityLabel={t("reader_back")}
        />
        <View style={styles.center} pointerEvents="box-none">
            <Pressable
              onPress={actions.openChapterList}
              accessibilityRole="button"
            >
              <TitlePill
                title={titleText}
                subtitle={scanlators}
                color={foregroundColor}
                maxWidth={titleMaxWidth}
              />
            </Pressable>
        </View>
          <View ref={menuButtonRef} collapsable={false}>
            <GlassIconButton
              icon="ellipsis-horizontal"
              onPress={openFallbackMenu}
              iconColor={foregroundColor}
              glassStyle="clear"
              tintColor={READER_GLASS_TINT}
              size={BUTTON_SIZE}
              iconSize={ICON_SIZE}
              accessibilityLabel={t("reader_more")}
            />
          </View>
      </View>
      <InlineActionMenu
        visible={menuAnchor !== null}
        anchor={menuAnchor}
        onClose={closeFallbackMenu}
        items={[
          {
            key: "share",
            label: t("reader_share"),
            sfSymbol: "square.and.arrow.up",
            fallbackIcon: "share-outline",
            onPress: actions.shareManga,
          },
          {
            key: "web",
            label: t("reader_open_web_view"),
            sfSymbol: "safari",
            fallbackIcon: "globe-outline",
            onPress: actions.openChapterUrl,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SIDE_GAP,
  },
  center: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  titleHost: {
    alignSelf: "center",
  },
  titleHidden: {
    opacity: 0,
  },
  dotsHost: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
  },
  titleSurface: {
    overflow: "hidden",
  },
  titleRow: {
    minHeight: BUTTON_SIZE,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
  },
  titleText: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: "center",
  },
  title: {
    fontWeight: "600",
    textAlign: "center",
  },
  subtitle: {
    opacity: 0.65,
    textAlign: "center",
  },
});
