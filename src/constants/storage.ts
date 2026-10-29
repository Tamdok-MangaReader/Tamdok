import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";

const PREFS_PATH = `${FileSystem.documentDirectory}app-preferences.json`;
const TMP_PATH = `${FileSystem.documentDirectory}app-preferences.json.tmp`;
const CORRUPT_PATH = `${FileSystem.documentDirectory}app-preferences.corrupt.json`;
const MIGRATION_FLAG = "storage_migrated_from_secure_store_v1";
const PERSIST_DELAY_MS = 40;

type Preferences = Record<string, unknown>;
type PreferencesStore = Map<string, string>;
type FileRead = { exists: boolean; data: Preferences | null };

let cache: PreferencesStore | null = null;
let loading: Promise<PreferencesStore> | null = null;
let persistRunning: Promise<void> | null = null;
let persistRequested = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readFile(path: string): Promise<FileRead> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return { exists: false, data: null };
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { exists: true, data: parsed as Preferences };
    }
    return { exists: true, data: null };
  } catch {
    return { exists: true, data: null };
  }
}

async function readPreferences(): Promise<Preferences> {
  const main = await readFile(PREFS_PATH);
  if (main.data) return main.data;
  const backup = await readFile(TMP_PATH);
  if (main.exists) {
    try {
      await FileSystem.deleteAsync(CORRUPT_PATH, { idempotent: true });
      await FileSystem.copyAsync({ from: PREFS_PATH, to: CORRUPT_PATH });
    } catch {}
  }
  return backup.data ?? {};
}

function serialize(store: PreferencesStore): string {
  const parts: string[] = [];
  for (const [key, value] of store)
    parts.push(`${JSON.stringify(key)}:${value}`);
  return `{${parts.join(",")}}`;
}

async function writeStore(store: PreferencesStore): Promise<void> {
  await FileSystem.writeAsStringAsync(TMP_PATH, serialize(store));
  await FileSystem.deleteAsync(PREFS_PATH, { idempotent: true });
  await FileSystem.moveAsync({ from: TMP_PATH, to: PREFS_PATH });
}

function ensureLoaded(): Promise<PreferencesStore> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = (async () => {
      const preferences = await readPreferences();
      const store: PreferencesStore = new Map();
      for (const [key, value] of Object.entries(preferences)) {
        const serialized = JSON.stringify(value);
        if (serialized !== undefined) store.set(key, serialized);
      }

      if (!store.has(MIGRATION_FLAG)) {
        for (const key of Object.values(storageKeys)) {
          if (store.has(key)) continue;
          try {
            const legacyValue = await SecureStore.getItemAsync(key);
            if (legacyValue == null) continue;
            try {
              JSON.parse(legacyValue);
              store.set(key, legacyValue);
            } catch {
              store.set(key, JSON.stringify(legacyValue));
            }
          } catch {}
        }
        store.set(MIGRATION_FLAG, "true");
        await writeStore(store);
      }

      cache = store;
      return store;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

function persist(): Promise<void> {
  persistRequested = true;
  if (!persistRunning) {
    persistRunning = (async () => {
      try {
        while (persistRequested) {
          await sleep(PERSIST_DELAY_MS);
          persistRequested = false;
          if (cache) await writeStore(cache);
        }
      } finally {
        persistRunning = null;
      }
    })();
  }
  return persistRunning;
}

export async function flushPreferences(): Promise<void> {
  while (persistRunning) {
    await persistRunning;
  }
}

export async function setValue<T>(key: string, value: T): Promise<void> {
  const store = await ensureLoaded();
  const serialized = JSON.stringify(value);
  if (serialized === undefined) store.delete(key);
  else store.set(key, serialized);
  await persist();
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

export async function replacePreferences(
  next: Record<string, unknown>,
): Promise<void> {
  const store = await ensureLoaded();
  store.clear();
  for (const [key, value] of Object.entries({
    ...next,
    [MIGRATION_FLAG]: true,
  })) {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) store.set(key, serialized);
  }
  await persist();
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
  ACCENT_COLOR: "accent_color_v1",
  APP_ICON: "app_icon_v1",
};
