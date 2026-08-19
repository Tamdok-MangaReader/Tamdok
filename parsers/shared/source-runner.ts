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

export type SourceRunner = {
  kind: InstalledSource['kind'];
  sourceId: string;
  getSearchMangaList: (params: SourceListParams) => Promise<MangaPageResult>;
  getMangaList?: (listing: Listing, page: number) => Promise<MangaPageResult>;
  getMangaUpdate: (manga: Manga, needsDetails: boolean, needsChapters: boolean) => Promise<Manga>;
  getPageList: (manga: Manga, chapter: Chapter) => Promise<Page[]>;
  getHome?: () => Promise<HomeLayout>;
  getListings?: () => Promise<Listing[]>;
  getFilters?: () => Promise<FilterDefinition[]>;
};

export function emptyMangaPage(): MangaPageResult {
  return { entries: [], hasNextPage: false };
}
