import type { ImageSourcePropType } from 'react-native';

import type { SourceRegistry } from '@/parsers/shared/types';
import { AIDOKU_COMMUNITY_REGISTRY, resolveRegistryAssetUrl } from '@/parsers/aidoku/registry';
import { normalizeRegistryUrl, registryUrlsMatch } from '@/utils/registry-url';

export type RegistryListItem = {
  id: string;
  url: string;
  name?: string;
};

const AIDOKU_REGISTRY_ICON = require('@/assets/images/aidoku-registry.png') as ImageSourcePropType;

const KNOWN_REGISTRY_NAMES: Record<string, string> = {
  [normalizeRegistryUrl(AIDOKU_COMMUNITY_REGISTRY)]: 'Aidoku Community',
};

export function getKnownRegistryDisplayName(url: string): string | undefined {
  return KNOWN_REGISTRY_NAMES[normalizeRegistryUrl(url)];
}

export function resolveRegistryDisplayName(
  item: Pick<RegistryListItem, 'url' | 'name'>,
  catalog?: Pick<SourceRegistry, 'name'> | null,
): string {
  if (catalog?.name?.trim()) return catalog.name.trim();
  return getKnownRegistryDisplayName(item.url) ?? item.name ?? item.url;
}

export function resolveRegistryIconSource(
  registryUrl: string,
  catalog?: Pick<SourceRegistry, 'iconURL'> | null,
): ImageSourcePropType | undefined {
  if (catalog?.iconURL) {
    return { uri: resolveRegistryAssetUrl(registryUrl, catalog.iconURL) };
  }
  if (registryUrlsMatch(registryUrl, AIDOKU_COMMUNITY_REGISTRY)) {
    return AIDOKU_REGISTRY_ICON;
  }
  return undefined;
}

export function enrichRegistryListItem(item: RegistryListItem): RegistryListItem {
  const name = getKnownRegistryDisplayName(item.url);
  if (!name) return item;
  return { ...item, name };
}

export function mergeRegistryWithCatalog(
  item: RegistryListItem,
  catalog: SourceRegistry | null | undefined,
): RegistryListItem {
  if (!catalog?.name?.trim()) return enrichRegistryListItem(item);
  return enrichRegistryListItem({ ...item, name: catalog.name.trim() });
}

export function createRegistryListItem(url: string): RegistryListItem {
  const trimmed = url.trim();
  return enrichRegistryListItem({ id: trimmed, url: trimmed });
}
