import { unzipSync } from 'fflate';

import type { SourceManifest } from '../shared/types';

export type AidokuPackage = {
  manifest: SourceManifest;
  wasm: Uint8Array;
  filters?: unknown;
  settings?: unknown;
  icon?: Uint8Array;
};

export function parseAidokuPackage(data: Uint8Array): AidokuPackage {
  const files = unzipSync(data);
  const manifestBytes = readPayloadFile(files, 'source.json');
  const wasm = readPayloadFile(files, 'main.wasm');
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as SourceManifest;

  const filtersFile = tryPayloadFile(files, 'filters.json');
  const settingsFile = tryPayloadFile(files, 'settings.json');
  const iconFile = tryPayloadFile(files, 'icon.png');

  return {
    manifest,
    wasm,
    filters: filtersFile ? JSON.parse(new TextDecoder().decode(filtersFile)) : undefined,
    settings: settingsFile ? JSON.parse(new TextDecoder().decode(settingsFile)) : undefined,
    icon: iconFile,
  };
}

function readPayloadFile(files: Record<string, Uint8Array>, name: string): Uint8Array {
  const file = tryPayloadFile(files, name);
  if (!file) {
    throw new Error(`Missing ${name} in Aidoku package`);
  }
  return file;
}

function tryPayloadFile(files: Record<string, Uint8Array>, name: string): Uint8Array | undefined {
  return files[`Payload/${name}`] ?? files[name];
}

export function isAidokuPackageFilename(name: string): boolean {
  return name.endsWith('.aix');
}
