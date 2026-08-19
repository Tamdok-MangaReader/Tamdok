import * as FileSystem from 'expo-file-system/legacy';

import { joinInstallPath } from '../shared/source-manager';
import { getSourceSettings } from '@/services/source-settings';
import type { InstalledSource } from '../shared/types';

type AidokuSettingsEntry = {
  type?: string;
  key?: string;
  id?: string;
  default?: unknown;
  items?: AidokuSettingsEntry[];
};

async function readRawAidokuSettingsDefaults(source: InstalledSource): Promise<Record<string, unknown>> {
  const settingsPath = joinInstallPath(source.installPath, 'settings.json');
  const info = await FileSystem.getInfoAsync(settingsPath);
  if (!info.exists) return {};

  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(settingsPath)) as unknown;
    if (!Array.isArray(parsed)) return {};

    const defaults: Record<string, unknown> = {};
    collectAidokuDefaults(parsed as AidokuSettingsEntry[], defaults);
    return defaults;
  } catch {
    return {};
  }
}

function collectAidokuDefaults(entries: AidokuSettingsEntry[], defaults: Record<string, unknown>) {
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    if (entry.type === 'group' || entry.type === 'page') {
      collectAidokuDefaults(entry.items ?? [], defaults);
      continue;
    }

    const key = entry.key ?? entry.id;
    if (!key || entry.default === undefined) continue;
    defaults[key] = entry.default;
  }
}

function defaultLanguagesForSource(source: InstalledSource): string[] {
  const manifest = source.manifest.info.languages ?? [];
  const preferred = ['en', 'ru'].filter((code) => manifest.includes(code));
  if (preferred.length > 0) return preferred;
  if (manifest.length > 0) return manifest.slice(0, Math.min(5, manifest.length));
  return ['en'];
}

function isMangadexSource(source: InstalledSource): boolean {
  return source.id.toLowerCase().includes('mangadex');
}

export async function getAidokuInvokeSettings(source: InstalledSource): Promise<Record<string, unknown>> {
  const [stored, fromSettingsJson] = await Promise.all([
    getSourceSettings(source.id),
    readRawAidokuSettingsDefaults(source),
  ]);

  const merged: Record<string, unknown> = { ...fromSettingsJson, ...stored };

  if (!Array.isArray(merged.languages) || merged.languages.length === 0) {
    merged.languages = defaultLanguagesForSource(source);
  }

  if (isMangadexSource(source)) {
    if (!Array.isArray(merged.contentRating) || merged.contentRating.length === 0) {
      merged.contentRating = ['safe', 'suggestive', 'erotica', 'pornographic'];
    }
    if (!Array.isArray(merged.blockedUUIDs)) {
      merged.blockedUUIDs = [];
    }
  }

  return merged;
}

export function isMissingWasmExportError(error: unknown, exportName: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes(`WASM export not found: ${exportName}`) ||
    message.includes('Aidoku source method is unimplemented')
  );
}
