import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";

// Android self-update from GitHub Releases. Not imported on iOS.
const RELEASES_URL =
  "https://api.github.com/repos/Tamdok-MangaReader/Tamdok/releases/latest";
const APK_MIME = "application/vnd.android.package-archive";

export type AppRelease = {
  version: string;
  name: string;
  notes: string;
  pageUrl: string;
  apkUrl: string | null;
  apkSize: number | null;
};

type GithubAsset = { name: string; size: number; browser_download_url: string };

type GithubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: GithubAsset[];
};

export function currentAppVersion(): string {
  return String(
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "0",
  );
}

function parseVersion(value: string): number[] {
  return value
    .replace(/^[^\d]*/, "")
    .split(/[.\-+]/)
    .map((part) => parseInt(part, 10))
    .filter((n) => !Number.isNaN(n));
}

/** Positive when `a` is newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const REPO_URL = "https://github.com/Tamdok-MangaReader/Tamdok";

/**
 * Fallback without the REST API (unauthenticated API calls are rate limited to 60/hour per IP,
 * which answers 403). The /releases/latest page redirects to the tag page, and the
 * expanded_assets fragment lists the attached files.
 */
async function fetchLatestReleaseFromWeb(): Promise<AppRelease> {
  const latest = await fetch(`${REPO_URL}/releases/latest`, {
    headers: { Accept: "text/html" },
  });
  const tag = decodeURIComponent(latest.url.split("/releases/tag/")[1] ?? "").split(/[?#]/)[0];
  if (!tag) throw new Error(`GitHub ${latest.status}`);
  const assetsResponse = await fetch(
    `${REPO_URL}/releases/expanded_assets/${encodeURIComponent(tag)}`,
    { headers: { Accept: "text/html" } },
  );
  const html = assetsResponse.ok ? await assetsResponse.text() : "";
  const hrefs = [...html.matchAll(/href="([^"]+\.apk)"/gi)].map((m) => m[1]);
  const href = hrefs.find((h) => /universal|android/i.test(h)) ?? hrefs[0];
  return {
    version: tag,
    name: tag,
    notes: "",
    pageUrl: `${REPO_URL}/releases/tag/${encodeURIComponent(tag)}`,
    apkUrl: href ? new URL(href, "https://github.com").toString() : null,
    apkSize: null,
  };
}

export async function fetchLatestRelease(): Promise<AppRelease> {
  let response: Response | null = null;
  try {
    response = await fetch(RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Tamdok-Android",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch {
    // Network error: try the web fallback below.
  }
  if (!response || response.status === 403 || response.status === 429) {
    return fetchLatestReleaseFromWeb();
  }
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  const release = (await response.json()) as GithubRelease;
  const apks = release.assets.filter((asset) =>
    asset.name.toLowerCase().endsWith(".apk"),
  );
  // Prefer a universal build when several APKs are attached.
  const apk =
    apks.find((asset) => /universal|android/i.test(asset.name)) ?? apks[0];
  return {
    version: release.tag_name,
    name: release.name || release.tag_name,
    notes: (release.body ?? "").trim(),
    pageUrl: release.html_url,
    apkUrl: apk?.browser_download_url ?? null,
    apkSize: apk?.size ?? null,
  };
}

export function isNewer(release: AppRelease): boolean {
  return compareVersions(release.version, currentAppVersion()) > 0;
}

export async function downloadApk(
  url: string,
  onProgress: (fraction: number) => void,
): Promise<string> {
  const target = `${FileSystem.cacheDirectory}Tamdok-update.apk`;
  await FileSystem.deleteAsync(target, { idempotent: true });
  const task = FileSystem.createDownloadResumable(url, target, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) {
      onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  });
  const result = await task.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error(`Download ${result?.status ?? "failed"}`);
  }
  return result.uri;
}

export async function installApk(fileUri: string): Promise<void> {
  // Loaded lazily so a missing native module surfaces as a normal error.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const IntentLauncher = require("expo-intent-launcher") as {
    startActivityAsync: (
      action: string,
      params: { data?: string; flags?: number; type?: string },
    ) => Promise<unknown>;
  };
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
    flags: 1 | 268435456,
    type: APK_MIME,
  });
}
