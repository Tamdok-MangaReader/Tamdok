import { deserialize } from '@variegated-coffee/serde-postcard-ts';

import type {
  Chapter,
  FilterValue,
  HomeComponent,
  HomeFilterItem,
  HomeLayout,
  HomeNavigationLink,
  HomeScrollerEntry,
  Listing,
  Manga,
  SourceListParams,
} from '../../shared/types';
import { parseMangaDescription } from '../../shared/manga-description';
import { GlobalStore, WasmEnv } from './env';
import { SyncFetchBridge } from './fetch-bridge';
import { createWasmImports } from './imports';
import {
  ChapterSchema,
  FilterValueListSchema,
  FilterValueSchema,
  HomeLayoutSchema,
  ListingListSchema,
  ListingSchema,
  MangaPageResultSchema,
  MangaSchema,
  PageListSchema,
  type PostcardChapter,
  type PostcardHomeLayout,
  type PostcardListing,
  type PostcardManga,
} from './schemas';
import { storeEncodedValue } from './imports/std';
import { resetPartialResults, resolveHomeLayout } from './partial-results';

const DEFAULT_BIG_SCROLLER_INTERVAL = 5;

type WasmInstance = WebAssembly.Instance & {
  exports: WebAssembly.Exports & {
    memory: WebAssembly.Memory;
    start?: () => void;
    free_result: (ptr: number) => void;
    get_search_manga_list: (query: number, page: number, filters: number) => number;
    get_manga_update: (manga: number, needsDetails: number, needsChapters: number) => number;
    get_page_list: (manga: number, chapter: number) => number;
    get_manga_list?: (listing: number, page: number) => number;
    get_home?: () => number;
    get_listings?: () => number;
  };
};

const instanceCache = new Map<string, WasmInstance>();

/** Drop cached module when source settings change or user leaves the source. */
export function resetWasmSourceRuntime(sourceId: string): void {
  instanceCache.delete(sourceId);
}

export type InvokeContext = {
  sourceId: string;
  wasm: Uint8Array;
  postToParent?: (message: Record<string, unknown>) => void;
};

export async function loadWasmInstance(sourceId: string, wasm: Uint8Array, env: WasmEnv): Promise<WasmInstance> {
  const cached = instanceCache.get(sourceId);
  if (cached) {
    env.memory = cached.exports.memory;
    return cached;
  }

  const imports = createWasmImports(env);
  const instantiated = await WebAssembly.instantiate(wasm, imports);
  const wasmInstance = ('instance' in instantiated ? instantiated.instance : instantiated) as WasmInstance;
  env.memory = wasmInstance.exports.memory;
  wasmInstance.exports.start?.();
  instanceCache.set(sourceId, wasmInstance);
  return wasmInstance;
}

/** Entry point: encode RN args into RIDs, call WASM export, decode postcard result. */
export async function invokeExport(
  ctx: InvokeContext,
  method: string,
  args: unknown,
  providedEnv?: WasmEnv,
): Promise<unknown> {
  const env =
    providedEnv ??
    new WasmEnv(
      ctx.postToParent
        ? new SyncFetchBridge((message) => ctx.postToParent?.(message))
        : {
            send: () => {
              throw new Error('Fetch bridge is not configured');
            },
            sendAll: () => {
              throw new Error('Fetch bridge is not configured');
            },
          },
    );
  const instance = await loadWasmInstance(ctx.sourceId, ctx.wasm, env);
  env.sourceId = ctx.sourceId;
  env.store = new GlobalStore();
  resetPartialResults(env);
  const descriptors = encodeArgs(method, args, env);
  const ptr = callExport(instance, method, descriptors);
  env.memory = instance.exports.memory;
  const decoded = decodeResult(env, instance, method, ptr);
  return normalizeResult(method, decoded);
}

function encodeArgs(method: string, args: unknown, env: WasmEnv): number[] {
  switch (method) {
    case 'get_search_manga_list': {
      const params = args as SourceListParams;
      const queryRid = storePlainString(env, params.query ?? '');
      const filters = (params.filters ?? []).map(toPostcardFilter);
      const filtersRid = storeEncodedValue(env, FilterValueListSchema, filters);
      return [queryRid, params.page, filtersRid];
    }
    case 'get_manga_list': {
      const { listing, page } = args as { listing: Listing; page: number };
      const listingRid = storeEncodedValue(env, ListingSchema, toPostcardListing(listing));
      return [listingRid, page];
    }
    case 'get_manga_update': {
      const { manga, needsDetails, needsChapters } = args as {
        manga: Manga;
        needsDetails: boolean;
        needsChapters: boolean;
      };
      const mangaRid = storeEncodedValue(env, MangaSchema, toPostcardManga(manga));
      return [mangaRid, needsDetails ? 1 : 0, needsChapters ? 1 : 0];
    }
    case 'get_page_list': {
      const { manga, chapter } = args as { manga: Manga; chapter: Chapter };
      const mangaRid = storeEncodedValue(env, MangaSchema, toPostcardManga(manga));
      const chapterRid = storeEncodedValue(env, ChapterSchema, toPostcardChapter(chapter));
      return [mangaRid, chapterRid];
    }
    case 'get_home':
      return [];
    case 'get_listings':
      return [];
    default:
      throw new Error(`Unsupported Aidoku method: ${method}`);
  }
}

function callExport(instance: WasmInstance, method: string, args: number[]): number {
  const fn = instance.exports[method as keyof WasmInstance['exports']];
  if (typeof fn !== 'function') {
    throw new Error(`WASM export not found: ${method}`);
  }
  return (fn as (...params: number[]) => number)(...args);
}

// WASM uses negative ptr for errno-style errors; positive ptr is a length-prefixed buffer.
function decodeResult(env: WasmEnv, instance: WasmInstance, method: string, ptr: number): unknown {
  if (ptr < 0) {
    throw new Error(mapErrorCode(ptr));
  }

  const len = env.readI32(ptr);
  if (len === -1) {
    // String error payload instead of postcard bytes.
    const message = new TextDecoder().decode(env.readResultBytes(ptr));
    instance.exports.free_result(ptr);
    throw new Error(message || 'Aidoku source error');
  }

  const bytes = env.readResultBytes(ptr);
  instance.exports.free_result(ptr);

  switch (method) {
    case 'get_search_manga_list':
    case 'get_manga_list':
      return decodePostcard(MangaPageResultSchema, bytes, method);
    case 'get_manga_update':
      return decodePostcard(MangaSchema, bytes, method);
    case 'get_page_list':
      return decodePostcard(PageListSchema, bytes, method);
    case 'get_home':
      return resolveHomeLayout(env, decodePostcard(HomeLayoutSchema, bytes, method) as PostcardHomeLayout);
    case 'get_listings':
      return decodePostcard(ListingListSchema, bytes, method);
    default:
      return bytes;
  }
}

function storePlainString(env: WasmEnv, value: string): number {
  return env.store.store({ kind: 'string', value });
}

function decodePostcard<T>(schema: Parameters<typeof deserialize>[0], bytes: Uint8Array, method: string): T {
  try {
    return (deserialize(schema, bytes) as { value: T }).value;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${method}: ${detail} (${bytes.length} bytes)`);
  }
}

function mapErrorCode(code: number): string {
  switch (code) {
    case -1:
      return 'Aidoku source error';
    case -2:
      return 'Aidoku source method is unimplemented';
    case -3:
      return 'Aidoku network request failed';
    default:
      return `Aidoku WASM call failed (${code})`;
  }
}

function toPostcardListing(listing: Listing) {
  return {
    id: listing.id,
    name: listing.name ?? listing.id,
    kind: listing.kind === 'list' ? { type: 'List' as const } : { type: 'Default' as const },
  };
}

function toPostcardManga(manga: Manga): PostcardManga {
  return {
    key: manga.key,
    title: manga.title,
    cover: manga.cover ?? null,
    artists: manga.artists ?? null,
    authors: manga.authors ?? null,
    description: manga.description ?? null,
    url: manga.url ?? null,
    tags: manga.tags ?? null,
    status: mapStatus(manga.status),
    content_rating: mapContentRating(manga.contentRating),
    viewer: mapViewer(manga.viewer),
    update_strategy: { type: 'Always' },
    next_update_time: null,
    chapters: manga.chapters?.map(toPostcardChapter) ?? null,
  };
}

function toPostcardChapter(chapter: Chapter): PostcardChapter {
  return {
    key: chapter.key,
    title: chapter.title ?? null,
    chapter_number: chapter.chapterNumber ?? null,
    volume_number: chapter.volumeNumber ?? null,
    date_uploaded: chapter.dateUploaded != null ? BigInt(Math.trunc(chapter.dateUploaded)) : null,
    scanlators: chapter.scanlators ?? null,
    url: chapter.url ?? null,
    language: chapter.language ?? null,
    thumbnail: chapter.thumbnail ?? null,
    locked: Boolean(chapter.locked),
  };
}

function toPostcardFilter(filter: FilterValue) {
  switch (filter.type) {
    case 'text':
      return { type: 'Text' as const, value: { id: filter.id, value: filter.value } };
    case 'sort':
      return { type: 'Sort' as const, value: { id: filter.id, index: filter.index, ascending: filter.ascending } };
    case 'select':
      return { type: 'Select' as const, value: { id: filter.id, value: filter.value } };
    case 'multiSelect':
      return {
        type: 'MultiSelect' as const,
        value: { id: filter.id, included: filter.included, excluded: filter.excluded ?? [] },
      };
    case 'check':
      return { type: 'Check' as const, value: { id: filter.id, value: filter.value ? 1 : 0 } };
    case 'range': {
      let from = filter.from ?? null;
      // Aidoku treats 0 as "unset" for most ranges, but rating=0 is meaningful.
      if (from === 0 && filter.id !== 'rating') {
        from = null;
      }
      return {
        type: 'Range' as const,
        value: { id: filter.id, from, to: filter.to ?? null },
      };
    }
    default:
      throw new Error(`Unsupported filter type: ${(filter as FilterValue).type}`);
  }
}

function mapStatus(status?: Manga['status']) {
  switch (status) {
    case 'ongoing':
      return { type: 'Ongoing' as const };
    case 'completed':
      return { type: 'Completed' as const };
    case 'cancelled':
      return { type: 'Cancelled' as const };
    case 'hiatus':
      return { type: 'Hiatus' as const };
    default:
      return { type: 'Unknown' as const };
  }
}

function mapContentRating(rating?: Manga['contentRating']) {
  switch (rating) {
    case 'safe':
      return { type: 'Safe' as const };
    case 'suggestive':
      return { type: 'Suggestive' as const };
    case 'nsfw':
      return { type: 'NSFW' as const };
    default:
      return { type: 'Unknown' as const };
  }
}

function mapViewer(viewer?: Manga['viewer']) {
  switch (viewer) {
    case 'ltr':
      return { type: 'LeftToRight' as const };
    case 'rtl':
      return { type: 'RightToLeft' as const };
    case 'webtoon':
      return { type: 'Webtoon' as const };
    case 'vertical':
      return { type: 'Vertical' as const };
    default:
      return { type: 'Unknown' as const };
  }
}

// Aidoku page content is a tagged union (Text, Url, Zip); map each to our Page shape.
function normalizeResult(method: string, value: unknown): unknown {
  if (method === 'get_search_manga_list' || method === 'get_manga_list') {
    const result = value as { entries: PostcardManga[]; has_next_page: boolean };
    return {
      entries: result.entries.map(fromPostcardManga),
      hasNextPage: result.has_next_page,
    };
  }
  if (method === 'get_manga_update') {
    return fromPostcardManga(value as PostcardManga);
  }
  if (method === 'get_page_list') {
    return (value as Array<{ content: { type: string; value?: unknown }; thumbnail?: string | null }>).map((page) => {
      if (page.content.type === 'Text') {
        return { text: postcardTupleString(page.content.value, 0), thumbnail: page.thumbnail ?? undefined };
      }
      if (page.content.type === 'Url') {
        const url = postcardTupleString(page.content.value, 0);
        const context = postcardTupleItem(page.content.value, 1);
        const headers =
          context && typeof context === 'object' && !Array.isArray(context)
            ? (context as Record<string, string>)
            : undefined;
        return {
          url,
          thumbnail: page.thumbnail ?? undefined,
          ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
        };
      }
      if (page.content.type === 'Zip') {
        return {
          zipUrl: postcardTupleString(page.content.value, 0),
          zipEntry: postcardTupleString(page.content.value, 1) || undefined,
          thumbnail: page.thumbnail ?? undefined,
        };
      }
      return { thumbnail: page.thumbnail ?? undefined };
    });
  }
  if (method === 'get_home') {
    return fromPostcardHomeLayout(value as PostcardHomeLayout);
  }
  if (method === 'get_listings') {
    return (value as PostcardListing[]).map(fromPostcardListing);
  }
  return value;
}

function postcardTupleItem(value: unknown, index: number): unknown {
  if (Array.isArray(value)) return value[index];
  if (value && typeof value === 'object') {
    return (value as Record<string | number, unknown>)[index];
  }
  return undefined;
}

function postcardTupleString(value: unknown, index: number): string {
  const item = postcardTupleItem(value, index);
  return typeof item === 'string' ? item : '';
}

function fromPostcardListing(listing: PostcardListing): Listing {
  return {
    id: listing.id,
    name: listing.name,
    kind: listing.kind.type === 'List' ? 'list' : 'grid',
  };
}

type PostcardLink = {
  title: string;
  subtitle?: string | null;
  image_url?: string | null;
  value?:
    | { type: 'Url'; value: string }
    | { type: 'Listing'; value: PostcardListing }
    | { type: 'Manga'; value: PostcardManga }
    | null;
};

type PostcardHomeComponent = PostcardHomeLayout['components'][number];

function resolveLinkSubtitle(link: PostcardLink, manga: Manga): string | undefined {
  if (link.subtitle?.trim()) return link.subtitle.trim();
  return parseMangaDescription(manga.description).ratingLine;
}

function fromPostcardLink(link: PostcardLink): HomeScrollerEntry | null {
  const value = link.value;

  if (value?.type === 'Manga') {
    const manga = fromPostcardManga(value.value);
    if (link.title && manga.title !== link.title) {
      manga.title = link.title;
    }
    const chapter = manga.chapters?.[0];
    return { manga, homeCover: manga.cover, chapter, subtitle: resolveLinkSubtitle(link, manga) };
  }
  if (value?.type === 'Url') {
    const manga = {
      key: value.value,
      title: link.title,
      url: value.value,
    };
    return { manga, subtitle: link.subtitle ?? undefined };
  }
  if (link.title) {
    return {
      manga: {
        key: link.title,
        title: link.title,
      },
      subtitle: link.subtitle ?? undefined,
    };
  }
  return null;
}

function fromPostcardHomeComponent(component: PostcardHomeComponent): HomeComponent | null {
  const title = component.title ?? undefined;
  const subtitle = component.subtitle ?? undefined;
  const { value } = component;

  switch (value.type) {
    case 'Scroller': {
      const scrollerEntries = value.value.entries
        .map(fromPostcardLink)
        .filter((entry): entry is HomeScrollerEntry => entry != null);
      return {
        title,
        subtitle,
        kind: 'scroller',
        entries: scrollerEntries.map((entry) => entry.manga),
        scrollerEntries,
        listing: value.value.listing ? fromPostcardListing(value.value.listing) : undefined,
      };
    }
    case 'BigScroller':
      return {
        title,
        subtitle,
        kind: 'bigScroller',
        entries: value.value.entries.map(fromPostcardManga),
        autoScrollInterval: value.value.auto_scroll_interval ?? DEFAULT_BIG_SCROLLER_INTERVAL,
      };
    case 'ImageScroller': {
      const scrollerEntries = value.value.links
        .map(fromPostcardLink)
        .filter((entry): entry is HomeScrollerEntry => entry != null);
      return {
        title,
        subtitle,
        kind: 'scroller',
        entries: scrollerEntries.map((entry) => entry.manga),
        scrollerEntries,
      };
    }
    case 'MangaList': {
      const entries = value.value.entries
        .map(fromPostcardLink)
        .filter((entry): entry is HomeScrollerEntry => entry != null)
        .map((entry) => entry.manga);
      const pageSize = value.value.page_size ?? undefined;
      return {
        title,
        subtitle,
        kind: 'mangaGrid',
        entries: pageSize != null ? entries.slice(0, pageSize) : entries,
        listing: value.value.listing ? fromPostcardListing(value.value.listing) : undefined,
        pageSize,
        ranking: value.value.ranking,
      };
    }
    case 'MangaChapterList':
      return {
        title,
        subtitle,
        kind: 'mangaChapterList',
        entries: [],
        chapterEntries: value.value.entries.map((entry) => ({
          manga: fromPostcardManga(entry.manga),
          chapter: fromPostcardChapter(entry.chapter),
        })),
        listing: value.value.listing ? fromPostcardListing(value.value.listing) : undefined,
        pageSize: value.value.page_size ?? undefined,
      };
    case 'Filters':
      return {
        title,
        subtitle,
        kind: 'filters',
        entries: [],
        filterItems: value.value
          .map(fromPostcardFilterItem)
          .filter((item): item is HomeFilterItem => item != null),
      };
    case 'Links':
      return {
        title,
        subtitle,
        kind: 'links',
        entries: [],
        links: value.value
          .map(fromPostcardNavigationLink)
          .filter((link): link is HomeNavigationLink => link != null),
      };
    default:
      return null;
  }
}

function fromPostcardFilterItem(item: {
  title: string;
  values?: Array<{ type: string; value: Record<string, unknown> }> | null;
}): HomeFilterItem | null {
  if (!item.title?.trim()) return null;
  return {
    title: item.title,
    filters: (item.values ?? []).map(fromPostcardFilterValue).filter((value): value is FilterValue => value != null),
  };
}

type PostcardFilterValue = {
  type: string;
  value: Record<string, unknown>;
};

function fromPostcardFilterValue(filter: PostcardFilterValue): FilterValue | null {
  switch (filter.type) {
    case 'Text':
      return { type: 'text', id: String(filter.value.id), value: String(filter.value.value ?? '') };
    case 'Sort':
      return {
        type: 'sort',
        id: String(filter.value.id),
        index: Number(filter.value.index ?? 0),
        ascending: Boolean(filter.value.ascending),
      };
    case 'Check':
      return { type: 'check', id: String(filter.value.id), value: Number(filter.value.value ?? 0) === 1 };
    case 'Select':
      return { type: 'select', id: String(filter.value.id), value: String(filter.value.value ?? '') };
    case 'MultiSelect':
      return {
        type: 'multiSelect',
        id: String(filter.value.id),
        included: Array.isArray(filter.value.included) ? filter.value.included.map(String) : [],
        excluded: Array.isArray(filter.value.excluded) ? filter.value.excluded.map(String) : [],
      };
    case 'Range':
      return {
        type: 'range',
        id: String(filter.value.id),
        from: filter.value.from != null ? Number(filter.value.from) : undefined,
        to: filter.value.to != null ? Number(filter.value.to) : undefined,
      };
    default:
      return null;
  }
}

function fromPostcardNavigationLink(link: PostcardLink): HomeNavigationLink | null {
  const value = link.value;
  const base: HomeNavigationLink = {
    title: link.title,
    subtitle: link.subtitle ?? undefined,
    imageUrl: link.image_url ?? undefined,
  };

  if (value?.type === 'Manga') {
    const manga = fromPostcardManga(value.value);
    if (link.title) manga.title = link.title;
    return { ...base, manga };
  }
  if (value?.type === 'Listing') {
    return { ...base, listing: fromPostcardListing(value.value) };
  }
  if (value?.type === 'Url') {
    return { ...base, url: value.value };
  }
  if (link.title) {
    return base;
  }
  return null;
}

function fromPostcardHomeLayout(layout: PostcardHomeLayout): HomeLayout {
  return {
    components: layout.components
      .map(fromPostcardHomeComponent)
      .filter((component): component is HomeComponent => component != null),
  };
}

function fromPostcardManga(manga: PostcardManga): Manga {
  return {
    key: manga.key,
    title: manga.title,
    cover: manga.cover ?? undefined,
    artists: manga.artists ?? undefined,
    authors: manga.authors ?? undefined,
    description: manga.description ?? undefined,
    url: manga.url ?? undefined,
    tags: manga.tags ?? undefined,
    status: fromStatus(manga.status),
    contentRating: fromContentRating(manga.content_rating),
    viewer: fromViewer(manga.viewer),
    chapters: manga.chapters?.map(fromPostcardChapter),
  };
}

function fromPostcardChapter(chapter: PostcardChapter): Chapter {
  return {
    key: chapter.key,
    title: chapter.title ?? undefined,
    chapterNumber: chapter.chapter_number ?? undefined,
    volumeNumber: chapter.volume_number ?? undefined,
    dateUploaded: chapter.date_uploaded != null ? Number(chapter.date_uploaded) : undefined,
    scanlators: chapter.scanlators ?? undefined,
    url: chapter.url ?? undefined,
    language: chapter.language ?? undefined,
    thumbnail: chapter.thumbnail ?? undefined,
    locked: chapter.locked,
  };
}

function fromStatus(status: PostcardManga['status']): Manga['status'] {
  switch (status.type) {
    case 'Ongoing':
      return 'ongoing';
    case 'Completed':
      return 'completed';
    case 'Cancelled':
      return 'cancelled';
    case 'Hiatus':
      return 'hiatus';
    default:
      return 'unknown';
  }
}

function fromContentRating(rating: PostcardManga['content_rating']): Manga['contentRating'] {
  switch (rating.type) {
    case 'Safe':
      return 'safe';
    case 'Suggestive':
      return 'suggestive';
    case 'NSFW':
      return 'nsfw';
    default:
      return undefined;
  }
}

function fromViewer(viewer: PostcardManga['viewer']): Manga['viewer'] {
  switch (viewer.type) {
    case 'LeftToRight':
      return 'ltr';
    case 'RightToLeft':
      return 'rtl';
    case 'Webtoon':
      return 'webtoon';
    case 'Vertical':
      return 'vertical';
    default:
      return undefined;
  }
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)!;
  }
  return bytes;
}
