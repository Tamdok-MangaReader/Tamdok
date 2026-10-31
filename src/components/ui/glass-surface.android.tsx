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
export function GlassSurface({ children, borderRadius, style, tintColor }: GlassSurfaceProps) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        styles.surface,
        { borderRadius: borderRadius ?? radius.md, backgroundColor: tintColor ?? colors.secondaryFill },
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
