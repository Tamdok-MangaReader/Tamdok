import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { t } from "@/constants/locales";
import { getValue, setValue, storageKeys } from "@/constants/storage";
import {
  getLibraryUpdateSettings,
  updateLibraryUpdateSettings,
} from "@/services/library";
import type { SourceUpdateInfo } from "@/services/source-updates";

export type NewChapterNotice = {
  sourceId: string;
  routeId: string;
  mangaKey: string;
  title: string;
  cover?: string;
  latest: string;
  count: number;
};

export type NewChapterTarget = {
  routeId: string;
  mangaKey: string;
  title: string;
  cover?: string;
};

export async function initNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Tamdok",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function getNotifySourceUpdates(): Promise<boolean> {
  return getValue(storageKeys.NOTIFY_SOURCE_UPDATES, true);
}

export async function setNotifySourceUpdates(value: boolean): Promise<boolean> {
  if (value) {
    const granted = await requestNotificationPermissions();
    if (!granted) return false;
  }
  await setValue(storageKeys.NOTIFY_SOURCE_UPDATES, value);
  return value;
}

export async function getNotifyNewChapters(): Promise<boolean> {
  return getValue(storageKeys.NOTIFY_NEW_CHAPTERS, false);
}

export async function setNotifyNewChapters(value: boolean): Promise<boolean> {
  if (value) {
    const granted = await requestNotificationPermissions();
    if (!granted) return false;
    const settings = await getLibraryUpdateSettings();
    if (settings.updateInterval === "never") {
      await updateLibraryUpdateSettings({ updateInterval: "12h" });
    }
  }
  await setValue(storageKeys.NOTIFY_NEW_CHAPTERS, value);
  const { syncBackgroundLibraryUpdates } =
    await import("@/services/background-library-update");
  await syncBackgroundLibraryUpdates();
  return value;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

async function getNotifiedSourceVersions(): Promise<Record<string, number>> {
  return getValue<Record<string, number>>(
    storageKeys.SOURCE_UPDATE_NOTIFIED,
    {},
  );
}

async function setNotifiedSourceVersion(
  sourceId: string,
  version: number,
): Promise<void> {
  const notified = await getNotifiedSourceVersions();
  notified[sourceId] = version;
  await setValue(storageKeys.SOURCE_UPDATE_NOTIFIED, notified);
}

export async function notifyNewSourceUpdates(
  updates: SourceUpdateInfo[],
): Promise<void> {
  const enabled = await getNotifySourceUpdates();
  if (!enabled || updates.length === 0) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  const notified = await getNotifiedSourceVersions();

  for (const update of updates) {
    const lastNotified = notified[update.sourceId] ?? 0;
    if (update.availableVersion <= lastNotified) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: t("notification_source_update_title"),
        body: t("notification_source_update_body", {
          name: update.source.manifest.info.name,
          version: String(update.availableVersion),
        }),
        data: { type: "source_update", sourceId: update.sourceId },
      },
      trigger: null,
    });

    await setNotifiedSourceVersion(update.sourceId, update.availableVersion);
  }
}

export async function notifyNewChapters(
  notices: NewChapterNotice[],
): Promise<void> {
  if (notices.length === 0) return;
  if (!(await getNotifyNewChapters())) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  for (const notice of notices) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `new-chapter:${notice.sourceId}:${notice.mangaKey}`,
        content: {
          title: notice.title,
          body:
            notice.count > 1
              ? t("notification_new_chapter_body_many", {
                  count: String(notice.count),
                  chapter: notice.latest,
                })
              : t("notification_new_chapter_body_one", {
                  chapter: notice.latest,
                }),
          data: {
            type: "new_chapter",
            routeId: notice.routeId,
            mangaKey: notice.mangaKey,
            title: notice.title,
            ...(notice.cover ? { cover: notice.cover } : {}),
          },
        },
        trigger: null,
      });
    } catch {}
  }
}

export function parseNewChapterResponse(
  response: Notifications.NotificationResponse | null | undefined,
): NewChapterTarget | null {
  const data = response?.notification.request.content.data as
    Record<string, unknown> | undefined;
  if (!data || data.type !== "new_chapter") return null;
  const routeId = typeof data.routeId === "string" ? data.routeId : "";
  const mangaKey = typeof data.mangaKey === "string" ? data.mangaKey : "";
  if (!routeId || !mangaKey) return null;
  return {
    routeId,
    mangaKey,
    title: typeof data.title === "string" ? data.title : mangaKey,
    cover: typeof data.cover === "string" ? data.cover : undefined,
  };
}
