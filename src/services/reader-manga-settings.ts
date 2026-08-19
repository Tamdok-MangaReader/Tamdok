import { getValue, setValue } from '@/constants/storage';
import type { ReadingMode } from '@/services/app-settings';

const READING_MODE_KEY = 'reader_manga_reading_mode_v1';
const PAGE_OFFSET_KEY = 'reader_manga_page_offset_v1';

type ReadingModeStore = Record<string, ReadingMode | 'default'>;
type PageOffsetStore = Record<string, boolean | null>;

function mangaSettingsKey(sourceId: string, mangaKey: string): string {
  return `${sourceId}:${mangaKey}`;
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
