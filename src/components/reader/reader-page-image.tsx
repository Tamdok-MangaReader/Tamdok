import { useWindowDimensions } from "@/hooks/use-duo-layout";
import {
  getReaderMaxHeightRatio,
  getReaderMinAspect,
  shouldShowReaderImageSize,
} from "@/utils/reader-debug";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image as RNImage,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ReaderDictionaryOverlay } from "@/components/reader/reader-dictionary-overlay";
import { useReader } from "@/components/reader/reader-context";
import { WebtoonScrollContext } from "@/components/reader/reader-webtoon-scroll-context";
import { WebtoonZoomContext } from "@/components/reader/reader-webtoon-zoom";
import { describeImageLoadError } from "@/utils/reader-image-error";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/constants/locales";
import type {
  DictionarySettings,
  ReaderSettings,
} from "@/services/app-settings";
import { coverImageSource } from "@/utils/cover-image-source";
import { IMAGE_CACHE_POLICY } from "@/utils/image-memory";
import { useSlowRelease } from "@/utils/reader-slow-mode";
import {
  READER_DEFAULT_ASPECT_RATIO,
  readerPageAspectFromSize,
  type ReaderPage,
} from "@/utils/reader-pages";

type ReaderPageImageProps = {
  page: ReaderPage;
  settings: ReaderSettings;
  dictionarySettings?: DictionarySettings;
  coverHeaders?: Record<string, string>;
  backgroundColor: string;
  disableDoubleTap?: boolean;
  pillarbox?: boolean;
  pillarboxAmount?: number;
  pillarboxOrientation?: import("@/services/app-settings").PillarboxOrientation;
  onMeasuredAspectRatio?: (ratio: number) => void;
  onSingleTap?: (x: number, y: number) => void;
  onLongPress?: (x: number, y: number) => void;
  /** Fires when the page enters or leaves the zoomed state (used to pause page turning). */
  onZoomChange?: (zoomed: boolean) => void;
  onDictionaryLookup?: (x: number, y: number) => void;
  layout?: "fill" | "intrinsic";
  contentFit?: "contain" | "cover" | "fill";
  containerWidth?: number;
  /** Top of this page in list content coordinates; enables the sticky loading/error indicator. */
  stickyTop?: number;
};

const STICKY_PAD = 32;

function StickyStatus({
  stickyTop,
  frameHeight,
  contentHeight,
  children,
}: {
  stickyTop: number;
  frameHeight: number;
  contentHeight: number;
  children: React.ReactNode;
}) {
  const scroll = useContext(WebtoonScrollContext);
  const style = useAnimatedStyle(() => {
    if (!scroll) return { transform: [{ translateY: STICKY_PAD }] };
    const center = scroll.scrollY.value + scroll.viewportHeight.value / 2;
    const wanted = center - stickyTop - contentHeight / 2;
    const max = Math.max(STICKY_PAD, frameHeight - STICKY_PAD - contentHeight);
    return {
      transform: [{ translateY: Math.min(max, Math.max(STICKY_PAD, wanted)) }],
    };
  });
  return <Animated.View style={[styles.stickyStatus, style]}>{children}</Animated.View>;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

function panLimit(
  zoom: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  "worklet";
  return {
    x: Math.max(0, ((zoom - 1) * viewW) / 2),
    y: Math.max(0, ((zoom - 1) * viewH) / 2),
  };
}
const DOUBLE_TAP_SCALE = 2.5;
const ZOOM_EPSILON = 1.01;

function initialAspectRatio(
  page: ReaderPage,
  layout: "fill" | "intrinsic",
): number {
  return (
    readerPageAspectFromSize(page.width, page.height) ??
    (layout === "intrinsic" ? READER_DEFAULT_ASPECT_RATIO : 0.7)
  );
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
  pillarboxOrientation = "both",
  onMeasuredAspectRatio,
  onSingleTap,
  onLongPress,
  onZoomChange,
  onDictionaryLookup,
  layout = "fill",
  contentFit,
  containerWidth,
  stickyTop,
}: ReaderPageImageProps) {
  const { debugShowPageNumbers } = useReader();
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const dictionaryEnabled = dictionarySettings?.enable ?? false;
  const dictionaryLongPress =
    dictionaryEnabled && dictionarySettings?.lookupGesture === "long-press";
  const dictionarySingleTap =
    dictionaryEnabled && dictionarySettings?.lookupGesture === "single-tap";
  const quickActionsLongPress =
    !settings.disableQuickActions && !dictionaryLongPress;
  const [aspectRatio, setAspectRatio] = useState(() =>
    initialAspectRatio(page, layout),
  );
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
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
  const viewWidth = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const pinching = useSharedValue(false);
  const panLastX = useSharedValue(0);
  const panLastY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);

  // Callbacks are read through refs so the gesture object keeps its identity when the parent
  // re-renders with new inline closures (rebuilding it mid-pinch makes the zoom jump).
  const onSingleTapRef = useRef(onSingleTap);
  onSingleTapRef.current = onSingleTap;
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;
  const onDictionaryLookupRef = useRef(onDictionaryLookup);
  onDictionaryLookupRef.current = onDictionaryLookup;

  const handleSingleTapJS = useCallback(
    (x: number, y: number) => {
      if (dictionarySingleTap) {
        onDictionaryLookupRef.current?.(x, y);
        return;
      }
      onSingleTapRef.current?.(x, y);
    },
    [dictionarySingleTap],
  );

  const handleLongPressJS = useCallback(
    (x: number, y: number) => {
      if (dictionaryLongPress) {
        onDictionaryLookupRef.current?.(x, y);
        return;
      }
      onLongPressRef.current?.(x, y);
    },
    [dictionaryLongPress],
  );

  const liveText = Platform.OS === "ios" && settings.liveText;

  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const notifyZoom = useCallback((zoomed: boolean) => {
    onZoomChangeRef.current?.(zoomed);
  }, []);
  useAnimatedReaction(
    () => scale.value > ZOOM_EPSILON,
    (zoomed, previous) => {
      if (zoomed !== previous) runOnJS(notifyZoom)(zoomed);
    },
  );
  useEffect(() => () => onZoomChangeRef.current?.(false), []);

  // In the webtoon strip the whole reader zooms (see WebtoonZoom); this page then only reports double taps.
  const webtoonZoom = useContext(WebtoonZoomContext);
  const hasExternalZoom = layout === "intrinsic" && webtoonZoom != null;
  const toggleExternalZoom = webtoonZoom?.toggleZoomAt;

  const composed = useMemo(() => {
    // Pinch zoom only; pan activates once zoomed so taps still reach the reader chrome.
    const pinch = Gesture.Pinch()
      .onStart((event) => {
        pinching.value = true;
        savedScale.value = scale.value;
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        pinchFocalX.value = event.focalX;
        pinchFocalY.value = event.focalY;
      })
      .onUpdate((event) => {
        const next = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, savedScale.value * event.scale),
        );
        const ratio = next / savedScale.value;
        const cx = viewWidth.value / 2;
        const cy = viewHeight.value / 2;
        const limit = panLimit(
          next,
          viewWidth.value,
          viewHeight.value,
        );
        const maxX = limit.x;
        const maxY = limit.y;
        const tx =
          savedTranslateX.value +
          (1 - ratio) * (pinchFocalX.value - cx - savedTranslateX.value) +
          (event.focalX - pinchFocalX.value);
        const ty =
          savedTranslateY.value +
          (1 - ratio) * (pinchFocalY.value - cy - savedTranslateY.value) +
          (event.focalY - pinchFocalY.value);
        scale.value = next;
        translateX.value = Math.min(maxX, Math.max(-maxX, tx));
        translateY.value = Math.min(maxY, Math.max(-maxY, ty));
      })
      .onFinalize(() => {
        pinching.value = false;
      })
      .onEnd(() => {
        if (scale.value > MIN_SCALE) {
          savedScale.value = scale.value;
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
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
      .onTouchesMove((event, state) => {
        if (scale.value <= ZOOM_EPSILON) {
          state.fail();
          return;
        }
        if (event.numberOfTouches === 1 && !pinching.value) {
          state.activate();
        }
      })
      .onStart((event) => {
        panLastX.value = event.translationX;
        panLastY.value = event.translationY;
      })
      .onUpdate((event) => {
        const deltaX = event.translationX - panLastX.value;
        const deltaY = event.translationY - panLastY.value;
        panLastX.value = event.translationX;
        panLastY.value = event.translationY;
        if (pinching.value) return;
        const limit = panLimit(
          scale.value,
          viewWidth.value,
          viewHeight.value,
        );
        const maxX = limit.x;
        const maxY = limit.y;
        translateX.value = Math.min(
          maxX,
          Math.max(-maxX, translateX.value + deltaX),
        );
        translateY.value = Math.min(
          maxY,
          Math.max(-maxY, translateY.value + deltaY),
        );
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(220)
      .enabled(!disableDoubleTap)
      .onEnd((event, success) => {
        if (!success) return;
        if (hasExternalZoom) {
          toggleExternalZoom?.(
            event.absoluteX ?? event.x,
            event.absoluteY ?? event.y,
          );
          return;
        }
        if (scale.value > ZOOM_EPSILON) {
          scale.value = withTiming(MIN_SCALE);
          savedScale.value = MIN_SCALE;
          translateX.value = withTiming(0);
          translateY.value = withTiming(0);
          savedTranslateX.value = 0;
          savedTranslateY.value = 0;
          return;
        }
        const target = DOUBLE_TAP_SCALE;
        const cx = viewWidth.value / 2;
        const cy = viewHeight.value / 2;
        const limit = panLimit(
          target,
          viewWidth.value,
          viewHeight.value,
        );
        const maxX = limit.x;
        const maxY = limit.y;
        const tx = Math.min(maxX, Math.max(-maxX, (1 - target) * (event.x - cx)));
        const ty = Math.min(maxY, Math.max(-maxY, (1 - target) * (event.y - cy)));
        scale.value = withTiming(target);
        translateX.value = withTiming(tx);
        translateY.value = withTiming(ty);
        savedScale.value = target;
        savedTranslateX.value = tx;
        savedTranslateY.value = ty;
      });

    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .maxDuration(220)
      .maxDistance(16)
      .onEnd((event, success) => {
        if (!success) return;
        runOnJS(handleSingleTapJS)(
          event.absoluteX ?? event.x,
          event.absoluteY ?? event.y,
        );
      });

    const longPress = Gesture.LongPress()
      .minDuration(400)
      .enabled(!liveText && (quickActionsLongPress || dictionaryLongPress))
      .onStart((event) => {
        runOnJS(handleLongPressJS)(
          event.absoluteX ?? event.x,
          event.absoluteY ?? event.y,
        );
      });

    const needsSingleTap = Boolean(onSingleTap) || dictionarySingleTap;
    const taps =
      !disableDoubleTap && needsSingleTap
        ? hasExternalZoom
          // Webtoon: react to the first tap at once instead of waiting out the double-tap window.
          ? Gesture.Simultaneous(doubleTap, singleTap)
          : Gesture.Exclusive(doubleTap, singleTap)
        : !disableDoubleTap
          ? doubleTap
          : needsSingleTap
            ? singleTap
            : null;

    if (hasExternalZoom) {
      return taps
        ? Gesture.Simultaneous(taps, longPress)
        : Gesture.Simultaneous(longPress);
    }
    return taps
      ? Gesture.Simultaneous(taps, pinch, pan, longPress)
      : Gesture.Simultaneous(pinch, pan, longPress);
  }, [
    hasExternalZoom,
    toggleExternalZoom,
    dictionaryLongPress,
    dictionarySingleTap,
    disableDoubleTap,
    handleLongPressJS,
    handleSingleTapJS,
    onSingleTap,
    quickActionsLongPress,
    liveText,
    panLastX,
    panLastY,
    pinching,
    pinchFocalX,
    pinchFocalY,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
    viewHeight,
    viewWidth,
  ]);

  const slowReleased = useSlowRelease(page.url);

  const handleViewLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewWidth.value = event.nativeEvent.layout.width;
      viewHeight.value = event.nativeEvent.layout.height;
    },
    [viewHeight, viewWidth],
  );

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
      .join("|");
  }, [coverHeaders, page.headers]);
  const imageSource = useMemo(() => {
    if (!page.url) return null;
    const headers = { ...coverHeaders, ...page.headers };
    return coverImageSource(
      page.url,
      Object.keys(headers).length > 0 ? headers : undefined,
    );
  }, [coverHeaders, page.headers, page.url]);

  useEffect(() => {
    setAspectRatio(initialAspectRatio(page, layout));
  }, [headerKey, layout, page.url]);

  const commitAspectRatio = useCallback(
    (
      width: number,
      height: number,
      ignoreIfMatchesView?: { viewWidth: number; viewHeight: number },
    ) => {
      if (width < 16 || height < 16) return;
      if (
        ignoreIfMatchesView &&
        Math.abs(width - ignoreIfMatchesView.viewWidth) < 2 &&
        Math.abs(height - ignoreIfMatchesView.viewHeight) < 2
      ) {
        return;
      }
      const next = width / height;
      setAspectRatio((current) =>
        Math.abs(next - current) > 0.01 ? next : current,
      );
      onMeasuredAspectRatioRef.current?.(next);
    },
    [],
  );

  useEffect(() => {
    if (layout !== "intrinsic" || !page.url) return;
    let cancelled = false;
    const headers = { ...coverHeaders, ...page.headers };
    const finish = (width?: number, height?: number) => {
      if (cancelled || !width || !height) return;
      commitAspectRatio(width, height);
    };
    const onFailure = () => {};
    if (
      Object.keys(headers).length > 0 &&
      typeof RNImage.getSizeWithHeaders === "function"
    ) {
      RNImage.getSizeWithHeaders(page.url, headers, finish, onFailure);
    } else {
      RNImage.getSize(page.url, finish, onFailure);
    }
    return () => {
      cancelled = true;
    };
  }, [
    commitAspectRatio,
    coverHeaders,
    headerKey,
    layout,
    page.headers,
    page.url,
  ]);

  useEffect(() => {
    if (!page.url) {
      setLoadError(t("reader_image_error_missing"));
      setLoadState("error");
      return;
    }
    setLoadError(null);
    setLoadState("loading");
  }, [page.url, retryTick]);

  useEffect(() => {
    if (
      loadState !== "loading" ||
      layout !== "fill" ||
      !page.url ||
      !slowReleased
    )
      return;
    const timer = setTimeout(() => {
      setLoadState((current) => (current === "loading" ? "ready" : current));
    }, 1200);
    return () => clearTimeout(timer);
  }, [layout, loadState, page.url, retryTick, slowReleased]);

  const resolvedFit =
    contentFit ??
    (layout === "intrinsic"
      ? "fill"
      : settings.cropBorders
        ? "cover"
        : "contain");
  const pillarboxPadding = pillarbox ? Math.round(pillarboxAmount) : 0;
  const intrinsicWidth = Math.max(
    1,
    (containerWidth ?? windowWidth) -
      (pillarboxPadding > 0 && pillarboxOrientation !== "vertical"
        ? pillarboxPadding * 2
        : 0),
  );
  const displayAspectRatio =
    page.splitTotal && page.splitTotal > 1
      ? aspectRatio / page.splitTotal
      : aspectRatio;
  const showPlaceholder = layout === "intrinsic" && loadState !== "ready";
  const frameHeight = Math.round(
    intrinsicWidth / Math.max(displayAspectRatio, getReaderMinAspect()),
  );
  const frameStyle =
    pillarboxPadding > 0
      ? pillarboxOrientation === "vertical"
        ? { paddingVertical: pillarboxPadding }
        : pillarboxOrientation === "horizontal"
          ? { paddingHorizontal: pillarboxPadding }
          : {
              paddingHorizontal: pillarboxPadding,
              paddingVertical: pillarboxPadding,
            }
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
    layout === "intrinsic"
      ? [
          styles.intrinsicImage,
          // Whole-point height matching the list cell (see readerPageFrameHeight); a fractional
          // aspectRatio height left a sub-point gap of background between pages.
          splitStyle ?? {
            width: intrinsicWidth,
            height: frameHeight,
          },
        ]
      : [styles.image, splitStyle ?? styles.imageFull];
  const missingPage = !page.url && !page.text;
  const sticky = layout === "intrinsic" && stickyTop != null;
  const retryButton = (
    <View style={styles.errorCard}>
      <View style={styles.errorIconCircle}>
        <Ionicons name="image-outline" size={26} color="#FFFFFF" />
      </View>
      <ThemedText variant="headline" style={styles.errorTitle}>
        {t("reader_image_failed")}
      </ThemedText>
      {loadError ? (
        <ThemedText
          variant="footnote"
          style={styles.errorDetail}
          numberOfLines={3}
        >
          {loadError}
        </ThemedText>
      ) : null}
      <Pressable
        style={({ pressed }) => [
          styles.retryPill,
          pressed ? styles.retryPillPressed : null,
        ]}
        onPress={() => {
          setLoadError(null);
          setLoadState("loading");
          setRetryTick((value) => value + 1);
        }}
        accessibilityRole="button"
        accessibilityLabel={t("reader_image_retry")}
      >
        <Ionicons name="refresh" size={18} color="#000000" />
        <ThemedText variant="subheadline" style={styles.retryPillLabel}>
          {t("reader_image_retry")}
        </ThemedText>
      </Pressable>
    </View>
  );

  const statusOverlay =
    loadState === "loading" ? (
      <View
        style={[styles.statusOverlay, sticky ? styles.statusOverlaySticky : null]}
        pointerEvents="none"
      >
        {sticky ? (
          <StickyStatus
            stickyTop={stickyTop}
            frameHeight={frameHeight}
            contentHeight={36}
          >
            <ActivityIndicator size="large" color="#FFFFFF" />
          </StickyStatus>
        ) : (
          <ActivityIndicator size="large" color="#FFFFFF" />
        )}
      </View>
    ) : loadState === "error" ? (
      <View
        style={[
          styles.statusOverlayPassive,
          sticky ? styles.statusOverlaySticky : null,
        ]}
        pointerEvents="box-none"
      >
        {sticky ? (
          <StickyStatus
            stickyTop={stickyTop}
            frameHeight={frameHeight}
            contentHeight={210}
          >
            {retryButton}
          </StickyStatus>
        ) : (
          retryButton
        )}
      </View>
    ) : null;

  const debugIndex = debugShowPageNumbers ? (page.sourceIndex ?? 0) + 1 : null;
  const debugLabel =
    debugIndex == null
      ? null
      : page.splitTotal && page.splitTotal > 1
        ? `${debugIndex}.${(page.splitIndex ?? 0) + 1}`
        : String(debugIndex);
  const sizeLabel = shouldShowReaderImageSize()
    ? `${naturalSize ? `${naturalSize.width}×${naturalSize.height}` : "?"} → ${frameHeight}px (max ${Math.round(intrinsicWidth * getReaderMaxHeightRatio())}px)`
    : null;
  const combinedLabel =
    debugLabel != null && sizeLabel != null
      ? `${debugLabel} · ${sizeLabel}`
      : (debugLabel ?? sizeLabel);
  const debugBadge =
    combinedLabel != null ? (
      <ThemedText
        variant="footnote"
        style={
          layout === "intrinsic" ? styles.debugIndex : styles.debugIndexOverlay
        }
      >
        {combinedLabel}
      </ThemedText>
    ) : null;

  return (
    <View
      style={[
        layout === "intrinsic" ? styles.intrinsicContainer : styles.container,
        { backgroundColor },
      ]}
    >
      {layout === "intrinsic" ? debugBadge : null}
      <GestureDetector gesture={composed}>
        <Animated.View
          collapsable={false}
          onLayout={handleViewLayout}
          style={layout === "intrinsic" ? styles.gestureIntrinsic : styles.gestureFill}
        >
        <Animated.View
          collapsable={false}
          style={[
            layout === "intrinsic" ? styles.intrinsicContent : styles.content,
            animatedStyle,
          ]}
        >
          {page.url && imageSource ? (
            <View
              style={[
                layout === "intrinsic"
                  ? [
                      styles.intrinsicFrame,
                      {
                        width: intrinsicWidth,
                        height: frameHeight,
                      },
                    ]
                  : styles.imageFrame,
                frameStyle,
              ]}
            >
              <Image
                key={`${page.url}:${retryTick}`}
                source={slowReleased ? imageSource : undefined}
                style={[
                  imageStyle,
                  showPlaceholder ? styles.loadingImage : null,
                ]}
                contentFit={resolvedFit}
                allowDownscaling={settings.downsampleImages}
                cachePolicy={IMAGE_CACHE_POLICY}
                recyclingKey={`${page.id}:${retryTick}`}
                transition={0}
                pointerEvents={
                  Platform.OS === "ios" && settings.liveText ? "auto" : "none"
                }
                {...(Platform.OS === "ios" && settings.liveText
                  ? ({ enableLiveTextInteraction: true } as Record<
                      string,
                      unknown
                    >)
                  : {})}
                onLoad={(event) => {
                  const { width: loadedWidth, height: loadedHeight } =
                    event.source;
                  if (loadedWidth && loadedHeight) {
                    setNaturalSize({ width: loadedWidth, height: loadedHeight });
                    commitAspectRatio(loadedWidth, loadedHeight, {
                      viewWidth: intrinsicWidth,
                      viewHeight: frameHeight,
                    });
                  }
                  setLoadState("ready");
                }}
                onLoadEnd={() => {
                  setLoadState((current) =>
                    current === "error" ? current : "ready",
                  );
                }}
                onError={(event) => {
                  setLoadError(describeImageLoadError(event));
                  setLoadState("error");
                }}
              />
              {statusOverlay}
              {layout !== "intrinsic" ? debugBadge : null}
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
                layout === "intrinsic"
                  ? [styles.missingIntrinsic, { height: frameHeight }]
                  : styles.imageFrame,
              ]}
            >
              {layout !== "intrinsic" ? debugBadge : null}
              <View style={styles.statusOverlay} pointerEvents="none">
                <Ionicons
                  name="alert-circle-outline"
                  size={28}
                  color="#FFFFFF"
                />
                <ThemedText variant="subheadline" style={styles.retryLabel}>
                  {t("reader_image_error_missing")}
                </ThemedText>
              </View>
            </View>
          ) : null}
        </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  gestureFill: {
    flex: 1,
  },
  gestureIntrinsic: {
    width: "100%",
  },
  intrinsicContainer: {
    overflow: "hidden",
    width: "100%",
    alignSelf: "stretch",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  intrinsicContent: {
    width: "100%",
  },
  imageFrame: {
    width: "100%",
    flex: 1,
    overflow: "hidden",
  },
  intrinsicFrame: {
    width: "100%",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  intrinsicImage: {
    width: "100%",
  },
  imageFull: {
    width: "100%",
    height: "100%",
  },
  statusOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  statusOverlayPassive: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  stickyStatus: {
    alignItems: "center",
    alignSelf: "stretch",
  },
  statusOverlaySticky: {
    justifyContent: "flex-start",
  },
  errorCard: {
    alignItems: "center",
    gap: 8,
    maxWidth: 300,
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 24,
    backgroundColor: "rgba(20,20,22,0.82)",
  },
  errorIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    marginBottom: 2,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    textAlign: "center",
  },
  errorDetail: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
  },
  retryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  retryPillPressed: {
    opacity: 0.7,
  },
  retryPillLabel: {
    color: "#000000",
    fontWeight: "700",
  },
  retryButton: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  retryLabel: {
    color: "#FFFFFF",
    fontWeight: "600",
    textAlign: "center",
  },
  retryHint: {
    color: "rgba(255,255,255,0.78)",
    fontWeight: "600",
  },
  missingIntrinsic: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  loadingImage: {
    opacity: 0,
  },
  debugIndex: {
    alignSelf: "flex-start",
    marginHorizontal: 8,
    marginVertical: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.72)",
    color: "#FFD60A",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    zIndex: 2,
  },
  debugIndexOverlay: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.72)",
    color: "#FFD60A",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    zIndex: 2,
  },
  text: {
    padding: 24,
    fontSize: 17,
    lineHeight: 24,
    color: "#FFFFFF",
  },
});
