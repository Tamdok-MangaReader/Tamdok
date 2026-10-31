import Constants from "expo-constants";

import { t } from "@/constants/locales";
import type { RegistryEntry } from "@/parsers/shared/types";

// Compares dotted versions numerically ("1.10" > "1.9"). Missing parts count as 0.
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

// The installed binary's version comes first (same order as the Settings screen). The JS config
// version (app.json) can be ahead of it while developing, which would hide incompatibilities.
export function getAppVersion(): string {
  return Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "0";
}

export type Compatibility = { ok: true } | { ok: false; message: string };

// Aidoku registries use Aidoku's own app versions, so only Tamdok packages are checked.
export function checkSourceCompatibility(
  entry: Pick<RegistryEntry, "minAppVersion" | "maxAppVersion" | "downloadURL">,
  registryUrl: string,
): Compatibility {
  if (entry.downloadURL.endsWith(".aix") || registryUrl.includes("aidoku")) {
    return { ok: true };
  }
  const app = getAppVersion();
  if (entry.minAppVersion && compareVersions(app, entry.minAppVersion) < 0) {
    return {
      ok: false,
      message: t("source_requires_newer_app", { version: entry.minAppVersion, current: app }),
    };
  }
  if (entry.maxAppVersion && compareVersions(app, entry.maxAppVersion) > 0) {
    return {
      ok: false,
      message: t("source_requires_older_app", { version: entry.maxAppVersion, current: app }),
    };
  }
  return { ok: true };
}
