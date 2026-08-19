import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { getAllPreferences, getValue, replacePreferences, setValue, storageKeys } from '@/constants/storage';
import { registryEntryKind } from '@/parsers/aidoku/registry';
import { listInstalledSources } from '@/parsers/shared/source-manager';
import type { RegistryEntry, SourceKind } from '@/parsers/shared/types';
import { invalidateLibraryCache } from '@/services/library';
import {
  getRegistryUrls,
  getSourceIdentityKey,
  installFromRegistry,
  loadRegistryFromUrl,
} from '@/services/sources';
import { notifyAppSettingsChanged } from '@/utils/app-settings-events';
import { notifyAppearanceChanged } from '@/utils/appearance-events';
import { notifyMangaDataChanged } from '@/utils/manga-events';

export type BackupSourceRef = {
  id: string;
  kind: SourceKind;
  version?: number;
  name?: string;
};

export type BackupPayload = {
  version: 1 | 2;
  name: string;
  date: number;
  library?: unknown;
  mangaTracking?: unknown;
  downloads?: unknown;
  appSettings?: unknown;
  preferences?: Record<string, unknown>;
  installedSources?: BackupSourceRef[];
};

export type RestoreProgress = {
  phase: 'preferences' | 'sources';
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
const SKIP_PREFERENCE_KEYS = new Set([storageKeys.SOURCE_UPDATE_NOTIFIED]);

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
  const exact = entries.find((entry) => entry.id === source.id && registryEntryKind(registryUrl, entry) === source.kind);
  if (exact) return exact;

  const sameId = entries.find((entry) => entry.id === source.id);
  if (sameId) return sameId;

  const identity = sourceIdentity(source.id, source.kind);
  return (
    entries.find((entry) => {
      const kind = registryEntryKind(registryUrl, entry);
      return kind === source.kind && sourceIdentity(entry.id, kind) === identity;
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

export async function listBackups(): Promise<Array<{ name: string; uri: string; date: number }>> {
  await ensureBackupDir();
  const files = await FileSystem.readDirectoryAsync(BACKUP_DIR);
  const backups = await Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map(async (file) => {
        const uri = `${BACKUP_DIR}${file}`;
        const info = await FileSystem.getInfoAsync(uri);
        return {
          name: file.replace(/\.json$/, ''),
          uri,
          date: info.exists && 'modificationTime' in info ? (info.modificationTime ?? 0) * 1000 : 0,
        };
      }),
  );
  return backups.sort((left, right) => right.date - left.date);
}

export async function createBackup(name?: string): Promise<string> {
  await ensureBackupDir();
  const [library, mangaTracking, downloads, appSettings, preferences, installedSources] = await Promise.all([
    getValue(storageKeys.LIBRARY, null),
    getValue(storageKeys.MANGA_TRACKING, null),
    getValue(storageKeys.DOWNLOADS, null),
    getValue(storageKeys.APP_SETTINGS, null),
    getAllPreferences(),
    snapshotInstalledSources(),
  ]);

  const sanitizedPreferences = { ...preferences };
  for (const key of SKIP_PREFERENCE_KEYS) {
    delete sanitizedPreferences[key];
  }

  const payload: BackupPayload = {
    version: 2,
    name: name ?? `backup-${new Date().toISOString().slice(0, 10)}`,
    date: Date.now(),
    library,
    mangaTracking,
    downloads,
    appSettings,
    preferences: sanitizedPreferences,
    installedSources,
  };

  const fileName = `${payload.name.replace(/[^\w.-]+/g, '_')}.json`;
  const uri = `${BACKUP_DIR}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2));
  return uri;
}

export async function shareBackup(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json' });
}

async function restorePreferences(payload: BackupPayload): Promise<void> {
  if (payload.version >= 2 && payload.preferences && typeof payload.preferences === 'object') {
    const next = { ...payload.preferences };
    for (const key of SKIP_PREFERENCE_KEYS) {
      delete next[key];
    }
    await replacePreferences(next);
    return;
  }

  if (payload.library != null) await setValue(storageKeys.LIBRARY, payload.library);
  if (payload.mangaTracking != null) await setValue(storageKeys.MANGA_TRACKING, payload.mangaTracking);
  if (payload.downloads != null) await setValue(storageKeys.DOWNLOADS, payload.downloads);
  if (payload.appSettings != null) await setValue(storageKeys.APP_SETTINGS, payload.appSettings);
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
        return { url: registry.url, sources: (await loadRegistryFromUrl(registry.url, true)).sources };
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
      phase: 'sources',
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
      const installedSource = await installFromRegistry(matched.url, matched.entry);
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
  onProgress?.({ phase: 'preferences', current: 0, total: 1 });
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
