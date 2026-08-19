/** Keep YYYYMMDD-style numbers; drop timestamps, snowflakes, and other huge IDs. */
const MAX_PLAUSIBLE_CHAPTER = 1_000_000_000;

/** Drop float noise like 16.000023434571 that f32/API math leaves behind. */
export function sanitizeChapterNumber(value?: number | null): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value * 1000) / 1000;
  if (!Number.isFinite(rounded) || Math.abs(rounded) >= MAX_PLAUSIBLE_CHAPTER) return undefined;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatChapterNumberValue(value: number): string {
  const n = sanitizeChapterNumber(value);
  if (n == null) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

/** Source keys/IDs like 108483889558806971 are not chapter numbers. */
export function looksLikeOpaqueChapterId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return true;
  const lastSegment = trimmed.split(/[/\\?#]/).pop()?.split('&')[0] ?? trimmed;
  if (/^\d{10,}$/.test(trimmed) || /^\d{10,}$/.test(lastSegment)) return true;
  return false;
}

/** Collapse noisy decimals in titles like "Глава 16.000023434571". */
export function sanitizeChapterDisplayText(value: string): string {
  return value.replace(/(\d+)\.(\d{4,})/g, (match) => {
    const n = Number(match);
    if (!Number.isFinite(n)) return match;
    const formatted = formatChapterNumberValue(n);
    return formatted || match;
  });
}

export function sanitizeChapterTitle(title?: string | null): string | undefined {
  if (title == null) return undefined;
  const trimmed = title.trim();
  if (!trimmed || looksLikeOpaqueChapterId(trimmed)) return undefined;
  const cleaned = sanitizeChapterDisplayText(trimmed);
  if (!cleaned || looksLikeOpaqueChapterId(cleaned)) return undefined;
  return cleaned;
}
