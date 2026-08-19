import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import type { ReaderBackgroundColor } from '@/services/app-settings';

export function readerBackgroundColor(
  color: ReaderBackgroundColor,
  scheme: 'light' | 'dark' | null | undefined | 'unspecified',
): string {
  switch (color) {
    case 'white':
      return '#FFFFFF';
    case 'black':
      return '#000000';
    case 'system':
    default:
      return scheme === 'light' ? '#FFFFFF' : '#000000';
  }
}

export function useReaderBackground(color: ReaderBackgroundColor): string {
  const scheme = useColorScheme();
  return useMemo(() => readerBackgroundColor(color, scheme), [color, scheme]);
}

export function readerForegroundColor(background: string): string {
  const normalized = background.toLowerCase();
  if (normalized === '#ffffff' || normalized === '#fff') return '#000000';
  return '#FFFFFF';
}
