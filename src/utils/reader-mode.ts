import type { Manga, Viewer } from '@/parsers/shared/types';
import type { ReaderSettings, ReadingMode, ResolvedReadingMode } from '@/services/app-settings';

const TALL_RATIO = 1.5;
const VERY_TALL_RATIO = 1.8;
const BANNER_MAX_RATIO = 0.85;

const WEBTOON_HINTS = [
  'манхва',
  'маньхуа',
  'manhwa',
  'manhua',
  'manwha',
  'webtoon',
  'вебтун',
  '웹툰',
  'longstrip',
  'long strip',
];

const MANGA_HINTS = ['манга', 'manga', 'додзинси', 'doujinshi', 'doujin'];

type MangaHint = Pick<Manga, 'viewer' | 'tags' | 'title'>;

/** Priority: per-manga override, then global setting, then title type / source viewer. */
export function resolveReadingMode(
  settings: ReaderSettings,
  mangaOverride: ReadingMode | 'default' | null | undefined,
  manga?: MangaHint,
): ResolvedReadingMode {
  const override = mangaOverride && mangaOverride !== 'default' ? mangaOverride : null;

  if (override && override !== 'auto') {
    return normalizeMode(override, manga?.viewer);
  }

  const global = settings.readingMode;
  if (override === 'auto' || global === 'auto') {
    return inferReadingModeFromManga(manga) ?? 'rtl';
  }

  if (global === 'default') {
    return inferReadingModeFromManga(manga) ?? 'rtl';
  }

  return normalizeMode(global, manga?.viewer);
}

export function shouldInferModeFromImages(
  settings: ReaderSettings,
  mangaOverride: ReadingMode | 'default' | null | undefined,
): boolean {
  if (mangaOverride && mangaOverride !== 'default' && mangaOverride !== 'auto') return false;
  return mangaOverride === 'auto' || settings.readingMode === 'auto';
}

/** Tags/viewer first: manhwa/webtoon scroll down, manga reads rtl. */
export function inferReadingModeFromManga(manga?: MangaHint): ResolvedReadingMode | null {
  if (!manga) return null;

  if (manga.viewer === 'webtoon' || manga.viewer === 'vertical') return 'continuous';
  if (manga.viewer === 'rtl') return 'rtl';
  if (manga.viewer === 'ltr') return 'ltr';

  const tags = (manga.tags ?? []).map((tag) => normalizeHintText(tag.trim())).filter(Boolean);
  if (tags.some((tag) => matchesHintList(tag, WEBTOON_HINTS))) return 'continuous';
  if (tags.some((tag) => matchesHintList(tag, MANGA_HINTS))) return 'rtl';

  const title = normalizeHintText(manga.title ?? '');
  if (title && WEBTOON_HINTS.some((hint) => hasHintWord(title, hint))) return 'continuous';
  if (title && MANGA_HINTS.some((hint) => hasHintWord(title, hint))) return 'rtl';
  return null;
}

/** Skip translator banners: short/wide first pages shouldn't decide the mode. */
export function isBannerImageSize(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return true;
  return height / width < BANNER_MAX_RATIO;
}

/** Prefer pages after the opening banner when the chapter has more than one image. */
export function pagesForAutoModeProbe<T extends { url?: string }>(pages: T[]): T[] {
  const withUrl = pages.filter((page) => Boolean(page.url));
  if (withUrl.length >= 2) return withUrl.slice(1, 4);
  return withUrl.slice(0, 3);
}

/** Tall pages (webtoon aspect) push the reader into vertical strip mode. */
export function inferReadingModeFromImageSizes(
  sizes: Array<{ width: number; height: number }>,
): { mode: ResolvedReadingMode; confident: boolean } {
  const content = sizes.filter((item) => item.width >= 16 && item.height >= 16 && !isBannerImageSize(item.width, item.height));
  if (content.length === 0) return { mode: 'rtl', confident: false };

  const ratios = content.map((item) => item.height / item.width);
  const maxRatio = Math.max(...ratios);
  const tallCount = ratios.filter((ratio) => ratio >= TALL_RATIO).length;

  if (maxRatio >= VERY_TALL_RATIO) return { mode: 'continuous', confident: true };
  if (tallCount >= 1 && content.length >= 2 && tallCount / content.length >= 0.5) {
    return { mode: 'continuous', confident: true };
  }
  if (tallCount === 0 && content.length >= 2) return { mode: 'rtl', confident: true };
  return { mode: maxRatio >= TALL_RATIO ? 'continuous' : 'rtl', confident: false };
}

export function pickAutoReadingMode(
  fromManga: ResolvedReadingMode | null,
  fromImages: { mode: ResolvedReadingMode; confident: boolean } | null,
): ResolvedReadingMode {
  if (fromImages?.mode === 'continuous' && fromImages.confident) return 'continuous';
  if (fromManga === 'continuous') return 'continuous';
  if (fromImages?.confident) return fromImages.mode;
  if (fromManga) return fromManga;
  if (fromImages) return fromImages.mode;
  return 'rtl';
}

function normalizeHintText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesHintList(value: string, hints: string[]): boolean {
  return hints.some((hint) => value === hint || value.includes(hint));
}

function hasHintWord(haystack: string, hint: string): boolean {
  const index = haystack.indexOf(hint);
  if (index < 0) return false;
  const before = haystack[index - 1];
  const after = haystack[index + hint.length];
  const boundary = (char?: string) => !char || /[^a-zа-я0-9]/.test(char);
  return boundary(before) && boundary(after);
}

function normalizeMode(mode: ReadingMode | Viewer, mangaViewer?: Viewer): ResolvedReadingMode {
  if (mode === 'auto' || mode === 'default') {
    return inferReadingModeFromManga({ viewer: mangaViewer, title: '' }) ?? 'rtl';
  }
  return mode as ResolvedReadingMode;
}

export function isStripMode(mode: ResolvedReadingMode): boolean {
  return mode === 'webtoon' || mode === 'continuous';
}

export function isWebtoonMode(mode: ResolvedReadingMode): boolean {
  return isStripMode(mode);
}

export function isPagedMode(mode: ResolvedReadingMode): boolean {
  return mode === 'rtl' || mode === 'ltr' || mode === 'vertical';
}

export function isTextChapter(pages: Array<{ url?: string; text?: string }>): boolean {
  return pages.length > 0 && pages.every((page) => !page.url && !!page.text);
}
