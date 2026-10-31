import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/hooks/use-theme";

type GlassSurfaceProps = {
  children?: React.ReactNode;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  glassStyle?: "clear" | "regular";
  tintColor?: string;
};

/** Material-style tonal surface (no glass blur on Android). */
export function GlassSurface({ children, borderRadius, style, tintColor, glassStyle }: GlassSurfaceProps) {
  const { colors, radius, isDark } = useTheme();
  // "regular" surfaces sit on top of content (menus, tags, hero blocks), so a see-through tonal fill is
  // unreadable there. Menus/pills pass an explicit radius and get an opaque surface; the hero meta and
  // description blocks pass none and get an 80% opaque one, so the big cover shows through slightly.
  let background: string = colors.secondaryFill;
  // iOS uses tintColor="transparent" for "plain glass" (e.g. the Ongoing status pill); on Android that
  // would be fully see-through, so it gets an opaque neutral gray instead.
  if (tintColor === "transparent") {
    background = isDark ? "#3A3A3C" : "#E5E5EA";
  } else if (glassStyle === "regular") {
    background = borderRadius !== undefined ? colors.tertiarySystemBackground : `${colors.tertiarySystemBackground}CC`;
  }
  return (
    <View
      style={[
        styles.surface,
        { borderRadius: borderRadius ?? radius.md, backgroundColor: tintColor && tintColor !== "transparent" ? tintColor : background },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { overflow: "hidden" },
});
