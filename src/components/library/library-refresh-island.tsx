import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, View } from 'react-native';
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
  const [dismissed, setDismissed] = useState(false);
  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => subscribeLibraryRefreshProgress(setProgress), []);

  const isActive = progress != null;
  useEffect(() => {
    if (!isActive) {
      setDismissed(false);
      translate.setValue({ x: 0, y: 0 });
      opacity.setValue(1);
    }
  }, [isActive, translate, opacity]);

  const dismiss = useCallback(
    (dx: number, dy: number) => {
      const horizontal = Math.abs(dx) > Math.abs(dy);
      Animated.parallel([
        Animated.timing(translate, {
          toValue: horizontal ? { x: dx > 0 ? 400 : -400, y: 0 } : { x: 0, y: -160 },
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => setDismissed(true));
    },
    [translate, opacity],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
        onPanResponderMove: (_event, gesture) => {
          translate.setValue({ x: gesture.dx, y: Math.min(0, gesture.dy) });
        },
        onPanResponderRelease: (_event, gesture) => {
          const farEnough = Math.abs(gesture.dx) > 60 || gesture.dy < -24;
          const fastEnough = Math.abs(gesture.vx) > 0.6 || gesture.vy < -0.5;
          if (farEnough || fastEnough) {
            dismiss(gesture.dx, gesture.dy);
            return;
          }
          Animated.spring(translate, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translate, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        },
      }),
    [translate, dismiss],
  );
  useEffect(() => {
    const load = () => {
      void getAppSettings().then((settings) => {
        setEnabled(settings.libraryDisplay.showLibraryRefreshLiveActivity ?? true);
      });
    };
    load();
    return subscribeAppSettings(load);
  }, []);

  if (!enabled || dismissed || !progress || progress.total <= 0) return null;

  const ratio = Math.max(0, Math.min(1, progress.current / progress.total));

  const island = (
    <View pointerEvents='box-none' style={StyleSheet.absoluteFill}>
      <View pointerEvents='box-none' style={[styles.host, { top: insets.top + 6 }]}>
        <Animated.View
          {...panResponder.panHandlers}
          style={[styles.shadow, { opacity, transform: translate.getTranslateTransform() }]}
        >
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
        </Animated.View>
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
