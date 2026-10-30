import {
  GlassEffectContainer,
  HStack,
  Host,
  Image,
  Namespace,
  ScrollView,
  Text,
  VStack,
  ZStack,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  Animation,
  animation,
  contentShape,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  glassEffectId,
  id,
  multilineTextAlignment,
  onTapGesture,
  padding,
  scrollPosition,
  scrollTargetLayout,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import * as Haptics from "expo-haptics";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import type { Chapter } from "@/parsers/shared/types";
import {
  chapterTitleForDisplay,
  formatChapterLabel,
  formatChapterNumberValue,
} from "@/utils/chapter-label";
import { READER_GLASS_TINT } from "@/utils/reader-glass";

const ROW_HEIGHT = 62;
const PANEL_MAX_WIDTH = 340;
const BIG = 10000;
const MORPH = Animation.smooth({ duration: 0.45 });
const COLLAPSE_DELAY_MS = 520;

type Props = {
  chapters: Chapter[];
  currentKey: string;
  readKeys: Set<string>;
  title: string;
  subtitle: string;
  buttonSize: number;
  pillMaxWidth: number;
  foregroundColor: string;
  onSelect: (chapter: Chapter) => void;
};

type RowData = {
  key: string;
  heading: string;
  subtitle?: string;
  icon: "book.fill" | "checkmark.circle.fill" | "circle";
};

function buildRows(
  chapters: Chapter[],
  currentKey: string,
  readKeys: Set<string>,
): RowData[] {
  return chapters.map((item) => {
    const name = chapterTitleForDisplay(item);
    const hasNumber = item.chapterNumber != null;
    return {
      key: item.key,
      heading: hasNumber
        ? t("reader_chapter_number", {
            n: formatChapterNumberValue(item.chapterNumber as number),
          })
        : name || formatChapterLabel(item),
      subtitle: hasNumber ? name : undefined,
      icon:
        item.key === currentKey
          ? "book.fill"
          : readKeys.has(item.key)
            ? "checkmark.circle.fill"
            : "circle",
    };
  });
}

const ChapterRow = memo(function ChapterRow({
  row,
  current,
  onPress,
}: {
  row: RowData;
  current: boolean;
  onPress: (key: string) => void;
}) {
  const iconColor = current ? "#FFFFFF" : "rgba(255,255,255,0.6)";
  return (
    <HStack
      spacing={12}
      modifiers={[
        id(row.key),
        frame({ maxWidth: BIG, minHeight: ROW_HEIGHT }),
        padding({ horizontal: 18 }),
        contentShape(shapes.rectangle()),
        onTapGesture(() => onPress(row.key)),
      ]}
    >
      <Image systemName={row.icon} size={20} color={iconColor} />
      <VStack spacing={2} modifiers={[frame({ maxWidth: BIG })]}>
        <Text
          modifiers={[
            font({ size: 17, weight: current ? "bold" : "semibold" }),
            foregroundStyle("#FFFFFF"),
            multilineTextAlignment("center"),
          ]}
        >
          {row.heading}
        </Text>
        {row.subtitle ? (
          <Text
            modifiers={[
              font({ size: 13, weight: "regular" }),
              foregroundStyle("rgba(255,255,255,0.65)"),
              multilineTextAlignment("center"),
            ]}
          >
            {row.subtitle}
          </Text>
        ) : null}
      </VStack>
      <Image systemName="circle" size={20} color="rgba(0,0,0,0)" />
    </HStack>
  );
});

export function ReaderChapterGlassMenu({
  chapters,
  currentKey,
  readKeys,
  title,
  subtitle,
  buttonSize,
  pillMaxWidth,
  foregroundColor,
  onSelect,
}: Props) {
  const namespaceId = useId();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [boxOpen, setBoxOpen] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeId = useNativeState<string | null>(currentKey);

  const rows = useMemo(
    () => buildRows(chapters, currentKey, readKeys),
    [chapters, currentKey, readKeys],
  );

  const topPad = Math.max(insets.top, Spacing.sm);
  const panelWidth = Math.min(width - Spacing.lg * 2, PANEL_MAX_WIDTH);
  const panelHeight = Math.max(
    ROW_HEIGHT * 3,
    Math.min(
      rows.length * ROW_HEIGHT,
      height - topPad - insets.bottom - Spacing.xxxl,
      height * 0.62,
    ),
  );
  const collapsedHeight = topPad + buttonSize;
  const openHeight = topPad + panelHeight + Spacing.sm;

  useEffect(
    () => () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    },
    [],
  );

  const open = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    activeId.set(currentKey);
    setBoxOpen(true);
    setExpanded(true);
    void Haptics.selectionAsync();
  }, [activeId, currentKey]);

  const close = useCallback(() => {
    setExpanded(false);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(
      () => setBoxOpen(false),
      COLLAPSE_DELAY_MS,
    );
  }, []);

  const handlePress = useCallback(
    (key: string) => {
      close();
      if (key === currentKey) return;
      const target = chapters.find((item) => item.key === key);
      if (!target) return;
      void Haptics.selectionAsync();
      setTimeout(() => onSelect(target), 160);
    },
    [chapters, close, currentKey, onSelect],
  );

  const glassPill = glassEffect({
    glass: { variant: "clear", interactive: true, tint: READER_GLASS_TINT },
    shape: "roundedRectangle",
    cornerRadius: 22,
  });
  const glassPanel = glassEffect({
    glass: { variant: "clear", tint: READER_GLASS_TINT },
    shape: "roundedRectangle",
    cornerRadius: 28,
  });

  return (
    <>
      {boxOpen ? (
        <Pressable
          onPress={close}
          style={[styles.backdrop, { width, height }]}
        />
      ) : null}
      <View
        pointerEvents="box-none"
        style={[
          styles.box,
          {
            width,
            height: boxOpen ? openHeight : collapsedHeight,
            zIndex: boxOpen ? 20 : 0,
          },
        ]}
      >
        <Host
          colorScheme="dark"
          style={{ width, height: boxOpen ? openHeight : collapsedHeight }}
        >
          <Namespace id={namespaceId}>
            <ZStack
              alignment="top"
              modifiers={[
                frame({ maxWidth: BIG, maxHeight: BIG, alignment: "top" }),
                padding({ top: topPad }),
                animation(MORPH, expanded),
              ]}
            >
              <GlassEffectContainer spacing={20}>
                {expanded ? (
                  <ScrollView
                    showsIndicators={false}
                    modifiers={[
                      frame({ minWidth: panelWidth, maxWidth: panelWidth, minHeight: panelHeight, maxHeight: panelHeight }),
                      glassPanel,
                      glassEffectId("chapter-menu", namespaceId),
                      scrollPosition(activeId, { anchor: "center" }),
                    ]}
                  >
                    <VStack spacing={0} modifiers={[scrollTargetLayout()]}>
                      {rows.map((row) => (
                        <ChapterRow
                          key={row.key}
                          row={row}
                          current={row.key === currentKey}
                          onPress={handlePress}
                        />
                      ))}
                    </VStack>
                  </ScrollView>
                ) : (
                  <HStack
                    spacing={8}
                    modifiers={[
                      frame({ maxWidth: pillMaxWidth, minHeight: buttonSize }),
                      padding({ horizontal: 18, vertical: 6 }),
                      glassPill,
                      glassEffectId("chapter-menu", namespaceId),
                      contentShape(shapes.rectangle()),
                      onTapGesture(open),
                    ]}
                  >
                    <VStack spacing={1}>
                      <Text
                        modifiers={[
                          font({ size: 15, weight: "semibold" }),
                          foregroundStyle(foregroundColor),
                          multilineTextAlignment("center"),
                        ]}
                      >
                        {title}
                      </Text>
                      {subtitle ? (
                        <Text
                          modifiers={[
                            font({ size: 12, weight: "regular" }),
                            foregroundStyle(foregroundColor),
                            multilineTextAlignment("center"),
                          ]}
                        >
                          {subtitle}
                        </Text>
                      ) : null}
                    </VStack>
                    <Image
                      systemName="chevron.down"
                      size={14}
                      color={foregroundColor}
                    />
                  </HStack>
                )}
              </GlassEffectContainer>
            </ZStack>
          </Namespace>
        </Host>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 10,
  },
});
