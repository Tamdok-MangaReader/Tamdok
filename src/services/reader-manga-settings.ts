import { getValue, setValue } from '@/constants/storage';
import type { ReadingMode, ResolvedReadingMode } from '@/services/app-settings';

const READING_MODE_KEY = 'reader_manga_reading_mode_v1';
const AUTO_RESOLVED_MODE_KEY = 'reader_manga_auto_resolved_mode_v1';
const PAGE_OFFSET_KEY = 'reader_manga_page_offset_v1';

type ReadingModeStore = Record<string, ReadingMode | 'default'>;
type AutoResolvedModeStore = Record<string, ResolvedReadingMode>;
type PageOffsetStore = Record<string, boolean | null>;

const RESOLVED_MODES: ResolvedReadingMode[] = ['rtl', 'ltr', 'vertical', 'webtoon', 'continuous'];

function mangaSettingsKey(sourceId: string, mangaKey: string): string {
  return `${sourceId}:${mangaKey}`;
}

function isResolvedReadingMode(value: unknown): value is ResolvedReadingMode {
  return typeof value === 'string' && RESOLVED_MODES.includes(value as ResolvedReadingMode);
}

export async function getMangaReadingMode(
  sourceId: string,
  mangaKey: string,
): Promise<ReadingMode | 'default' | null> {
  const store = await getValue<ReadingModeStore>(READING_MODE_KEY, {});
  return store[mangaSettingsKey(sourceId, mangaKey)] ?? null;
}

export async function setMangaReadingMode(
  sourceId: string,
  mangaKey: string,
  mode: ReadingMode | 'default',
): Promise<void> {
  const store = await getValue<ReadingModeStore>(READING_MODE_KEY, {});
  const key = mangaSettingsKey(sourceId, mangaKey);
  if (mode === 'default') {
    delete store[key];
  } else {
    store[key] = mode;
  }
  await setValue(READING_MODE_KEY, store);
}

export async function getMangaAutoResolvedMode(
  sourceId: string,
  mangaKey: string,
): Promise<ResolvedReadingMode | null> {
  const store = await getValue<AutoResolvedModeStore>(AUTO_RESOLVED_MODE_KEY, {});
  const value = store[mangaSettingsKey(sourceId, mangaKey)];
  return isResolvedReadingMode(value) ? value : null;
}

export async function setMangaAutoResolvedMode(
  sourceId: string,
  mangaKey: string,
  mode: ResolvedReadingMode,
): Promise<void> {
  const store = await getValue<AutoResolvedModeStore>(AUTO_RESOLVED_MODE_KEY, {});
  store[mangaSettingsKey(sourceId, mangaKey)] = mode;
  await setValue(AUTO_RESOLVED_MODE_KEY, store);
}

export async function getMangaPageOffset(sourceId: string, mangaKey: string): Promise<boolean | null> {
  const store = await getValue<PageOffsetStore>(PAGE_OFFSET_KEY, {});
  const value = store[mangaSettingsKey(sourceId, mangaKey)];
  return value ?? null;
}

export async function setMangaPageOffset(
  sourceId: string,
  mangaKey: string,
  enabled: boolean | null,
): Promise<void> {
  const store = await getValue<PageOffsetStore>(PAGE_OFFSET_KEY, {});
  const key = mangaSettingsKey(sourceId, mangaKey);
  if (enabled == null) {
    delete store[key];
  } else {
    store[key] = enabled;
  }
  await setValue(PAGE_OFFSET_KEY, store);
}
