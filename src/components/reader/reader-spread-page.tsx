import { StyleSheet, View } from 'react-native';

import { ReaderPageImage } from '@/components/reader/reader-page-image';
import type { ReaderSettings } from '@/services/app-settings';
import type { PillarboxOrientation } from '@/services/app-settings';
import type { ReaderPage } from '@/utils/reader-pages';

type ReaderSpreadPageProps = {
  pages: ReaderPage[];
  settings: ReaderSettings;
  dictionarySettings: import('@/services/app-settings').DictionarySettings;
  coverHeaders?: Record<string, string>;
  backgroundColor: string;
  mode: 'rtl' | 'ltr' | 'vertical';
  onSingleTap: (x: number, y: number) => void;
  onLongPress?: (page: ReaderPage, x: number, y: number) => void;
  onDictionaryLookup?: (page: ReaderPage, x: number, y: number) => void;
  reloadKeys?: Record<string, number>;
};

function pillarboxStyle(
  pillarbox: boolean,
  amount: number,
  orientation: PillarboxOrientation,
): { paddingHorizontal?: number; paddingVertical?: number } | null {
  if (!pillarbox || amount <= 0) return null;
  switch (orientation) {
    case 'horizontal':
      return { paddingHorizontal: amount };
    case 'vertical':
      return { paddingVertical: amount };
    case 'both':
    default:
      return { paddingHorizontal: amount, paddingVertical: amount };
  }
}

export function ReaderSpreadPage({
  pages,
  settings,
  dictionarySettings,
  coverHeaders,
  backgroundColor,
  mode,
  onSingleTap,
  onLongPress,
  onDictionaryLookup,
  reloadKeys,
}: ReaderSpreadPageProps) {
  const pillarbox = pillarboxStyle(settings.pillarbox, settings.pillarboxAmount, settings.pillarboxOrientation);
  const flexDirection = mode === 'vertical' ? 'column' : 'row';
  const reverse = mode === 'rtl';

  const orderedPages = reverse ? [...pages].reverse() : pages;

  return (
    <View style={[styles.root, pillarbox]}>
      <View style={[styles.row, { flexDirection }]}>
        {orderedPages.map((page) => (
          <View key={`${page.id}-${reloadKeys?.[page.id] ?? 0}`} style={styles.cell}>
            <ReaderPageImage
              page={page}
              settings={settings}
              dictionarySettings={dictionarySettings}
              coverHeaders={coverHeaders}
              backgroundColor={backgroundColor}
              disableDoubleTap={settings.disableDoubleTap}
              pillarbox={false}
                    contentFit={settings.cropBorders ? 'cover' : 'contain'}
              onSingleTap={onSingleTap}
              onLongPress={onLongPress ? (x, y) => onLongPress(page, x, y) : undefined}
              onDictionaryLookup={onDictionaryLookup ? (x, y) => onDictionaryLookup(page, x, y) : undefined}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  row: {
    flex: 1,
  },
  cell: {
    flex: 1,
  },
});
