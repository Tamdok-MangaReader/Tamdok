import { useMemo, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

import { useAppearance } from '@/context/appearance-context';
import { getAccentPreset } from '@/constants/accent-colors';
import { useTheme } from '@/hooks/use-theme';
import { subscribeAppearance, getAppearanceSnapshot } from '@/utils/appearance-events';
import { isGlassSupported, liquidGlassScrollEdgeEffects } from '@/utils/glass';

function buildNavigationTheme(isDark: boolean, accentLight: string, accentDark: string): Theme {
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
  const appearanceTick = useSyncExternalStore(subscribeAppearance, getAppearanceSnapshot, getAppearanceSnapshot);
  const accent = getAccentPreset(accentColorId);

  return useMemo(
    () => buildNavigationTheme(isDark, accent.light, accent.dark),
    [accent.dark, accent.light, appearanceTick, isDark],
  );
}

export function useNavigationTheme() {
  const { colors, isDark } = useTheme();
  const useGlassSearchBar = isGlassSupported();
  const useLiquidGlassHeader = isGlassSupported();

  const stackScreenOptions = useMemo(
    () => ({
      headerShown: true,
      headerLargeTitle: true,
      headerTransparent: true,
      headerTintColor: colors.tint,
      headerTitleStyle: { color: colors.label },
      headerLargeTitleStyle: { color: colors.label },
      contentStyle: { backgroundColor: colors.groupedBackground },
      ...(useLiquidGlassHeader
        ? {
            headerShadowVisible: true,
            scrollEdgeEffects: liquidGlassScrollEdgeEffects,
          }
        : Platform.OS === 'ios'
          ? { headerBlurEffect: 'regular' as const }
          : {}),
    }),
    [colors.groupedBackground, colors.label, colors.tint, useLiquidGlassHeader],
  );

  const stackSearchBarProps = useMemo(
    () =>
      useGlassSearchBar
        ? {
            placement: 'automatic' as const,
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
