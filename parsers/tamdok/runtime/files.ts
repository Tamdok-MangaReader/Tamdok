import * as FileSystem from "expo-file-system/legacy";

import { bytesToBase64 } from "../../shared/base64";

// Images produced by sources (for example decrypted pages) live in the system cache directory:
// the OS may reclaim it, and old files are pruned here once per app session.
const DIR = `${FileSystem.cacheDirectory}tamdok-source-images/`;
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;
const SAFE_EXTENSION = /^[a-z0-9]{1,5}$/;

let ready: Promise<void> | null = null;
let counter = 0;

async function prepare(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    return;
  }
  // Best effort cleanup; failures only mean the files stay until next time.
  try {
    const names = await FileSystem.readDirectoryAsync(DIR);
    const cutoff = Date.now() - MAX_AGE_MS;
    await Promise.all(
      names.map(async (name) => {
        const file = await FileSystem.getInfoAsync(`${DIR}${name}`);
        if (file.exists && (file.modificationTime ?? 0) * 1000 < cutoff) {
          await FileSystem.deleteAsync(`${DIR}${name}`, { idempotent: true });
        }
      }),
    );
  } catch {}
}

// Writes `bytes` to a new cache file and returns its file:// URI.
export async function saveSourceImage(
  sourceId: string,
  bytes: Uint8Array,
  extension = "jpg",
): Promise<string> {
  if (!ready) ready = prepare().catch(() => undefined);
  await ready;
  const ext = SAFE_EXTENSION.test(extension) ? extension : "jpg";
  const safeSource = sourceId.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 24);
  counter += 1;
  const uri = `${DIR}${safeSource}-${Date.now().toString(36)}-${counter}.${ext}`;
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}
