import { useMemo, useSyncExternalStore } from "react";
import { DarkTheme, DefaultTheme, type Theme } from "expo-router";

import { useAppearance } from "@/context/appearance-context";
import { getAccentPreset } from "@/constants/accent-colors";
import { useTheme } from "@/hooks/use-theme";
import {
  subscribeAppearance,
  getAppearanceSnapshot,
} from "@/utils/appearance-events";
import { isGlassSupported } from "@/utils/glass";

function buildNavigationTheme(
  isDark: boolean,
  accentLight: string,
  accentDark: string,
): Theme {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: isDark ? accentDark : accentLight,
    },
  };
}

export function useExpoRouterTheme(): Theme {
  const { isDark } = useTheme();
  const { accentColorId } = useAppearance();
  const appearanceTick = useSyncExternalStore(
    subscribeAppearance,
    getAppearanceSnapshot,
    getAppearanceSnapshot,
  );
  const accent = getAccentPreset(accentColorId);

  return useMemo(
    () => buildNavigationTheme(isDark, accent.light, accent.dark),
    [accent.dark, accent.light, appearanceTick, isDark],
  );
}

export function useNavigationTheme() {
  const { colors, isDark } = useTheme();
  const useGlassSearchBar = isGlassSupported();

  // Android: an opaque Material top app bar. The iOS options (transparent header + blur/glass edge
  // effects) make the header overlay the content on Android, so they are not used here.
  const stackScreenOptions = useMemo(
    () => ({
      headerShown: true,
      headerLargeTitle: false,
      headerTransparent: false,
      headerShadowVisible: false,
      headerTintColor: colors.tint,
      headerTitleStyle: { color: colors.label },
      headerStyle: { backgroundColor: colors.groupedBackground },
      // Icon color follows the app theme (not the system one), so a light app theme gets dark icons.
      statusBarStyle: (isDark ? "light" : "dark") as "light" | "dark",
      freezeOnBlur: true,
      contentStyle: { backgroundColor: colors.groupedBackground },
    }),
    [colors.groupedBackground, colors.label, colors.tint, isDark],
  );

  const stackSearchBarProps = useMemo(
    () =>
      useGlassSearchBar
        ? {
            placement: "automatic" as const,
            allowToolbarIntegration: true,
            tintColor: colors.tint,
          }
        : {
            barTintColor: colors.secondarySystemBackground,
            textColor: colors.label,
            hintTextColor: colors.tertiaryLabel,
            tintColor: colors.tint,
            headerIconColor: colors.label,
          },
    [
      colors.label,
      colors.secondarySystemBackground,
      colors.tertiaryLabel,
      colors.tint,
      useGlassSearchBar,
    ],
  );

  return {
    colors,
    isDark,
    stackScreenOptions,
    stackSearchBarProps,
    tabTintColor: colors.tint,
    tabIconColor: colors.secondaryLabel,
  };
}
