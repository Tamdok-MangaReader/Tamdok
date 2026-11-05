import * as SecureStore from "expo-secure-store";

import { flushWrites, getDb, runWrite, insertMany } from "@/db/database";
import { importPreferenceMap } from "@/db/legacy-import";
import { DATA_TABLES } from "@/db/schema";

/**
 * Key-value preferences (theme, app settings, source settings, bookmarks, ...), stored in the `kv`
 * table of the SQLite database. The table is small, so it is mirrored in memory; every write is
 * persisted per key. The big domains (library, history, downloads) have their own tables.
 */

const MIGRATION_FLAG = "storage_migrated_from_secure_store_v1";
const LEGACY_DONE_KEY = "legacy_json_migrated_v1";
const PERSIST_DELAY_MS = 120;

type PreferencesStore = Map<string, string>;

let cache: PreferencesStore | null = null;
let loading: Promise<PreferencesStore> | null = null;
// Keys changed since the last flush: a serialized value, or null for a deletion.
const pending = new Map<string, string | null>();
let persistRunning: Promise<void> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadFromDatabase(): Promise<PreferencesStore> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM kv",
  );
  const store: PreferencesStore = new Map();
  for (const row of rows) store.set(row.key, row.value);
  return store;
}

function ensureLoaded(): Promise<PreferencesStore> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = (async () => {
      const store = await loadFromDatabase();

      // Very old installs kept values in SecureStore; copy them over once.
      if (!store.has(MIGRATION_FLAG)) {
        const found: Array<[string, string]> = [];
        for (const key of Object.values(storageKeys)) {
          if (store.has(key)) continue;
          try {
            const legacyValue = await SecureStore.getItemAsync(key);
            if (legacyValue == null) continue;
            try {
              JSON.parse(legacyValue);
              found.push([key, legacyValue]);
            } catch {
              found.push([key, JSON.stringify(legacyValue)]);
            }
          } catch {}
        }
        found.push([MIGRATION_FLAG, "true"]);
        const parsed: Record<string, unknown> = {};
        for (const [key, value] of found) parsed[key] = JSON.parse(value);
        // Library, history and downloads documents are routed to their tables by the importer.
        await runWrite((tx) => importPreferenceMap(tx, parsed));
        for (const [key, value] of found) {
          if (key !== storageKeys.LIBRARY && key !== storageKeys.MANGA_TRACKING && key !== storageKeys.DOWNLOADS) {
            store.set(key, value);
          }
        }
      }

      cache = store;
      return store;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

async function writePending(): Promise<void> {
  if (pending.size === 0) return;
  const batch = [...pending];
  pending.clear();
  try {
    await runWrite(async (tx) => {
      const upserts: Array<[string, string]> = [];
      const removals: string[] = [];
      for (const [key, value] of batch) {
        if (value === null) removals.push(key);
        else upserts.push([key, value]);
      }
      await insertMany(tx, "INSERT OR REPLACE INTO kv (key, value)", 2, upserts);
      for (const key of removals) {
        await tx.runAsync("DELETE FROM kv WHERE key = ?", [key]);
      }
    });
  } catch (error) {
    // Put the batch back (newer changes win) so the next flush retries it.
    for (const [key, value] of batch) if (!pending.has(key)) pending.set(key, value);
    throw error;
  }
}

function persist(): Promise<void> {
  if (!persistRunning) {
    persistRunning = (async () => {
      try {
        while (pending.size > 0) {
          await sleep(PERSIST_DELAY_MS);
          await writePending();
        }
      } finally {
        persistRunning = null;
      }
    })();
  }
  return persistRunning;
}

/** Resolves once every preference change made so far is on disk. */
export async function flushPreferences(): Promise<void> {
  while (persistRunning) {
    await persistRunning.catch(() => undefined);
  }
  await flushWrites();
}

export async function setValue<T>(key: string, value: T): Promise<void> {
  const store = await ensureLoaded();
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    store.delete(key);
    pending.set(key, null);
  } else {
    store.set(key, serialized);
    pending.set(key, serialized);
  }
  await persist();
}

export async function getValueSerialized(key: string): Promise<string | undefined> {
  const store = await ensureLoaded();
  return store.get(key);
}

export async function getValue<T>(key: string, defaultValue: T): Promise<T> {
  const store = await ensureLoaded();
  const serialized = store.get(key);
  if (serialized === undefined) return defaultValue;
  try {
    return JSON.parse(serialized) as T;
  } catch {
    return defaultValue;
  }
}

export async function hasValue(key: string): Promise<boolean> {
  const store = await ensureLoaded();
  return store.has(key);
}

export async function removeValue(key: string): Promise<void> {
  const store = await ensureLoaded();
  if (!store.delete(key)) return;
  pending.set(key, null);
  await persist();
}

export async function getAllPreferences(): Promise<Record<string, unknown>> {
  const store = await ensureLoaded();
  const result: Record<string, unknown> = {};
  for (const [key, serialized] of store) {
    try {
      result[key] = JSON.parse(serialized);
    } catch {}
  }
  return result;
}

/** Reloads the in-memory mirror after another writer (a backup restore) changed the table. */
export async function reloadPreferences(): Promise<void> {
  await flushPreferences();
  cache = await loadFromDatabase();
}

/**
 * Replaces every preference with `next` (legacy full-replace restore). Keys of the old single-file
 * format that now live in tables are routed there.
 */
export async function replacePreferences(
  next: Record<string, unknown>,
): Promise<void> {
  await flushPreferences();
  await runWrite(async (tx) => {
    await tx.runAsync("DELETE FROM kv WHERE key <> ?", [LEGACY_DONE_KEY]);
    for (const table of DATA_TABLES) {
      if (table !== "kv") await tx.runAsync(`DELETE FROM ${table}`);
    }
    await importPreferenceMap(tx, { ...next, [MIGRATION_FLAG]: true });
  });
  cache = await loadFromDatabase();
}

export const storageKeys = {
  THEME_MODE: "app_theme_mode",
  WELCOME_COMPLETED_KEY: "welcome_completed_v1",
  SHOW_NSFW_SOURCES: "show_nsfw_sources",
  SOURCE_REGISTRY_URLS: "source_registry_urls",
  SOURCE_LAYOUT: "source_layout",
  NOTIFY_SOURCE_UPDATES: "notify_source_updates",
  NOTIFY_NEW_CHAPTERS: "notify_new_chapters",
  SOURCE_UPDATE_NOTIFIED: "source_update_notified",
  MANGA_TRACKING: "manga_tracking_v1",
  LIBRARY: "library_v1",
  DOWNLOADS: "downloads_v1",
  APP_SETTINGS: "app_settings_v1",
  REVIEW_PROMPT: "review_prompt_v1",
  ACCENT_COLOR: "accent_color_v1",
  APP_ICON: "app_icon_v1",
};
