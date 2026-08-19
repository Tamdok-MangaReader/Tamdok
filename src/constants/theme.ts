import { Platform } from 'react-native';

import { getAccentPreset, type AccentColorId } from '@/constants/accent-colors';

export const AppAccent = {
  light: '#00C7BE',
  dark: '#63E6E2',
} as const;

const BASE_COLORS = {
  light: {
    label: '#000000',
    secondaryLabel: '#3C3C4399',
    tertiaryLabel: '#3C3C434D',
    quaternaryLabel: '#3C3C432E',
    systemBackground: '#F2F2F7',
    secondarySystemBackground: '#FFFFFF',
    tertiarySystemBackground: '#FFFFFF',
    groupedBackground: '#F2F2F7',
    separator: '#3C3C434A',
    opaqueSeparator: '#C6C6C8',
    destructive: '#FF3B30',
    fill: '#78788033',
    secondaryFill: '#78788029',
    tertiaryFill: '#7676801F',
    quaternaryFill: '#74748014',
    onTint: '#FFFFFF',
  },
  dark: {
    label: '#FFFFFF',
    secondaryLabel: '#EBEBF599',
    tertiaryLabel: '#EBEBF54D',
    quaternaryLabel: '#EBEBF52E',
    systemBackground: '#000000',
    secondarySystemBackground: '#1C1C1E',
    tertiarySystemBackground: '#2C2C2E',
    groupedBackground: '#000000',
    separator: '#54545899',
    opaqueSeparator: '#38383A',
    destructive: '#FF453A',
    fill: '#7878805C',
    secondaryFill: '#78788052',
    tertiaryFill: '#7676803D',
    quaternaryFill: '#74748029',
    onTint: '#FFFFFF',
  },
} as const;

export function buildThemeColors(accentColorId: AccentColorId) {
  const accent = getAccentPreset(accentColorId);
  return {
    light: {
      ...BASE_COLORS.light,
      link: accent.light,
      tint: accent.light,
    },
    dark: {
      ...BASE_COLORS.dark,
      link: accent.dark,
      tint: accent.dark,
    },
  } as const;
}

export const Colors = buildThemeColors('mint');

export type ColorToken = keyof (typeof Colors)['light'];

export const Typography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '400' as const },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '400' as const },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '400' as const },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' as const },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' as const },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400' as const },
} as const;

export type TypographyToken = keyof typeof Typography;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const Radius = {
  standard: { sm: 8, md: 12, lg: 16, pill: 999 },
  glass: { sm: 12, md: 18, lg: 24, pill: 999 },
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    mono: 'Menlo',
  },
  default: {
    sans: 'System',
    mono: 'monospace',
  },
});

export const BottomTabInset = Platform.select({ ios: 50, android: 56, default: 0 }) ?? 0;
