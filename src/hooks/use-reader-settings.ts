import { useEffect, useState } from 'react';

import { getAppSettings, type ReaderSettings } from '@/services/app-settings';
import { subscribeAppSettings } from '@/utils/app-settings-events';

export function useReaderSettings(): ReaderSettings | null {
  const [settings, setSettings] = useState<ReaderSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAppSettings().then((value) => {
      if (!cancelled) setSettings(value.reader);
    });
    const unsubscribe = subscribeAppSettings(() => {
      void getAppSettings().then((value) => {
        if (!cancelled) setSettings(value.reader);
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return settings;
}
