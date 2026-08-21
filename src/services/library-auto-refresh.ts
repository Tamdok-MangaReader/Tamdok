import type { InstalledSource } from '@/parsers/shared/types';
import { getLibraryUpdateSettings, LIBRARY_UPDATE_INTERVAL_MS } from '@/services/library';
import { refreshLibraryEntries } from '@/services/library-refresh';

let refreshInFlight = false;

export async function runLibraryAutoRefreshIfNeeded(installed: InstalledSource[]): Promise<void> {
  if (refreshInFlight || installed.length === 0) return;

  const settings = await getLibraryUpdateSettings();
  if (!settings.backgroundRefresh) return;

  const intervalMs = LIBRARY_UPDATE_INTERVAL_MS[settings.updateInterval];
  if (intervalMs == null) return;

  const now = Date.now();
  const lastRefresh = settings.lastAutoRefreshAt ?? 0;
  if (now - lastRefresh < intervalMs) return;

  if (settings.updateOnWifiOnly) {
    // Wi-Fi detection is not wired yet; proceed for now.
  }

  refreshInFlight = true;
  try {
    await refreshLibraryEntries(installed);
  } finally {
    refreshInFlight = false;
  }
}
