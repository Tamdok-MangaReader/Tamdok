import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Alert, Pressable, Switch, TextInput, View, StyleSheet } from 'react-native';
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
import { isIllustrationMode, setIllustrationMode } from '@/services/illustration-mode';
import { replayWelcome } from '@/utils/welcome-data-loader';

export default function AdvancedSettingsScreen() {
  const { refresh } = useSources();
  const [showReaderPageNumbers, setShowReaderPageNumbers] = useState(false);
  const [showImageSize, setShowImageSize] = useState(false);
  const [maxHeightRatio, setMaxHeightRatio] = useState('100');
  const tapCountRef = useRef(0);
  const lastTapRef = useRef(0);

  const handleSecretTap = useCallback(() => {
    const now = Date.now();
    tapCountRef.current = now - lastTapRef.current < 700 ? tapCountRef.current + 1 : 1;
    lastTapRef.current = now;
    if (tapCountRef.current < 7) return;
    tapCountRef.current = 0;
    void setIllustrationMode(!isIllustrationMode());
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  useEffect(() => {
    const apply = (settings: Awaited<ReturnType<typeof getAppSettings>>) => {
      setShowReaderPageNumbers(settings.debug.showReaderPageNumbers);
      setShowImageSize(settings.debug.showReaderImageSize);
    };
    void getAppSettings().then((settings) => {
      apply(settings);
      setMaxHeightRatio(String(settings.debug.readerMaxHeightRatio));
    });
    return subscribeAppSettings(() => {
      void getAppSettings().then(apply);
    });
  }, []);

  const togglePageNumbers = (value: boolean) => {
    setShowReaderPageNumbers(value);
    void updateAppSettings({ debug: { showReaderPageNumbers: value } });
  };

  const toggleImageSize = (value: boolean) => {
    setShowImageSize(value);
    void updateAppSettings({ debug: { showReaderImageSize: value } });
  };

  const changeMaxHeightRatio = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setMaxHeightRatio(cleaned);
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed) && parsed >= 1) {
      void updateAppSettings({ debug: { readerMaxHeightRatio: parsed } });
    }
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
        <Pressable onPress={handleSecretTap} accessible={false}>
          <SectionLabel>{t('advanced_debug_section')}</SectionLabel>
        </Pressable>
        <Card>
          <View style={[styles.switchRow, styles.switchRowFirst]}>
            <View style={styles.switchText}>
              <ThemedText variant='body'>{t('advanced_debug_page_numbers')}</ThemedText>
              <ThemedText variant='footnote' color='secondaryLabel'>
                {t('advanced_debug_page_numbers_hint')}
              </ThemedText>
            </View>
            <Switch value={showReaderPageNumbers} onValueChange={togglePageNumbers} />
          </View>
          <CardSeparator />
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <ThemedText variant='body'>{t('advanced_debug_image_size')}</ThemedText>
              <ThemedText variant='footnote' color='secondaryLabel'>
                {t('advanced_debug_image_size_hint')}
              </ThemedText>
            </View>
            <Switch value={showImageSize} onValueChange={toggleImageSize} />
          </View>
          <CardSeparator />
          <View style={[styles.switchRow, styles.switchRowLast]}>
            <View style={styles.switchText}>
              <ThemedText variant='body'>{t('advanced_debug_max_height')}</ThemedText>
              <ThemedText variant='footnote' color='secondaryLabel'>
                {t('advanced_debug_max_height_hint')}
              </ThemedText>
            </View>
            <TextInput
              value={maxHeightRatio}
              onChangeText={changeMaxHeightRatio}
              keyboardType='number-pad'
              style={styles.ratioInput}
            />
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
  ratioInput: {
    minWidth: 64,
    textAlign: 'right',
    fontSize: 16,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
});
