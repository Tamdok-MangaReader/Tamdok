import { isMissingWasmExportError } from '@/parsers/aidoku/invoke-settings';
import { parseMangaDescription } from '@/parsers/shared/manga-description';
import type { HomeComponent, HomeLayout, Listing, Manga } from '@/parsers/shared/types';
import type { SourceRunner } from '@/parsers/shared/source-runner';
import { withLatestChapterOnly } from '@/utils/chapter-label';

const DEFAULT_BIG_SCROLLER_INTERVAL = 5;
const NHENTAI_SOURCE_ID = 'multi.nhentai';

function isRemangaSource(sourceId?: string): boolean {
  return Boolean(sourceId?.toLowerCase().includes('remanga'));
}

function fallbackHomeSectionKind(sourceId?: string): HomeComponent['kind'] {
  return isRemangaSource(sourceId) ? 'mangaGrid' : 'scroller';
}

export type SourceHomeLoadResult = {
  home: HomeLayout;
  listings: Listing[];
};

/**
 * Load source home with fallbacks: native getHome, listing grids, then empty search.
 * Also fills in missing chapter/cover data where sources allow it.
 */
export async function loadSourceHomeData(
  runner: SourceRunner,
  source: { id?: string; manifest: { listings?: Listing[] } } | undefined,
  manifestListings: Listing[],
): Promise<SourceHomeLoadResult> {
  let homeLayout = await loadSourceHome(runner, manifestListings, source?.id);
  const sourceListings = (await runner.getListings?.()) ?? manifestListings;

  if (homeLayout.components.length === 0) {
    homeLayout = await buildFallbackHome(runner, sourceListings, source?.id);
  }

  homeLayout =
    (await enrichHomeLayout(runner, homeLayout, sourceListings, source?.id)) ?? { components: [] };

  if (homeLayout.components.length === 0) {
    homeLayout = await buildSearchFallbackHome(runner, source?.id);
  }

  return {
    home: homeLayout,
    listings: sourceListings.filter((listing) => listing.name || listing.id),
  };
}

async function loadSourceHome(
  runner: SourceRunner,
  manifestListings: Listing[],
  sourceId?: string,
): Promise<HomeLayout> {
  if (!runner.getHome) {
    return buildFallbackHome(runner, manifestListings, sourceId);
  }

  try {
    return (await runner.getHome()) ?? { components: [] };
  } catch (error) {
    if (isMissingWasmExportError(error, 'get_home')) {
      return buildFallbackHome(runner, manifestListings, sourceId);
    }
    throw error;
  }
}

async function enrichHomeLayout(
  runner: SourceRunner,
  home: HomeLayout,
  listings: Listing[],
  sourceId?: string,
): Promise<HomeLayout> {
  const components: HomeComponent[] = [];
  const skipListingFallback = sourceId === NHENTAI_SOURCE_ID;
  // Aidoku home already ships latest chapters; re-fetching every tile is slow and can 429.
  const skipEntryEnrichment = runner.kind === 'aidoku' || sourceId === NHENTAI_SOURCE_ID;

  for (const component of home.components) {
    if (isRemangaSource(sourceId) && component.kind === 'scroller' && component.entries.length > 0) {
      components.push({
        ...component,
        kind: 'mangaGrid',
        pageSize: component.pageSize ?? component.entries.length,
      });
      continue;
    }

    if (component.kind === 'bigScroller') {
      let entries = component.entries;

      if (entries.length === 0 && runner.getMangaList) {
        const listing =
          component.listing ??
          listings.find((entry) => entry.id === 'popular') ??
          listings.find((entry) => entry.name === component.title);
        if (listing) {
          const page = await runner.getMangaList(listing, 1);
          entries = page.entries.slice(0, 10);
        }
      }

      if (entries.length === 0) continue;

      if (!skipEntryEnrichment) {
        entries = await enrichBigScrollerEntries(runner, entries);
        entries = await enrichWithLatestChapters(runner, entries);
      }
      components.push({
        ...component,
        entries,
        autoScrollInterval: component.autoScrollInterval ?? DEFAULT_BIG_SCROLLER_INTERVAL,
      });
      continue;
    }

    if (component.kind === 'scroller' && component.entries.length > 0) {
      let entries = skipEntryEnrichment
        ? component.entries
        : await enrichWithLatestChapters(runner, component.entries);
      let scrollerEntries = component.scrollerEntries;

      if (scrollerEntries?.length) {
        const byKey = new Map(entries.map((entry) => [entry.key, entry]));
        scrollerEntries = scrollerEntries.map((entry) => {
          const enriched = byKey.get(entry.manga.key);
          const homeCover = entry.homeCover ?? entry.manga.cover;
          const manga = preserveHomeCover(homeCover, enriched ?? entry.manga);
          return {
            ...entry,
            homeCover,
            manga,
            chapter: entry.chapter ?? enriched?.chapters?.[0],
          };
        });
      }

      components.push({
        ...component,
        entries,
        scrollerEntries,
      });
      continue;
    }

    if (
      !skipListingFallback &&
      (component.kind === 'mangaGrid' || component.kind === 'scroller') &&
      component.entries.length === 0 &&
      component.listing &&
      runner.getMangaList
    ) {
      const page = await runner.getMangaList(component.listing, 1);
      const useGrid = component.kind === 'mangaGrid' || isRemangaSource(sourceId);
      const limit = component.pageSize ?? (useGrid ? 9 : 12);
      let entries = page.entries.slice(0, limit);
      if (entries.length === 0) continue;
      if (component.kind === 'scroller' && !skipEntryEnrichment) {
        entries = await enrichWithLatestChapters(runner, entries);
      }
      components.push({
        ...component,
        kind: useGrid ? 'mangaGrid' : component.kind,
        entries,
      });
      continue;
    }

    if (component.entries.length === 0 && component.kind !== 'mangaChapterList') {
      continue;
    }

    components.push(component);
  }

  return { components };
}

function mangaHasBigScrollerDetails(manga: Manga): boolean {
  const { summary } = parseMangaDescription(manga.description);
  return Boolean(manga.authors?.length && manga.tags?.length && summary?.trim());
}

function preserveHomeCover(homeCover: string | undefined, manga: Manga): Manga {
  if (!homeCover) return manga;
  return { ...manga, cover: homeCover };
}

async function enrichWithLatestChapters(runner: SourceRunner, entries: Manga[]): Promise<Manga[]> {
  if (!runner.getMangaUpdate) return entries;

  const needsEnrichment = entries.filter((manga) => !manga.chapters?.length);
  if (needsEnrichment.length === 0) return entries;

  const enriched = new Map<string, Manga>();
  const concurrency = 4;

  for (let index = 0; index < needsEnrichment.length; index += concurrency) {
    const batch = needsEnrichment.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async (manga) => {
        try {
          const homeCover = manga.cover;
          const updated = await runner.getMangaUpdate!(manga, false, true);
          const latest = withLatestChapterOnly(updated);
          return [manga.key, preserveHomeCover(homeCover, { ...manga, chapters: latest.chapters })] as const;
        } catch {
          return [manga.key, manga] as const;
        }
      }),
    );
    for (const [key, manga] of results) {
      enriched.set(key, manga);
    }
  }

  return entries.map((manga) => enriched.get(manga.key) ?? manga);
}

async function enrichBigScrollerEntries(runner: SourceRunner, entries: Manga[]): Promise<Manga[]> {
  if (!runner.getMangaUpdate) return entries;

  const needsEnrichment = entries.filter((manga) => !mangaHasBigScrollerDetails(manga));
  if (needsEnrichment.length === 0) return entries;

  const enriched = new Map<string, Manga>();
  const concurrency = 4;

  for (let index = 0; index < needsEnrichment.length; index += concurrency) {
    const batch = needsEnrichment.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async (manga) => {
        try {
          const homeCover = manga.cover;
          const updated = await runner.getMangaUpdate!(manga, true, false);
          return [manga.key, preserveHomeCover(homeCover, updated)] as const;
        } catch {
          return [manga.key, manga] as const;
        }
      }),
    );
    for (const [key, manga] of results) {
      enriched.set(key, manga);
    }
  }

  return entries.map((manga) => enriched.get(manga.key) ?? manga);
}

async function buildFallbackHome(
  runner: SourceRunner,
  sourceListings: Listing[],
  sourceId?: string,
): Promise<HomeLayout> {
  const components: HomeComponent[] = [];
  const sectionKind = fallbackHomeSectionKind(sourceId);

  for (const listing of sourceListings.slice(0, 3)) {
    if (!runner.getMangaList) continue;
    try {
      const page = await runner.getMangaList(listing, 1);
      if (page.entries.length === 0) continue;
      components.push({
        title: listing.name ?? listing.id,
        kind: sectionKind,
        entries: page.entries,
        listing,
        pageSize: sectionKind === 'mangaGrid' ? page.entries.length : undefined,
      });
    } catch {
      // Try the next listing.
    }
  }

  if (components.length > 0) {
    return { components };
  }

  return buildSearchFallbackHome(runner, sourceId);
}

async function buildSearchFallbackHome(runner: SourceRunner, sourceId?: string): Promise<HomeLayout> {
  try {
    const page = await runner.getSearchMangaList({ page: 1, query: '', filters: [] });
    if (page.entries.length === 0) {
      return { components: [] };
    }
    const sectionKind = fallbackHomeSectionKind(sourceId);
    return {
      components: [
        {
          kind: sectionKind,
          entries: page.entries,
          pageSize: sectionKind === 'mangaGrid' ? page.entries.length : undefined,
        },
      ],
    };
  } catch {
    return { components: [] };
  }
}
