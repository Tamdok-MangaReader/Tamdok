import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as SQLite from "expo-sqlite";

import {
  flushPreferences,
  getAllPreferences,
  getValue,
  replacePreferences,
  setValue,
  storageKeys,
} from "@/constants/storage";
import {
  flushWrites,
  insertMany,
  mainDatabasePath,
  runWithAttached,
  runWrite,
  toDbPath,
} from "@/db/database";
import {
  importDownloadsDocument,
  importLibraryDocument,
  importTrackingDocument,
  LIBRARY_SETTINGS_KEY,
} from "@/db/legacy-import";
import { SCHEMA_VERSION, schemaStatements } from "@/db/schema";
import { registryEntryKind } from "@/parsers/aidoku/registry";
import { listInstalledSources } from "@/parsers/shared/source-manager";
import type { RegistryEntry, SourceKind } from "@/parsers/shared/types";
import {
  BACKUP_SETTINGS_KEY,
  fullBackupScope,
  type BackupScope,
} from "@/services/backup-config";
import { invalidateDownloadsCache } from "@/services/downloads";
import {
  invalidateLibraryCache,
  recomputeAllLibraryUnread,
} from "@/services/library";
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
const BACKUP_EXTENSION = ".tdb";
// New backups are .tdb (SQLite files); the pre-SQLite .json backups stay listed and restorable.
const BACKUP_FILE_PATTERN = /\.(tdb|sqlite|json)$/;
const BACKUP_FORMAT = "tamdok-backup-v1";

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
      .filter((file) => BACKUP_FILE_PATTERN.test(file))
      .map(async (file) => {
        const uri = `${BACKUP_DIR}${file}`;
        const info = await FileSystem.getInfoAsync(uri);
        return {
          name: file.replace(BACKUP_FILE_PATTERN, ""),
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
  const taken = (name: string) =>
    files.has(`${name}${BACKUP_EXTENSION}`) || files.has(`${name}.json`);
  if (!taken(base)) return base;
  let index = 2;
  while (taken(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

export type CreateBackupOptions = {
  name?: string;
  scope?: BackupScope;
  auto?: boolean;
};

// Column lists of the tables copied into a backup. Explicit lists keep a backup restorable even if a
// later schema version appends columns to the live tables.
const COPY_COLUMNS = {
  library_entries:
    "source_id, manga_key, title, cover, date_added, unread_count, downloaded_count, last_refreshed, status, update_failed, last_attempt_at, favorite, chapter_count",
  library_entry_categories: "source_id, manga_key, category_id",
  known_chapters: "source_id, manga_key, chapter_key, position",
  categories: "id, name, sort_order",
  manga_meta: "source_id, manga_key, title, cover",
  reading_log:
    "source_id, manga_key, chapter_key, page, date_read, history_at, chapter_title",
  downloads:
    "source_id, manga_key, chapter_key, manga_title, chapter_title, status, progress, date_added, error",
} as const;

type CopyTable = keyof typeof COPY_COLUMNS;

// Copies a table between the main database and an attached backup, natively (no rows cross into JS).
function copySql(
  table: CopyTable,
  from: string,
  to: string,
  options: { select?: string; where?: string; verb?: string; tail?: string } = {},
): string {
  const columns = COPY_COLUMNS[table];
  return `${options.verb ?? "INSERT"} INTO ${to}.${table} (${columns})
          SELECT ${options.select ?? columns} FROM ${from}.${table}
          WHERE ${options.where ?? "1"} ${options.tail ?? ""}`;
}

// Settings and preferences that travel in the backup's key-value table.
async function collectBackupKeyValues(
  scope: BackupScope,
): Promise<Array<[string, unknown]>> {
  const rows: Array<[string, unknown]> = [];

  if (scope.libraryCategories || scope.libraryUpdateSettings) {
    const settings = asRecord(await getValue(LIBRARY_SETTINGS_KEY, null));
    const part: LooseRecord = {};
    if (scope.libraryCategories) {
      Object.assign(
        part,
        pickKeys(settings, ["defaultCategoryId", "excludedCategoryIds"]),
      );
    }
    if (scope.libraryUpdateSettings) {
      Object.assign(part, pickKeys(settings, LIBRARY_SETTING_KEYS));
    }
    rows.push([LIBRARY_SETTINGS_KEY, part]);
  }

  if (scope.appSettings || scope.privacy) {
    const settings = asRecord(await getValue(storageKeys.APP_SETTINGS, null));
    const part: LooseRecord = {};
    if (scope.appSettings) {
      const { privacy: _privacy, ...general } = settings;
      Object.assign(part, general);
    }
    if (scope.privacy) part.privacy = settings.privacy ?? null;
    rows.push([storageKeys.APP_SETTINGS, part]);
  }

  const { exact, prefixes } = prefKeysForScope(scope);
  if (exact.length > 0 || prefixes.length > 0) {
    const preferences = await getAllPreferences();
    for (const [key, value] of Object.entries(preferences)) {
      if (SKIP_PREFERENCE_KEYS.has(key)) continue;
      if (
        exact.includes(key) ||
        prefixes.some((prefix) => key.startsWith(prefix))
      ) {
        rows.push([key, value]);
      }
    }
  }
  return rows;
}

/**
 * Creates a backup: a standalone SQLite file with the same schema as the app database, holding only the
 * parts the scope selects. Tables are copied natively with INSERT ... SELECT, so the time is dominated
 * by disk speed, not by the number of rows. The file is built under a temporary name and moved into
 * place when complete, so a failure never leaves a half-written backup.
 */
export async function createBackup(
  options: CreateBackupOptions = {},
): Promise<string> {
  await ensureBackupDir();
  const scope = options.scope ?? fullBackupScope();
  const auto = options.auto ?? false;
  const name = options.name ?? (await defaultBackupName(auto));
  const fileBase = name.replace(/[^\w.-]+/g, "_");
  const finalUri = `${BACKUP_DIR}${fileBase}${BACKUP_EXTENSION}`;
  const partName = `${fileBase}${BACKUP_EXTENSION}.part`;
  const partUri = `${BACKUP_DIR}${partName}`;

  const keyValues = await collectBackupKeyValues(scope);
  const installedSources = scope.installedSources
    ? await snapshotInstalledSources()
    : undefined;
  await flushWrites();
  await FileSystem.deleteAsync(partUri, { idempotent: true });

  const dest = await SQLite.openDatabaseAsync(
    partName,
    undefined,
    toDbPath(BACKUP_DIR),
  );
  try {
    // One self-contained file: no -wal/-shm companions to lose when the file is shared.
    await dest.execAsync("PRAGMA journal_mode = DELETE");
    for (const statement of schemaStatements("main")) {
      await dest.execAsync(statement);
    }
    await dest.execAsync(
      "CREATE TABLE backup_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID",
    );
    await dest.runAsync("ATTACH DATABASE ? AS src", [mainDatabasePath()]);
    await dest.execAsync("BEGIN");
    try {
      if (scope.libraryManga) {
        await dest.execAsync(copySql("library_entries", "src", "main"));
        await dest.execAsync(copySql("library_entry_categories", "src", "main"));
        await dest.execAsync(copySql("known_chapters", "src", "main"));
      }
      if (scope.libraryCategories) {
        await dest.execAsync(copySql("categories", "src", "main"));
      }
      if (scope.readProgress || scope.history) {
        await dest.execAsync(copySql("manga_meta", "src", "main"));
        if (scope.readProgress && scope.history) {
          await dest.execAsync(copySql("reading_log", "src", "main"));
        } else if (scope.readProgress) {
          await dest.execAsync(
            copySql("reading_log", "src", "main", {
              select:
                "source_id, manga_key, chapter_key, page, date_read, NULL, NULL",
            }),
          );
        } else {
          await dest.execAsync(
            copySql("reading_log", "src", "main", {
              where: "history_at IS NOT NULL",
            }),
          );
        }
      }
      if (scope.downloads) {
        await dest.execAsync(copySql("downloads", "src", "main"));
      }

      await insertMany(
        dest,
        "INSERT OR REPLACE INTO kv (key, value)",
        2,
        keyValues.flatMap(([key, value]) => {
          const serialized = JSON.stringify(value);
          return serialized === undefined ? [] : [[key, serialized]];
        }),
      );

      const meta: Array<[string, string]> = [
        ["format", BACKUP_FORMAT],
        ["name", name],
        ["date", String(Date.now())],
        ["auto", auto ? "1" : "0"],
        ["scope", JSON.stringify(scope)],
      ];
      if (installedSources) {
        meta.push(["installedSources", JSON.stringify(installedSources)]);
      }
      await insertMany(dest, "INSERT INTO backup_meta (key, value)", 2, meta);
      await dest.execAsync("COMMIT");
    } catch (error) {
      await dest.execAsync("ROLLBACK").catch(() => undefined);
      throw error;
    }
    await dest.execAsync("DETACH DATABASE src");
    await dest.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } catch (error) {
    await dest.closeAsync().catch(() => undefined);
    await FileSystem.deleteAsync(partUri, { idempotent: true });
    throw error;
  }
  await dest.closeAsync();

  await FileSystem.deleteAsync(finalUri, { idempotent: true });
  await FileSystem.moveAsync({ from: partUri, to: finalUri });
  return finalUri;
}

export async function shareBackup(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync()) || !uri) return;
  const tempUri = `${FileSystem.cacheDirectory}${uri.split("/").pop()}`;
  try {
    await FileSystem.copyAsync({
      from: uri,
      to: tempUri,
    });

    const legacy = uri.endsWith(".json");
    await Sharing.shareAsync(tempUri, {
      mimeType: legacy ? "application/json" : "application/vnd.sqlite3",
      UTI: legacy ? "public.json" : "public.database",
    });
  } catch (error) {
    console.error("Backup share error:", error);
  }
}

// Settings documents are merged into what is stored (a partial backup only carries the keys it selected).
async function applyKeyValue(key: string, value: unknown): Promise<void> {
  if (SKIP_PREFERENCE_KEYS.has(key)) return;
  if (key === storageKeys.APP_SETTINGS || key === LIBRARY_SETTINGS_KEY) {
    const current = asRecord(await getValue(key, null));
    await setValue(key, { ...current, ...asRecord(value) });
    return;
  }
  await setValue(key, value);
}

type BackupMeta = Record<string, string>;

const SQLITE_HEADER_BASE64 = "U1FMaXRlIGZvcm1hdCAz"; // "SQLite format 3"

async function isSqliteFile(uri: string): Promise<boolean> {
  try {
    const head = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 15,
    });
    return head.startsWith(SQLITE_HEADER_BASE64);
  } catch {
    return false;
  }
}

/**
 * Restores a SQLite backup. The backup file is attached to the app database and the selected tables are
 * replaced with INSERT ... SELECT in one transaction: either everything is restored or nothing changes.
 */
async function restoreSqliteBackup(
  uri: string,
): Promise<{ meta: BackupMeta; scope: BackupScope }> {
  const path = toDbPath(uri);
  const { meta, keyValues } = await runWithAttached(path, async (conn) => {
    const metaRows = await conn
      .getAllAsync<{ key: string; value: string }>(
        "SELECT key, value FROM bk.backup_meta",
      )
      .catch(() => [] as Array<{ key: string; value: string }>);
    const meta: BackupMeta = {};
    for (const row of metaRows) meta[row.key] = row.value;
    if (meta.format !== BACKUP_FORMAT) throw new Error("Not a Tamdok backup");
    const version = await conn.getFirstAsync<{ user_version: number }>(
      "PRAGMA bk.user_version",
    );
    if ((version?.user_version ?? 0) > SCHEMA_VERSION) {
      throw new Error("This backup was made by a newer version of the app");
    }

    const scope = JSON.parse(meta.scope ?? "{}") as BackupScope;

    if (scope.libraryManga) {
      for (const table of [
        "library_entries",
        "library_entry_categories",
        "known_chapters",
      ] as const) {
        await conn.execAsync(`DELETE FROM main.${table}`);
        await conn.execAsync(copySql(table, "bk", "main"));
      }
    }
    if (scope.libraryCategories) {
      await conn.execAsync("DELETE FROM main.categories");
      await conn.execAsync(copySql("categories", "bk", "main"));
    }
    if (scope.readProgress || scope.history) {
      await conn.execAsync(
        copySql("manga_meta", "bk", "main", { verb: "INSERT OR REPLACE" }),
      );
      if (scope.readProgress && scope.history) {
        await conn.execAsync("DELETE FROM main.reading_log");
        await conn.execAsync(copySql("reading_log", "bk", "main"));
      } else if (scope.readProgress) {
        // Progress is replaced; the history of the app is kept.
        await conn.execAsync("DELETE FROM main.reading_log WHERE history_at IS NULL");
        await conn.execAsync(
          copySql("reading_log", "bk", "main", {
            tail: `ON CONFLICT (source_id, manga_key, chapter_key) DO UPDATE SET
                     page = excluded.page, date_read = excluded.date_read`,
          }),
        );
      } else {
        // History is replaced; reading progress is kept (rows missing there are added).
        await conn.execAsync(
          "UPDATE main.reading_log SET history_at = NULL, chapter_title = NULL",
        );
        await conn.execAsync(
          copySql("reading_log", "bk", "main", {
            tail: `ON CONFLICT (source_id, manga_key, chapter_key) DO UPDATE SET
                     history_at = excluded.history_at, chapter_title = excluded.chapter_title`,
          }),
        );
      }
    }
    if (scope.downloads) {
      await conn.execAsync("DELETE FROM main.downloads");
      await conn.execAsync(copySql("downloads", "bk", "main"));
    }

    const kvRows = await conn.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM bk.kv",
    );
    return { meta, keyValues: kvRows };
  });

  for (const row of keyValues) {
    try {
      await applyKeyValue(row.key, JSON.parse(row.value));
    } catch {}
  }
  await flushPreferences();
  return { meta, scope: JSON.parse(meta.scope!) as BackupScope };
}

// Pre-SQLite backups: JSON documents of versions 1-3, converted through the same importers as the
// one-time migration.
async function restoreLegacyBackup(payload: BackupPayload): Promise<void> {
  await flushPreferences();

  if (payload.version >= 3) {
    await runWrite(async (tx) => {
      if (payload.library && typeof payload.library === "object") {
        await importLibraryDocument(tx, payload.library);
      }
      if (payload.mangaTracking && typeof payload.mangaTracking === "object") {
        await importTrackingDocument(tx, payload.mangaTracking);
      }
      if (payload.downloads != null) {
        await importDownloadsDocument(tx, payload.downloads);
      }
    });
    if (payload.appSettings != null || payload.privacySettings != null) {
      const next: LooseRecord = { ...asRecord(payload.appSettings) };
      if (payload.privacySettings != null) next.privacy = payload.privacySettings;
      await applyKeyValue(storageKeys.APP_SETTINGS, next);
    }
    if (payload.preferences && typeof payload.preferences === "object") {
      for (const [key, value] of Object.entries(payload.preferences)) {
        await applyKeyValue(key, value);
      }
    }
    await flushPreferences();
    return;
  }

  if (
    payload.version >= 2 &&
    payload.preferences &&
    typeof payload.preferences === "object"
  ) {
    const next = { ...payload.preferences };
    for (const key of SKIP_PREFERENCE_KEYS) delete next[key];
    await replacePreferences(next);
    return;
  }

  await runWrite(async (tx) => {
    if (payload.library != null) {
      for (const table of [
        "library_entries",
        "library_entry_categories",
        "known_chapters",
        "categories",
      ]) {
        await tx.runAsync(`DELETE FROM ${table}`);
      }
      await importLibraryDocument(tx, payload.library);
    }
    if (payload.mangaTracking != null) {
      await importTrackingDocument(tx, payload.mangaTracking);
    }
    if (payload.downloads != null) {
      await importDownloadsDocument(tx, payload.downloads);
    }
  });
  if (payload.appSettings != null) {
    await setValue(storageKeys.APP_SETTINGS, payload.appSettings);
    await flushPreferences();
  }
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

  let sources: BackupSourceRef[] = [];
  let touchedLibraryData = true;
  if (await isSqliteFile(uri)) {
    const { meta, scope } = await restoreSqliteBackup(uri);
    sources = meta.installedSources
      ? (JSON.parse(meta.installedSources) as BackupSourceRef[])
      : [];
    touchedLibraryData = scope.libraryManga || scope.readProgress || scope.history;
  } else {
    const raw = await FileSystem.readAsStringAsync(uri);
    const payload = JSON.parse(raw) as BackupPayload;
    await restoreLegacyBackup(payload);
    sources = payload.installedSources ?? [];
  }

  invalidateLibraryCache();
  invalidateDownloadsCache();
  if (touchedLibraryData) await recomputeAllLibraryUnread();
  notifyAppSettingsChanged();
  notifyAppearanceChanged();
  notifyMangaDataChanged();

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
