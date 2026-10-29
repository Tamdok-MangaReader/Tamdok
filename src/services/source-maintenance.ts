import { resetAidokuSourceRuntime } from '@/parsers/aidoku/wasm-bridge';
import { clearAidokuSettingsDefaultsCache } from '@/parsers/aidoku/invoke-settings';
import { hostFromUrl } from '@/parsers/shared/host-clearance';
import { clearHostChallenge, clearResponseCache, resetHostThrottle } from '@/parsers/shared/net-policy';
import { invalidateInstalledCaches } from '@/parsers/shared/source-manager';
import type { InstalledSource } from '@/parsers/shared/types';
import { clearMangaDetailCacheForSource } from '@/services/manga-detail-cache';
import { clearReaderPageCacheForSource } from '@/services/reader-page-cache';
import { clearSourceHomeCache } from '@/services/source-home-cache';
import { resetSourceSettings } from '@/services/source-settings';
import { evictSourceRunner } from '@/services/sources';
import { notifyMangaDataChanged } from '@/utils/manga-events';

export function sourceHosts(source: InstalledSource): string[] {
  const urls = [source.manifest.info.url, ...(source.manifest.info.urls ?? [])];
  const hosts = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    const host = hostFromUrl(url);
    if (host) hosts.add(host);
  }
  return [...hosts];
}

export async function resetInstalledSourceSettings(source: InstalledSource): Promise<void> {
  await resetSourceSettings(source.id);
  clearAidokuSettingsDefaultsCache();
  evictSourceRunner(source);
}

export async function clearInstalledSourceCache(source: InstalledSource): Promise<void> {
  const hosts = sourceHosts(source);
  clearResponseCache(hosts);
  resetHostThrottle(hosts);
  for (const host of hosts) clearHostChallenge(host);

  await Promise.all([clearSourceHomeCache(source.id), clearMangaDetailCacheForSource(source.id)]);
  clearReaderPageCacheForSource(source.id);

  invalidateInstalledCaches(source.installPath);
  clearAidokuSettingsDefaultsCache();
  evictSourceRunner(source);
  if (source.kind === 'aidoku') resetAidokuSourceRuntime(source.id);
  notifyMangaDataChanged();
}
