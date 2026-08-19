import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { LibraryMangaCover } from '@/components/manga/library-manga-cover';
import { StarRating } from '@/components/manga/star-rating';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Manga } from '@/parsers/shared/types';
import { homeChapterLabel } from '@/utils/chapter-label';
import { parseMangaDescription, parseRatingText } from '@/utils/manga-description';

const DEFAULT_AUTO_SCROLL_SECONDS = 5;

type MangaBigScrollerProps = {
  title?: string;
  subtitle?: string;
  entries: Manga[];
  sourceId?: string;
  autoScrollInterval?: number;
  onPressManga: (manga: Manga) => void;
};

export function MangaBigScroller({
  title,
  subtitle,
  entries,
  sourceId,
  autoScrollInterval,
  onPressManga,
}: MangaBigScrollerProps) {
  const { colors, radius } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const cardWidth = Dimensions.get('window').width - Spacing.lg * 2;
  const cardStep = cardWidth + Spacing.sm;
  const scrollInterval =
    autoScrollInterval ?? (entries.length > 1 ? DEFAULT_AUTO_SCROLL_SECONDS : undefined);

  const scrollToPage = useCallback(
    (nextPage: number) => {
      if (entries.length === 0) return;
      const clamped = ((nextPage % entries.length) + entries.length) % entries.length;
      scrollRef.current?.scrollTo({ x: clamped * cardStep, animated: true });
      setPage(clamped);
    },
    [cardStep, entries.length],
  );

  useEffect(() => {
    if (!scrollInterval || entries.length <= 1) return;
    const timer = setInterval(() => {
      setPage((current) => {
        const next = (current + 1) % entries.length;
        scrollRef.current?.scrollTo({ x: next * cardStep, animated: true });
        return next;
      });
    }, scrollInterval * 1000);
    return () => clearInterval(timer);
  }, [scrollInterval, entries.length, cardStep]);

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.x;
    const nextPage = Math.round(offset / cardStep);
    setPage(nextPage);
  };

  if (entries.length === 0) return null;

  return (
    <View style={styles.section}>
      {(title || subtitle) && (
        <View style={styles.header}>
          {title ? <ThemedText variant='title2'>{title}</ThemedText> : null}
          {subtitle ? (
            <ThemedText variant='footnote' color='secondaryLabel'>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      )}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        decelerationRate='fast'
        snapToInterval={cardStep}
        snapToAlignment='start'
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroller}
        onMomentumScrollEnd={onScrollEnd}>
        {entries.map((manga) => (
          <BigMangaCard
            key={manga.key}
            manga={manga}
            sourceId={sourceId}
            width={cardWidth}
            borderRadius={radius.md}
            placeholderColor={colors.secondaryFill}
            onPress={() => onPressManga(manga)}
          />
        ))}
      </ScrollView>
      {entries.length > 1 ? (
        <View style={styles.dots}>
          {entries.map((entry, index) => (
            <View
              key={entry.key}
              style={[
                styles.dot,
                { backgroundColor: index === page ? colors.tint : colors.tertiaryFill },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

type BigMangaCardProps = {
  manga: Manga;
  sourceId?: string;
  width: number;
  borderRadius: number;
  placeholderColor: string;
  onPress: () => void;
};

function BigMangaCard({ manga, sourceId, width, borderRadius, placeholderColor, onPress }: BigMangaCardProps) {
  const { colors, radius } = useTheme();
  const coverWidth = Math.round(width * 0.38);
  const coverHeight = Math.round(coverWidth * 1.45);
  const parsed = parseMangaDescription(manga.description);
  const rating = parseRatingText(parsed.ratingLine);
  const authors = manga.authors?.filter(Boolean).join(', ');
  const tags = manga.tags?.slice(0, 6) ?? [];
  const altTitles = (parsed.altTitles ?? []).filter((name) => name !== manga.title);
  const chapterLabel = homeChapterLabel(manga, manga.chapters?.[0]);

  return (
    <Pressable style={StyleSheet.flatten([styles.card, { width }])} onPress={onPress}>
      <View style={styles.cardBody}>
        <View style={[styles.coverWrap, { width: coverWidth, height: coverHeight, borderRadius, backgroundColor: placeholderColor }]}>
          <LibraryMangaCover sourceId={sourceId} manga={manga} width={coverWidth} showTitleOverlay={false} />
        </View>
        <View style={styles.info}>
          <ThemedText variant='headline' numberOfLines={2}>
            {manga.title}
          </ThemedText>
          {chapterLabel ? (
            <ThemedText variant='footnote' color='secondaryLabel' numberOfLines={1}>
              {chapterLabel}
            </ThemedText>
          ) : null}
          {altTitles.length > 0 ? (
            <ThemedText variant='subheadline' color='tertiaryLabel' numberOfLines={3}>
              {altTitles.join(', ')}
            </ThemedText>
          ) : null}
          {authors ? (
            <ThemedText variant='subheadline' color='secondaryLabel' numberOfLines={2}>
              {authors}
            </ThemedText>
          ) : null}
          {rating ? <StarRating rating={rating} /> : null}
          {parsed.summary ? (
            <ThemedText variant='footnote' color='secondaryLabel' numberOfLines={5} style={styles.summary}>
              {parsed.summary}
            </ThemedText>
          ) : null}
        </View>
      </View>
      {tags.length > 0 ? (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <View key={tag} style={[styles.tagPill, { borderRadius: radius.pill, backgroundColor: colors.secondaryFill }]}>
              <ThemedText variant='caption2' color='secondaryLabel' numberOfLines={1}>
                {tag}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    gap: 2,
  },
  scroller: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  card: {
    gap: Spacing.sm,
  },
  cardBody: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  coverWrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
  },
  summary: {
    lineHeight: 18,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  tagPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: Spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
