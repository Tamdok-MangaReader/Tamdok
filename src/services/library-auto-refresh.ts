import { AppState } from "react-native";

import type { InstalledSource } from "@/parsers/shared/types";
import {
  getLibraryUpdateSettings,
  LIBRARY_UPDATE_INTERVAL_MS,
} from "@/services/library";
import {
  BACKGROUND_ENTRY_TIMEOUT_MS,
  BACKGROUND_REFRESH_BUDGET_MS,
  isLibraryRefreshRunning,
  refreshLibraryEntries,
} from "@/services/library-refresh";
import { getNotifyNewChapters } from "@/services/notifications";

export async function runLibraryAutoRefreshIfNeeded(
  installed: InstalledSource[],
): Promise<void> {
  if (installed.length === 0 || isLibraryRefreshRunning()) return;

  const [settings, notify] = await Promise.all([
    getLibraryUpdateSettings(),
    getNotifyNewChapters(),
  ]);
  if (!settings.backgroundRefresh && !notify) return;

  const intervalMs = LIBRARY_UPDATE_INTERVAL_MS[settings.updateInterval];
  if (intervalMs == null) return;

  if (Date.now() - (settings.lastAutoRefreshAt ?? 0) < intervalMs) return;

  const inBackground = AppState.currentState !== "active";

  await refreshLibraryEntries(installed, undefined, undefined, {
    automatic: true,
    notify,
    minAgeMs: intervalMs,
    ...(inBackground
      ? {
          silent: true,
          budgetMs: BACKGROUND_REFRESH_BUDGET_MS,
          entryTimeoutMs: BACKGROUND_ENTRY_TIMEOUT_MS,
        }
      : {}),
  });
}
