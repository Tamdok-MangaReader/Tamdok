import { ScrollView, StyleSheet, View } from "react-native";

import { LibraryMangaCover } from "@/components/manga/library-manga-cover";
import { ThemedText } from "@/components/ui/themed-text";
import { Spacing } from "@/constants/theme";
import type { HomeScrollerEntry, Listing } from "@/parsers/shared/types";
import { homeChapterLabel } from "@/utils/chapter-label";
import { StarRating } from "@/components/manga/star-rating";
import { useCoverDisplay } from "@/hooks/use-cover-display";
import {
  parseMangaDescription,
  parseRatingText,
} from "@/utils/manga-description";

type MangaScrollerProps = {
  title?: string;
  subtitle?: string;
  entries: HomeScrollerEntry[];
  sourceId?: string;
  listing?: Listing;
  coverWidth?: number;
  onPressManga: (entry: HomeScrollerEntry) => void;
  onPressSeeAll?: (listing: Listing) => void;
};

export function MangaScroller({
  title,
  subtitle,
  entries,
  sourceId,
  listing,
  coverWidth = 180,
  onPressManga,
  onPressSeeAll,
}: MangaScrollerProps) {
  const { showRating } = useCoverDisplay();
  if (entries.length === 0) return null;

  return (
    <View style={styles.section}>
      {(title || listing) && (
        <View style={styles.header}>
          <View style={styles.titles}>
            {title ? <ThemedText variant="title2">{title}</ThemedText> : null}
            {subtitle ? (
              <ThemedText variant="footnote" color="secondaryLabel">
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          {listing && onPressSeeAll ? (
            <ThemedText
              variant="callout"
              color="tint"
              onPress={() => onPressSeeAll(listing)}
            >
              See all
            </ThemedText>
          ) : null}
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroller}
      >
        {entries.map((entry) => {
          const chapterLabel = homeChapterLabel(entry.manga, entry.chapter);
          const parsed = parseMangaDescription(entry.manga.description);
          const isTitleBig = (chapterLabel?.length || 0) >= 10;
          const rating = showRating
            ? parseRatingText(entry.manga.rating || parsed.ratingLine)
            : null;
          return (
            <View
              key={entry.manga.key}
              style={[styles.tile, { width: coverWidth }]}
            >
              <LibraryMangaCover
                sourceId={sourceId}
                manga={entry.manga}
                cover={entry.homeCover ?? entry.manga.cover}
                width={coverWidth}
                rating={undefined}
                onPress={() => onPressManga(entry)}
              />
              <View
                style={[
                  styles.bottom,
                  !isTitleBig && {
                    alignItems: "center",
                    alignContent: "center",
                    flexDirection: "row",
                  },
                ]}
              >
                {rating ? (
                  <View style={styles.ratingWrap}>
                    <StarRating rating={rating} />
                  </View>
                ) : null}
                {rating && chapterLabel && !isTitleBig ? (
                  <ThemedText
                    variant="footnote"
                    color="secondaryLabel"
                    numberOfLines={1}
                  >
                    |
                  </ThemedText>
                ) : null}
                {chapterLabel ? (
                  <ThemedText
                    variant="footnote"
                    color="secondaryLabel"
                    numberOfLines={1}
                  >
                    {chapterLabel}
                  </ThemedText>
                ) : null}
              </View>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  bottom: {
    gap: Spacing.xs,
  },
  ratingWrap: {
    paddingLeft: 2,
  },
});
