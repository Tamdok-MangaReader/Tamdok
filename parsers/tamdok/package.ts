import { unzipSync } from "fflate";

import type { SourceManifest } from "../shared/types";

// Contents of a .tamdok file: a zip with source.json, index.js and optional filters.json/icon.png.
export type TamdokPackage = {
  manifest: SourceManifest;
  script: string;
  filters?: unknown;
  icon?: Uint8Array;
};

export function parseTamdokPackage(data: Uint8Array): TamdokPackage {
  const files = unzipSync(data);
  const manifestBytes = readPayloadFile(files, "source.json");
  const scriptBytes = readPayloadFile(files, "index.js");
  const manifest = JSON.parse(
    new TextDecoder().decode(manifestBytes),
  ) as SourceManifest;

  const filtersFile = tryPayloadFile(files, "filters.json");

  const iconFile = tryPayloadFile(files, "icon.png");

  return {
    manifest,
    script: new TextDecoder().decode(scriptBytes),
    filters: filtersFile
      ? JSON.parse(new TextDecoder().decode(filtersFile))
      : undefined,
    icon: iconFile,
  };
}

export function isTamdokPackageFilename(name: string): boolean {
  return name.endsWith(".tamdok");
}

function readPayloadFile(
  files: Record<string, Uint8Array>,
  name: string,
): Uint8Array {
  const file = tryPayloadFile(files, name);
  if (!file) {
    throw new Error(`Missing ${name} in Tamdok package`);
  }
  return file;
}

// Files normally live under Payload/ (the same layout Aidoku uses); a flat zip is accepted too.
function tryPayloadFile(
  files: Record<string, Uint8Array>,
  name: string,
): Uint8Array | undefined {
  return files[`Payload/${name}`] ?? files[name];
}
