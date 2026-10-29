import type { InstalledSource, Manga } from "@/parsers/shared/types";
import { sanitizeChapterNumber } from "@/parsers/shared/chapter-number";
import { readMangaDetailCache } from "@/services/manga-detail-cache";
import {
  getMangaChapterProgress,
  getMangaHistoryForEntry,
  importChapterReadStates,
  removeMangaHistoryGroup,
} from "@/services/manga-tracking";
import { removeMangaDownloads } from "@/services/downloads";
import { replaceLibraryEntry } from "@/services/library";
import {
  getOrCreateSourceRunner,
  getSourceIdentityKey,
} from "@/services/sources";

const MAX_CANDIDATES = 3;
const MAX_CONCURRENT_SEARCHES = 3;
const MAX_ALT_QUERIES = 2;

export type TransferCancel = { cancelled: boolean };

export type TransferOrigin = {
  sourceId: string;
  mangaKey: string;
  title: string;
  cover?: string;
  altTitles?: string[];
};

let activeSearches = 0;
const searchQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeSearches < MAX_CONCURRENT_SEARCHES) {
    activeSearches++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    searchQueue.push(() => {
      activeSearches++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeSearches--;
  searchQueue.shift()?.();
}

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  await acquireSlot();
  try {
    return await work();
  } finally {
    releaseSlot();
  }
}

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenSet(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter(Boolean));
}

function titleScore(normalizedQuery: string, candidate: Manga): number {
  const names = [candidate.title, ...(candidate.altTitles ?? [])];
  let best = 0;
  const queryTokens = tokenSet(normalizedQuery);
  for (const name of names) {
    const normalized = normalizeTitle(name);
    if (!normalized) continue;
    if (normalized === normalizedQuery) return 3;
    if (
      normalized.includes(normalizedQuery) ||
      normalizedQuery.includes(normalized)
    ) {
      best = Math.max(best, 2);
      continue;
    }
    const tokens = tokenSet(normalized);
    let shared = 0;
    for (const token of queryTokens) if (tokens.has(token)) shared++;
    const union = queryTokens.size + tokens.size - shared;
    if (union > 0) best = Math.max(best, shared / union);
  }
  return best;
}

const SEARCH_CACHE_LIMIT = 200;
const searchCache = new Map<string, Promise<Manga[]>>();

function searchOne(
  source: InstalledSource,
  query: string,
  cancel?: TransferCancel,
): Promise<Manga[]> {
  const cacheKey = `${source.kind}:${source.id}|${query}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const pending = withSlot(async () => {
    if (cancel?.cancelled) throw new Error("cancelled");
    const runner = await getOrCreateSourceRunner(source);
    const page = await runner.getSearchMangaList({ query, page: 1 });
    return page.entries;
  }).catch((error) => {
    searchCache.delete(cacheKey);
    throw error;
  });
  searchCache.set(cacheKey, pending);
  if (searchCache.size > SEARCH_CACHE_LIMIT) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  return pending;
}

export async function searchTransferCandidates(
  source: InstalledSource,
  origin: Pick<TransferOrigin, "title" | "altTitles">,
  cancel?: TransferCancel,
): Promise<Manga[]> {
  const normalizedTitle = normalizeTitle(origin.title);
  const queries = [
    origin.title,
    ...(origin.altTitles ?? [])
      .filter((alt) => normalizeTitle(alt) !== normalizedTitle)
      .slice(0, MAX_ALT_QUERIES),
  ].filter((query) => query.trim().length > 0);

  const merged = new Map<string, { manga: Manga; score: number; order: number }>();
  let order = 0;

  for (const query of queries) {
    const normalizedQuery = normalizeTitle(query);
    if (cancel?.cancelled) break;
    const entries = await searchOne(source, query, cancel);
    for (const manga of entries) {
      if (merged.has(manga.key)) continue;
      const score = Math.max(
        titleScore(normalizedTitle, manga),
        titleScore(normalizedQuery, manga),
      );
      merged.set(manga.key, { manga, score, order: order++ });
    }
    const hasExact = [...merged.values()].some((item) => item.score >= 3);
    if (hasExact && merged.size >= MAX_CANDIDATES) break;
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_CANDIDATES)
    .map((item) => ({ ...item.manga, sourceId: source.id }));
}

export function isTwinSource(
  candidate: Pick<InstalledSource, "kind" | "id">,
  originSourceId: string,
  originKind?: InstalledSource["kind"],
): boolean {
  if (candidate.id === originSourceId && (!originKind || candidate.kind === originKind)) {
    return false;
  }
  return (
    getSourceIdentityKey(candidate) ===
    getSourceIdentityKey({
      kind: originKind ?? (originSourceId.endsWith(".tamdok") ? "tamdok" : "aidoku"),
      id: originSourceId,
    })
  );
}

export function isSameSource(
  candidate: Pick<InstalledSource, "kind" | "id">,
  originSourceId: string,
  originKind?: InstalledSource["kind"],
): boolean {
  return (
    candidate.id === originSourceId &&
    (!originKind || candidate.kind === originKind)
  );
}

export async function findMangaByKey(
  source: InstalledSource,
  mangaKey: string,
  title: string,
  cancel?: TransferCancel,
): Promise<Manga | null> {
  try {
    const runner = await withSlot(() => getOrCreateSourceRunner(source));
    if (cancel?.cancelled) return null;
    const manga = await withSlot(() =>
      runner.getMangaUpdate({ key: mangaKey, title }, true, false),
    );
    if (!manga?.title?.trim()) return null;
    return { ...manga, key: manga.key || mangaKey, sourceId: source.id };
  } catch {
    return null;
  }
}

export async function loadOriginAltTitles(
  sourceId: string,
  mangaKey: string,
): Promise<string[]> {
  const cached = await readMangaDetailCache(sourceId, mangaKey);
  return cached?.manga.altTitles ?? [];
}

export async function transferManga(
  origin: TransferOrigin,
  targetSource: InstalledSource,
  target: Manga,
): Promise<{ sourceRoute: string; manga: Manga }> {
  const runner = await getOrCreateSourceRunner(targetSource);
  const detailed = await runner.getMangaUpdate(target, true, true);
  const targetChapters = detailed.chapters ?? [];

  const [progress, originCache] = await Promise.all([
    getMangaChapterProgress(origin.sourceId, origin.mangaKey),
    readMangaDetailCache(origin.sourceId, origin.mangaKey),
  ]);

  const originNumbers = new Map<string, number>();
  for (const chapter of originCache?.manga.chapters ?? []) {
    const number = sanitizeChapterNumber(chapter.chapterNumber);
    if (number != null) originNumbers.set(chapter.key, number);
  }

  const readNumbers = new Map<number, number>();
  const readKeys = new Map<string, number>();
  for (const item of Object.values(progress)) {
    if (item.page !== -1) continue;
    readKeys.set(item.chapterKey, item.dateRead);
    const number = originNumbers.get(item.chapterKey);
    if (number != null) {
      readNumbers.set(number, Math.max(readNumbers.get(number) ?? 0, item.dateRead));
    }
  }

  const imports: { chapterKey: string; dateRead: number }[] = [];
  for (const chapter of targetChapters) {
    const direct = readKeys.get(chapter.key);
    const number = sanitizeChapterNumber(chapter.chapterNumber);
    const byNumber = number != null ? readNumbers.get(number) : undefined;
    const dateRead = direct ?? byNumber;
    if (dateRead != null) imports.push({ chapterKey: chapter.key, dateRead });
  }

  const merged: Manga = {
    ...target,
    ...detailed,
    key: detailed.key || target.key,
    title: detailed.title || target.title,
    cover: detailed.cover ?? target.cover,
  };

  await replaceLibraryEntry(
    { sourceId: origin.sourceId, mangaKey: origin.mangaKey },
    {
      sourceId: targetSource.id,
      mangaKey: merged.key,
      title: merged.title,
      cover: merged.cover,
    },
  );

  await importChapterReadStates(targetSource.id, merged.key, imports);

  const sameEntry =
    origin.sourceId === targetSource.id && origin.mangaKey === merged.key;
  if (!sameEntry) {
    try {
      const history = await getMangaHistoryForEntry(
        origin.sourceId,
        origin.mangaKey,
      );
      await Promise.all([
        removeMangaDownloads(origin.sourceId, origin.mangaKey),
        removeMangaHistoryGroup(
          origin.sourceId,
          origin.mangaKey,
          history.map((entry) => entry.chapterKey),
        ),
      ]);
    } catch {}
  }

  return { sourceRoute: `${targetSource.kind}:${targetSource.id}`, manga: merged };
}
