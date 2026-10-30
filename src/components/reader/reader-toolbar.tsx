import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { READER_GLASS_TINT } from "@/utils/reader-glass";
import { useReader } from "@/components/reader/reader-context";
import { ReaderPageSlider } from "@/components/reader/reader-page-slider";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type ReaderToolbarProps = {
  visible: boolean;
};

export function ReaderToolbar({ visible }: ReaderToolbarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { chrome, actions, foregroundColor, mode, bookmarked } = useReader();

  if (!visible) return null;

  const totalPages = Math.max(1, chrome.totalPages);
  const inverted = mode === "rtl";

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(180)}
      style={[
        styles.root,
        { paddingBottom: Math.max(insets.bottom, Spacing.sm) },
      ]}
      pointerEvents="box-none"
    >
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
