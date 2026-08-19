import { useMemo, useSyncExternalStore } from 'react';

import { buildThemeColors, Radius, Spacing, Typography } from '@/constants/theme';
import { useAppearance } from '@/context/appearance-context';
import { useThemePreference } from '@/context/theme-preference-context';
import { subscribeAppearance, getAppearanceSnapshot } from '@/utils/appearance-events';
import { isGlassSupported } from '@/utils/glass';

export function useTheme() {
  const { resolvedColorScheme } = useThemePreference();
  const { accentColorId } = useAppearance();
  const appearanceTick = useSyncExternalStore(subscribeAppearance, getAppearanceSnapshot, getAppearanceSnapshot);
  const isDark = resolvedColorScheme === 'dark';

  const colors = useMemo(
    () => buildThemeColors(accentColorId)[resolvedColorScheme],
    [accentColorId, appearanceTick, resolvedColorScheme],
  );

  return {
    colors,
    colorScheme: resolvedColorScheme,
    isDark,
    spacing: Spacing,
    typography: Typography,
    radius: isGlassSupported() ? Radius.glass : Radius.standard,
    isGlass: isGlassSupported(),
    accentColorId,
  };
}

export function useThemeColor(token: keyof ReturnType<typeof buildThemeColors>['light']) {
  const { colors } = useTheme();
  return colors[token];
}
