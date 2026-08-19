import { Dimensions, Pressable, StyleSheet, View } from 'react-native';

import { MangaBigScroller } from '@/components/manga/manga-big-scroller';
import { HomeFiltersSection } from '@/components/manga/home-filters-section';
import { HomeLinksSection } from '@/components/manga/home-links-section';
import { LibraryMangaCover } from '@/components/manga/library-manga-cover';
import { MangaRatedScroller } from '@/components/manga/manga-rated-scroller';
import { MangaScroller } from '@/components/manga/manga-scroller';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import type { FilterValue, HomeComponent, HomeScrollerEntry, Listing, Manga } from '@/parsers/shared/types';
import { formatChapterLabel } from '@/utils/chapter-label';

type HomeSectionProps = {
  component: HomeComponent;
  sourceId?: string;
  onPressManga: (manga: Manga) => void;
  onPressListing: (listing: Listing) => void;
  onApplyHomeFilters?: (filters: FilterValue[]) => void;
};

const GRID_COLUMNS = 3;

function gridItemWidth(): number {
  const width = Dimensions.get('window').width;
  return Math.floor((width - Spacing.lg * 2 - Spacing.sm * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
}

function scrollerEntries(component: HomeComponent): HomeScrollerEntry[] {
  if (component.scrollerEntries?.length) {
    return component.scrollerEntries;
  }
  return component.entries.map((manga) => ({
    manga,
    homeCover: manga.cover,
    chapter: manga.chapters?.[0],
  }));
}

function hasRatedScrollerEntries(entries: HomeScrollerEntry[]): boolean {
  return entries.some((entry) => Boolean(entry.subtitle?.trim()));
}

export function HomeSection({ component, sourceId, onPressManga, onPressListing, onApplyHomeFilters }: HomeSectionProps) {
  if (component.kind === 'filters') {
    return (
      <HomeFiltersSection
        title={component.title}
        subtitle={component.subtitle}
        items={component.filterItems ?? []}
        onApplyFilters={(filters) => onApplyHomeFilters?.(filters)}
      />
    );
  }

  if (component.kind === 'links') {
    return (
      <HomeLinksSection
        title={component.title}
        subtitle={component.subtitle}
        links={component.links ?? []}
        onPressManga={onPressManga}
        onPressListing={onPressListing}
      />
    );
  }

  if (component.kind === 'bigScroller') {
    return (
      <MangaBigScroller
        title={component.title}
        subtitle={component.subtitle}
        entries={component.entries}
        sourceId={sourceId}
        autoScrollInterval={component.autoScrollInterval}
        onPressManga={onPressManga}
      />
    );
  }

  if (component.kind === 'scroller') {
    const entries = scrollerEntries(component);
    if (hasRatedScrollerEntries(entries)) {
      return (
        <MangaRatedScroller
          title={component.title}
          subtitle={component.subtitle}
          entries={entries}
          sourceId={sourceId}
          listing={component.listing}
          onPressManga={(entry) => onPressManga(entry.manga)}
          onPressSeeAll={component.listing ? onPressListing : undefined}
        />
      );
    }

    return (
      <MangaScroller
        title={component.title}
        subtitle={component.subtitle}
        entries={entries}
        sourceId={sourceId}
        listing={component.listing}
        onPressManga={(entry) => onPressManga(entry.manga)}
        onPressSeeAll={component.listing ? onPressListing : undefined}
      />
    );
  }

  if (component.kind === 'mangaChapterList') {
    const itemWidth = gridItemWidth();
    const rows = component.chapterEntries ?? [];

    return (
      <View style={styles.block}>
        {component.title ? (
          <View style={styles.sectionHeader}>
            <ThemedText variant='title3'>{component.title}</ThemedText>
            {component.subtitle ? (
              <ThemedText variant='footnote' color='secondaryLabel'>
                {component.subtitle}
              </ThemedText>
            ) : null}
          </View>
        ) : null}
        <View style={styles.gridWrap}>
          {rows.map(({ manga, chapter }) => (
            <View key={`${manga.key}-${chapter.key}`} style={[styles.chapterItem, { width: itemWidth }]}>
              <LibraryMangaCover
                sourceId={sourceId}
                manga={manga}
                width={itemWidth}
                onPress={() => onPressManga(manga)}
              />
              <ThemedText variant='footnote' color='secondaryLabel' numberOfLines={1}>
                {formatChapterLabel(chapter)}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (component.kind === 'mangaGrid') {
    const itemWidth = gridItemWidth();

    return (
      <View style={styles.block}>
        {component.title ? (
          <View style={styles.sectionHeader}>
            <ThemedText variant='title3'>{component.title}</ThemedText>
            {component.subtitle ? (
              <ThemedText variant='footnote' color='secondaryLabel'>
                {component.subtitle}
              </ThemedText>
            ) : null}
          </View>
        ) : null}
        <View style={styles.gridWrap}>
          {component.entries.map((item, index) => (
            <View key={item.key} style={[styles.gridItem, { width: itemWidth }]}>
              {component.ranking ? (
                <ThemedText variant='caption1' color='tertiaryLabel' style={styles.rankLabel}>
                  #{index + 1}
                </ThemedText>
              ) : null}
              <LibraryMangaCover
                sourceId={sourceId}
                manga={item}
                width={itemWidth}
                onPress={() => onPressManga(item)}
              />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      {component.title ? (
        <ThemedText variant='title3' style={styles.title}>
          {component.title}
        </ThemedText>
      ) : null}
      {component.entries.map((item) => (
        <Pressable key={item.key} onPress={() => onPressManga(item)} style={styles.listRow}>
          <ThemedText variant='body'>{item.title}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.lg,
    gap: 2,
  },
  title: {
    paddingHorizontal: Spacing.lg,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  listRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  chapterItem: {
    gap: Spacing.xs,
  },
  gridItem: {
    gap: Spacing.xs,
  },
  rankLabel: {
    paddingHorizontal: 2,
  },
});
