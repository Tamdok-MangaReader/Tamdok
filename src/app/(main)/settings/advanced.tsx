import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
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
import { cacheDatabaseSize, cacheRowCount, compactCacheDatabase } from '@/db/cache-database';
import { countRows, mainDatabaseSize, walDatabaseSize } from '@/db/database';
import { useSources } from '@/context/sources-context';
import { clearMangaDetailCache } from '@/services/manga-detail-cache';
import { clearSourceHomeCache } from '@/services/source-home-cache';
import { clearHistory as clearReadingHistory } from '@/services/manga-tracking';
import { setNotifyNewChapters } from '@/services/notifications';
import { notifyAppearanceChanged } from '@/utils/appearance-events';
import { useTheme } from '@/hooks/use-theme';
import { getAppSettings, resetAppSettings, updateAppSettings } from '@/services/app-settings';
import { resetLibrary as resetLibraryData } from '@/services/library';
import { clearAllDownloads } from '@/services/downloads';
import { removeSource, resetRegistryUrlsToDefault } from '@/services/sources';
import { subscribeAppSettings } from '@/utils/app-settings-events';
import { notifyMangaDataChanged } from '@/utils/manga-events';
import { isIllustrationMode, isIllustrationSource, setIllustrationMode } from '@/services/illustration-mode';
import { replayWelcome } from '@/utils/welcome-data-loader';

// `null` values are still loading and render as a placeholder.
type StorageRow = { label: string; bytes: number | null; files?: number | null };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const STORAGE_TABLES = ['reading_log', 'manga_meta', 'library_entries', 'known_chapters', 'downloads'];

// The section is shown at once with placeholders; each row fills in as soon as its own value is ready.
function initialStorageRows(): StorageRow[] {
  return [
    { label: 'tamdok.db', bytes: null },
    ...STORAGE_TABLES.map((table) => ({ label: `  ${table}`, bytes: 0, files: null })),
    { label: 'cache.db', bytes: null },
    { label: '  manga_detail', bytes: 0, files: null },
    { label: '  source_home', bytes: 0, files: null },
  ];
}

function loadStorageRows(update: (label: string, patch: Partial<StorageRow>) => void): void {
  const run = (task: Promise<void>) => void task.catch(() => undefined);
  run(
    Promise.all([mainDatabaseSize(), walDatabaseSize()]).then(([db, wal]) =>
      update('tamdok.db', { bytes: db + wal }),
    ),
  );
  for (const table of STORAGE_TABLES) {
    run(countRows(table).then((count) => update(`  ${table}`, { bytes: 0, files: count })));
  }
  run(cacheDatabaseSize().then((bytes) => update('cache.db', { bytes })));
  run(cacheRowCount('manga_detail').then((count) => update('  manga_detail', { bytes: 0, files: count })));
  run(cacheRowCount('source_home').then((count) => update('  source_home', { bytes: 0, files: count })));
}

export default function AdvancedSettingsScreen() {
  const { refresh, installed, setShowNsfw } = useSources();
  const { colors, isDark } = useTheme();
  const [showReaderPageNumbers, setShowReaderPageNumbers] = useState(false);
  const [showImageSize, setShowImageSize] = useState(false);
  const [maxHeightRatio, setMaxHeightRatio] = useState('100');
  const [storageRows, setStorageRows] = useState<StorageRow[]>(initialStorageRows);
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

  const refreshStorageRows = useCallback(() => {
    loadStorageRows((label, patch) =>
      setStorageRows((rows) => rows.map((row) => (row.label === label ? { ...row, ...patch } : row))),
    );
  }, []);

  useEffect(() => {
    refreshStorageRows();
  }, [refreshStorageRows]);

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
          void clearReadingHistory().then(() => notifyMangaDataChanged());
        },
      },
    ]);
  };

  const clearDownloads = () => {
    Alert.alert(t('advanced_clear_downloads_title'), t('advanced_clear_downloads_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('advanced_clear_action'),
        style: 'destructive',
        onPress: () => {
          void clearAllDownloads()
            .catch(() => undefined)
            .then(() => {
              notifyMangaDataChanged();
              refreshStorageRows();
            });
        },
      },
    ]);
  };

  const clearCache = async () => {
    // Detail/home caches live in the document directory, and expo-image keeps its own disk and memory caches.
    await Promise.all([
      clearMangaDetailCache(),
      clearSourceHomeCache(),
      Image.clearDiskCache(),
      Image.clearMemoryCache(),
    ]).catch(() => undefined);
    await compactCacheDatabase().catch(() => undefined);
    const cacheDir = `${FileSystem.cacheDirectory ?? ''}`;
    if (cacheDir) {
      const entries = await FileSystem.readDirectoryAsync(cacheDir).catch(() => [] as string[]);
      await Promise.all(
        entries.map((entry) => FileSystem.deleteAsync(`${cacheDir}${entry}`, { idempotent: true }).catch(() => undefined)),
      );
    }
    notifyMangaDataChanged();
    refreshStorageRows();
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
            // Preferences live in several storage keys besides app settings; the app-settings reset goes last
            // because its change event also makes the theme context re-read its stored mode.
            await removeValue(storageKeys.THEME_MODE);
            await removeValue(storageKeys.ACCENT_COLOR);
            await removeValue(storageKeys.APP_ICON);
            await removeValue(storageKeys.NOTIFY_SOURCE_UPDATES);
            await setNotifyNewChapters(false);
            await setShowNsfw(false);
            await resetRegistryUrlsToDefault();
            await resetAppSettings();
            notifyAppearanceChanged();
            await refresh();
          })();
        },
      },
    ]);
  };

  const removeAllSources = () => {
    const removable = installed.filter((source) => !isIllustrationSource(source));
    if (removable.length === 0) {
      Alert.alert(t('advanced_remove_sources_title'), t('advanced_remove_sources_none'));
      return;
    }
    Alert.alert(
      t('advanced_remove_sources_title'),
      t('advanced_remove_sources_confirm', { count: String(removable.length) }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('sources_uninstall_action'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              for (const source of removable) {
                await removeSource(source).catch(() => undefined);
                await clearSourceHomeCache(source.id).catch(() => undefined);
              }
              await refresh();
            })();
          },
        },
      ],
    );
  };

  const resetLibrary = () => {
    Alert.alert(t('advanced_reset_library_title'), t('advanced_reset_library_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('advanced_reset_action'),
        style: 'destructive',
        onPress: () => {
          void resetLibraryData().then(() => notifyMangaDataChanged());
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: t('advanced_settings_title') }} />
      <ScreenContent>
        <SectionLabel isFirst>{t('advanced_storage_section')}</SectionLabel>
        <Card>
          {storageRows.map((row, index, rows) => (
            <View key={row.label}>
              <View style={[styles.switchRow, index === 0 && styles.switchRowFirst, index === rows.length - 1 && styles.switchRowLast]}>
                <ThemedText variant='body' style={styles.switchText}>{row.label}</ThemedText>
                <ThemedText variant='body' color='secondaryLabel'>
                  {row.bytes === null || (row.files === null && row.bytes === 0)
                    ? '…'
                    : `${row.bytes > 0 || row.files == null ? formatBytes(row.bytes) : ''}${
                        row.files != null ? `${row.bytes > 0 ? ' · ' : ''}${row.files}` : ''
                      }`}
                </ThemedText>
              </View>
              {index < rows.length - 1 ? <CardSeparator /> : null}
            </View>
          ))}
        </Card>
        <SectionLabel>{t('advanced_maintenance_section')}</SectionLabel>
        <Card>
          <ListRow icon='cloud-outline' label={t('advanced_clear_cache')} onPress={() => void clearCache()} isFirst />
          <CardSeparator />
          <ListRow icon='download-outline' label={t('advanced_clear_downloads')} onPress={clearDownloads} isLast />
        </Card>

        <SectionLabel>{t('advanced_reset_section')}</SectionLabel>
        <Card>
          <ListRow icon='time-outline' label={t('advanced_clear_history')} onPress={clearHistory} destructive isFirst />
          <CardSeparator />
          <ListRow icon='refresh-outline' label={t('advanced_reset_settings')} onPress={resetSettings} destructive />
          <CardSeparator />
          <ListRow icon='trash-outline' label={t('advanced_reset_library')} onPress={resetLibrary} destructive />
          <CardSeparator />
          <ListRow
            icon='extension-puzzle-outline'
            label={t('advanced_remove_sources')}
            onPress={removeAllSources}
            destructive
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
            <Switch value={showReaderPageNumbers} onValueChange={togglePageNumbers} accessibilityLabel={t('advanced_debug_page_numbers')} />
          </View>
          <CardSeparator />
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <ThemedText variant='body'>{t('advanced_debug_image_size')}</ThemedText>
              <ThemedText variant='footnote' color='secondaryLabel'>
                {t('advanced_debug_image_size_hint')}
              </ThemedText>
            </View>
            <Switch value={showImageSize} onValueChange={toggleImageSize} accessibilityLabel={t('advanced_debug_image_size')} />
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
              style={[styles.ratioInput, { color: colors.label }]}
              placeholderTextColor={colors.tertiaryLabel}
              keyboardAppearance={isDark ? 'dark' : 'light'}
            />
          </View>
        </Card>
        <SectionLabel>{t('advanced_onboarding_section')}</SectionLabel>
        <Card>
          <ListRow
            icon='sparkles-outline'
            label={t('advanced_show_onboarding')}
            onPress={() => void replayWelcome()}
            isFirst
            isLast
          />
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
    fontSize: 17,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
});
