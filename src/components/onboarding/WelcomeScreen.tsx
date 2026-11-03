import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppIcon } from '@/components/branding/app-icon';
import { GlassButton } from '@/components/ui/glass-button';
import { SFSymbolIcon } from '@/components/ui/sf-symbol-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';

type Chip = {
  symbol: string;
  fallback: keyof typeof Ionicons.glyphMap;
  labelKey: string;
};

type OnboardingSlide = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  symbol?: string;
  fallback?: keyof typeof Ionicons.glyphMap;
  showAppIcon?: boolean;
  /** Main accent of the slide: tints the hero tile and the background glow. */
  accent: string;
  accentDark: string;
  chips: Chip[];
};

const SLIDES: OnboardingSlide[] = [
  {
    id: 'welcome',
    titleKey: 'onboarding_slide1_title',
    descriptionKey: 'onboarding_slide1_desc',
    showAppIcon: true,
    accent: '#FF8A5C',
    accentDark: '#E5484D',
    chips: [
      { symbol: 'globe', fallback: 'globe-outline', labelKey: 'onboarding_chip_sources' },
      { symbol: 'books.vertical.fill', fallback: 'library-outline', labelKey: 'onboarding_chip_library' },
      { symbol: 'book.fill', fallback: 'book-outline', labelKey: 'onboarding_chip_reader' },
    ],
  },
  {
    id: 'sources',
    titleKey: 'onboarding_slide2_title',
    descriptionKey: 'onboarding_slide2_desc',
    symbol: 'globe',
    fallback: 'globe-outline',
    accent: '#4DA3FF',
    accentDark: '#2F6BFF',
    chips: [
      { symbol: 'puzzlepiece.extension.fill', fallback: 'extension-puzzle-outline', labelKey: 'onboarding_chip_extensions' },
      { symbol: 'magnifyingglass', fallback: 'search-outline', labelKey: 'onboarding_chip_global_search' },
      { symbol: 'tray.full.fill', fallback: 'albums-outline', labelKey: 'onboarding_chip_registries' },
    ],
  },
  {
    id: 'library',
    titleKey: 'onboarding_slide3_title',
    descriptionKey: 'onboarding_slide3_desc',
    symbol: 'books.vertical.fill',
    fallback: 'library-outline',
    accent: '#B26BFF',
    accentDark: '#7B3FE4',
    chips: [
      { symbol: 'folder.fill', fallback: 'folder-outline', labelKey: 'onboarding_chip_categories' },
      { symbol: 'star.fill', fallback: 'star-outline', labelKey: 'onboarding_chip_favorites' },
      { symbol: 'line.3.horizontal.decrease', fallback: 'funnel-outline', labelKey: 'onboarding_chip_filters' },
    ],
  },
  {
    id: 'reader',
    titleKey: 'onboarding_slide4_title',
    descriptionKey: 'onboarding_slide4_desc',
    symbol: 'book.fill',
    fallback: 'book-outline',
    accent: '#35C28C',
    accentDark: '#119E6B',
    chips: [
      { symbol: 'rectangle.split.1x2.fill', fallback: 'phone-portrait-outline', labelKey: 'onboarding_chip_modes' },
      { symbol: 'hand.tap.fill', fallback: 'hand-left-outline', labelKey: 'onboarding_chip_tap_zones' },
      { symbol: 'character.book.closed.fill', fallback: 'language-outline', labelKey: 'onboarding_chip_dictionary' },
    ],
  },
  {
    id: 'offline',
    titleKey: 'onboarding_slide5_title',
    descriptionKey: 'onboarding_slide5_desc',
    symbol: 'arrow.down.circle.fill',
    fallback: 'cloud-download-outline',
    accent: '#FFB020',
    accentDark: '#F07A12',
    chips: [
      { symbol: 'arrow.down.circle.fill', fallback: 'download-outline', labelKey: 'onboarding_chip_downloads' },
      { symbol: 'arrow.triangle.2.circlepath', fallback: 'refresh-outline', labelKey: 'onboarding_chip_updates' },
      { symbol: 'iphone.gen3', fallback: 'phone-portrait-outline', labelKey: 'onboarding_chip_island' },
    ],
  },
  {
    id: 'progress',
    titleKey: 'onboarding_slide6_title',
    descriptionKey: 'onboarding_slide6_desc',
    symbol: 'chart.bar.xaxis',
    fallback: 'stats-chart',
    accent: '#FF5C8A',
    accentDark: '#D6336C',
    chips: [
      { symbol: 'chart.bar.fill', fallback: 'stats-chart-outline', labelKey: 'onboarding_chip_statistics' },
      { symbol: 'clock.arrow.circlepath', fallback: 'time-outline', labelKey: 'onboarding_chip_history' },
      { symbol: 'externaldrive.fill', fallback: 'save-outline', labelKey: 'onboarding_chip_backups' },
    ],
  },
  {
    id: 'free',
    titleKey: 'onboarding_slide7_title',
    descriptionKey: 'onboarding_slide7_desc',
    symbol: 'heart.fill',
    fallback: 'heart-outline',
    accent: '#6C7BFF',
    accentDark: '#4357E8',
    chips: [
      { symbol: 'gift.fill', fallback: 'gift-outline', labelKey: 'onboarding_chip_free' },
      { symbol: 'chevron.left.forwardslash.chevron.right', fallback: 'code-slash-outline', labelKey: 'onboarding_chip_opensource' },
      { symbol: 'xmark.circle.fill', fallback: 'close-circle-outline', labelKey: 'onboarding_chip_no_subscriptions' },
    ],
  },
];

const ACCENTS = SLIDES.map((slide) => slide.accent);
const ACCENTS_REVERSED = [...ACCENTS].reverse();

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<OnboardingSlide>);

type SlideViewProps = {
  item: OnboardingSlide;
  index: number;
  width: number;
  scrollX: SharedValue<number>;
  float: SharedValue<number>;
};

function SlideChip({
  chip,
  order,
  index,
  width,
  scrollX,
  float,
  accent,
}: {
  chip: Chip;
  order: number;
  index: number;
  width: number;
  scrollX: SharedValue<number>;
  float: SharedValue<number>;
  accent: string;
}) {
  const { colors, radius } = useTheme();
  const style = useAnimatedStyle(() => {
    const progress = (scrollX.value - index * width) / width;
    const away = Math.min(1, Math.abs(progress));
    // Chips trail the swipe by different amounts, which gives the row its parallax.
    const drift = -progress * width * (0.3 + order * 0.18);
    const bob = interpolate(float.value, [0, 1], [order % 2 === 0 ? -4 : 4, order % 2 === 0 ? 4 : -4]);
    return {
      opacity: interpolate(away, [0, 0.7], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: drift }, { translateY: bob }, { scale: interpolate(away, [0, 1], [1, 0.85]) }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.chip,
        { borderRadius: radius.pill, backgroundColor: `${accent}22`, borderColor: `${accent}55` },
        style,
      ]}>
      <SFSymbolIcon name={chip.symbol} size={15} color={accent} fallback={chip.fallback} weight='semibold' />
      <ThemedText variant='footnote' style={{ color: colors.label }} numberOfLines={1}>
        {t(chip.labelKey)}
      </ThemedText>
    </Animated.View>
  );
}

function SlideView({ item, index, width, scrollX, float }: SlideViewProps) {
  const heroStyle = useAnimatedStyle(() => {
    const progress = (scrollX.value - index * width) / width;
    const away = Math.min(1, Math.abs(progress));
    return {
      opacity: interpolate(away, [0, 0.8], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: -progress * width * 0.45 },
        { translateY: interpolate(float.value, [0, 1], [-7, 7]) },
        { scale: interpolate(away, [0, 1], [1, 0.6]) },
        { rotate: `${interpolate(progress, [-1, 1], [-14, 14])}deg` },
      ],
    };
  });

  const textStyle = useAnimatedStyle(() => {
    const progress = (scrollX.value - index * width) / width;
    const away = Math.min(1, Math.abs(progress));
    return {
      opacity: interpolate(away, [0, 0.6], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: -progress * width * 0.2 }],
    };
  });

  return (
    <View style={[styles.slide, { width }]}>
      <Animated.View style={[styles.heroShadow, { shadowColor: item.accentDark }, heroStyle]}>
        {item.showAppIcon ? (
          <View style={styles.appIconWrap}>
            <AppIcon />
          </View>
        ) : (
          <LinearGradient
            colors={[item.accent, item.accentDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroTile}>
            <View style={styles.heroGloss} pointerEvents='none' />
            <SFSymbolIcon
              name={item.symbol ?? 'book'}
              size={64}
              color='#FFFFFF'
              fallback={item.fallback ?? 'book-outline'}
              weight='semibold'
            />
          </LinearGradient>
        )}
      </Animated.View>

      <Animated.View style={[styles.textBlock, textStyle]}>
        <ThemedText variant='largeTitle' style={styles.title}>
          {t(item.titleKey)}
        </ThemedText>
        <ThemedText variant='body' color='secondaryLabel' style={styles.description}>
          {t(item.descriptionKey)}
        </ThemedText>
      </Animated.View>

      <View style={styles.chipRow}>
        {item.chips.map((chip, order) => (
          <SlideChip
            key={chip.labelKey}
            chip={chip}
            order={order}
            index={index}
            width={width}
            scrollX={scrollX}
            float={float}
            accent={item.accent}
          />
        ))}
      </View>
    </View>
  );
}

function Dot({ index, width, scrollX, color }: { index: number; width: number; scrollX: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      width: interpolate(scrollX.value, input, [8, 26, 8], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.value, input, [0.3, 1, 0.3], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

type WelcomeScreenProps = {
  onComplete: () => void;
};

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<OnboardingSlide>>(null);

  const scrollX = useSharedValue(0);
  const float = useSharedValue(0);
  const exit = useSharedValue(1);

  useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [float]);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const finish = useCallback(() => {
    exit.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) scheduleOnRN(onComplete);
    });
  }, [exit, onComplete]);

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      return;
    }
    finish();
  };

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
    if (index >= 0 && index < SLIDES.length) setCurrentIndex(index);
  };

  const rootStyle = useAnimatedStyle(() => ({
    opacity: exit.value,
    transform: [{ scale: interpolate(exit.value, [0, 1], [1.04, 1]) }],
  }));

  const inputRange = SLIDES.map((_, index) => index * screenWidth);

  const blobTop = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(scrollX.value, inputRange, ACCENTS),
    transform: [{ translateX: -scrollX.value * 0.18 }, { scale: interpolate(float.value, [0, 1], [1, 1.08]) }],
  }));
  const blobBottom = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(scrollX.value, inputRange, ACCENTS_REVERSED),
    transform: [{ translateX: scrollX.value * 0.12 }, { scale: interpolate(float.value, [0, 1], [1.06, 1]) }],
  }));

  const skipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [(SLIDES.length - 2) * screenWidth, (SLIDES.length - 1) * screenWidth], [1, 0], Extrapolation.CLAMP),
  }));

  const renderSlide = ({ item, index }: { item: OnboardingSlide; index: number }) => (
    <SlideView item={item} index={index} width={screenWidth} scrollX={scrollX} float={float} />
  );

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <Animated.View entering={FadeIn.duration(450)} style={styles.overlay}>
      <Animated.View style={[StyleSheet.absoluteFill, rootStyle]}>
        <ThemedView style={[styles.content, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.blobs} pointerEvents='none'>
            <Animated.View style={[styles.blob, styles.blobTop, blobTop]} />
            <Animated.View style={[styles.blob, styles.blobBottom, blobBottom]} />
          </View>

          <Animated.View
            style={[styles.skipButton, { top: insets.top + Spacing.sm }, skipStyle]}
            pointerEvents={isLast ? 'none' : 'auto'}>
            <Pressable onPress={finish} accessibilityRole='button' hitSlop={8} style={styles.skipPressable}>
              <ThemedText variant='callout' color='secondaryLabel'>
                {t('skip')}
              </ThemedText>
            </Pressable>
          </Animated.View>

          <AnimatedFlatList
            ref={flatListRef}
            data={SLIDES}
            renderItem={renderSlide}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={scrollHandler}
            onMomentumScrollEnd={handleMomentumEnd}
            scrollEventThrottle={16}
            keyExtractor={(item) => item.id}
            bounces={false}
            getItemLayout={(_, index) => ({ length: screenWidth, offset: screenWidth * index, index })}
          />

          <View style={styles.footer}>
            <View style={styles.dots}>
              {SLIDES.map((slide, index) => (
                <Dot key={slide.id} index={index} width={screenWidth} scrollX={scrollX} color={colors.tint} />
              ))}
            </View>
            <GlassButton label={t(isLast ? 'get_started' : 'next')} onPress={handleNext} wide />
          </View>
        </ThemedView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  blobs: {
    ...StyleSheet.absoluteFill,
  },
  blob: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    opacity: 0.2,
  },
  blobTop: {
    top: -170,
    left: -120,
  },
  blobBottom: {
    bottom: -200,
    right: -140,
  },
  skipButton: {
    position: 'absolute',
    right: Spacing.lg,
    zIndex: 10,
  },
  skipPressable: {
    padding: Spacing.sm,
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.xl,
  },
  heroShadow: {
    shadowOpacity: 0.35,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  heroTile: {
    width: 156,
    height: 156,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroGloss: {
    position: 'absolute',
    top: -60,
    left: -40,
    width: 220,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.18)',
    transform: [{ rotate: '-18deg' }],
  },
  appIconWrap: {
    width: 156,
    height: 156,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scale: 1.7 }],
  },
  textBlock: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    maxWidth: 330,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xl,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
