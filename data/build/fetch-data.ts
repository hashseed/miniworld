// Downloads the original source datasets listed in data/sources.json into
// data/out/<id>/ (not committed) and checks them against the recorded
// checksums (spec milestone 1, section 2.2). npm run simplify-data then turns
// them into the small extracts kept under data/sources/<id>/. Run once per
// source version. Archives are downloaded whole and the wanted files must be
// extracted by hand, as the source's download note says.
//
// Usage: node data/build/fetch-data.ts [source-id ...]

import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import type { SourceEntry } from './lib/licence.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SOURCES_JSON = join(ROOT, 'data/sources.json');

interface Download {
  url: string;
  files?: string[];
  archive?: string;
  note?: string;
  /** sha256 of each original download, by file name. */
  sha256?: Record<string, string>;
}

interface Entry extends SourceEntry {
  download?: Download;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as ReadableStream), createWriteStream(dest));
  console.log(`fetch-data: downloaded ${basename(dest)}`);
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function main(): Promise<void> {
  const only = process.argv.slice(2);
  const doc = JSON.parse(readFileSync(SOURCES_JSON, 'utf8')) as { sources: Entry[] };
  let changed = false;
  for (const src of doc.sources) {
    if (only.length && !only.includes(src.id)) continue;
    const dl = src.download;
    if (!dl) continue;
    const dir = join(ROOT, 'data/out', src.id);
    mkdirSync(dir, { recursive: true });
    const names = dl.archive ? [`${src.id}.${dl.archive}`] : (dl.files ?? []);
    for (const name of names) {
      const url = dl.url.endsWith('/') ? dl.url + name : dl.url;
      const dest = join(dir, name);
      if (!existsSync(dest)) await download(url, dest);
      const sum = await sha256(dest);
      const recorded = dl.sha256?.[name];
      if (recorded && recorded !== sum)
        throw new Error(
          `${src.id}: ${name} does not match the recorded checksum; delete it and retry`,
        );
      if (!recorded) {
        dl.sha256 = { ...dl.sha256, [name]: sum };
        changed = true;
      }
    }
    if (dl.archive)
      console.log(`fetch-data: ${src.id}: extract by hand into ${dir}. ${dl.note ?? ''}`);
  }
  if (changed) {
    writeFileSync(SOURCES_JSON, `${JSON.stringify(doc, null, 2)}\n`);
    console.log('fetch-data: recorded new checksums in data/sources.json');
  }
}

await main();
