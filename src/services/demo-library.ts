import { Image } from "react-native";

import { ILLUSTRATION_SOURCE_ID } from "@/services/illustration-mode";
import type { LibraryEntry } from "@/services/library";

const DAY_MS = 24 * 60 * 60 * 1000;

function cover(asset: number): string | undefined {
  return Image.resolveAssetSource(asset)?.uri;
}

const DEMO_TITLES = [
  { key: "kestrel-lane", title: "Kestrel Lane", unread: 3, asset: require("../../assets/images/demo-covers/kestrel.png") },
  { key: "salt-and-sourdough", title: "Salt & Sourdough", unread: 12, asset: require("../../assets/images/demo-covers/sourdough.png") },
  { key: "tide-breakers", title: "Tide Breakers", unread: 0, asset: require("../../assets/images/demo-covers/tidebreakers.png") },
  { key: "orchard-of-echoes", title: "Orchard of Echoes", unread: 7, asset: require("../../assets/images/demo-covers/orchard.png") },
] as const;

/** Fictional titles with original covers, shown in the library only while screenshot (illustration) mode is on. */
export const DEMO_LIBRARY_ENTRIES: LibraryEntry[] = DEMO_TITLES.map((item, index) => ({
  sourceId: ILLUSTRATION_SOURCE_ID,
  mangaKey: `demo:${item.key}`,
  title: item.title,
  cover: cover(item.asset),
  categoryIds: [],
  dateAdded: Date.now() - index * DAY_MS,
  unreadCount: item.unread,
  status: "ongoing",
}));
