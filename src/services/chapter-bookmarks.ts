import { getValue, setValue } from "@/constants/storage";
import { notifyMangaDataChanged } from "@/utils/manga-events";

const BOOKMARKS_KEY = "chapter_bookmarks_v1";
const SOURCE_PREFIX = /^(aidoku|tamdok):/;

type BookmarkStore = Record<string, string[]>;

let queue: Promise<unknown> = Promise.resolve();

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function mangaStoreKey(sourceId: string, mangaKey: string): string {
  return `${sourceId.replace(SOURCE_PREFIX, "")}:${safeDecode(mangaKey)}`;
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.catch(() => undefined).then(task);
  queue = run.catch(() => undefined);
  return run;
}

async function readStore(): Promise<BookmarkStore> {
  const store = await getValue<BookmarkStore>(BOOKMARKS_KEY, {});
  return store && typeof store === "object" ? store : {};
}

export function getBookmarkedChapterKeys(
  sourceId: string,
  mangaKey: string,
): Promise<Set<string>> {
  return enqueue(async () => {
    const store = await readStore();
    return new Set(store[mangaStoreKey(sourceId, mangaKey)] ?? []);
  });
}

export function toggleChapterBookmark(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
): Promise<boolean> {
  return enqueue(async () => {
    const store = await readStore();
    const key = mangaStoreKey(sourceId, mangaKey);
    const current = new Set(store[key] ?? []);
    const nextState = !current.has(chapterKey);
    if (nextState) current.add(chapterKey);
    else current.delete(chapterKey);
    const next: BookmarkStore = { ...store };
    if (current.size > 0) next[key] = [...current];
    else delete next[key];
    await setValue(BOOKMARKS_KEY, next);
    notifyMangaDataChanged();
    return nextState;
  });
}
