import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Switch, View, StyleSheet } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { Card, CardSeparator } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { ScreenContent } from '@/components/ui/screen-content';
import { SectionLabel } from '@/components/ui/section-label';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { removeValue, storageKeys } from '@/constants/storage';
import { useSources } from '@/context/sources-context';
import { getAppSettings, resetAppSettings, updateAppSettings } from '@/services/app-settings';
import { invalidateLibraryCache } from '@/services/library';
import { resetRegistryUrlsToDefault } from '@/services/sources';
import { subscribeAppSettings } from '@/utils/app-settings-events';
import { notifyMangaDataChanged } from '@/utils/manga-events';
import { replayWelcome } from '@/utils/welcome-data-loader';

export default function AdvancedSettingsScreen() {
  const { refresh } = useSources();
  const [showReaderPageNumbers, setShowReaderPageNumbers] = useState(false);

  useEffect(() => {
    const apply = (value: boolean) => setShowReaderPageNumbers(value);
    void getAppSettings().then((settings) => apply(settings.debug.showReaderPageNumbers));
    return subscribeAppSettings(() => {
      void getAppSettings().then((settings) => apply(settings.debug.showReaderPageNumbers));
    });
  }, []);

  const togglePageNumbers = (value: boolean) => {
    setShowReaderPageNumbers(value);
    void updateAppSettings({ debug: { showReaderPageNumbers: value } });
  };

  const clearHistory = () => {
    Alert.alert(t('advanced_clear_history_title'), t('advanced_clear_history_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('advanced_clear_action'),
        style: 'destructive',
        onPress: () => {
          void removeValue(storageKeys.MANGA_TRACKING).then(() => notifyMangaDataChanged());
        },
      },
    ]);
  };

  const clearCache = async () => {
    const cacheDir = `${FileSystem.cacheDirectory ?? ''}`;
    if (cacheDir) {
      const entries = await FileSystem.readDirectoryAsync(cacheDir).catch(() => [] as string[]);
      await Promise.all(entries.map((entry) => FileSystem.deleteAsync(`${cacheDir}${entry}`, { idempotent: true })));
    }
    Alert.alert(t('advanced_clear_cache_title'), t('advanced_clear_cache_done'));
  };

  const resetSettings = () => {
    Alert.alert(t('advanced_reset_settings_title'), t('advanced_reset_settings_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('advanced_reset_action'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await resetAppSettings();
            await resetRegistryUrlsToDefault();
            await refresh();
          })();
        },
      },
    ]);
  };

  const resetLibrary = () => {
    Alert.alert(t('advanced_reset_library_title'), t('advanced_reset_library_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('advanced_reset_action'),
        style: 'destructive',
        onPress: () => {
          void removeValue(storageKeys.LIBRARY).then(() => {
            invalidateLibraryCache();
            notifyMangaDataChanged();
          });
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: t('advanced_settings_title') }} />
      <ScreenContent>
        <SectionLabel isFirst>{t('advanced_onboarding_section')}</SectionLabel>
        <Card>
          <ListRow
            icon='sparkles-outline'
            label={t('advanced_show_onboarding')}
            onPress={() => void replayWelcome()}
            isFirst
            isLast
          />
        </Card>
        <SectionLabel>{t('advanced_debug_section')}</SectionLabel>
        <Card>
          <View style={[styles.switchRow, styles.switchRowFirst, styles.switchRowLast]}>
            <View style={styles.switchText}>
              <ThemedText variant='body'>{t('advanced_debug_page_numbers')}</ThemedText>
              <ThemedText variant='footnote' color='secondaryLabel'>
                {t('advanced_debug_page_numbers_hint')}
              </ThemedText>
            </View>
            <Switch value={showReaderPageNumbers} onValueChange={togglePageNumbers} />
          </View>
        </Card>
        <SectionLabel>{t('advanced_maintenance_section')}</SectionLabel>
        <Card>
          <ListRow icon='cloud-outline' label={t('advanced_clear_cache')} onPress={() => void clearCache()} isFirst />
          <CardSeparator />
          <ListRow icon='time-outline' label={t('advanced_clear_history')} onPress={clearHistory} />
          <CardSeparator />
          <ListRow icon='refresh-outline' label={t('advanced_reset_settings')} onPress={resetSettings} />
          <CardSeparator />
          <ListRow icon='trash-outline' label={t('advanced_reset_library')} onPress={resetLibrary} destructive isLast />
        </Card>
      </ScreenContent>
    </>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  switchRowFirst: {
    paddingTop: Spacing.lg,
  },
  switchRowLast: {
    paddingBottom: Spacing.lg,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
});
