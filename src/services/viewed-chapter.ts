import { getDb, runWrite } from "@/db/database";
import { getAppSettings } from "@/services/app-settings";

// The chapter the reader opened last, per manga. The reader leaves no reading record for a chapter that
// is already read, yet "Continue" on the manga page should still point at it.
export type ViewedChapter = { chapterKey: string; page: number; at: number };

export async function noteViewedChapter(
  sourceId: string,
  mangaKey: string,
  chapterKey: string,
  page: number,
): Promise<void> {
  if ((await getAppSettings()).incognitoMode) return;
  await runWrite((tx) =>
    tx.runAsync(
      `INSERT OR REPLACE INTO last_opened_chapter (source_id, manga_key, chapter_key, page, opened_at)
       VALUES (?, ?, ?, ?, ?)`,
      [sourceId, mangaKey, chapterKey, Math.max(0, page), Date.now()],
    ),
  );
}

export async function getViewedChapter(
  sourceId: string,
  mangaKey: string,
): Promise<ViewedChapter | undefined> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    chapter_key: string;
    page: number;
    opened_at: number;
  }>(
    "SELECT chapter_key, page, opened_at FROM last_opened_chapter WHERE source_id = ? AND manga_key = ?",
    [sourceId, mangaKey],
  );
  return row
    ? { chapterKey: row.chapter_key, page: row.page, at: row.opened_at }
    : undefined;
}
