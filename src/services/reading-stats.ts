import type { ReadEvent } from "@/services/manga-tracking";

const DAY_MS = 24 * 60 * 60 * 1000;

export type TopManga = {
  sourceId: string;
  mangaKey: string;
  title: string;
  count: number;
};

export type ReadingStats = {
  total: number;
  today: number;
  last7: number;
  last30: number;
  titlesRead: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  /** Chapters per day for the last `days` days, oldest first. */
  daily: { date: Date; count: number }[];
  /** Chapters per weekday, Monday first. */
  weekdays: number[];
  topManga: TopManga[];
  bySource: { sourceId: string; count: number }[];
};

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dayIndex(ms: number): number {
  // Whole local days since epoch; DST shifts are absorbed by rounding.
  return Math.round(startOfDay(ms) / DAY_MS);
}

export function computeReadingStats(
  reads: ReadEvent[],
  titles: Map<string, string>,
  now = Date.now(),
  days = 14,
): ReadingStats {
  const today = dayIndex(now);
  const perDay = new Map<number, number>();
  const perManga = new Map<string, TopManga>();
  const perSource = new Map<string, number>();
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  let todayCount = 0;
  let last7 = 0;
  let last30 = 0;

  for (const read of reads) {
    // A read event may stand for several chapters read on the same day.
    const n = read.count ?? 1;
    const day = dayIndex(read.dateRead);
    perDay.set(day, (perDay.get(day) ?? 0) + n);
    const age = today - day;
    if (age === 0) todayCount += n;
    if (age >= 0 && age < 7) last7 += n;
    if (age >= 0 && age < 30) last30 += n;
    // getDay(): Sunday = 0; shift so Monday comes first.
    weekdays[(new Date(read.dateRead).getDay() + 6) % 7] += n;

    const key = `${read.sourceId}:${read.mangaKey}`;
    const entry = perManga.get(key);
    if (entry) entry.count += n;
    else
      perManga.set(key, {
        sourceId: read.sourceId,
        mangaKey: read.mangaKey,
        title: titles.get(key) ?? read.mangaKey,
        count: n,
      });
    perSource.set(read.sourceId, (perSource.get(read.sourceId) ?? 0) + n);
  }

  const sortedDays = [...perDay.keys()].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of sortedDays) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  // The streak stays alive through today if nothing has been read yet today.
  let streak = 0;
  let cursor = perDay.has(today) ? today : today - 1;
  while (perDay.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }

  const daily = Array.from({ length: days }, (_, i) => {
    const day = today - (days - 1 - i);
    return { date: new Date(day * DAY_MS + 12 * 60 * 60 * 1000), count: perDay.get(day) ?? 0 };
  });

  return {
    total: reads.reduce((sum, read) => sum + (read.count ?? 1), 0),
    today: todayCount,
    last7,
    last30,
    titlesRead: perManga.size,
    activeDays: perDay.size,
    currentStreak: streak,
    longestStreak: longest,
    daily,
    weekdays,
    topManga: [...perManga.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    bySource: [...perSource.entries()]
      .map(([sourceId, count]) => ({ sourceId, count }))
      .sort((a, b) => b.count - a.count),
  };
}
