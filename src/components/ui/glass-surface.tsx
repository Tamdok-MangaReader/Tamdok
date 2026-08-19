import { GlassView } from 'expo-glass-effect';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type GlassEffectStyle = 'clear' | 'regular';

type GlassSurfaceProps = {
  children: React.ReactNode;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  glassStyle?: GlassEffectStyle;
  tintColor?: string;
};

export function GlassSurface({
  children,
  borderRadius,
  style,
  interactive = false,
  glassStyle,
  tintColor,
}: GlassSurfaceProps) {
  const { colors, radius, isDark, isGlass } = useTheme();
  const cornerRadius = borderRadius ?? radius.md;
  const effectStyle: GlassEffectStyle = glassStyle ?? (isDark ? 'clear' : 'regular');

  if (isGlass) {
    return (
      <GlassView
        style={[styles.surface, { borderRadius: cornerRadius }, style]}
        glassEffectStyle={effectStyle}
        tintColor={tintColor}
        colorScheme={isDark ? 'dark' : 'light'}
        isInteractive={interactive}>
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[styles.surface, { borderRadius: cornerRadius, backgroundColor: colors.secondaryFill }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    overflow: 'hidden',
  },
});
