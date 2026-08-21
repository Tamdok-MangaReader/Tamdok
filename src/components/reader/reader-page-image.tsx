import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image as RNImage, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ReaderDictionaryOverlay } from '@/components/reader/reader-dictionary-overlay';
import { useReader } from '@/components/reader/reader-context';
import { describeImageLoadError } from '@/utils/reader-image-error';
import { ThemedText } from '@/components/ui/themed-text';
import { t } from '@/constants/locales';
import type { DictionarySettings, ReaderSettings } from '@/services/app-settings';
import { coverImageSource } from '@/utils/cover-image-source';
import { IMAGE_CACHE_POLICY } from '@/utils/image-memory';
import {
  READER_DEFAULT_ASPECT_RATIO,
  readerPageAspectFromSize,
  type ReaderPage,
} from '@/utils/reader-pages';

type ReaderPageImageProps = {
  page: ReaderPage;
  settings: ReaderSettings;
  dictionarySettings?: DictionarySettings;
  coverHeaders?: Record<string, string>;
  backgroundColor: string;
  disableDoubleTap?: boolean;
  pillarbox?: boolean;
  pillarboxAmount?: number;
  pillarboxOrientation?: import('@/services/app-settings').PillarboxOrientation;
  onMeasuredAspectRatio?: (ratio: number) => void;
  onSingleTap?: (x: number, y: number) => void;
  onLongPress?: (x: number, y: number) => void;
  onDictionaryLookup?: (x: number, y: number) => void;
  layout?: 'fill' | 'intrinsic';
  contentFit?: 'contain' | 'cover' | 'fill';
  containerWidth?: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_EPSILON = 1.01;

function initialAspectRatio(page: ReaderPage, layout: 'fill' | 'intrinsic'): number {
  return readerPageAspectFromSize(page.width, page.height) ?? (layout === 'intrinsic' ? READER_DEFAULT_ASPECT_RATIO : 0.7);
}

export function ReaderPageImage({
  page,
  settings,
  dictionarySettings,
  coverHeaders,
  backgroundColor,
  disableDoubleTap = false,
  pillarbox = false,
  pillarboxAmount = 15,
  pillarboxOrientation = 'both',
  onMeasuredAspectRatio,
  onSingleTap,
  onLongPress,
  onDictionaryLookup,
  layout = 'fill',
  contentFit,
  containerWidth,
}: ReaderPageImageProps) {
  const { debugShowPageNumbers } = useReader();
  const dictionaryEnabled = dictionarySettings?.enable ?? false;
  const dictionaryLongPress = dictionaryEnabled && dictionarySettings?.lookupGesture === 'long-press';
  const dictionarySingleTap = dictionaryEnabled && dictionarySettings?.lookupGesture === 'single-tap';
  const quickActionsLongPress = !settings.disableQuickActions && !dictionaryLongPress;
  const [aspectRatio, setAspectRatio] = useState(() => initialAspectRatio(page, layout));
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const onMeasuredAspectRatioRef = useRef(onMeasuredAspectRatio);
  onMeasuredAspectRatioRef.current = onMeasuredAspectRatio;
  const { width: windowWidth } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const handleSingleTapJS = useCallback(
    (x: number, y: number) => {
      if (dictionarySingleTap) {
        onDictionaryLookup?.(x, y);
        return;
      }
      onSingleTap?.(x, y);
    },
    [dictionarySingleTap, onDictionaryLookup, onSingleTap],
  );

  const handleLongPressJS = useCallback(
    (x: number, y: number) => {
      if (dictionaryLongPress) {
        onDictionaryLookup?.(x, y);
        return;
      }
      onLongPress?.(x, y);
    },
    [dictionaryLongPress, onDictionaryLookup, onLongPress],
  );

  const composed = useMemo(() => {
    // Pinch zoom only; pan activates once zoomed so taps still reach the reader chrome.
    const pinch = Gesture.Pinch()
      .onStart(() => {
        savedScale.value = scale.value;
      })
      .onUpdate((event) => {
        scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * event.scale));
      })
      .onEnd(() => {
        if (scale.value > MIN_SCALE) {
          savedScale.value = scale.value;
          return;
        }
        scale.value = withTiming(MIN_SCALE);
        savedScale.value = MIN_SCALE;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      });

    const pan = Gesture.Pan()
      .maxPointers(1)
      .manualActivation(true)
      .onTouchesDown((_event, state) => {
        if (scale.value <= ZOOM_EPSILON) {
          state.fail();
        }
      })
      .onTouchesMove((_event, state) => {
        if (scale.value > ZOOM_EPSILON) {
          state.activate();
        } else {
          state.fail();
        }
      })
      .onStart(() => {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      })
      .onUpdate((event) => {
        translateX.value = savedTranslateX.value + event.translationX;
        translateY.value = savedTranslateY.value + event.translationY;
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(220)
      .enabled(!disableDoubleTap)
      .onEnd((_event, success) => {
        if (!success) return;
        if (scale.value > ZOOM_EPSILON) {
          scale.value = withTiming(MIN_SCALE);
          savedScale.value = MIN_SCALE;
          translateX.value = withTiming(0);
          translateY.value = withTiming(0);
          savedTranslateX.value = 0;
          savedTranslateY.value = 0;
          return;
        }
        scale.value = withTiming(2);
        savedScale.value = 2;
      });

    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .maxDuration(220)
      .maxDistance(16)
      .onEnd((event, success) => {
        if (!success) return;
        runOnJS(handleSingleTapJS)(event.absoluteX ?? event.x, event.absoluteY ?? event.y);
      });

    const longPress = Gesture.LongPress()
      .minDuration(400)
      .enabled(quickActionsLongPress || dictionaryLongPress)
      .onStart((event) => {
        runOnJS(handleLongPressJS)(event.absoluteX ?? event.x, event.absoluteY ?? event.y);
      });

    const needsSingleTap = Boolean(onSingleTap) || dictionarySingleTap;
    const taps =
      !disableDoubleTap && needsSingleTap
        ? Gesture.Exclusive(doubleTap, singleTap)
        : !disableDoubleTap
          ? doubleTap
          : needsSingleTap
            ? singleTap
            : null;

    return taps
      ? Gesture.Simultaneous(taps, pinch, pan, longPress)
      : Gesture.Simultaneous(pinch, pan, longPress);
  }, [
    dictionaryLongPress,
    dictionarySingleTap,
    disableDoubleTap,
    handleLongPressJS,
    handleSingleTapJS,
    onSingleTap,
    quickActionsLongPress,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const headerKey = useMemo(() => {
    const merged = { ...coverHeaders, ...page.headers };
    return Object.entries(merged)
      .sort()
      .map(([key, value]) => `${key}:${value}`)
      .join('|');
  }, [coverHeaders, page.headers]);
  const imageSource = useMemo(() => {
    if (!page.url) return null;
    const headers = { ...coverHeaders, ...page.headers };
    return coverImageSource(page.url, Object.keys(headers).length > 0 ? headers : undefined);
  }, [coverHeaders, page.headers, page.url]);

  useEffect(() => {
    setAspectRatio(initialAspectRatio(page, layout));
  }, [headerKey, layout, page.url]);

  const commitAspectRatio = useCallback((width: number, height: number, ignoreIfMatchesView?: { viewWidth: number; viewHeight: number }) => {
    if (width < 16 || height < 16) return;
    if (
      ignoreIfMatchesView &&
      Math.abs(width - ignoreIfMatchesView.viewWidth) < 2 &&
      Math.abs(height - ignoreIfMatchesView.viewHeight) < 2
    ) {
      return;
    }
    const next = width / height;
    setAspectRatio((current) => (Math.abs(next - current) > 0.01 ? next : current));
    onMeasuredAspectRatioRef.current?.(next);
  }, []);

  useEffect(() => {
    if (layout !== 'intrinsic' || !page.url) return;
    let cancelled = false;
    const headers = { ...coverHeaders, ...page.headers };
    const finish = (width?: number, height?: number) => {
      if (cancelled || !width || !height) return;
      commitAspectRatio(width, height);
    };
    const onFailure = () => {};
    if (Object.keys(headers).length > 0 && typeof RNImage.getSizeWithHeaders === 'function') {
      RNImage.getSizeWithHeaders(page.url, headers, finish, onFailure);
    } else {
      RNImage.getSize(page.url, finish, onFailure);
    }
    return () => {
      cancelled = true;
    };
  }, [commitAspectRatio, coverHeaders, headerKey, layout, page.headers, page.url]);

  useEffect(() => {
    if (!page.url) {
      setLoadError(t('reader_image_error_missing'));
      setLoadState('error');
      return;
    }
    setLoadError(null);
    setLoadState('loading');
  }, [page.url, retryTick]);

  useEffect(() => {
    if (loadState !== 'loading' || layout !== 'fill' || !page.url) return;
    const timer = setTimeout(() => {
      setLoadState((current) => (current === 'loading' ? 'ready' : current));
    }, 1200);
    return () => clearTimeout(timer);
  }, [layout, loadState, page.url, retryTick]);

  const resolvedFit =
    contentFit ?? (layout === 'intrinsic' ? 'contain' : settings.cropBorders ? 'cover' : 'contain');
  const pillarboxPadding = pillarbox ? Math.round(pillarboxAmount) : 0;
  const intrinsicWidth = Math.max(
    1,
    (containerWidth ?? windowWidth) -
      (pillarboxPadding > 0 && pillarboxOrientation !== 'vertical' ? pillarboxPadding * 2 : 0),
  );
  const displayAspectRatio =
    page.splitTotal && page.splitTotal > 1 ? aspectRatio / page.splitTotal : aspectRatio;
  const showPlaceholder = layout === 'intrinsic' && loadState !== 'ready';
  const frameHeight = Math.round(intrinsicWidth / Math.max(displayAspectRatio, 0.04));
  const frameStyle =
    pillarboxPadding > 0
      ? pillarboxOrientation === 'vertical'
        ? { paddingVertical: pillarboxPadding }
        : pillarboxOrientation === 'horizontal'
          ? { paddingHorizontal: pillarboxPadding }
          : { paddingHorizontal: pillarboxPadding, paddingVertical: pillarboxPadding }
      : null;
  const splitStyle =
    page.splitTotal && page.splitTotal > 1
      ? {
          width: intrinsicWidth * page.splitTotal,
          height: frameHeight,
          marginLeft: -((page.splitIndex ?? 0) * intrinsicWidth),
        }
      : null;
  const imageStyle =
    layout === 'intrinsic'
      ? [styles.intrinsicImage, splitStyle ?? { width: intrinsicWidth, aspectRatio: displayAspectRatio }]
      : [styles.image, splitStyle ?? styles.imageFull];
  const missingPage = !page.url && !page.text;
  const statusOverlay =
    loadState === 'loading' ? (
      <View style={styles.statusOverlay} pointerEvents='none'>
        <ActivityIndicator color='#FFFFFF' />
      </View>
    ) : loadState === 'error' ? (
      <Pressable
        style={styles.statusOverlay}
        onPress={() => {
          setLoadError(null);
          setLoadState('loading');
          setRetryTick((value) => value + 1);
        }}
        accessibilityRole='button'
        accessibilityLabel={t('reader_image_retry')}>
        <Ionicons name='alert-circle-outline' size={28} color='#FFFFFF' />
        <ThemedText variant='subheadline' style={styles.retryLabel}>
          {loadError ?? t('reader_image_failed')}
        </ThemedText>
        <ThemedText variant='footnote' style={styles.retryHint}>
          {t('reader_image_retry')}
        </ThemedText>
      </Pressable>
    ) : null;

  const debugIndex = debugShowPageNumbers ? (page.sourceIndex ?? 0) + 1 : null;
  const debugLabel =
    debugIndex == null
      ? null
      : page.splitTotal && page.splitTotal > 1
        ? `${debugIndex}.${(page.splitIndex ?? 0) + 1}`
        : String(debugIndex);
  const debugBadge =
    debugLabel != null ? (
      <ThemedText
        variant='footnote'
        style={layout === 'intrinsic' ? styles.debugIndex : styles.debugIndexOverlay}>
        {debugLabel}
      </ThemedText>
    ) : null;

  return (
    <View style={[layout === 'intrinsic' ? styles.intrinsicContainer : styles.container, { backgroundColor }]}>
      {layout === 'intrinsic' ? debugBadge : null}
      <GestureDetector gesture={composed}>
        <Animated.View
          collapsable={false}
          style={[layout === 'intrinsic' ? styles.intrinsicContent : styles.content, animatedStyle]}>
          {page.url && imageSource ? (
            <View
              style={[
                layout === 'intrinsic' ? [styles.intrinsicFrame, { width: intrinsicWidth, aspectRatio: displayAspectRatio }] : styles.imageFrame,
                frameStyle,
              ]}>
              <Image
                key={`${page.url}:${retryTick}`}
                source={imageSource}
                style={[imageStyle, showPlaceholder ? styles.loadingImage : null]}
                contentFit={resolvedFit}
                allowDownscaling
                cachePolicy={IMAGE_CACHE_POLICY}
                recyclingKey={`${page.id}:${retryTick}`}
                transition={0}
                pointerEvents={Platform.OS === 'ios' && settings.liveText ? 'auto' : 'none'}
                {...(Platform.OS === 'ios' && settings.liveText
                  ? ({ enableLiveTextInteraction: true } as Record<string, unknown>)
                  : {})}
                onLoad={(event) => {
                  const { width: loadedWidth, height: loadedHeight } = event.source;
                  if (loadedWidth && loadedHeight) {
                    commitAspectRatio(loadedWidth, loadedHeight, {
                      viewWidth: intrinsicWidth,
                      viewHeight: frameHeight,
                    });
                  }
                  setLoadState('ready');
                }}
                onLoadEnd={() => {
                  setLoadState((current) => (current === 'error' ? current : 'ready'));
                }}
                onError={(event) => {
                  setLoadError(describeImageLoadError(event));
                  setLoadState('error');
                }}
              />
              {statusOverlay}
              {layout !== 'intrinsic' ? debugBadge : null}
              {dictionarySettings ? (
                <ReaderDictionaryOverlay
                  imageUri={page.url}
                  settings={dictionarySettings}
                  enabled={dictionaryEnabled}
                />
              ) : null}
            </View>
          ) : page.text ? (
            <Animated.Text style={styles.text}>{page.text}</Animated.Text>
          ) : missingPage ? (
            <View
              style={[
                layout === 'intrinsic' ? [styles.missingIntrinsic, { height: frameHeight }] : styles.imageFrame,
              ]}>
              {layout !== 'intrinsic' ? debugBadge : null}
              <View style={styles.statusOverlay} pointerEvents='none'>
                <Ionicons name='alert-circle-outline' size={28} color='#FFFFFF' />
                <ThemedText variant='subheadline' style={styles.retryLabel}>
                  {t('reader_image_error_missing')}
                </ThemedText>
              </View>
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  intrinsicContainer: {
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intrinsicContent: {
    width: '100%',
  },
  imageFrame: {
    width: '100%',
    flex: 1,
    overflow: 'hidden',
  },
  intrinsicFrame: {
    width: '100%',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  intrinsicImage: {
    width: '100%',
  },
  imageFull: {
    width: '100%',
    height: '100%',
  },
  statusOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  retryLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  retryHint: {
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '600',
  },
  missingIntrinsic: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  loadingImage: {
    opacity: 0,
  },
  debugIndex: {
    alignSelf: 'flex-start',
    marginHorizontal: 8,
    marginVertical: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.72)',
    color: '#FFD60A',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    zIndex: 2,
  },
  debugIndexOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.72)',
    color: '#FFD60A',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    zIndex: 2,
  },
  text: {
    padding: 24,
    fontSize: 17,
    lineHeight: 24,
    color: '#FFFFFF',
  },
});
