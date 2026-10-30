import { getValue, setValue } from "@/constants/storage";
import type { ReadingMode, ResolvedReadingMode } from "@/services/app-settings";

const READING_MODE_KEY = "reader_manga_reading_mode_v1";
const AUTO_RESOLVED_MODE_KEY = "reader_manga_auto_resolved_mode_v1";
const PAGE_OFFSET_KEY = "reader_manga_page_offset_v1";
const SLOW_MODE_KEY = "reader_manga_slow_mode_v1";

type ReadingModeStore = Record<string, ReadingMode | "default">;
type AutoResolvedModeStore = Record<string, ResolvedReadingMode>;
type PageOffsetStore = Record<string, boolean | null>;

const RESOLVED_MODES: ResolvedReadingMode[] = [
  "rtl",
  "ltr",
  "vertical",
  "webtoon",
  "continuous",
];
const SOURCE_PREFIX = /^(aidoku|tamdok):/;

const queues = new Map<string, Promise<unknown>>();

function enqueue<T>(storageKey: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(storageKey) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  queues.set(
    storageKey,
    run.catch(() => undefined),
  );
  return run;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeEncode(value: string): string {
  try {
    return encodeURIComponent(value);
  } catch {
    return value;
  }
}

function canonicalKey(sourceId: string, mangaKey: string): string {
  return `${sourceId.replace(SOURCE_PREFIX, "")}:${safeDecode(mangaKey)}`;
}

function candidateKeys(sourceId: string, mangaKey: string): string[] {
  const stripped = sourceId.replace(SOURCE_PREFIX, "");
  const sources = [
    stripped,
    sourceId,
    `aidoku:${stripped}`,
    `tamdok:${stripped}`,
  ];
  const mangaKeys = [safeDecode(mangaKey), mangaKey, safeEncode(mangaKey)];
  const keys = new Set<string>([canonicalKey(sourceId, mangaKey)]);
  for (const source of sources) {
    for (const key of mangaKeys) keys.add(`${source}:${key}`);
  }
  return [...keys];
}

function readEntry<T>(
  store: Record<string, T>,
  candidates: string[],
): T | undefined {
  for (const key of candidates) {
    const value = store[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function isResolvedReadingMode(value: unknown): value is ResolvedReadingMode {
  return (
    typeof value === "string" &&
    RESOLVED_MODES.includes(value as ResolvedReadingMode)
  );
}

async function readStore<T extends Record<string, unknown>>(
  storageKey: string,
): Promise<T> {
  return enqueue(storageKey, async () => {
    const store = await getValue<T>(storageKey, {} as T);
    return store && typeof store === "object" ? store : ({} as T);
  });
}

async function updateStore<T extends Record<string, unknown>>(
  storageKey: string,
  sourceId: string,
  mangaKey: string,
  value: T[string] | undefined,
): Promise<void> {
  await enqueue(storageKey, async () => {
    const current = await getValue<T>(storageKey, {} as T);
    const next: Record<string, unknown> = {
      ...(current && typeof current === "object" ? current : {}),
    };
    for (const key of candidateKeys(sourceId, mangaKey)) delete next[key];
    if (value !== undefined) next[canonicalKey(sourceId, mangaKey)] = value;
    await setValue(storageKey, next as T);
  });
}

export async function getMangaReadingMode(
  sourceId: string,
  mangaKey: string,
): Promise<ReadingMode | "default" | null> {
  const store = await readStore<ReadingModeStore>(READING_MODE_KEY);
  return readEntry(store, candidateKeys(sourceId, mangaKey)) ?? null;
}

export async function setMangaReadingMode(
  sourceId: string,
  mangaKey: string,
  mode: ReadingMode | "default",
): Promise<void> {
  await updateStore<ReadingModeStore>(
    READING_MODE_KEY,
    sourceId,
    mangaKey,
    mode === "default" ? undefined : mode,
  );
}

export async function getMangaAutoResolvedMode(
  sourceId: string,
  mangaKey: string,
): Promise<ResolvedReadingMode | null> {
  const store = await readStore<AutoResolvedModeStore>(AUTO_RESOLVED_MODE_KEY);
  const value = readEntry(store, candidateKeys(sourceId, mangaKey));
  return isResolvedReadingMode(value) ? value : null;
}

export async function setMangaAutoResolvedMode(
  sourceId: string,
  mangaKey: string,
  mode: ResolvedReadingMode,
): Promise<void> {
  await updateStore<AutoResolvedModeStore>(
    AUTO_RESOLVED_MODE_KEY,
    sourceId,
    mangaKey,
    mode,
  );
}

export async function getMangaPageOffset(
  sourceId: string,
  mangaKey: string,
): Promise<boolean | null> {
  const store = await readStore<PageOffsetStore>(PAGE_OFFSET_KEY);
  return readEntry(store, candidateKeys(sourceId, mangaKey)) ?? null;
}

export async function setMangaPageOffset(
  sourceId: string,
  mangaKey: string,
  enabled: boolean | null,
): Promise<void> {
  await updateStore<PageOffsetStore>(
    PAGE_OFFSET_KEY,
    sourceId,
    mangaKey,
    enabled == null ? undefined : enabled,
  );
}

export async function getMangaSlowMode(
  sourceId: string,
  mangaKey: string,
): Promise<boolean> {
  const store = await readStore<PageOffsetStore>(SLOW_MODE_KEY);
  return readEntry(store, candidateKeys(sourceId, mangaKey)) === true;
}

export async function setMangaSlowMode(
  sourceId: string,
  mangaKey: string,
  enabled: boolean,
): Promise<void> {
  await updateStore<PageOffsetStore>(
    SLOW_MODE_KEY,
    sourceId,
    mangaKey,
    enabled ? true : undefined,
  );
}
