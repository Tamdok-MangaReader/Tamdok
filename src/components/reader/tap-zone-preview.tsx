import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OptionSegmentedControl } from '@/components/ui/option-segmented-control';
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

function actionIcon(action: TapAction): keyof typeof Ionicons.glyphMap | null {
  switch (action) {
    case 'previous':
      return 'chevron-back';
    case 'next':
      return 'chevron-forward';
    case 'toggleBars':
      return 'ellipsis-horizontal';
    default:
      return null;
  }
}

export function TapZonePreview({ settings }: TapZonePreviewProps) {
  const { colors, radius } = useTheme();
  const [previewMode, setPreviewMode] = useState<ResolvedReadingMode>('rtl');
  const grid = effectiveTapZoneGrid(settings, previewMode);
  const disabled = settings.tapZones === 'disabled';

  return (
    <View style={styles.root}>
      <OptionSegmentedControl
        options={PREVIEW_MODES.map((mode) => ({ id: mode, label: t(`reader_mode_${mode}`) }))}
        selectedId={previewMode}
        onSelect={(id) => setPreviewMode(id as ResolvedReadingMode)}
      />
      <View
        style={[
          styles.grid,
          {
            borderRadius: radius.md,
            backgroundColor: colors.tertiaryFill,
            borderColor: colors.separator,
            opacity: disabled ? 0.45 : 1,
          },
        ]}
        pointerEvents='none'
        accessibilityElementsHidden>
        {grid.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.gridRow}>
            {row.map((action, colIndex) => {
              const icon = actionIcon(action);
              return (
                <View
                  key={`${rowIndex}:${colIndex}`}
                  style={[styles.cell, { backgroundColor: actionColor(action), borderRadius: radius.sm }]}>
                  {icon ? <Ionicons name={icon} size={22} color='#FFFFFF' /> : null}
                  <ThemedText variant='caption2' style={styles.cellLabel} numberOfLines={1}>
                    {actionLabel(action)}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <ThemedText variant='footnote' color='secondaryLabel'>
        {t('reader_tap_zones_paged_hint')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
    gap: Spacing.md,
  },
  // Full card width; the three equal rows and columns match how taps are hit-tested on the page.
  grid: {
    alignSelf: 'stretch',
    aspectRatio: 1,
    padding: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 2,
  },
  cellLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
});
