import type { RegistryEntry, SourceRegistry } from "../shared/types";

export const AIDOKU_COMMUNITY_REGISTRY =
  "https://aidoku-community.github.io/sources/index.min.json";

export async function fetchSourceRegistry(
  url: string,
): Promise<SourceRegistry> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load registry: ${response.status}`);
  }
  return (await response.json()) as SourceRegistry;
}

// Registry entries may use absolute URLs or paths relative to the registry file.
export function resolveRegistryAssetUrl(
  registryUrl: string,
  assetPath: string,
): string {
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  const base = registryUrl.replace(/\/[^/]*$/, "/");
  return new URL(assetPath, base).toString();
}

export function resolveRegistryIconUrl(
  registryUrl: string,
  entry: RegistryEntry,
): string | undefined {
  if (!entry.iconURL) return undefined;
  return resolveRegistryAssetUrl(registryUrl, entry.iconURL);
}

// The package extension decides the runtime: .aix = Aidoku (WASM), .tamdok = Tamdok (JS).
// For ambiguous entries the registry URL is used as a hint.
export function registryEntryKind(
  registryUrl: string,
  entry: RegistryEntry,
): "aidoku" | "tamdok" {
  if (entry.downloadURL.endsWith(".aix")) return "aidoku";
  if (entry.downloadURL.endsWith(".tamdok")) return "tamdok";
  if (registryUrl.includes("aidoku")) return "aidoku";
  return "tamdok";
}

// Aidoku numbers content ratings from 0 (safe); the app's scale starts at 1, so values are shifted
// by one and clamped to 1..3.
export function shiftAidokuContentRating(value?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(3, Math.max(1, Math.round(value) + 1));
}

export function normalizeRegistryContentRatings(
  registryUrl: string,
  registry: SourceRegistry,
): SourceRegistry {
  if (!Array.isArray(registry.sources)) return registry;
  return {
    ...registry,
    sources: registry.sources.map((entry) => ({
      ...entry,
      contentRating: shiftAidokuContentRating(entry.contentRating),
    })),
  };
}
