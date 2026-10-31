import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { flushPreferences } from "@/constants/storage";
import {
  BACKUP_INTERVAL_MS,
  getBackupSettings,
  hasAnyScope,
  updateBackupSettings,
} from "@/services/backup-config";
import { createBackup, deleteBackup, listBackups } from "@/services/backup";
import { notifyMangaDataChanged } from "@/utils/manga-events";

export const AUTO_BACKUP_TASK = "tamdok-auto-backup";

const MIN_INTERVAL_MINUTES = 15;

let running: Promise<boolean> | null = null;

async function pruneAutoBackups(keepCount: number): Promise<void> {
  const backups = (await listBackups()).filter((backup) => backup.auto);
  const stale = backups.slice(keepCount);
  for (const backup of stale) {
    await deleteBackup(backup.uri);
  }
}

export function runAutoBackupIfNeeded(force = false): Promise<boolean> {
  if (running) return running;
  running = (async () => {
    try {
      const settings = await getBackupSettings();
      if (!settings.autoEnabled && !force) return false;
      if (!hasAnyScope(settings.autoScope)) return false;
      const intervalMs = BACKUP_INTERVAL_MS[settings.interval];
      if (!force && Date.now() - (settings.lastAutoAt ?? 0) < intervalMs) {
        return false;
      }
      await createBackup({ scope: settings.autoScope, auto: true });
      await updateBackupSettings({ lastAutoAt: Date.now() });
      await pruneAutoBackups(settings.keepCount);
      notifyMangaDataChanged();
      return true;
    } catch {
      return false;
    } finally {
      running = null;
    }
  })();
  return running;
}

TaskManager.defineTask(AUTO_BACKUP_TASK, async () => {
  try {
    await runAutoBackupIfNeeded();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    await flushPreferences();
  }
});

export async function syncAutoBackupTask(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const settings = await getBackupSettings();
    const registered = await TaskManager.isTaskRegisteredAsync(AUTO_BACKUP_TASK);

    if (!settings.autoEnabled) {
      if (registered) await BackgroundTask.unregisterTaskAsync(AUTO_BACKUP_TASK);
      return;
    }

    const minutes = Math.max(
      MIN_INTERVAL_MINUTES,
      Math.round(BACKUP_INTERVAL_MS[settings.interval] / 60_000),
    );
    await BackgroundTask.registerTaskAsync(AUTO_BACKUP_TASK, {
      minimumInterval: minutes,
    });
  } catch {}
}
