import type { Chapter, InstalledSource, Manga } from '../shared/types';
import type { SourceRunner } from '../shared/source-runner';
import { defaultFilterValues, sanitizeFilterValuesForInvoke } from '../shared/filters';
import type { FilterValue } from '../shared/types';
import { normalizeManga, normalizeMangaPageResult } from '../shared/normalize-manga';
import { expandZipPages } from '../shared/zip-pages';
import { readInstalledFilters, readInstalledWasm } from '../shared/source-manager';
import { getAidokuInvokeSettings, isMissingWasmExportError } from './invoke-settings';
import { resolveSourceBaseUrl } from '../shared/fetch-headers';
import { callAidokuWasm } from './wasm-bridge';

export {
  AIDOKU_REQUEST_CANCELLED,
  cancelAidokuSourceRequests,
  isAidokuRequestCancelled,
  releaseAidokuSourceRequests,
  retainAidokuSourceRequests,
} from './wasm-bridge';

// Optional WASM exports (get_home, get_listings) that a source does not provide. Remembered for the
// session so the app falls back immediately instead of paying for a failing call every time.
const missingWasmExports = new Map<string, Set<string>>();

export function clearAidokuWasmExportCache(sourceId?: string): void {
  if (sourceId) {
    missingWasmExports.delete(sourceId);
    return;
  }
  missingWasmExports.clear();
}

/** Remember exports that threw "not found" so we skip them on later calls this session. */
function markMissingExport(sourceId: string, exportName: string): void {
  let exports = missingWasmExports.get(sourceId);
  if (!exports) {
    exports = new Set();
    missingWasmExports.set(sourceId, exports);
  }
  exports.add(exportName);
}

function isExportAvailable(sourceId: string, exportName: string): boolean {
  return !missingWasmExports.get(sourceId)?.has(exportName);
}

// Adapts an installed Aidoku source to the common SourceRunner interface. Each method becomes one
// WASM export call routed through the WebView host (see wasm-bridge.ts).
export async function createAidokuSourceRunner(source: InstalledSource): Promise<SourceRunner> {
  const wasm = await readInstalledWasm(source);
  if (!wasm) {
    throw new Error('Aidoku WASM binary not found');
  }

  const sourceBaseUrl = resolveSourceBaseUrl(source.manifest);
  const invoke = <T,>(method: string, args: unknown) =>
    invokeAidoku<T>(wasm, source, method, args, sourceBaseUrl);

  return {
    kind: 'aidoku',
    sourceId: source.id,
    // Search prepares its filters first: if the caller passed none, the source's default filter values
    // are used; then open-ended ranges and empty text filters are dropped (sanitizeFilterValuesForInvoke).
    getSearchMangaList: async (params) => {
      const definitions = (await readInstalledFilters(source)) ?? [];
      let filters = params.filters;
      if (!filters?.length && definitions.length > 0) {
        filters = defaultFilterValues(definitions);
      }
      filters = sanitizeFilterValuesForInvoke(filters ?? [], definitions, {
        query: params.query,
        sourceId: source.id,
      });
      const query = resolveSearchQuery(source.id, params.query, filters);
      return normalizeMangaPageResult(
        await invoke('get_search_manga_list', { ...params, query, filters }),
      );
    },
    getMangaList: async (listing, page) =>
      normalizeMangaPageResult(await invoke('get_manga_list', { listing, page })),
    getMangaUpdate: async (manga: Manga, needsDetails: boolean, needsChapters: boolean) =>
      normalizeManga(
        await invoke('get_manga_update', {
          manga: enrichAidokuManga(source.id, manga),
          needsDetails,
          needsChapters,
        }),
      ),
    getPageList: async (manga: Manga, chapter: Chapter) => {
      const enrichedManga = enrichAidokuManga(source.id, manga);
      return expandZipPages(
        await invoke('get_page_list', {
          manga: enrichedManga,
          chapter: enrichAidokuChapter(source.id, enrichedManga, chapter),
        }),
      );
    },
    getHome: async () => {
      // Optional export: cache "missing" so we fall back without retrying every open.
      if (!isExportAvailable(source.id, 'get_home')) {
        throw new Error('WASM export not found: get_home');
      }
      try {
        return await invoke('get_home', {});
      } catch (error) {
        if (isMissingWasmExportError(error, 'get_home')) {
          markMissingExport(source.id, 'get_home');
        }
        throw error;
      }
    },
    getListings: async () => {
      if (!isExportAvailable(source.id, 'get_listings')) {
        return source.manifest.listings ?? [];
      }
      try {
        return await invoke('get_listings', {});
      } catch (error) {
        if (isMissingWasmExportError(error, 'get_listings')) {
          markMissingExport(source.id, 'get_listings');
          return source.manifest.listings ?? [];
        }
        throw error;
      }
    },
    getFilters: async () => (await readInstalledFilters(source)) ?? [],
  };
}

// The WASM host takes the source's current settings with EVERY call: users can change settings
// (API domain, languages, cookies) at any time and the module reads them through the defaults import.
async function invokeAidoku<T>(
  wasm: Uint8Array,
  source: InstalledSource,
  method: string,
  args: unknown,
  sourceBaseUrl?: string,
): Promise<T> {
  // Per-source settings (apiUrl, cookies) must be fresh on every WASM call.
  const settings = await getAidokuInvokeSettings(source);
  const result = await callAidokuWasm({
    sourceId: source.id,
    wasm,
    method,
    args,
    settings,
    sourceBaseUrl: resolveInvokeBaseUrl(settings, sourceBaseUrl),
  });
  return result as T;
}

// Sources that talk to an API on a different domain than their website expose it as a setting
// (`apiUrl` or `baseUrl`). That domain, not the manifest URL, is used for the Referer/Origin headers.
function resolveInvokeBaseUrl(settings: Record<string, unknown>, fallback?: string): string | undefined {
  const apiUrl = typeof settings.apiUrl === 'string' ? settings.apiUrl.trim() : '';
  if (apiUrl) return apiUrl;
  const baseUrl = typeof settings.baseUrl === 'string' ? settings.baseUrl.trim() : '';
  if (baseUrl) return baseUrl;
  return fallback;
}

// Special case: nhentai returns nothing for an empty browse query, so a harmless default is supplied.
function resolveSearchQuery(sourceId: string, query: string | undefined, filters: FilterValue[]): string {
  const trimmed = query?.trim() ?? '';
  if (trimmed) return trimmed;
  if (!sourceId.toLowerCase().includes('nhentai')) return trimmed;
  // Empty nhentai browse needs a default query or the source returns nothing.
  const hasTags = filters.some((filter) => {
    if (filter.type === 'multiSelect') return (filter.included?.length ?? 0) > 0;
    if (filter.type === 'text') return Boolean(filter.value?.trim());
    return false;
  });
  return hasTags ? trimmed : 'pages:>0';
}

function isNhentaiSource(sourceId: string): boolean {
  return sourceId.toLowerCase().includes('nhentai');
}

function nhentaiGalleryUrl(key: string): string | undefined {
  const id = key.trim();
  if (!/^\d+$/.test(id)) return undefined;
  return `https://nhentai.net/g/${id}/`;
}

// nhentai's WASM source only knows numeric gallery ids; the app builds the public URL so "open in
// browser" and sharing work.
function enrichAidokuManga(sourceId: string, manga: Manga): Manga {
  // nhentai WASM only stores numeric gallery ids; build shareable URLs for the UI.
  if (!isNhentaiSource(sourceId) || manga.url) return manga;
  const url = nhentaiGalleryUrl(manga.key);
  return url ? { ...manga, url } : manga;
}

function enrichAidokuChapter(sourceId: string, manga: Manga, chapter: Chapter): Chapter {
  if (!isNhentaiSource(sourceId) || chapter.url) return chapter;
  const url = nhentaiGalleryUrl(manga.key);
  return url ? { ...chapter, url } : chapter;
}

export type AidokuInvokeArgs = {
  sourceId: string;
  wasm: Uint8Array;
  method: string;
  args: unknown;
  settings?: Record<string, unknown>;
  sourceBaseUrl?: string;
};

/** @deprecated Use normalizeMangaPageResult from parsers/shared/normalize-manga */
export { normalizeMangaPageResult as normalizeAidokuMangaPageResult } from '../shared/normalize-manga';
