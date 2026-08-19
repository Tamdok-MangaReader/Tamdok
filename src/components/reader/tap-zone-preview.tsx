import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';
import type { ReaderSettings, ResolvedReadingMode } from '@/services/app-settings';
import { effectiveTapZoneGrid, type TapAction } from '@/utils/reader-tap-zones';

type TapZonePreviewProps = {
  settings: ReaderSettings;
};

const PREVIEW_MODES: ResolvedReadingMode[] = ['rtl', 'ltr'];

function actionLabel(action: TapAction): string {
  switch (action) {
    case 'previous':
      return t('reader_tap_zones_previous');
    case 'next':
      return t('reader_tap_zones_next');
    case 'toggleBars':
      return t('reader_tap_zones_menu');
    default:
      return '';
  }
}

function actionColor(action: TapAction): string {
  switch (action) {
    case 'previous':
      return 'rgba(10, 132, 255, 0.42)';
    case 'next':
      return 'rgba(255, 159, 10, 0.5)';
    case 'toggleBars':
      return 'rgba(142, 142, 147, 0.28)';
    default:
      return 'rgba(0, 0, 0, 0.2)';
  }
}

export function TapZonePreview({ settings }: TapZonePreviewProps) {
  const { colors, radius } = useTheme();
  const [previewMode, setPreviewMode] = useState<ResolvedReadingMode>('rtl');
  const grid = effectiveTapZoneGrid(settings, previewMode);
  const disabled = settings.tapZones === 'disabled';

  return (
    <View style={styles.root}>
      <ThemedText variant='footnote' color='secondaryLabel'>
        {t('reader_tap_zones_paged_hint')}
      </ThemedText>
      <View style={styles.modeRow}>
        {PREVIEW_MODES.map((mode) => {
          const selected = previewMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => setPreviewMode(mode)}
              style={[
                styles.modePill,
                { borderRadius: radius.pill, backgroundColor: selected ? colors.tint : colors.tertiaryFill },
              ]}
              accessibilityRole='button'>
              <ThemedText variant='footnote' style={selected ? styles.modePillLabelOn : undefined}>
                {t(`reader_mode_${mode}`)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View
        style={[
          styles.grid,
          { borderRadius: radius.md, backgroundColor: colors.tertiaryFill, opacity: disabled ? 0.45 : 1 },
        ]}
        pointerEvents='none'>
        {grid.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.gridRow}>
            {row.map((action, colIndex) => (
              <View
                key={`${rowIndex}:${colIndex}`}
                style={[
                  styles.cell,
                  { backgroundColor: actionColor(action), borderRadius: radius.sm },
                ]}>
                <ThemedText variant='caption2' style={styles.cellLabel} numberOfLines={1}>
                  {actionLabel(action)}
                </ThemedText>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.sm,
  },
  modeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  modePillLabelOn: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  grid: {
    aspectRatio: 0.72,
    maxHeight: 220,
    padding: 6,
    gap: 4,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  cellLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
});
