import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { t } from '@/constants/locales';
import { getAppSettings } from '@/services/app-settings';
import type { LibraryRefreshProgress } from '@/services/library-refresh';

type LibraryLiveActivityNative = {
  start: (title: string, subtitle: string, current: number, total: number) => Promise<string | null>;
  update: (id: string, title: string, subtitle: string, current: number, total: number) => Promise<void>;
  end: (id: string) => Promise<void>;
};

const native = requireOptionalNativeModule<LibraryLiveActivityNative>('LibraryLiveActivity');

let activityId: string | null = null;

export async function syncLibraryRefreshLiveActivity(progress: LibraryRefreshProgress | null): Promise<void> {
  if (Platform.OS !== 'ios' || !native) return;

  try {
    const enabled = (await getAppSettings()).libraryDisplay.showLibraryRefreshLiveActivity ?? true;
    const next = enabled ? progress : null;

    if (!next) {
      if (!activityId) return;
      const id = activityId;
      activityId = null;
      await native.end(id);
      return;
    }

    const title = t('library_updating');
    const subtitle = next.title;

    if (!activityId) {
      activityId = (await native.start(title, subtitle, next.current, next.total)) ?? null;
      return;
    }

    await native.update(activityId, title, subtitle, next.current, next.total);
  } catch {
    activityId = null;
  }
}
