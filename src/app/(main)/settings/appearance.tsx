import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';
import SegmentedControl from '@react-native-segmented-control/segmented-control';

import { InlinePillGrid } from '@/components/library/inline-pill-grid';
import { AccentColorPicker } from '@/components/settings/accent-color-picker';
import { AppIconPicker } from '@/components/settings/app-icon-picker';
import { Card } from '@/components/ui/card';
import { ScreenContent } from '@/components/ui/screen-content';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import type { AccentColorId } from '@/constants/accent-colors';
import type { AppIconId } from '@/constants/app-icons';
import { useAppearance } from '@/context/appearance-context';
import { AppThemeMode, useThemePreference } from '@/context/theme-preference-context';
import { getAppSettings, updateAppSettings, type LibraryDisplaySettings } from '@/services/app-settings';
import { notifyMangaDataChanged } from '@/utils/manga-events';

const THEME_MODES: AppThemeMode[] = ['system', 'light', 'dark'];
const GRID_SIZES: LibraryDisplaySettings['gridSize'][] = ['small', 'medium', 'large', 'extraLarge'];

export default function AppearanceScreen() {
  const { themeMode, setThemeMode, resolvedColorScheme } = useThemePreference();
  const { accentColorId, appIconId, setAccentColorId, setAppIconId, appIconSupported } = useAppearance();
  const isDark = resolvedColorScheme === 'dark';
  const selectedIndex = THEME_MODES.indexOf(themeMode);
  const [gridSize, setGridSize] = useState<LibraryDisplaySettings['gridSize']>('medium');

  const load = useCallback(async () => {
    const settings = await getAppSettings();
    setGridSize(settings.libraryDisplay.gridSize);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const gridOptions = GRID_SIZES.map((size) => ({
    id: size,
    label: t(`library_grid_size_${size}`),
  }));

  const handleAppIconSelect = (id: AppIconId) => {
    if (Platform.OS !== 'ios') {
      Alert.alert(t('app_icon_ios_only_title'), t('app_icon_ios_only_desc'));
      return;
    }
    if (!appIconSupported) {
      Alert.alert(t('app_icon_unavailable_title'), t('app_icon_unavailable_desc'));
      return;
    }
    void setAppIconId(id);
  };

  return (
    <>
      <Stack.Title>{t('section_appearance')}</Stack.Title>
      <ScreenContent>
        <SectionLabel>{t('theme')}</SectionLabel>
        <Card style={styles.card}>
          <SegmentedControl
            values={[t('theme_system'), t('theme_light'), t('theme_dark')]}
            appearance={isDark ? 'dark' : 'light'}
            selectedIndex={selectedIndex}
            style={styles.segmented}
            onChange={(event) => {
              const index = event.nativeEvent.selectedSegmentIndex;
              void setThemeMode(THEME_MODES[index] ?? 'system');
            }}
          />
          <ThemedText variant='footnote' color='secondaryLabel'>
            {t(`theme_${themeMode}_hint`)}
          </ThemedText>
        </Card>

        <SectionLabel>{t('appearance_accent_section')}</SectionLabel>
        <Card style={styles.card}>
          <AccentColorPicker
            selectedId={accentColorId}
            onSelect={(id: AccentColorId) => {
              void setAccentColorId(id);
            }}
          />
          <ThemedText variant='footnote' color='secondaryLabel'>
            {t('appearance_accent_hint')}
          </ThemedText>
        </Card>

        <SectionLabel>{t('appearance_app_icon_section')}</SectionLabel>
        <Card style={styles.card}>
          <AppIconPicker selectedId={appIconId} onSelect={handleAppIconSelect} />
          <ThemedText variant='footnote' color='secondaryLabel'>
            {t('appearance_app_icon_hint')}
          </ThemedText>
        </Card>

        <SectionLabel>{t('library_display_section')}</SectionLabel>
        <Card style={styles.card}>
          <InlinePillGrid
            options={gridOptions}
            selectedId={gridSize}
            preserveOrder
            onSelect={(size) => {
              const next = size as LibraryDisplaySettings['gridSize'];
              setGridSize(next);
              void getAppSettings().then((settings) =>
                updateAppSettings({
                  libraryDisplay: { ...settings.libraryDisplay, gridSize: next },
                }).then(() => notifyMangaDataChanged()),
              );
            }}
          />
          <ThemedText variant='footnote' color='secondaryLabel'>
            {t('library_grid_size_hint')}
          </ThemedText>
        </Card>
      </ScreenContent>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  segmented: {
    height: 36,
  },
});
