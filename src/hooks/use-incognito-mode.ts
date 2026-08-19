import { useEffect, useState } from 'react';

import { getAppSettings } from '@/services/app-settings';
import { subscribeAppSettings } from '@/utils/app-settings-events';

export function useIncognitoMode(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const settings = await getAppSettings();
      if (!cancelled) setEnabled(settings.incognitoMode);
    };
    void load();
    const unsubscribe = subscribeAppSettings(() => {
      void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return enabled;
}
