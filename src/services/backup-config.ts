import { getValue, setValue } from "@/constants/storage";

export const BACKUP_SETTINGS_KEY = "backup_settings_v1";

export const BACKUP_SCOPE_KEYS = [
  "libraryManga",
  "libraryCategories",
  "libraryUpdateSettings",
  "readProgress",
  "history",
  "bookmarks",
  "downloads",
  "readerMangaSettings",
  "appSettings",
  "appearance",
  "notifications",
  "privacy",
  "sourceRepos",
  "installedSources",
  "sourceSettings",
  "sourceLayout",
] as const;

export type BackupScopeKey = (typeof BACKUP_SCOPE_KEYS)[number];
export type BackupScope = Record<BackupScopeKey, boolean>;

export type BackupSection = {
  id: "library" | "app" | "sources";
  titleKey: string;
  items: BackupScopeKey[];
};

export const BACKUP_SECTIONS: BackupSection[] = [
  {
    id: "library",
    titleKey: "backups_section_library",
    items: [
      "libraryManga",
      "libraryCategories",
      "libraryUpdateSettings",
      "readProgress",
      "history",
      "bookmarks",
      "downloads",
      "readerMangaSettings",
    ],
  },
  {
    id: "app",
    titleKey: "backups_section_app",
    items: ["appSettings", "appearance", "notifications", "privacy"],
  },
  {
    id: "sources",
    titleKey: "backups_section_sources",
    items: ["sourceRepos", "installedSources", "sourceSettings", "sourceLayout"],
  },
];

export type BackupInterval = "6h" | "12h" | "1d" | "3d" | "7d";

export const BACKUP_INTERVALS: BackupInterval[] = ["6h", "12h", "1d", "3d", "7d"];

export const BACKUP_INTERVAL_MS: Record<BackupInterval, number> = {
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export const BACKUP_KEEP_OPTIONS = [3, 5, 10, 20];

export type BackupSettings = {
  autoEnabled: boolean;
  interval: BackupInterval;
  keepCount: number;
  autoScope: BackupScope;
  manualScope: BackupScope;
  lastAutoAt?: number;
};

export function fullBackupScope(): BackupScope {
  const scope = {} as BackupScope;
  for (const key of BACKUP_SCOPE_KEYS) scope[key] = true;
  return scope;
}

function normalizeScope(value: unknown): BackupScope {
  const base = fullBackupScope();
  if (!value || typeof value !== "object") return base;
  for (const key of BACKUP_SCOPE_KEYS) {
    const next = (value as Record<string, unknown>)[key];
    if (typeof next === "boolean") base[key] = next;
  }
  return base;
}

export function defaultBackupSettings(): BackupSettings {
  return {
    autoEnabled: true,
    interval: "1d",
    keepCount: 5,
    autoScope: fullBackupScope(),
    manualScope: fullBackupScope(),
  };
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const stored = await getValue<Partial<BackupSettings> | null>(
    BACKUP_SETTINGS_KEY,
    null,
  );
  const defaults = defaultBackupSettings();
  if (!stored) return defaults;
  return {
    autoEnabled:
      typeof stored.autoEnabled === "boolean"
        ? stored.autoEnabled
        : defaults.autoEnabled,
    interval:
      stored.interval && stored.interval in BACKUP_INTERVAL_MS
        ? stored.interval
        : defaults.interval,
    keepCount:
      typeof stored.keepCount === "number" && stored.keepCount > 0
        ? stored.keepCount
        : defaults.keepCount,
    autoScope: normalizeScope(stored.autoScope),
    manualScope: normalizeScope(stored.manualScope),
    lastAutoAt:
      typeof stored.lastAutoAt === "number" ? stored.lastAutoAt : undefined,
  };
}

export async function updateBackupSettings(
  patch: Partial<BackupSettings>,
): Promise<BackupSettings> {
  const next = { ...(await getBackupSettings()), ...patch };
  await setValue(BACKUP_SETTINGS_KEY, next);
  return next;
}

export function hasAnyScope(scope: BackupScope): boolean {
  return BACKUP_SCOPE_KEYS.some((key) => scope[key]);
}
