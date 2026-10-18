// Records Yang's approval of models in data/assets/manifest.json: status
// `approved`, today's review date and the hash of the geometry approved
// (spec milestone 2, section 13.3). Run it only after Yang has approved them.
//
// Usage: node assets/approve.ts <asset id>... [--note "text"]

import { readFileSync, writeFileSync } from 'node:fs';
import { MODELS, geometryHash } from './src/approval.ts';

interface Entry {
  id: string;
  status: string;
  reviewed?: string;
  geometry?: string;
  note?: string;
  [key: string]: unknown;
}

const FILE = new URL('../data/assets/manifest.json', import.meta.url).pathname;
const args = process.argv.slice(2);
const noteAt = args.indexOf('--note');
const note = noteAt >= 0 ? args.splice(noteAt, 2)[1] : undefined;
if (args.length === 0) {
  console.error('usage: node assets/approve.ts <asset id>... [--note "text"]');
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(FILE, 'utf8')) as { assets: Entry[] };
const today = new Date().toISOString().slice(0, 10);
for (const id of args) {
  const build = MODELS[id];
  const entry = manifest.assets.find((a) => a.id === id);
  if (!build || !entry) {
    console.error(`${id}: not a model in the asset manifest`);
    process.exit(1);
  }
  const geometry = geometryHash(build());
  // Keep the key order of the entry, with the hash right after the status.
  const updated = {} as Entry;
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'status') Object.assign(updated, { status: 'approved', geometry });
    else if (key !== 'geometry') updated[key] = value;
  }
  updated.reviewed = today;
  if (note !== undefined) updated.note = note;
  manifest.assets[manifest.assets.indexOf(entry)] = updated;
  console.log(`${id}: approved, geometry ${geometry}`);
}
writeFileSync(FILE, `${JSON.stringify(manifest, null, 2)}\n`);
