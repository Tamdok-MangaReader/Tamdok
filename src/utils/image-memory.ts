import { Image } from "expo-image";
import { AppState, Platform, type AppStateStatus } from "react-native";

export const IMAGE_CACHE_POLICY = "disk" as const;

const MAX_DECODED_MEMORY_BYTES = 192 * 1024 * 1024;
const MAX_DECODED_MEMORY_COUNT = 160;
const MAX_DISK_CACHE_BYTES = 512 * 1024 * 1024;

export function releaseImageRef(
  ref: { release?: () => void } | null | undefined,
): void {
  try {
    ref?.release?.();
  } catch {}
}

export function clearDecodedImageCache(): void {
  void Image.clearMemoryCache();
}

function configureNativeImageCache(): void {
  if (Platform.OS !== "ios") return;
  Image.configureCache({
    maxMemoryCost: MAX_DECODED_MEMORY_BYTES,
    maxMemoryCount: MAX_DECODED_MEMORY_COUNT,
    maxDiskSize: MAX_DISK_CACHE_BYTES,
  });
}

export function installImageMemoryReclaimer(): () => void {
  configureNativeImageCache();
  const onChange = (state: AppStateStatus) => {
    if (state !== "background") return;
    clearDecodedImageCache();
  };
  const subscription = AppState.addEventListener("change", onChange);
  return () => subscription.remove();
}
