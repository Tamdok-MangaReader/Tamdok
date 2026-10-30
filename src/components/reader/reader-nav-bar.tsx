import { Ionicons } from "@expo/vector-icons";
import {
  Button,
  Host,
  Label,
  Menu,
  RNHostView,
  Text as SwiftText,
  VStack,
} from "@expo/ui/swift-ui";
import {
  buttonStyle,
  menuIndicator,
  menuStyle,
} from "@expo/ui/swift-ui/modifiers";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import { useTheme } from "@/hooks/use-theme";
import {
  chapterTitleForDisplay,
  formatChapterLabel,
  formatChapterNumberValue,
} from "@/utils/chapter-label";
import { getMangaChapterProgress } from "@/services/manga-tracking";
import { subscribeMangaData } from "@/utils/manga-events";

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
  const { colors, isDark } = useTheme();
  const { chrome, actions, foregroundColor, chapter, chapters, manga, sourceId } =
    useReader();
  const [readKeys, setReadKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void getMangaChapterProgress(sourceId, manga.key)
        .then((progress) => {
          if (cancelled) return;
          const next = new Set<string>();
          for (const entry of Object.values(progress)) {
            if (entry.page === -1) next.add(entry.chapterKey);
          }
          setReadKeys(next);
        })
        .catch(() => undefined);
    };
    load();
    const unsubscribe = subscribeMangaData(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sourceId, manga.key, chapter.key]);
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
  const isIOS = Platform.OS === "ios";

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
          {isIOS ? (
            <Host
              matchContents
              seedColor={colors.tint}
              colorScheme={"dark"}
              style={styles.titleHost}
            >
              <Menu
                label={
                  <RNHostView matchContents>
                    <TitlePill
                      title={titleText}
                      subtitle={scanlators}
                      color={foregroundColor}
                      maxWidth={titleMaxWidth}
                    />
                  </RNHostView>
                }
                modifiers={[
                  menuStyle("button"),
                  buttonStyle("plain"),
                  menuIndicator("hidden"),
                ]}
              >
                {chapters.map((item) => {
                  const name = chapterTitleForDisplay(item);
                  const heading =
                    item.chapterNumber != null
                      ? t("reader_chapter_number", {
                          n: formatChapterNumberValue(item.chapterNumber),
                        })
                      : name || formatChapterLabel(item);
                  const subtitle = item.chapterNumber != null ? name : undefined;
                  const icon =
                    item.key === chapter.key
                      ? "book.fill"
                      : readKeys.has(item.key)
                        ? "checkmark.circle.fill"
                        : "circle";
                  return (
                    <Button
                      key={item.key}
                      onPress={() => {
                        if (item.key !== chapter.key)
                          actions.selectChapter(item);
                      }}
                    >
                      <Label systemImage={icon}>
                        <VStack alignment="leading">
                          <SwiftText>{heading}</SwiftText>
                          {subtitle ? <SwiftText>{subtitle}</SwiftText> : null}
                        </VStack>
                      </Label>
                    </Button>
                  );
                })}
              </Menu>
            </Host>
          ) : (
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
          )}
        </View>
        {isIOS ? (
          <Host
            matchContents
            seedColor={colors.tint}
            colorScheme={"dark"}
            style={styles.dotsHost}
          >
            <Menu
              label={
                <RNHostView matchContents>
                  <GlassIconButton
                    icon="ellipsis-horizontal"
                    onPress={() => {}}
                    iconColor={foregroundColor}
                    glassStyle="clear"
                    tintColor={READER_GLASS_TINT}
                    size={BUTTON_SIZE}
                    iconSize={ICON_SIZE}
                    accessibilityLabel={t("reader_more")}
                  />
                </RNHostView>
              }
              modifiers={[
                menuStyle("button"),
                buttonStyle("plain"),
                menuIndicator("hidden"),
              ]}
            >
              <Button
                label={t("reader_share")}
                systemImage="square.and.arrow.up"
                onPress={actions.shareManga}
              />
              <Button
                label={t("reader_open_web_view")}
                systemImage="safari"
                onPress={actions.openChapterUrl}
              />
            </Menu>
          </Host>
        ) : (
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
        )}
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
