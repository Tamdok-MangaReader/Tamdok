import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = dirname(root);

/** Tamdok JS sources live outside the app repo. */
export const TAMDOK_SOURCES_REPO = join(desktop, 'tamdok-sources');
export const TAMDOK_SOURCES_DIR = join(TAMDOK_SOURCES_REPO, 'sources');

/** Aidoku Rust/WASM sources live outside the app repo. */
export const AIDOKU_SOURCES_REPO = join(desktop, 'sources');
export const AIDOKU_SOURCES_DIR = join(AIDOKU_SOURCES_REPO, 'sources');

export function assertTamdokSourcesRepo() {
  if (!existsSync(TAMDOK_SOURCES_DIR)) {
    throw new Error(`Tamdok sources repo not found: ${TAMDOK_SOURCES_DIR}`);
  }
}

export function assertAidokuSourcesRepo() {
  if (!existsSync(AIDOKU_SOURCES_DIR)) {
    throw new Error(`Aidoku sources repo not found: ${AIDOKU_SOURCES_DIR}`);
  }
}
