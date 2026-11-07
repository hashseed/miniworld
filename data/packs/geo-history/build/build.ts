// Data build of the geo-history pack (engine.md, section 3): validates the
// curated tables and the plate model's extract and writes them, content-hashed,
// to the pack's public folder, with the manifest the app starts from.
//
// Usage: node data/packs/geo-history/build/build.ts

import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGeoData } from './geoData.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const PUBLIC = join(ROOT, 'app/packs/geo-history/public');
const OUT = join(PUBLIC, 'data');

const data = buildGeoData();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const file = `geo.${data.version}.json`;
const body = JSON.stringify(data);
writeFileSync(join(OUT, file), body);
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ version: data.version, geo: file }));
// The pack's favicons come from the shared ones.
for (const name of ['favicon-32.png', 'apple-touch-icon.png']) {
  const from = join(ROOT, 'app/public', name);
  if (existsSync(from)) copyFileSync(from, join(PUBLIC, name));
}
console.log(`build-data (geo-history): ${file}, ${(body.length / 1024).toFixed(0)} KB`);
