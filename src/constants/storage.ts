import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

const PREFS_PATH = `${FileSystem.documentDirectory}app-preferences.json`;
const MIGRATION_FLAG = 'storage_migrated_from_secure_store_v1';

type Preferences = Record<string, unknown>;

async function readPreferences(): Promise<Preferences> {
  const info = await FileSystem.getInfoAsync(PREFS_PATH);
  if (!info.exists) return {};
  try {
    const raw = await FileSystem.readAsStringAsync(PREFS_PATH);
    const parsed = JSON.parse(raw) as Preferences;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writePreferences(preferences: Preferences): Promise<void> {
  await FileSystem.writeAsStringAsync(PREFS_PATH, JSON.stringify(preferences));
}

async function migrateFromSecureStoreIfNeeded(): Promise<void> {
  const preferences = await readPreferences();
  if (preferences[MIGRATION_FLAG]) return;

  const legacyKeys = Object.values(storageKeys);

  for (const key of legacyKeys) {
    if (key in preferences) continue;
    const legacyValue = await SecureStore.getItemAsync(key);
    if (legacyValue == null) continue;
    try {
      preferences[key] = JSON.parse(legacyValue);
    } catch {
      preferences[key] = legacyValue;
    }
  }

  preferences[MIGRATION_FLAG] = true;
  await writePreferences(preferences);
}

export async function setValue<T>(key: string, value: T): Promise<void> {
  await migrateFromSecureStoreIfNeeded();
  const preferences = await readPreferences();
  preferences[key] = value;
  await writePreferences(preferences);
}

export async function getValue<T>(key: string, defaultValue: T): Promise<T> {
  await migrateFromSecureStoreIfNeeded();
  const preferences = await readPreferences();
  if (!(key in preferences)) return defaultValue;
  return preferences[key] as T;
}

export async function hasValue(key: string): Promise<boolean> {
  await migrateFromSecureStoreIfNeeded();
  const preferences = await readPreferences();
  return key in preferences;
}

export async function removeValue(key: string): Promise<void> {
  await migrateFromSecureStoreIfNeeded();
  const preferences = await readPreferences();
  delete preferences[key];
  await writePreferences(preferences);
}

export async function getAllPreferences(): Promise<Record<string, unknown>> {
  await migrateFromSecureStoreIfNeeded();
  return readPreferences();
}

export async function replacePreferences(next: Record<string, unknown>): Promise<void> {
  await migrateFromSecureStoreIfNeeded();
  await writePreferences({
    ...next,
    [MIGRATION_FLAG]: true,
  });
}

export const storageKeys = {
  THEME_MODE: 'app_theme_mode',
  WELCOME_COMPLETED_KEY: 'welcome_completed_v1',
  SHOW_NSFW_SOURCES: 'show_nsfw_sources',
  SOURCE_REGISTRY_URLS: 'source_registry_urls',
  SOURCE_LAYOUT: 'source_layout',
  NOTIFY_SOURCE_UPDATES: 'notify_source_updates',
  NOTIFY_NEW_CHAPTERS: 'notify_new_chapters',
  SOURCE_UPDATE_NOTIFIED: 'source_update_notified',
  MANGA_TRACKING: 'manga_tracking_v1',
  LIBRARY: 'library_v1',
  DOWNLOADS: 'downloads_v1',
  APP_SETTINGS: 'app_settings_v1',
  ACCENT_COLOR: 'accent_color_v1',
  APP_ICON: 'app_icon_v1',
};
