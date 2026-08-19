import { ScrollView, StyleSheet, View } from 'react-native';

import { LibraryMangaCover } from '@/components/manga/library-manga-cover';
import { StarRating } from '@/components/manga/star-rating';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import type { HomeScrollerEntry, Listing } from '@/parsers/shared/types';
import { homeChapterLabel } from '@/utils/chapter-label';
import { parseRatingText } from '@/utils/manga-description';

type MangaRatedScrollerProps = {
  title?: string;
  subtitle?: string;
  entries: HomeScrollerEntry[];
  sourceId?: string;
  listing?: Listing;
  coverWidth?: number;
  onPressManga: (entry: HomeScrollerEntry) => void;
  onPressSeeAll?: (listing: Listing) => void;
};

export function MangaRatedScroller({
  title,
  subtitle,
  entries,
  sourceId,
  listing,
  coverWidth = 180,
  onPressManga,
  onPressSeeAll,
}: MangaRatedScrollerProps) {
  if (entries.length === 0) return null;

  return (
    <View style={styles.section}>
      {(title || listing) && (
        <View style={styles.header}>
          <View style={styles.titles}>
            {title ? <ThemedText variant='title2'>{title}</ThemedText> : null}
            {subtitle ? (
              <ThemedText variant='footnote' color='secondaryLabel'>
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          {listing && onPressSeeAll ? (
            <ThemedText variant='callout' color='tint' onPress={() => onPressSeeAll(listing)}>
              See all
            </ThemedText>
          ) : null}
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroller}>
        {entries.map((entry) => {
          const rating = parseRatingText(entry.subtitle);
          const chapterLabel = homeChapterLabel(entry.manga, entry.chapter);
          return (
            <View key={entry.manga.key} style={[styles.tile, { width: coverWidth }]}>
              <LibraryMangaCover
                sourceId={sourceId}
                manga={entry.manga}
                cover={entry.homeCover ?? entry.manga.cover}
                width={coverWidth}
                onPress={() => onPressManga(entry)}
              />
              {chapterLabel ? (
                <ThemedText variant='footnote' color='secondaryLabel' numberOfLines={1}>
                  {chapterLabel}
                </ThemedText>
              ) : null}
              {rating ? (
                <View style={styles.ratingWrap}>
                  <StarRating rating={rating} compact />
                </View>
              ) : entry.subtitle ? (
                <ThemedText variant='caption2' color='secondaryLabel' numberOfLines={2}>
                  {entry.subtitle}
                </ThemedText>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  scroller: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  tile: {
    gap: Spacing.xs,
  },
  ratingWrap: {
    paddingHorizontal: 2,
  },
});
