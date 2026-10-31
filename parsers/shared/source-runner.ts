import type {
  Chapter,
  FilterDefinition,
  HomeLayout,
  InstalledSource,
  Listing,
  Manga,
  MangaPageResult,
  Page,
  SourceListParams,
} from './types';

// Common interface implemented by both runtimes (Aidoku WASM and Tamdok JS).
// The app only talks to this type, so it never needs to know which runtime backs a source.
// Optional members are capabilities a source may not provide.
export type SourceRunner = {
  kind: InstalledSource['kind'];
  sourceId: string;
  getSearchMangaList: (params: SourceListParams) => Promise<MangaPageResult>;
  getMangaList?: (listing: Listing, page: number) => Promise<MangaPageResult>;
  // Refreshes a manga. The flags tell the source whether the caller needs details, chapters or both.
  getMangaUpdate: (manga: Manga, needsDetails: boolean, needsChapters: boolean) => Promise<Manga>;
  getPageList: (manga: Manga, chapter: Chapter) => Promise<Page[]>;
  getHome?: () => Promise<HomeLayout>;
  getListings?: () => Promise<Listing[]>;
  getFilters?: () => Promise<FilterDefinition[]>;
};

export function emptyMangaPage(): MangaPageResult {
  return { entries: [], hasNextPage: false };
}
