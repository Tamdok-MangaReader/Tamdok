export type ParsedMangaDescription = {
  summary?: string;
  altTitle?: string;
  altTitles?: string[];
  ratingLine?: string;
};

/** Split libgroup-style markdown descriptions into summary / rating / alt title. */
export function parseMangaDescription(
  description?: string,
): ParsedMangaDescription {
  if (!description?.trim()) return {};

  const blocks = description
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean);
  let summary: string | undefined;
  let ratingLine: string | undefined;
  let altTitle: string | undefined;
  let altTitles: string[] | undefined;

  for (const block of blocks) {
    // LibGroup-style descriptions embed the rating as a line of star glyphs plus a number.
    if (/[★✮☆]/.test(block) && /\d[\d.]*/.test(block)) {
      ratingLine = block.replace(/\s*\(голосов:.*\)$/i, "").trim();
      continue;
    }

    // Alternative titles come in a block starting with a localized label; the label differs per
    // source language, so both the English and the Russian form are handled.
    if (block.startsWith("Alt titles:")) {
      const names = block
        .replace(/^Альтернативные названия:<br\/?>/i, "")
        .split(/<br\/?>|,\s*/)
        .map((name) => name.trim())
        .filter(Boolean);
      altTitles = names;
      altTitle = names[0];
      continue;
    }

    if (block.startsWith("Альтернативные названия:")) {
      const names = block
        .replace(/^Альтернативные названия:<br\/?>/i, "")
        .split(/<br\/?>|,\s*/)
        .map((name) => name.trim())
        .filter(Boolean);
      altTitles = names;
      altTitle = names[0];
      continue;
    }

    if (!summary) {
      summary = block.replace(/<br\/?>/g, "\n").trim();
    }
  }

  return { summary, altTitle, altTitles, ratingLine };
}

// Rating information extracted from the star glyphs (or a numeric score) of a description.
export type ParsedRating = {
  filled: number;
  half: boolean;
  empty: number;
  score?: string;
};

// ★ = full star, ✮ = half star, ☆ = empty star. If there are no glyphs, a numeric score is used:
// values above 5 are assumed to be on a 10-point scale and halved.
export function parseRatingText(text?: string): ParsedRating | null {
  if (!text) return null;

  const starMatch = text.match(/([★✮☆]+)/);
  const scoreMatch = text.match(/(\d+(?:\.\d+)?)/);

  if (!starMatch && !scoreMatch) return null;

  const scoreStr = scoreMatch?.[1];
  let filled = 0;
  let half = false;
  let empty = 0;

  if (starMatch) {
    const stars = starMatch[1];
    for (const char of stars) {
      if (char === "★") filled += 1;
      else if (char === "✮") half = true;
      else if (char === "☆") empty += 1;
    }
  } else if (scoreStr) {
    let score = parseFloat(scoreStr);

    if (score > 5) {
      score = score / 2;
    }

    const boundedScore = Math.max(0, Math.min(5, score));
    filled = Math.floor(boundedScore);
    const remainder = boundedScore - filled;

    // Round the fractional part to the nearest half star.
    if (remainder >= 0.25 && remainder < 0.75) {
      half = true;
    } else if (remainder >= 0.75) {
      filled += 1;
    }

    empty = 5 - filled - (half ? 1 : 0);
  }

  return {
    filled,
    half,
    empty,
    score: scoreStr,
  };
}
