import * as FileSystem from 'expo-file-system/legacy';

import { getValue, setValue, storageKeys } from '@/constants/storage';
import { notifyMangaDataChanged } from '@/utils/manga-events';

export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed';

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

function downloadKey(sourceId: string, mangaKey: string, chapterKey: string): string {
  return `${sourceId}:${mangaKey}:${chapterKey}`;
}

function matchesDownload(
  entry: Pick<DownloadEntry, 'sourceId' | 'mangaKey' | 'chapterKey'>,
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
): boolean {
  return sameDownloadSource(entry.sourceId, sourceId) && entry.mangaKey === mangaKey && entry.chapterKey === chapterKey;
}

function sourceIdCandidates(sourceId: string): string[] {
  const stripped = sourceId.replace(/^(aidoku|tamdok):/, '');
  return stripped === sourceId ? [sourceId] : [sourceId, stripped];
}

function sameDownloadSource(a: string, b: string): boolean {
  return a === b || a.replace(/^(aidoku|tamdok):/, '') === b.replace(/^(aidoku|tamdok):/, '');
}

function toFileUri(path: string): string {
  if (path.startsWith('file:')) return path;
  if (path.startsWith('/')) return `file://${path}`;
  return path;
}

export function downloadDirectory(sourceId: string, mangaKey: string, chapterKey: string): string {
  return `${FileSystem.documentDirectory}Downloads/${sourceId}/${mangaKey}/${chapterKey}/`;
}

async function readStore(): Promise<DownloadStore> {
  return getValue<DownloadStore>(storageKeys.DOWNLOADS, { entries: [] });
}

async function writeStore(store: DownloadStore): Promise<void> {
  await setValue(storageKeys.DOWNLOADS, store);
  notifyMangaDataChanged();
}

export async function getDownloads(): Promise<DownloadEntry[]> {
  const store = await readStore();
  return [...store.entries].sort((a, b) => b.dateAdded - a.dateAdded);
}

export async function getMangaDownloads(sourceId: string, mangaKey: string): Promise<DownloadEntry[]> {
  const store = await readStore();
  return store.entries.filter((entry) => sameDownloadSource(entry.sourceId, sourceId) && entry.mangaKey === mangaKey);
}

export async function isChapterDownloaded(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
): Promise<boolean> {
  const store = await readStore();
  const entry = store.entries.find((item) => matchesDownload(item, sourceId, mangaKey, chapterKey));
  return entry?.status === 'completed';
}

export async function queueChapterDownload(
  entry: Pick<DownloadEntry, 'sourceId' | 'mangaKey' | 'chapterKey' | 'mangaTitle' | 'chapterTitle'>,
): Promise<void> {
  const store = await readStore();
  const key = downloadKey(entry.sourceId, entry.mangaKey, entry.chapterKey);
  const existing = store.entries.find(
    (item) => downloadKey(item.sourceId, item.mangaKey, item.chapterKey) === key,
  );
  if (existing && existing.status !== 'failed') return;

  if (existing) {
    existing.status = 'pending';
    existing.progress = 0;
    existing.error = undefined;
    existing.dateAdded = Date.now();
  } else {
    store.entries.push({
      ...entry,
      status: 'pending',
      progress: 0,
      dateAdded: Date.now(),
    });
  }

  await writeStore(store);
}

export async function updateDownloadStatus(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
  status: DownloadStatus,
  progress?: number,
  error?: string,
): Promise<void> {
  const store = await readStore();
  const key = downloadKey(sourceId, mangaKey, chapterKey);
  const entry = store.entries.find(
    (item) => downloadKey(item.sourceId, item.mangaKey, item.chapterKey) === key,
  );
  if (!entry) return;
  entry.status = status;
  if (progress != null) entry.progress = progress;
  if (error != null) entry.error = error;
  await writeStore(store);
}

export async function removeChapterDownload(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
): Promise<void> {
  const store = await readStore();
  const key = downloadKey(sourceId, mangaKey, chapterKey);
  store.entries = store.entries.filter(
    (item) => downloadKey(item.sourceId, item.mangaKey, item.chapterKey) !== key,
  );
  const dir = downloadDirectory(sourceId, mangaKey, chapterKey);
  const info = await FileSystem.getInfoAsync(dir);
  if (info.exists) {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }
  await writeStore(store);
}

export async function removeMangaDownloads(sourceId: string, mangaKey: string): Promise<void> {
  const store = await readStore();
  const toRemove = store.entries.filter(
    (entry) => entry.sourceId === sourceId && entry.mangaKey === mangaKey,
  );
  for (const entry of toRemove) {
    const dir = downloadDirectory(entry.sourceId, entry.mangaKey, entry.chapterKey);
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  }
  store.entries = store.entries.filter(
    (entry) => !(entry.sourceId === sourceId && entry.mangaKey === mangaKey),
  );
  await writeStore(store);
}

export async function saveDownloadedPages(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
  pageUrls: string[],
  headers?: Record<string, string>,
): Promise<void> {
  const dir = downloadDirectory(sourceId, mangaKey, chapterKey);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const manifest: string[] = [];
  const options = headers && Object.keys(headers).length > 0 ? { headers } : undefined;

  for (let index = 0; index < pageUrls.length; index += 1) {
    const url = pageUrls[index];
    if (!url) continue;
    const filename = `page_${String(index).padStart(4, '0')}.jpg`;
    const target = `${dir}${filename}`;
    await FileSystem.downloadAsync(url, target, options);
    manifest.push(target);
    await updateDownloadStatus(sourceId, mangaKey, chapterKey, 'downloading', (index + 1) / pageUrls.length);
  }

  await FileSystem.writeAsStringAsync(`${dir}manifest.json`, JSON.stringify(manifest));
  await updateDownloadStatus(sourceId, mangaKey, chapterKey, 'completed', 1);
}

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
      const existing = await Promise.all(urls.map(async (url) => (await FileSystem.getInfoAsync(url)).exists));
      if (!existing.some(Boolean)) continue;
      return urls;
    } catch {
      continue;
    }
  }
  return null;
}

export async function getDownloadStats(): Promise<{ total: number; completed: number; pending: number }> {
  const entries = await getDownloads();
  return {
    total: entries.length,
    completed: entries.filter((entry) => entry.status === 'completed').length,
    pending: entries.filter((entry) => entry.status === 'pending' || entry.status === 'downloading').length,
  };
}

export async function clearFailedDownloads(): Promise<void> {
  const store = await readStore();
  store.entries = store.entries.filter((entry) => entry.status !== 'failed');
  await writeStore(store);
}

export type DownloadPageList = {
  urls: string[];
  headers?: Record<string, string>;
};

let queueTail: Promise<void> = Promise.resolve();

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
    while (true) {
      const store = await readStore();
      const pending = store.entries
        .filter((entry) => entry.status === 'pending' || entry.status === 'downloading')
        .sort((a, b) => a.dateAdded - b.dateAdded)
        .slice(0, limit);
      if (pending.length === 0) break;

      for (const entry of pending) {
        try {
          await updateDownloadStatus(entry.sourceId, entry.mangaKey, entry.chapterKey, 'downloading', 0);
          const fetched = await fetchPages(
            entry.sourceId,
            entry.mangaKey,
            entry.chapterKey,
            entry.mangaTitle,
            entry.chapterTitle,
          );
          const urls = Array.isArray(fetched) ? fetched : fetched.urls;
          const headers = Array.isArray(fetched) ? undefined : fetched.headers;
          if (urls.length === 0) {
            await updateDownloadStatus(entry.sourceId, entry.mangaKey, entry.chapterKey, 'failed', 0, 'No pages');
            continue;
          }
          await saveDownloadedPages(entry.sourceId, entry.mangaKey, entry.chapterKey, urls, headers);
        } catch (error) {
          await updateDownloadStatus(
            entry.sourceId,
            entry.mangaKey,
            entry.chapterKey,
            'failed',
            undefined,
            error instanceof Error ? error.message : 'Download failed',
          );
        }
      }
    }
  });
  queueTail = run.catch(() => undefined);
  await run;
}
