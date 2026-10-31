import { Image } from "react-native";
import { useSyncExternalStore } from "react";

import { getValue, setValue } from "@/constants/storage";
import type { InstalledSource } from "@/parsers/shared/types";

const STORAGE_KEY = "illustration_mode_v1";

export const ILLUSTRATION_SOURCE_ID = "komga";

export const ILLUSTRATION_SOURCE: InstalledSource = {
  id: ILLUSTRATION_SOURCE_ID,
  kind: "tamdok",
  installPath: "",
  iconUri: Image.resolveAssetSource(require("../../assets/images/komga.png"))
    ?.uri,
  manifest: {
    info: {
      id: ILLUSTRATION_SOURCE_ID,
      name: "Komga",
      version: 1,
      languages: ["multi"],
      contentRating: 0,
    },
  },
};

const ILLUSTRATION_ROUTE_ID = `${ILLUSTRATION_SOURCE.kind}:${ILLUSTRATION_SOURCE_ID}`;

let enabled = false;
const listeners = new Set<() => void>();

export const illustrationModeReady: Promise<void> = getValue<boolean>(
  STORAGE_KEY,
  false,
)
  .then((value) => {
    if (value !== enabled) {
      enabled = value;
      listeners.forEach((listener) => listener());
    }
  })
  .catch(() => undefined);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isIllustrationMode(): boolean {
  return enabled;
}

export function useIllustrationMode(): boolean {
  return useSyncExternalStore(subscribe, isIllustrationMode, () => false);
}

export async function setIllustrationMode(value: boolean): Promise<void> {
  if (enabled === value) return;
  enabled = value;
  listeners.forEach((listener) => listener());
  await setValue(STORAGE_KEY, value);
}

export function subscribeIllustrationMode(listener: () => void): () => void {
  return subscribe(listener);
}

export function isIllustrationSourceRoute(routeId: string): boolean {
  if (routeId === ILLUSTRATION_ROUTE_ID || routeId === ILLUSTRATION_SOURCE_ID) {
    return true;
  }
  try {
    return decodeURIComponent(routeId) === ILLUSTRATION_ROUTE_ID;
  } catch {
    return false;
  }
}

export function isIllustrationSource(
  source: Pick<InstalledSource, "id">,
): boolean {
  return source.id === ILLUSTRATION_SOURCE_ID;
}
