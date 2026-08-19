import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SFSymbolIcon } from '@/components/ui/sf-symbol-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { t } from '@/constants/locales';
import { getAppSettings } from '@/services/app-settings';
import type { LibraryRefreshProgress } from '@/services/library-refresh';
import { subscribeLibraryRefreshProgress } from '@/services/library-refresh-progress';
import { subscribeAppSettings } from '@/utils/app-settings-events';

export function LibraryRefreshIsland() {
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState<LibraryRefreshProgress | null>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => subscribeLibraryRefreshProgress(setProgress), []);
  useEffect(() => {
    const load = () => {
      void getAppSettings().then((settings) => {
        setEnabled(settings.libraryDisplay.showLibraryRefreshLiveActivity ?? true);
      });
    };
    load();
    return subscribeAppSettings(load);
  }, []);

  if (!enabled || !progress || progress.total <= 0) return null;

  const ratio = Math.max(0, Math.min(1, progress.current / progress.total));

  const island = (
    <View pointerEvents='box-none' style={StyleSheet.absoluteFill}>
      <View pointerEvents='none' style={[styles.host, { top: insets.top + 6 }]}>
        <View style={styles.shadow}>
          <BlurView intensity={64} tint='dark' style={styles.island}>
            <View style={styles.row}>
              <SFSymbolIcon name='books.vertical.fill' size={16} color='#F5F5F7' fallback='library' />
              <View style={styles.meta}>
                <ThemedText variant='caption1' numberOfLines={1} style={styles.title}>
                  {progress.title}
                </ThemedText>
                <ThemedText variant='caption2' numberOfLines={1} style={styles.subtitle}>
                  {t('library_refresh_progress', {
                    current: String(progress.current),
                    total: String(progress.total),
                  })}
                </ThemedText>
              </View>
              <View style={styles.countWrap}>
                <ThemedText variant='caption1' style={styles.count}>
                  {progress.current}/{progress.total}
                </ThemedText>
              </View>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(6, ratio * 100)}%` }]} />
            </View>
          </BlurView>
        </View>
      </View>
    </View>
  );

  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{island}</FullWindowOverlay>;
  }

  return island;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  shadow: {
    width: '78%',
    maxWidth: 340,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#0B0B0D',
  },
  island: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 11,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    color: '#F5F5F7',
    fontWeight: '600',
  },
  subtitle: {
    color: 'rgba(245,245,247,0.62)',
  },
  countWrap: {
    minWidth: 36,
    alignItems: 'flex-end',
  },
  count: {
    color: '#F5F5F7',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  fill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
});
