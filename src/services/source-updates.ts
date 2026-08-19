import type { InstalledSource, RegistryEntry, SourceRegistry } from '@/parsers/shared/types';
import { filterByNsfw } from '@/services/sources';
import type { SourceRegistryList } from '@/services/sources';

export type SourceUpdateInfo = {
  sourceId: string;
  source: InstalledSource;
  registryUrl: string;
  entry: RegistryEntry;
  installedVersion: number;
  availableVersion: number;
};

export function findSourceUpdates(
  installed: InstalledSource[],
  registryCatalogs: Record<string, SourceRegistry | null>,
  registries: SourceRegistryList[],
  showNsfw: boolean,
): SourceUpdateInfo[] {
  const updates: SourceUpdateInfo[] = [];

  for (const source of installed) {
    const match = findRegistryEntryForSource(source.id, registryCatalogs, registries, showNsfw);
    if (!match) continue;

    const installedVersion = source.manifest.info.version;
    if (match.entry.version <= installedVersion) continue;

    updates.push({
      sourceId: source.id,
      source,
      registryUrl: match.registryUrl,
      entry: match.entry,
      installedVersion,
      availableVersion: match.entry.version,
    });
  }

  return updates.sort((a, b) => a.source.manifest.info.name.localeCompare(b.source.manifest.info.name));
}

export function findRegistryEntryForSource(
  sourceId: string,
  registryCatalogs: Record<string, SourceRegistry | null>,
  registries: SourceRegistryList[],
  showNsfw: boolean,
): { registryUrl: string; entry: RegistryEntry } | null {
  for (const registry of registries) {
    const catalog = registryCatalogs[registry.url];
    if (!catalog) continue;

    const entry = filterByNsfw(catalog.sources, showNsfw).find((item) => item.id === sourceId);
    if (entry) {
      return { registryUrl: registry.url, entry };
    }
  }

  return null;
}

export function getUpdateForSource(updates: SourceUpdateInfo[], sourceId: string): SourceUpdateInfo | undefined {
  return updates.find((update) => update.sourceId === sourceId);
}
