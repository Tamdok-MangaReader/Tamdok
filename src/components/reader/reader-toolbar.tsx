import { StyleSheet, View } from "react-native";
import { Fragment, useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { READER_GLASS_TINT } from "@/utils/reader-glass";
import { useReader } from "@/components/reader/reader-context";
import { ReaderPageSlider } from "@/components/reader/reader-page-slider";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import { useGlassEpoch } from "@/hooks/use-glass-epoch";
import { useSystemRail } from "@/hooks/use-duo-layout";
import { useTheme } from "@/hooks/use-theme";

type ReaderToolbarProps = {
  visible: boolean;
};

export function ReaderToolbar({ visible }: ReaderToolbarProps) {
  const insets = useSafeAreaInsets();
  // Folded Duo: keep the controls out from under the system rail (it swallows touches there).
  const rail = useSystemRail();
  const { colors } = useTheme();
  const { chrome, actions, foregroundColor, mode, bookmarked, chapter } = useReader();

  // Stays mounted and only fades: mounting the glass controls on every tap made the menu appear late.
  const glassEpoch = useGlassEpoch(visible, undefined, `${chapter.key}|${chrome.totalPages}`);
  const opacity = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 180 });
  }, [opacity, visible]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const totalPages = Math.max(1, chrome.totalPages);
  const inverted = mode === "rtl";

  return (
    <Animated.View
      style={[
        styles.root,
        {
          paddingBottom: Math.max(insets.bottom, Spacing.sm),
          paddingLeft: Spacing.lg + rail.left,
          paddingRight: Spacing.lg + rail.right,
        },
        fadeStyle,
      ]}
      pointerEvents={visible ? "box-none" : "none"}
    >
      <Fragment key={glassEpoch}>
      <View style={styles.controls}>
        <GlassIconButton
          icon={bookmarked ? "bookmark" : "bookmark-outline"}
          onPress={actions.toggleBookmark}
          iconColor={bookmarked ? colors.tint : foregroundColor}
          size={52}
          glassStyle="clear"
          tintColor={READER_GLASS_TINT}
          iconSize={24}
          accessibilityLabel={t(
            bookmarked ? "reader_bookmark_remove" : "reader_bookmark_add",
          )}
        />
        <ReaderPageSlider
          key={inverted ? "rtl" : "ltr"}
          currentPage={chrome.currentPage}
          totalPages={totalPages}
          accentColor={colors.tint}
          labelColor={foregroundColor}
          inverted={inverted}
          onSeek={(page) => actions.goToPage(page, false)}
        />
        <GlassIconButton
          icon="settings-outline"
          onPress={actions.openReaderSettings}
          iconColor={foregroundColor}
          size={52}
          glassStyle="clear"
          tintColor={READER_GLASS_TINT}
          iconSize={24}
          accessibilityLabel="Reader settings"
        />
      </View>
      {chrome.incognito ? (
        <ThemedText
          variant="caption2"
          style={{ color: foregroundColor, textAlign: "center" }}
        >
          {t("incognito_mode_active")}
        </ThemedText>
      ) : null}
      </Fragment>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rowReversed: {
    flexDirection: "row-reverse",
  },
});
