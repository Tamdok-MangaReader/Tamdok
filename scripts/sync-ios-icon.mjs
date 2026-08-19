import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const src = join(root, 'assets/tamdok.icon');
const dest = join(root, 'ios/Tamdok/tamdok.icon');

if (!existsSync(src) || !existsSync(dest)) {
  process.exit(0);
}

cpSync(src, dest, { recursive: true, force: true });
console.log('Synced assets/tamdok.icon → ios/Tamdok/tamdok.icon');
