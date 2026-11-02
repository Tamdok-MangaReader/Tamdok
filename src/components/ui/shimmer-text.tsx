import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, type ComponentType } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { ThemedText, type ThemedTextProps } from "@/components/ui/themed-text";
import { useTheme } from "@/hooks/use-theme";

// The library ships class-component typings that do not satisfy the current JSX types.
const Masked = MaskedView as unknown as ComponentType<{
  style?: object;
  maskElement: React.ReactElement;
  children?: React.ReactNode;
}>;

/** Text with a light band sweeping across it, like the "Loading…" labels in Apple apps. */
export function ShimmerText({ children, style, variant, ...rest }: ThemedTextProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + progress.value * width * 2 }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.width);
    setWidth((prev) => (prev === next ? prev : next));
  };

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {/* Invisible copy reserves the size; the masked copy is what the eye sees. */}
      <ThemedText variant={variant} style={[style, styles.hidden]} {...rest}>
        {children}
      </ThemedText>
      {width > 0 ? (
        <Masked
          style={StyleSheet.absoluteFill}
          maskElement={
            <ThemedText
              variant={variant}
              style={[style, { color: "#000" }]}
              {...rest}
            >
              {children}
            </ThemedText>
          }
        >
          <View style={[styles.fill, { backgroundColor: colors.tertiaryLabel }]} />
          <Animated.View style={[styles.band, { width }, bandStyle]}>
            <LinearGradient
              colors={["transparent", colors.label, "transparent"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </Masked>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-start" },
  hidden: { opacity: 0 },
  fill: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { position: "absolute", top: 0, bottom: 0, left: 0 },
});
