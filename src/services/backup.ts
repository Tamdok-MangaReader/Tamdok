import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import {
  getAllPreferences,
  getValue,
  replacePreferences,
  setValue,
  storageKeys,
} from "@/constants/storage";
import { registryEntryKind } from "@/parsers/aidoku/registry";
import { listInstalledSources } from "@/parsers/shared/source-manager";
import type { RegistryEntry, SourceKind } from "@/parsers/shared/types";
import {
  BACKUP_SETTINGS_KEY,
  fullBackupScope,
  type BackupScope,
} from "@/services/backup-config";
import { invalidateLibraryCache } from "@/services/library";
import {
  getRegistryUrls,
  getSourceIdentityKey,
  installFromRegistry,
  loadRegistryFromUrl,
} from "@/services/sources";
import { notifyAppSettingsChanged } from "@/utils/app-settings-events";
import { notifyAppearanceChanged } from "@/utils/appearance-events";
import { notifyMangaDataChanged } from "@/utils/manga-events";

export type BackupSourceRef = {
  id: string;
  kind: SourceKind;
  version?: number;
  name?: string;
};

export type BackupPayload = {
  version: 1 | 2 | 3;
  name: string;
  date: number;
  library?: unknown;
  mangaTracking?: unknown;
  downloads?: unknown;
  appSettings?: unknown;
  preferences?: Record<string, unknown>;
  installedSources?: BackupSourceRef[];
  privacySettings?: unknown;
  scope?: BackupScope;
  auto?: boolean;
};

export type RestoreProgress = {
  phase: "preferences" | "sources";
  current: number;
  total: number;
  sourceName?: string;
};

export type RestoreResult = {
  sourcesRequested: number;
  sourcesInstalled: number;
  sourcesFailed: BackupSourceRef[];
};

const BACKUP_DIR = `${FileSystem.documentDirectory}Backups/`;
const SKIP_PREFERENCE_KEYS = new Set<string>([
  storageKeys.SOURCE_UPDATE_NOTIFIED,
  BACKUP_SETTINGS_KEY,
]);
const BOOKMARKS_PREF_KEY = "chapter_bookmarks_v1";
const AUTO_PREFIX = "auto-";

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" ? (value as LooseRecord) : {};
}

function pickKeys(source: LooseRecord, keys: string[]): LooseRecord {
  const result: LooseRecord = {};
  for (const key of keys) {
    if (key in source) result[key] = source[key];
  }
  return result;
}

const LIBRARY_SETTING_KEYS = [
  "updateOnWifiOnly",
  "updateInterval",
  "skipUnreadChapters",
  "skipCompletedStatus",
  "skipUnreadManga",
  "refreshMetadata",
  "backgroundRefresh",
];
const LIBRARY_CATEGORY_KEYS = [
  "categories",
  "defaultCategoryId",
  "excludedCategoryIds",
];

function prefKeysForScope(scope: BackupScope): {
  exact: string[];
  prefixes: string[];
} {
  const exact: string[] = [];
  const prefixes: string[] = [];
  if (scope.appearance) {
    exact.push(
      storageKeys.THEME_MODE,
      storageKeys.ACCENT_COLOR,
      storageKeys.APP_ICON,
    );
  }
  if (scope.notifications) {
    exact.push(
      storageKeys.NOTIFY_SOURCE_UPDATES,
      storageKeys.NOTIFY_NEW_CHAPTERS,
    );
  }
  if (scope.sourceRepos) exact.push(storageKeys.SOURCE_REGISTRY_URLS);
  if (scope.sourceLayout) {
    exact.push(storageKeys.SOURCE_LAYOUT, storageKeys.SHOW_NSFW_SOURCES);
  }
  if (scope.bookmarks) exact.push(BOOKMARKS_PREF_KEY);
  if (scope.readerMangaSettings) prefixes.push("reader_manga_");
  if (scope.sourceSettings) prefixes.push("source_settings:");
  return { exact, prefixes };
}

async function ensureBackupDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(BACKUP_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
  }
}

function sourceIdentity(id: string, kind: SourceKind): string {
  return getSourceIdentityKey({ id, kind });
}

function pickRegistryEntry(
  source: BackupSourceRef,
  registryUrl: string,
  entries: RegistryEntry[],
): RegistryEntry | null {
  const exact = entries.find(
    (entry) =>
      entry.id === source.id &&
      registryEntryKind(registryUrl, entry) === source.kind,
  );
  if (exact) return exact;

  const sameId = entries.find((entry) => entry.id === source.id);
  if (sameId) return sameId;

  const identity = sourceIdentity(source.id, source.kind);
  return (
    entries.find((entry) => {
      const kind = registryEntryKind(registryUrl, entry);
      return (
        kind === source.kind && sourceIdentity(entry.id, kind) === identity
      );
    }) ?? null
  );
}

async function snapshotInstalledSources(): Promise<BackupSourceRef[]> {
  const installed = await listInstalledSources();
  return installed.map((source) => ({
    id: source.id,
    kind: source.kind,
    version: source.manifest.info.version,
    name: source.manifest.info.name,
  }));
}

export async function listBackups(): Promise<
  Array<{ name: string; uri: string; date: number; size: number; auto: boolean }>
> {
  await ensureBackupDir();
  const files = await FileSystem.readDirectoryAsync(BACKUP_DIR);
  const backups = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        const uri = `${BACKUP_DIR}${file}`;
        const info = await FileSystem.getInfoAsync(uri);
        return {
          name: file.replace(/\.json$/, ""),
          uri,
          date:
            info.exists && "modificationTime" in info
              ? (info.modificationTime ?? 0) * 1000
              : 0,
          size: info.exists && "size" in info ? (info.size ?? 0) : 0,
          auto: file.startsWith(AUTO_PREFIX),
        };
      }),
  );
  return backups.sort((left, right) => right.date - left.date);
}

async function defaultBackupName(auto: boolean): Promise<string> {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const base = `${auto ? AUTO_PREFIX : ""}backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const files = new Set(await FileSystem.readDirectoryAsync(BACKUP_DIR));
  if (!files.has(`${base}.json`)) return base;
  let index = 2;
  while (files.has(`${base}_${index}.json`)) index += 1;
  return `${base}_${index}`;
}

export type CreateBackupOptions = {
  name?: string;
  scope?: BackupScope;
  auto?: boolean;
};

export async function createBackup(
  options: CreateBackupOptions = {},
): Promise<string> {
  await ensureBackupDir();
  const scope = options.scope ?? fullBackupScope();
  const auto = options.auto ?? false;

  const payload: BackupPayload = {
    version: 3,
    name: options.name ?? (await defaultBackupName(auto)),
    date: Date.now(),
    scope,
    auto,
  };

  if (
    scope.libraryManga ||
    scope.libraryCategories ||
    scope.libraryUpdateSettings
  ) {
    const library = asRecord(await getValue(storageKeys.LIBRARY, null));
    const part: LooseRecord = {};
    if (scope.libraryManga) Object.assign(part, pickKeys(library, ["entries"]));
    if (scope.libraryCategories) {
      Object.assign(part, pickKeys(library, LIBRARY_CATEGORY_KEYS));
    }
    if (scope.libraryUpdateSettings) {
      Object.assign(part, pickKeys(library, LIBRARY_SETTING_KEYS));
    }
    payload.library = part;
  }

  if (scope.readProgress || scope.history) {
    const tracking = asRecord(await getValue(storageKeys.MANGA_TRACKING, null));
    const part: LooseRecord = {};
    if (scope.readProgress) Object.assign(part, pickKeys(tracking, ["chapters"]));
    if (scope.history) Object.assign(part, pickKeys(tracking, ["history"]));
    payload.mangaTracking = part;
  }

  if (scope.downloads) {
    payload.downloads = await getValue(storageKeys.DOWNLOADS, null);
  }

  if (scope.appSettings || scope.privacy) {
    const settings = asRecord(await getValue(storageKeys.APP_SETTINGS, null));
    if (scope.appSettings) {
      const { privacy: _privacy, ...general } = settings;
      payload.appSettings = general;
    }
    if (scope.privacy) payload.privacySettings = settings.privacy ?? null;
  }

  const { exact, prefixes } = prefKeysForScope(scope);
  if (exact.length > 0 || prefixes.length > 0) {
    const preferences = await getAllPreferences();
    const picked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(preferences)) {
      if (SKIP_PREFERENCE_KEYS.has(key)) continue;
      if (
        exact.includes(key) ||
        prefixes.some((prefix) => key.startsWith(prefix))
      ) {
        picked[key] = value;
      }
    }
    payload.preferences = picked;
  }

  if (scope.installedSources) {
    payload.installedSources = await snapshotInstalledSources();
  }

  const fileName = `${payload.name.replace(/[^\w.-]+/g, "_")}.json`;
  const uri = `${BACKUP_DIR}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload));
  return uri;
}

export async function shareBackup(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync()) || !uri) return;
  const tempUri = `${FileSystem.cacheDirectory}${uri.split("/").pop()}`;
  try {
    await FileSystem.copyAsync({
      from: uri,
      to: tempUri,
    });

    await Sharing.shareAsync(tempUri, {
      mimeType: "application/json",
      UTI: "public.json",
    });
  } catch (error) {
    console.error("Backup share error:", error);
  }
}

async function restorePartial(payload: BackupPayload): Promise<void> {
  if (payload.library && typeof payload.library === "object") {
    const current = asRecord(await getValue(storageKeys.LIBRARY, null));
    await setValue(storageKeys.LIBRARY, {
      ...current,
      ...asRecord(payload.library),
    });
  }
  if (payload.mangaTracking && typeof payload.mangaTracking === "object") {
    const current = asRecord(await getValue(storageKeys.MANGA_TRACKING, null));
    await setValue(storageKeys.MANGA_TRACKING, {
      ...current,
      ...asRecord(payload.mangaTracking),
    });
  }
  if (payload.downloads != null) {
    await setValue(storageKeys.DOWNLOADS, payload.downloads);
  }
  if (payload.appSettings != null || payload.privacySettings != null) {
    const current = asRecord(await getValue(storageKeys.APP_SETTINGS, null));
    const next: LooseRecord = { ...current, ...asRecord(payload.appSettings) };
    if (payload.privacySettings != null) next.privacy = payload.privacySettings;
    await setValue(storageKeys.APP_SETTINGS, next);
  }
  if (payload.preferences && typeof payload.preferences === "object") {
    for (const [key, value] of Object.entries(payload.preferences)) {
      if (SKIP_PREFERENCE_KEYS.has(key)) continue;
      await setValue(key, value);
    }
  }
}

async function restorePreferences(payload: BackupPayload): Promise<void> {
  if (payload.version >= 3) {
    await restorePartial(payload);
    return;
  }
  if (
    payload.version >= 2 &&
    payload.preferences &&
    typeof payload.preferences === "object"
  ) {
    const next = { ...payload.preferences };
    for (const key of SKIP_PREFERENCE_KEYS) {
      delete next[key];
    }
    await replacePreferences(next);
    return;
  }

  if (payload.library != null)
    await setValue(storageKeys.LIBRARY, payload.library);
  if (payload.mangaTracking != null)
    await setValue(storageKeys.MANGA_TRACKING, payload.mangaTracking);
  if (payload.downloads != null)
    await setValue(storageKeys.DOWNLOADS, payload.downloads);
  if (payload.appSettings != null)
    await setValue(storageKeys.APP_SETTINGS, payload.appSettings);
}

async function reinstallSources(
  sources: BackupSourceRef[],
  onProgress?: (progress: RestoreProgress) => void,
): Promise<BackupSourceRef[]> {
  if (sources.length === 0) return [];

  const registries = await getRegistryUrls();
  const catalogs = await Promise.all(
    registries.map(async (registry) => {
      try {
        return {
          url: registry.url,
          sources: (await loadRegistryFromUrl(registry.url, true)).sources,
        };
      } catch {
        return { url: registry.url, sources: [] as RegistryEntry[] };
      }
    }),
  );

  const installed = await listInstalledSources();
  const installedIds = new Set(installed.map((source) => source.id));
  const failed: BackupSourceRef[] = [];

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]!;
    onProgress?.({
      phase: "sources",
      current: index + 1,
      total: sources.length,
      sourceName: source.name ?? source.id,
    });

    if (installedIds.has(source.id)) continue;

    let matched: { url: string; entry: RegistryEntry } | null = null;
    for (const catalog of catalogs) {
      const entry = pickRegistryEntry(source, catalog.url, catalog.sources);
      if (!entry) continue;
      matched = { url: catalog.url, entry };
      break;
    }

    if (!matched) {
      failed.push(source);
      continue;
    }

    try {
      const installedSource = await installFromRegistry(
        matched.url,
        matched.entry,
      );
      installedIds.add(installedSource.id);
    } catch {
      failed.push(source);
    }
  }

  return failed;
}

export async function restoreBackup(
  uri: string,
  onProgress?: (progress: RestoreProgress) => void,
): Promise<RestoreResult> {
  onProgress?.({ phase: "preferences", current: 0, total: 1 });
  const raw = await FileSystem.readAsStringAsync(uri);
  const payload = JSON.parse(raw) as BackupPayload;
  await restorePreferences(payload);
  invalidateLibraryCache();
  notifyAppSettingsChanged();
  notifyAppearanceChanged();
  notifyMangaDataChanged();

  const sources = payload.installedSources ?? [];
  const sourcesFailed = await reinstallSources(sources, onProgress);
  notifyMangaDataChanged();

  return {
    sourcesRequested: sources.length,
    sourcesInstalled: Math.max(0, sources.length - sourcesFailed.length),
    sourcesFailed,
  };
}

export async function deleteBackup(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function importBackupFromUri(
  uri: string,
  onProgress?: (progress: RestoreProgress) => void,
): Promise<RestoreResult> {
  return restoreBackup(uri, onProgress);
}
