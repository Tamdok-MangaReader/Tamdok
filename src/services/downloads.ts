import * as FileSystem from "expo-file-system/legacy";

import { getValue, setValue, storageKeys } from "@/constants/storage";
import { getAppSettings } from "@/services/app-settings";
import { isOnWifi } from "@/services/network";
import { notifyMangaDataChanged } from "@/utils/manga-events";

export type DownloadStatus = "pending" | "downloading" | "completed" | "failed";

export type DownloadEntry = {
  sourceId: string;
  mangaKey: string;
  chapterKey: string;
  mangaTitle: string;
  chapterTitle?: string;
  status: DownloadStatus;
  progress: number;
  dateAdded: number;
  error?: string;
};

type DownloadStore = {
  entries: DownloadEntry[];
};

export type QueueDownloadInput = Pick<
  DownloadEntry,
  "sourceId" | "mangaKey" | "chapterKey" | "mangaTitle" | "chapterTitle"
>;

// Pages of one chapter are downloaded in parallel with this many workers.
const PAGE_CONCURRENCY = 4;
// Per-page progress updates are batched: listeners are notified at most this often.
const PROGRESS_NOTIFY_MS = 500;
const SOURCE_PREFIX = /^(aidoku|tamdok):/;

// The download list is persisted as one JSON document and mirrored in memory. All writes go through
// mutateStore, which serialises them (mutationTail) so concurrent updates never overwrite each other.
let cache: DownloadStore | null = null;
let cacheLoad: Promise<DownloadStore> | null = null;
let mutationTail: Promise<void> = Promise.resolve();

function loadStore(): Promise<DownloadStore> {
  if (cache) return Promise.resolve(cache);
  if (!cacheLoad) {
    cacheLoad = getValue<DownloadStore>(storageKeys.DOWNLOADS, { entries: [] })
      .then((stored) => {
        const store: DownloadStore = {
          entries: Array.isArray(stored?.entries) ? stored.entries : [],
        };
        cache = store;
        return store;
      })
      .finally(() => {
        cacheLoad = null;
      });
  }
  return cacheLoad;
}

export function invalidateDownloadsCache(): void {
  cache = null;
}

// `apply` mutates the in-memory store and returns whether anything changed; only then it is
// persisted and listeners are notified.
function mutateStore(
  apply: (store: DownloadStore) => boolean,
  persist = true,
): Promise<void> {
  const run = mutationTail.then(async () => {
    const store = await loadStore();
    if (!apply(store)) return;
    if (persist) await setValue(storageKeys.DOWNLOADS, store);
    notifyMangaDataChanged();
  });
  mutationTail = run.catch(() => undefined);
  return run;
}

function downloadKey(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
): string {
  return `${sourceId}:${mangaKey}:${chapterKey}`;
}

function findEntry(
  store: DownloadStore,
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
): DownloadEntry | undefined {
  return store.entries.find(
    (item) =>
      item.sourceId === sourceId &&
      item.mangaKey === mangaKey &&
      item.chapterKey === chapterKey,
  );
}

function matchesDownload(
  entry: Pick<DownloadEntry, "sourceId" | "mangaKey" | "chapterKey">,
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
): boolean {
  return (
    sameDownloadSource(entry.sourceId, sourceId) &&
    entry.mangaKey === mangaKey &&
    entry.chapterKey === chapterKey
  );
}

// Older data may have been stored with or without the `aidoku:`/`tamdok:` prefix, so lookups try both.
function sourceIdCandidates(sourceId: string): string[] {
  const stripped = sourceId.replace(SOURCE_PREFIX, "");
  return stripped === sourceId ? [sourceId] : [sourceId, stripped];
}

function sameDownloadSource(a: string, b: string): boolean {
  return (
    a === b || a.replace(SOURCE_PREFIX, "") === b.replace(SOURCE_PREFIX, "")
  );
}

function toFileUri(path: string): string {
  if (path.startsWith("file:")) return path;
  if (path.startsWith("/")) return `file://${path}`;
  return path;
}

export function downloadDirectory(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
): string {
  return `${FileSystem.documentDirectory}Downloads/${sourceId}/${mangaKey}/${chapterKey}/`;
}

export async function getDownloads(): Promise<DownloadEntry[]> {
  const store = await loadStore();
  return store.entries
    .map((entry) => ({ ...entry }))
    .sort((a, b) => b.dateAdded - a.dateAdded);
}

export async function getMangaDownloads(
  sourceId: string,
  mangaKey: string,
): Promise<DownloadEntry[]> {
  const store = await loadStore();
  const result: DownloadEntry[] = [];
  for (const entry of store.entries) {
    if (
      sameDownloadSource(entry.sourceId, sourceId) &&
      entry.mangaKey === mangaKey
    ) {
      result.push({ ...entry });
    }
  }
  return result;
}

export async function isChapterDownloaded(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
): Promise<boolean> {
  const store = await loadStore();
  const entry = store.entries.find((item) =>
    matchesDownload(item, sourceId, mangaKey, chapterKey),
  );
  return entry?.status === "completed";
}

export async function queueChapterDownloads(
  entries: QueueDownloadInput[],
): Promise<void> {
  if (entries.length === 0) return;

  await mutateStore((store) => {
    const index = new Map<string, DownloadEntry>();
    for (const item of store.entries) {
      index.set(
        downloadKey(item.sourceId, item.mangaKey, item.chapterKey),
        item,
      );
    }

    const now = Date.now();
    let changed = false;

    entries.forEach((entry, order) => {
      const key = downloadKey(entry.sourceId, entry.mangaKey, entry.chapterKey);
      const existing = index.get(key);
      if (existing && existing.status !== "failed") return;

      const dateAdded = now + order;
      if (existing) {
        existing.status = "pending";
        existing.progress = 0;
        existing.error = undefined;
        existing.dateAdded = dateAdded;
      } else {
        const created: DownloadEntry = {
          ...entry,
          status: "pending",
          progress: 0,
          dateAdded,
        };
        store.entries.push(created);
        index.set(key, created);
      }
      changed = true;
    });

    return changed;
  });
}

export async function queueChapterDownload(
  entry: QueueDownloadInput,
): Promise<void> {
  await queueChapterDownloads([entry]);
}

export async function updateDownloadStatus(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
  status: DownloadStatus,
  progress?: number,
  error?: string,
): Promise<void> {
  await mutateStore((store) => {
    const entry = findEntry(store, sourceId, mangaKey, chapterKey);
    if (!entry) return false;
    entry.status = status;
    if (progress != null) entry.progress = progress;
    if (error != null) entry.error = error;
    return true;
  });
}

let progressTimer: ReturnType<typeof setTimeout> | null = null;

// Hot path (called after every page): only updates memory and schedules a throttled notification,
// without writing to storage.
function reportProgress(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
  progress: number,
): void {
  if (!cache) return;
  const entry = findEntry(cache, sourceId, mangaKey, chapterKey);
  if (!entry) return;
  entry.progress = progress;
  if (progressTimer) return;
  progressTimer = setTimeout(() => {
    progressTimer = null;
    notifyMangaDataChanged();
  }, PROGRESS_NOTIFY_MS);
}

export async function removeChapterDownload(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
): Promise<void> {
  await mutateStore((store) => {
    const before = store.entries.length;
    store.entries = store.entries.filter(
      (item) =>
        !(
          item.sourceId === sourceId &&
          item.mangaKey === mangaKey &&
          item.chapterKey === chapterKey
        ),
    );
    return store.entries.length !== before;
  });
  await FileSystem.deleteAsync(
    downloadDirectory(sourceId, mangaKey, chapterKey),
    {
      idempotent: true,
    },
  );
}

export async function removeMangaDownloads(
  sourceId: string,
  mangaKey: string,
): Promise<void> {
  const removed: DownloadEntry[] = [];

  await mutateStore((store) => {
    const keep: DownloadEntry[] = [];
    for (const entry of store.entries) {
      if (
        sameDownloadSource(entry.sourceId, sourceId) &&
        entry.mangaKey === mangaKey
      ) {
        removed.push(entry);
      } else {
        keep.push(entry);
      }
    }
    if (removed.length === 0) return false;
    store.entries = keep;
    return true;
  });

  await Promise.all(
    removed.map((entry) =>
      FileSystem.deleteAsync(
        downloadDirectory(entry.sourceId, entry.mangaKey, entry.chapterKey),
        { idempotent: true },
      ),
    ),
  );
}

export async function clearFailedDownloads(): Promise<void> {
  await mutateStore((store) => {
    const before = store.entries.length;
    store.entries = store.entries.filter((entry) => entry.status !== "failed");
    return store.entries.length !== before;
  });
}

// Downloads all pages with a small worker pool. The first failure stops the other workers (`failed`)
// and rejects, which marks the chapter as failed. Files are stored as page_0000.jpg, ... plus a
// manifest.json listing them in reading order; the entry is marked completed only after the manifest is written.
export async function saveDownloadedPages(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
  pageUrls: string[],
  headers?: Record<string, string>,
  pageHeaders?: (Record<string, string> | undefined)[],
): Promise<void> {
  const dir = downloadDirectory(sourceId, mangaKey, chapterKey);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const files: (string | null)[] = new Array(pageUrls.length).fill(null);
  let nextIndex = 0;
  let finished = 0;
  let failed = false;

  const worker = async (): Promise<void> => {
    while (!failed) {
      const index = nextIndex++;
      if (index >= pageUrls.length) return;

      const url = pageUrls[index];
      if (url) {
        const target = `${dir}page_${String(index).padStart(4, "0")}.jpg`;
        try {
          const merged = { ...headers, ...pageHeaders?.[index] };
          const options =
            Object.keys(merged).length > 0 ? { headers: merged } : undefined;
          const result = await FileSystem.downloadAsync(url, target, options);
          if (result.status < 200 || result.status >= 300) {
            throw new Error(`HTTP ${result.status}`);
          }
          files[index] = target;
        } catch (error) {
          failed = true;
          throw error;
        }
      }

      finished += 1;
      reportProgress(
        sourceId,
        mangaKey,
        chapterKey,
        finished / pageUrls.length,
      );
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(PAGE_CONCURRENCY, pageUrls.length) }, () =>
      worker(),
    ),
  );

  const manifest = files.filter((file): file is string => file !== null);
  await FileSystem.writeAsStringAsync(
    `${dir}manifest.json`,
    JSON.stringify(manifest),
  );
  await updateDownloadStatus(sourceId, mangaKey, chapterKey, "completed", 1);
}

// Returns file:// URLs for an offline chapter, or null if it is not (fully) available. At least one
// file must really exist, which protects against the OS purging files while the entry says completed.
export async function getDownloadedPageUrls(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
): Promise<string[] | null> {
  const downloaded = await isChapterDownloaded(sourceId, mangaKey, chapterKey);
  if (!downloaded) return null;

  for (const id of sourceIdCandidates(sourceId)) {
    const dir = downloadDirectory(id, mangaKey, chapterKey);
    const manifestPath = `${dir}manifest.json`;
    const info = await FileSystem.getInfoAsync(manifestPath);
    if (!info.exists) continue;
    try {
      const raw = await FileSystem.readAsStringAsync(manifestPath);
      const urls = (JSON.parse(raw) as string[]).map(toFileUri);
      if (urls.length === 0) continue;

      let anyExists = false;
      for (const url of urls) {
        if ((await FileSystem.getInfoAsync(url)).exists) {
          anyExists = true;
          break;
        }
      }
      if (!anyExists) continue;
      return urls;
    } catch {
      continue;
    }
  }
  return null;
}

export async function getDownloadStats(): Promise<{
  total: number;
  completed: number;
  pending: number;
}> {
  const store = await loadStore();
  let completed = 0;
  let pending = 0;
  for (const entry of store.entries) {
    if (entry.status === "completed") completed += 1;
    else if (entry.status === "pending" || entry.status === "downloading")
      pending += 1;
  }
  return { total: store.entries.length, completed, pending };
}

export type DownloadPageList = {
  urls: string[];
  headers?: Record<string, string>;
  pageHeaders?: (Record<string, string> | undefined)[];
};

// The queue is processed by a single chain of promises (queueTail) so two runs never overlap.
// `queueGeneration` lets a reset invalidate a run that is already in progress.
let queueTail: Promise<void> = Promise.resolve();
let queueGeneration = 0;

export async function getActiveDownloads(): Promise<DownloadEntry[]> {
  const store = await loadStore();
  return store.entries.filter(
    (entry) => entry.status === "pending" || entry.status === "downloading",
  );
}

export async function getFailedDownloads(): Promise<DownloadEntry[]> {
  const store = await loadStore();
  return store.entries.filter((entry) => entry.status === "failed");
}

export async function hasUnfinishedDownloads(): Promise<boolean> {
  const store = await loadStore();
  return store.entries.some(
    (entry) => entry.status === "pending" || entry.status === "downloading",
  );
}

// After the app was killed or suspended, entries can be stuck in `downloading` with nothing running.
// Bumping the generation stops any old run; stuck entries go back to `pending` so they restart.
export async function resetStuckDownloadQueue(): Promise<void> {
  queueGeneration += 1;
  queueTail = Promise.resolve();
  await mutateStore((store) => {
    let changed = false;
    for (const entry of store.entries) {
      if (entry.status === "downloading") {
        entry.status = "pending";
        entry.progress = 0;
        changed = true;
      }
    }
    return changed;
  });
}

// Takes pending entries oldest-first, a few at a time, and keeps looping until none are left.
// `fetchPages` is injected so this module does not depend on source runtimes. Failures are recorded
// per chapter and do not stop the rest of the queue. Wi-Fi-only mode stops the run when not on Wi-Fi.
export async function processDownloadQueue(
  fetchPages: (
    sourceId: string,
    mangaKey: string,
    chapterKey: string,
    mangaTitle: string,
    chapterTitle?: string,
  ) => Promise<DownloadPageList | string[]>,
  limit = 3,
): Promise<void> {
  const run = queueTail.then(async () => {
    const generation = queueGeneration;
    while (true) {
      if (generation !== queueGeneration) break;
      const appSettings = await getAppSettings();
      if (appSettings.downloads.downloadOnlyOnWifi && !(await isOnWifi()))
        break;
      const store = await loadStore();
      const pending = store.entries
        .filter(
          (entry) =>
            entry.status === "pending" || entry.status === "downloading",
        )
        .sort((a, b) => a.dateAdded - b.dateAdded)
        .slice(0, limit);
      if (pending.length === 0) break;

      for (const entry of pending) {
        if (generation !== queueGeneration) break;
        try {
          await updateDownloadStatus(
            entry.sourceId,
            entry.mangaKey,
            entry.chapterKey,
            "downloading",
            0,
          );
          const fetched = await fetchPages(
            entry.sourceId,
            entry.mangaKey,
            entry.chapterKey,
            entry.mangaTitle,
            entry.chapterTitle,
          );
          const urls = Array.isArray(fetched) ? fetched : fetched.urls;
          const headers = Array.isArray(fetched) ? undefined : fetched.headers;
          const pageHeaders = Array.isArray(fetched)
            ? undefined
            : fetched.pageHeaders;
          if (urls.length === 0) {
            await updateDownloadStatus(
              entry.sourceId,
              entry.mangaKey,
              entry.chapterKey,
              "failed",
              0,
              "No pages",
            );
            continue;
          }
          await saveDownloadedPages(
            entry.sourceId,
            entry.mangaKey,
            entry.chapterKey,
            urls,
            headers,
            pageHeaders,
          );
        } catch (error) {
          await updateDownloadStatus(
            entry.sourceId,
            entry.mangaKey,
            entry.chapterKey,
            "failed",
            undefined,
            error instanceof Error ? error.message : "Download failed",
          );
        }
      }
    }
  });
  queueTail = run.catch(() => undefined);
  await run;
}
