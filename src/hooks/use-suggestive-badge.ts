import { useEffect, useState } from "react";

import { getAppSettings } from "@/services/app-settings";
import { subscribeAppSettings } from "@/utils/app-settings-events";

let cached = true;
let loaded = false;

function refresh(): Promise<boolean> {
  return getAppSettings().then((settings) => {
    cached = settings.sourceDisplay.showSuggestiveBadge;
    loaded = true;
    return cached;
  });
}

export function useShowSuggestiveBadge(): boolean {
  const [value, setValue] = useState(cached);

  useEffect(() => {
    let active = true;
    const sync = () =>
      void refresh().then((next) => {
        if (active) setValue(next);
      });
    if (!loaded) sync();
    const unsubscribe = subscribeAppSettings(sync);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return value;
}
