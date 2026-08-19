export type ParsedMangaDescription = {
  summary?: string;
  altTitle?: string;
  altTitles?: string[];
  ratingLine?: string;
};

/** Split libgroup-style markdown descriptions into summary / rating / alt title. */
export function parseMangaDescription(description?: string): ParsedMangaDescription {
  if (!description?.trim()) return {};

  const blocks = description.split('\n\n').map((block) => block.trim()).filter(Boolean);
  let summary: string | undefined;
  let ratingLine: string | undefined;
  let altTitle: string | undefined;
  let altTitles: string[] | undefined;

  for (const block of blocks) {
    if (/[★✮☆]/.test(block) && /\d[\d.]*/.test(block)) {
      ratingLine = block.replace(/\s*\(голосов:.*\)$/i, '').trim();
      continue;
    }

    if (block.startsWith('Альтернативные названия:')) {
      const names = block
        .replace(/^Альтернативные названия:<br\/?>/i, '')
        .split(/<br\/?>|,\s*/)
        .map((name) => name.trim())
        .filter(Boolean);
      altTitles = names;
      altTitle = names[0];
      continue;
    }

    if (!summary) {
      summary = block.replace(/<br\/?>/g, '\n').trim();
    }
  }

  return { summary, altTitle, altTitles, ratingLine };
}

export type ParsedRating = {
  filled: number;
  half: boolean;
  empty: number;
  score?: string;
};

export function parseRatingText(text?: string): ParsedRating | null {
  if (!text) return null;

  const starMatch = text.match(/([★✮☆]+)/);
  const scoreMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (!starMatch && !scoreMatch) return null;

  const stars = starMatch?.[1] ?? '';
  let filled = 0;
  let half = false;
  let empty = 0;

  for (const char of stars) {
    if (char === '★') filled += 1;
    else if (char === '✮') half = true;
    else if (char === '☆') empty += 1;
  }

  return {
    filled,
    half,
    empty,
    score: scoreMatch?.[1],
  };
}
