import { useEffect, useState } from "react";

import { useSources } from "@/context/sources-context";
import {
  getAppSettings,
  type TabBadgeSettings,
} from "@/services/app-settings";
import { getLibraryUnreadTotal } from "@/services/library";
import { subscribeAppSettings } from "@/utils/app-settings-events";
import { subscribeMangaData } from "@/utils/manga-events";

const DISABLED: TabBadgeSettings = {
  sourceUpdates: false,
  libraryUnread: false,
  libraryUnreadUpdatableOnly: false,
};

function sameSettings(a: TabBadgeSettings, b: TabBadgeSettings): boolean {
  return (
    a.sourceUpdates === b.sourceUpdates &&
    a.libraryUnread === b.libraryUnread &&
    a.libraryUnreadUpdatableOnly === b.libraryUnreadUpdatableOnly
  );
}

export function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function useTabBadges(): { sources: number; library: number } {
  const { pendingUpdates } = useSources();
  const [settings, setSettings] = useState<TabBadgeSettings>(DISABLED);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () =>
      void getAppSettings().then((value) => {
        if (!active) return;
        setSettings((previous) =>
          sameSettings(previous, value.tabBadges) ? previous : value.tabBadges,
        );
      });
    load();
    const unsubscribe = subscribeAppSettings(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const libraryEnabled = settings.libraryUnread;
  const updatableOnly = settings.libraryUnreadUpdatableOnly;

  useEffect(() => {
    if (!libraryEnabled) {
      setUnread(0);
      return;
    }
    let active = true;
    const compute = () =>
      void getLibraryUnreadTotal(updatableOnly).then((total) => {
        if (active) setUnread((previous) => (previous === total ? previous : total));
      });
    compute();
    const unsubscribe = subscribeMangaData(compute);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [libraryEnabled, updatableOnly]);

  return {
    sources: settings.sourceUpdates ? pendingUpdates.length : 0,
    library: libraryEnabled ? unread : 0,
  };
}
