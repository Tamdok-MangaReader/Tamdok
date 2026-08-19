import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

import { assertTamdokSourcesRepo, TAMDOK_SOURCES_DIR } from './source-paths.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const outDir = join(root, 'assets/sources');
const targetId = process.argv[2]?.trim();

assertTamdokSourcesRepo();
mkdirSync(outDir, { recursive: true });

let built = 0;

for (const entry of readdirSync(TAMDOK_SOURCES_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'template') continue;

  const sourceDir = join(TAMDOK_SOURCES_DIR, entry.name);
  const manifestPath = join(sourceDir, 'source.json');
  const scriptPath = join(sourceDir, 'index.js');

  if (!existsSync(manifestPath) || !existsSync(scriptPath)) continue;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (targetId && manifest.info.id !== targetId) continue;

  const script = readFileSync(scriptPath, 'utf8');
  const files = {
    'Payload/source.json': new TextEncoder().encode(JSON.stringify(manifest)),
    'Payload/index.js': new TextEncoder().encode(script),
  };

  if (Array.isArray(manifest.settings) && manifest.settings.length > 0) {
    files['Payload/settings.json'] = new TextEncoder().encode(JSON.stringify(manifest.settings));
  }

  const iconPath = join(sourceDir, 'icon.png');
  if (existsSync(iconPath)) {
    files['Payload/icon.png'] = readFileSync(iconPath);
  }

  const filtersPath = join(sourceDir, 'filters.json');
  if (existsSync(filtersPath)) {
    files['Payload/filters.json'] = readFileSync(filtersPath);
  }

  const pkgName = manifest.info.id.endsWith('.tamdok') ? manifest.info.id : `${manifest.info.id}.tamdok`;
  writeFileSync(join(outDir, pkgName), zipSync(files));
  console.log(`Built assets/sources/${pkgName} from tamdok-sources/${entry.name}`);
  built += 1;
}

if (built === 0) {
  console.error(targetId ? `Source not found in tamdok-sources: ${targetId}` : 'No Tamdok sources found to build');
  process.exit(1);
}
