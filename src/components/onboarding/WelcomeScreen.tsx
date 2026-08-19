import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/branding/app-icon';
import { GlassButton } from '@/components/ui/glass-button';
import { SFSymbolIcon } from '@/components/ui/sf-symbol-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { t } from '@/constants/locales';
import { useTheme } from '@/hooks/use-theme';

type OnboardingSlide = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  symbol?: string;
  fallback?: keyof typeof Ionicons.glyphMap;
  showAppIcon?: boolean;
};

const SLIDES: OnboardingSlide[] = [
  {
    id: 'welcome',
    titleKey: 'onboarding_slide1_title',
    descriptionKey: 'onboarding_slide1_desc',
    showAppIcon: true,
  },
  {
    id: 'sources',
    titleKey: 'onboarding_slide2_title',
    descriptionKey: 'onboarding_slide2_desc',
    symbol: 'globe',
    fallback: 'globe-outline',
  },
  {
    id: 'library',
    titleKey: 'onboarding_slide3_title',
    descriptionKey: 'onboarding_slide3_desc',
    symbol: 'books.vertical.fill',
    fallback: 'library-outline',
  },
  {
    id: 'reader',
    titleKey: 'onboarding_slide4_title',
    descriptionKey: 'onboarding_slide4_desc',
    symbol: 'book.fill',
    fallback: 'book-outline',
  },
];

type WelcomeScreenProps = {
  onComplete: () => void;
};

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<OnboardingSlide>>(null);
  const progressAnim = useRef(new Animated.Value(1 / SLIDES.length)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (currentIndex + 1) / SLIDES.length,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [currentIndex, progressAnim]);

  const finish = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 280,
      useNativeDriver: true,
    }).start(onComplete);
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      return;
    }
    finish();
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
    if (index !== currentIndex && index >= 0 && index < SLIDES.length) {
      setCurrentIndex(index);
    }
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const renderSlide = ({ item }: { item: OnboardingSlide }) => (
    <View style={[styles.slide, { width: screenWidth }]}>
      <View style={[styles.iconContainer, { borderRadius: radius.lg, backgroundColor: colors.quaternaryFill }]}>
        {item.showAppIcon ? (
          <AppIcon />
        ) : (
          <SFSymbolIcon
            name={item.symbol ?? 'book'}
            size={56}
            color={colors.tint}
            fallback={item.fallback ?? 'book-outline'}
          />
        )}
      </View>
      <ThemedText variant='title2' style={styles.title}>
        {t(item.titleKey)}
      </ThemedText>
      <ThemedText variant='body' color='secondaryLabel' style={styles.description}>
        {t(item.descriptionKey)}
      </ThemedText>
    </View>
  );

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <ThemedView style={[styles.content, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>
        {currentIndex < SLIDES.length - 1 ? (
          <Pressable
            style={[styles.skipButton, { top: insets.top + Spacing.sm }]}
            onPress={finish}
            accessibilityRole='button'>
            <ThemedText variant='callout' color='secondaryLabel'>
              {t('skip')}
            </ThemedText>
          </Pressable>
        ) : null}

        <FlatList
          ref={flatListRef}
          data={SLIDES}
          renderItem={renderSlide}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyExtractor={(item) => item.id}
          bounces={false}
          getItemLayout={(_, index) => ({ length: screenWidth, offset: screenWidth * index, index })}
        />

        <View style={styles.footer}>
          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: colors.quaternaryFill }]}>
              <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: colors.tint }]} />
            </View>
            <ThemedText variant='caption1' color='tertiaryLabel'>
              {currentIndex + 1} / {SLIDES.length}
            </ThemedText>
          </View>
          <GlassButton
            label={t(currentIndex === SLIDES.length - 1 ? 'get_started' : 'next')}
            onPress={handleNext}
            wide
          />
        </View>
      </ThemedView>
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
  },
  skipButton: {
    position: 'absolute',
    right: Spacing.lg,
    zIndex: 10,
    padding: Spacing.sm,
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  iconContainer: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxl,
    overflow: 'hidden',
  },
  title: {
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  description: {
    textAlign: 'center',
    maxWidth: 320,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  progressRow: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressTrack: {
    width: 200,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
