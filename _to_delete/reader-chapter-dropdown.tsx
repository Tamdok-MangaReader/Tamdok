import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassSurface } from "@/components/ui/glass-surface";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import type { Chapter } from "@/parsers/shared/types";
import { READER_GLASS_TINT } from "@/utils/reader-glass";
import {
  chapterTitleForDisplay,
  formatChapterLabel,
  formatChapterNumberValue,
} from "@/utils/chapter-label";

const ROW_HEIGHT = 64;
const PANEL_MAX_WIDTH = 340;
const ICON_SLOT = 28;

export type ChapterDropdownAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  anchor: ChapterDropdownAnchor | null;
  chapters: Chapter[];
  currentKey: string;
  readKeys: Set<string>;
  onSelect: (chapter: Chapter) => void;
  onClose: () => void;
};

type RowProps = {
  chapter: Chapter;
  current: boolean;
  read: boolean;
  onSelect: (chapter: Chapter) => void;
};

const Row = memo(function Row({ chapter, current, read, onSelect }: RowProps) {
  const name = chapterTitleForDisplay(chapter);
  const hasNumber = chapter.chapterNumber != null;
  const heading = hasNumber
    ? t("reader_chapter_number", {
        n: formatChapterNumberValue(chapter.chapterNumber as number),
      })
    : name || formatChapterLabel(chapter);
  const subtitle = hasNumber ? name : undefined;
  const icon = current
    ? "book"
    : read
      ? "checkmark-circle"
      : "ellipse-outline";

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onSelect(chapter)}
      accessibilityRole="button"
    >
      <View style={styles.iconSlot}>
        <Ionicons
          name={icon}
          size={20}
          color={current ? "#fff" : read ? "rgba(255,255,255,0.55)" : "#fff"}
        />
      </View>
      <View style={styles.texts}>
        <ThemedText
          variant="body"
          numberOfLines={1}
          style={[styles.heading, current && styles.headingCurrent]}
        >
          {heading}
        </ThemedText>
        {subtitle ? (
          <ThemedText variant="footnote" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.iconSlot} />
    </Pressable>
  );
});

export function ReaderChapterDropdown({
  anchor,
  chapters,
  currentKey,
  readKeys,
  onSelect,
  onClose,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const closingRef = useRef(false);

  useEffect(() => {
    if (!anchor) return;
    closingRef.current = false;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [anchor, progress]);

  const layout = useMemo(() => {
    if (!anchor) return null;
    const panelWidth = Math.min(width - Spacing.lg * 2, PANEL_MAX_WIDTH);
    const available = height - anchor.y - insets.bottom - Spacing.xl;
    const panelHeight = Math.max(
      ROW_HEIGHT * 3,
      Math.min(chapters.length * ROW_HEIGHT, available, height * 0.62),
    );
    const index = Math.max(
      0,
      chapters.findIndex((item) => item.key === currentKey),
    );
    const total = chapters.length * ROW_HEIGHT;
    const centered = index * ROW_HEIGHT + ROW_HEIGHT / 2 - panelHeight / 2;
    return {
      panelWidth,
      panelHeight,
      left: (width - panelWidth) / 2,
      offset: Math.min(Math.max(0, centered), Math.max(0, total - panelHeight)),
    };
  }, [anchor, chapters, currentKey, height, insets.bottom, width]);

  const frameStyle = useAnimatedStyle(() => {
    if (!anchor || !layout) return {};
    const p = progress.value;
    return {
      top: anchor.y,
      left: anchor.x + (layout.left - anchor.x) * p,
      width: anchor.width + (layout.panelWidth - anchor.width) * p,
      height: anchor.height + (layout.panelHeight - anchor.height) * p,
      borderRadius: 22 + 4 * p,
    };
  });

  const contentStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, (progress.value - 0.35) / 0.65),
  }));

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    progress.value = withTiming(0, {
      duration: 240,
      easing: Easing.inOut(Easing.cubic),
    });
    setTimeout(onClose, 230);
  }, [onClose, progress]);

  const handleSelect = useCallback(
    (chapter: Chapter) => {
      close();
      if (chapter.key === currentKey) return;
      void Haptics.selectionAsync();
      setTimeout(() => onSelect(chapter), 120);
    },
    [close, currentKey, onSelect],
  );

  if (!anchor || !layout) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <Animated.View style={[styles.frame, frameStyle]}>
        <GlassSurface
          borderRadius={26}
          glassStyle="clear"
          tintColor={READER_GLASS_TINT}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[
            styles.content,
            { width: layout.panelWidth, height: layout.panelHeight },
            contentStyle,
          ]}
        >
          <ScrollView
            contentOffset={{ x: 0, y: layout.offset }}
            showsVerticalScrollIndicator={false}
          >
            {chapters.map((item) => (
              <Row
                key={item.key}
                chapter={item}
                current={item.key === currentKey}
                read={readKeys.has(item.key)}
                onSelect={handleSelect}
              />
            ))}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  frame: {
    position: "absolute",
    overflow: "hidden",
  },
  content: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  rowPressed: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  iconSlot: {
    width: ICON_SLOT,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
  },
  heading: {
    color: "#fff",
    textAlign: "center",
  },
  headingCurrent: {
    fontWeight: "700",
  },
  subtitle: {
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
  },
});
