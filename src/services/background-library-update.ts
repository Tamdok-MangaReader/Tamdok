import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { flushPreferences } from "@/constants/storage";
import {
  getLibraryUpdateSettings,
  LIBRARY_UPDATE_INTERVAL_MS,
} from "@/services/library";
import {
  BACKGROUND_ENTRY_TIMEOUT_MS,
  BACKGROUND_REFRESH_BUDGET_MS,
  refreshLibraryEntries,
} from "@/services/library-refresh";
import { getNotifyNewChapters } from "@/services/notifications";
import { getInstalledSources } from "@/services/sources";

export const LIBRARY_BACKGROUND_TASK = "tamdok-library-background-update";

const MIN_INTERVAL_MINUTES = 15;

async function runBackgroundLibraryUpdate(): Promise<void> {
  const [settings, notify] = await Promise.all([
    getLibraryUpdateSettings(),
    getNotifyNewChapters(),
  ]);
  if (!settings.backgroundRefresh && !notify) return;

  const intervalMs = LIBRARY_UPDATE_INTERVAL_MS[settings.updateInterval];
  if (intervalMs == null) return;
  if (Date.now() - (settings.lastAutoRefreshAt ?? 0) < intervalMs) return;

  const installed = await getInstalledSources();
  if (installed.length === 0) return;

  await refreshLibraryEntries(installed, undefined, undefined, {
    automatic: true,
    notify,
    silent: true,
    minAgeMs: intervalMs,
    budgetMs: BACKGROUND_REFRESH_BUDGET_MS,
    entryTimeoutMs: BACKGROUND_ENTRY_TIMEOUT_MS,
  });
}

TaskManager.defineTask(LIBRARY_BACKGROUND_TASK, async () => {
  try {
    await runBackgroundLibraryUpdate();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    await flushPreferences();
  }
});

export async function syncBackgroundLibraryUpdates(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const [settings, notify] = await Promise.all([
      getLibraryUpdateSettings(),
      getNotifyNewChapters(),
    ]);
    const intervalMs = LIBRARY_UPDATE_INTERVAL_MS[settings.updateInterval];
    const wanted = (notify || settings.backgroundRefresh) && intervalMs != null;
    const registered = await TaskManager.isTaskRegisteredAsync(
      LIBRARY_BACKGROUND_TASK,
    );

    if (!wanted) {
      if (registered)
        await BackgroundTask.unregisterTaskAsync(LIBRARY_BACKGROUND_TASK);
      return;
    }

    const minutes = Math.max(
      MIN_INTERVAL_MINUTES,
      Math.round((intervalMs ?? 0) / 60_000),
    );
    await BackgroundTask.registerTaskAsync(LIBRARY_BACKGROUND_TASK, {
      minimumInterval: minutes,
    });
  } catch {}
}

export async function isBackgroundUpdateAvailable(): Promise<boolean> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    return status === BackgroundTask.BackgroundTaskStatus.Available;
  } catch {
    return false;
  }
}
