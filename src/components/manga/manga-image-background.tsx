import { useHeaderHeight } from "@react-navigation/elements";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { IMAGE_CACHE_POLICY } from "@/utils/image-memory";

type MangaBackgroundProps = {
  source: {
    isAnimated?: true | undefined;
    headers?: Record<string, string> | undefined;
    uri: string;
  };
};

const BODY_HEIGHT = 340;
const BLEED = Spacing.xxxl * 2;
const TOP_EXTRA = Spacing.lg + 160;

function withAlpha(color: string, alpha: number): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    const value = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0");
    return `${color}${value}`;
  }
  return color;
}

export const MangaBackground = memo(function MangaBackground({
  source,
}: MangaBackgroundProps) {
  const { colors, isDark } = useTheme();
  const headerHeight = useHeaderHeight();
  const background = colors.groupedBackground;

  const { frame, mainHeight } = useMemo(() => {
    const height = headerHeight + TOP_EXTRA + BODY_HEIGHT;
    return {
      mainHeight: height,
      frame: {
        top: -(headerHeight + TOP_EXTRA + height),
        left: -BLEED,
        right: -BLEED,
        height: height * 2,
      },
    };
  }, [headerHeight]);

  const mainStyle = useMemo(
    () => ({
      position: "absolute" as const,
      left: 0,
      right: 0,
      bottom: 0,
      height: mainHeight,
    }),
    [mainHeight],
  );
  const mirrorStyle = useMemo(
    () => ({
      position: "absolute" as const,
      left: 0,
      right: 0,
      top: 0,
      height: mainHeight,
      transform: [{ scaleY: -1 }],
    }),
    [mainHeight],
  );

  const bottomFade = useMemo(
    () =>
      [
        withAlpha(background, 0),
        withAlpha(background, 0.55),
        background,
      ] as const,
    [background],
  );
  const topScrim = useMemo(
    () =>
      [
        withAlpha(background, isDark ? 0.55 : 0.4),
        withAlpha(background, 0),
      ] as const,
    [background, isDark],
  );

  return (
    <View pointerEvents="none" style={[styles.root, frame]}>
      <View style={mirrorStyle}>
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={`background-${source.uri}`}
          cachePolicy={IMAGE_CACHE_POLICY}
          allowDownscaling
        />
      </View>
      <View style={mainStyle}>
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={`background-${source.uri}`}
          cachePolicy={IMAGE_CACHE_POLICY}
          allowDownscaling
          transition={250}
        />
      </View>
      <BlurView
        intensity={isDark ? 70 : 55}
        tint={isDark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          styles.mirrorScrim,
          { height: mainHeight, backgroundColor: topScrim[0] },
        ]}
      />
      <LinearGradient
        colors={topScrim}
        style={[styles.topScrim, { top: mainHeight }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={bottomFade}
        locations={[0, 0.55, 1]}
        style={styles.bottomFade}
        pointerEvents="none"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    overflow: "hidden",
    zIndex: -1,
  },
  mirrorScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  bottomFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: BODY_HEIGHT * 0.75,
  },
});
