import type { RegistryEntry, SourceRegistry } from '../shared/types';

export const AIDOKU_COMMUNITY_REGISTRY =
  'https://aidoku-community.github.io/sources/index.min.json';

export async function fetchSourceRegistry(url: string): Promise<SourceRegistry> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load registry: ${response.status}`);
  }
  return (await response.json()) as SourceRegistry;
}

export function resolveRegistryAssetUrl(registryUrl: string, assetPath: string): string {
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  const base = registryUrl.replace(/\/[^/]*$/, '/');
  return new URL(assetPath, base).toString();
}

export function resolveRegistryIconUrl(registryUrl: string, entry: RegistryEntry): string | undefined {
  if (!entry.iconURL) return undefined;
  return resolveRegistryAssetUrl(registryUrl, entry.iconURL);
}

export function registryEntryKind(registryUrl: string, entry: RegistryEntry): 'aidoku' | 'tamdok' {
  if (entry.downloadURL.endsWith('.aix')) return 'aidoku';
  if (entry.downloadURL.endsWith('.tamdok')) return 'tamdok';
  if (registryUrl.includes('aidoku')) return 'aidoku';
  return 'tamdok';
}
