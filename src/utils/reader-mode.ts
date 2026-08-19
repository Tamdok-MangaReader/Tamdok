import type { Viewer } from '@/parsers/shared/types';
import type { ReaderSettings, ReadingMode, ResolvedReadingMode } from '@/services/app-settings';

const WEBTOON_HEIGHT_RATIO = 1.85;

/** Priority: per-manga override, then global setting, then source viewer metadata. */
export function resolveReadingMode(
  settings: ReaderSettings,
  mangaOverride: ReadingMode | 'default' | null | undefined,
  mangaViewer?: Viewer,
): ResolvedReadingMode {
  const override = mangaOverride && mangaOverride !== 'default' ? mangaOverride : null;

  if (override && override !== 'auto') {
    return normalizeMode(override, mangaViewer);
  }

  const global = settings.readingMode;
  if (override === 'auto' || global === 'auto') {
    if (mangaViewer && mangaViewer !== 'default') {
      return normalizeMode(mangaViewer, mangaViewer);
    }
    return 'continuous';
  }

  if (global === 'default') {
    if (mangaViewer && mangaViewer !== 'default') {
      return normalizeMode(mangaViewer, mangaViewer);
    }
    return 'continuous';
  }

  return normalizeMode(global, mangaViewer);
}

export function shouldInferModeFromImages(
  settings: ReaderSettings,
  mangaOverride: ReadingMode | 'default' | null | undefined,
): boolean {
  if (mangaOverride && mangaOverride !== 'default' && mangaOverride !== 'auto') return false;
  return mangaOverride === 'auto' || settings.readingMode === 'auto';
}

/** Tall pages (webtoon aspect) push the reader into vertical strip mode. */
export function inferReadingModeFromImageSizes(
  sizes: Array<{ width: number; height: number }>,
): ResolvedReadingMode {
  const usable = sizes.filter((item) => item.width > 0 && item.height > 0);
  if (usable.length === 0) return 'rtl';
  const averageHeightRatio =
    usable.reduce((sum, item) => sum + item.height / item.width, 0) / usable.length;
  if (averageHeightRatio >= WEBTOON_HEIGHT_RATIO) return 'webtoon';
  return 'rtl';
}

function normalizeMode(mode: ReadingMode | Viewer, mangaViewer?: Viewer): ResolvedReadingMode {
  if (mode === 'auto' || mode === 'default') {
    if (mangaViewer && mangaViewer !== 'default') {
      return mangaViewer as ResolvedReadingMode;
    }
    return 'continuous';
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
