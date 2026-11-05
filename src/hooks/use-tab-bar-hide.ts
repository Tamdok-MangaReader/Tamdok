import { useSegments } from "expo-router";
import { useEffect, useState } from "react";

import {
  DEFAULT_SETTINGS,
  getAppSettings,
  type TabBarHideSettings,
} from "@/services/app-settings";
import { subscribeAppSettings } from "@/utils/app-settings-events";

/** Whether the tab bar should collapse on scroll for the tab that is currently open. */
export function useTabBarHideActive(): boolean {
  const [settings, setSettings] = useState<TabBarHideSettings>(DEFAULT_SETTINGS.tabBarHide);
  const segments = useSegments() as string[];

  useEffect(() => {
    let active = true;
    const load = () =>
      void getAppSettings().then((value) => {
        if (active) setSettings(value.tabBarHide);
      });
    load();
    const unsubscribe = subscribeAppSettings(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const tab = segments[segments.indexOf("(main)") + 1];
  switch (tab) {
    case "sources":
      return settings.sources;
    case "history":
      return settings.history;
    case "settings":
      return settings.settings;
    default:
      return settings.library;
  }
}
