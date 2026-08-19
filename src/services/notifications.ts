import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { t } from '@/constants/locales';
import { getValue, setValue, storageKeys } from '@/constants/storage';
import type { SourceUpdateInfo } from '@/services/source-updates';

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

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Tamdok',
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
  return getValue(storageKeys.NOTIFY_NEW_CHAPTERS, true);
}

export async function setNotifyNewChapters(value: boolean): Promise<boolean> {
  if (value) {
    const granted = await requestNotificationPermissions();
    if (!granted) return false;
  }
  await setValue(storageKeys.NOTIFY_NEW_CHAPTERS, value);
  return value;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function getNotifiedSourceVersions(): Promise<Record<string, number>> {
  return getValue<Record<string, number>>(storageKeys.SOURCE_UPDATE_NOTIFIED, {});
}

async function setNotifiedSourceVersion(sourceId: string, version: number): Promise<void> {
  const notified = await getNotifiedSourceVersions();
  notified[sourceId] = version;
  await setValue(storageKeys.SOURCE_UPDATE_NOTIFIED, notified);
}

export async function notifyNewSourceUpdates(updates: SourceUpdateInfo[]): Promise<void> {
  const enabled = await getNotifySourceUpdates();
  if (!enabled || updates.length === 0) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const notified = await getNotifiedSourceVersions();

  for (const update of updates) {
    const lastNotified = notified[update.sourceId] ?? 0;
    if (update.availableVersion <= lastNotified) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notification_source_update_title'),
        body: t('notification_source_update_body', {
          name: update.source.manifest.info.name,
          version: String(update.availableVersion),
        }),
        data: { type: 'source_update', sourceId: update.sourceId },
      },
      trigger: null,
    });

    await setNotifiedSourceVersion(update.sourceId, update.availableVersion);
  }
}

export async function notifyNewChaptersAvailable(mangaTitle: string, chapterTitle: string): Promise<void> {
  const enabled = await getNotifyNewChapters();
  if (!enabled) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: t('notification_new_chapter_title'),
      body: t('notification_new_chapter_body', { manga: mangaTitle, chapter: chapterTitle }),
      data: { type: 'new_chapter' },
    },
    trigger: null,
  });
}
