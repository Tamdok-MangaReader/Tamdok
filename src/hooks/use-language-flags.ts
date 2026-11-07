import { useEffect, useState } from "react";

import { getAppSettings } from "@/services/app-settings";
import { subscribeAppSettings } from "@/utils/app-settings-events";

let cached = true;
let loaded = false;

/** Current value for plain (non-hook) formatters; components that use them also call `useLanguageFlags` to re-render. */
export function languageFlagsEnabled(): boolean {
  return cached;
}

function refresh(): Promise<boolean> {
  return getAppSettings().then((settings) => {
    cached = settings.sourceDisplay.languageFlags;
    loaded = true;
    return cached;
  });
}

export function useLanguageFlags(): boolean {
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
