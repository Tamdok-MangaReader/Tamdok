import {
  buildRegistrySettingsHref,
  parseRegistryDeepLink,
  setPendingRegistryDeepLink,
} from '@/utils/registry-deep-link';

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const registryUrl = parseRegistryDeepLink(path);
    if (!registryUrl) return path;

    setPendingRegistryDeepLink(registryUrl);
    return buildRegistrySettingsHref(registryUrl);
  } catch {
    return '/';
  }
}
