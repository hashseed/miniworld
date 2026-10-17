// Downloads the source datasets listed in data/sources.json into
// data/sources/<id>/ and records their checksums (spec milestone 1, section
// 2.2). Run once per source version; the data build then reads only the
// committed copies. Archives are downloaded to data/out/ and their wanted
// files must be extracted by hand until the archive layout is verified.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceEntry } from './lib/licence.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SOURCES_JSON = join(ROOT, 'data/sources.json');

interface Download {
  url: string;
  files?: string[];
  archive?: string;
  note?: string;
}

interface Entry extends SourceEntry {
  download?: Download;
  files: { path: string; sha256: string; bytes: number }[];
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`fetch-data: ${basename(dest)} ${(buf.length / 1e6).toFixed(1)} MB`);
}

function checksum(path: string): { sha256: string; bytes: number } {
  const data = readFileSync(path);
  return { sha256: createHash('sha256').update(data).digest('hex'), bytes: statSync(path).size };
}

async function main(): Promise<void> {
  const only = process.argv.slice(2);
  const doc = JSON.parse(readFileSync(SOURCES_JSON, 'utf8')) as { sources: Entry[] };
  for (const src of doc.sources) {
    if (only.length && !only.includes(src.id)) continue;
    const dl = src.download;
    if (!dl) continue;
    const dir = join(ROOT, 'data/sources', src.id);
    mkdirSync(dir, { recursive: true });
    if (dl.archive) {
      const out = join(ROOT, 'data/out');
      mkdirSync(out, { recursive: true });
      const dest = join(out, `${src.id}.${dl.archive}`);
      if (!existsSync(dest)) await download(dl.url, dest);
      console.log(`fetch-data: ${src.id}: extract into ${dir} by hand. ${dl.note ?? ''}`);
    } else {
      for (const file of dl.files ?? []) {
        const url = dl.url.endsWith('/') ? dl.url + file : dl.url;
        const dest = join(dir, file);
        if (!existsSync(dest)) await download(url, dest);
      }
    }
    // Record checksums of everything now in the source folder that is listed or new.
    const listed = new Set([...(dl.files ?? []), ...src.files.map((f) => f.path)]);
    src.files = [...listed]
      .filter((p) => existsSync(join(dir, p)))
      .map((p) => ({ path: p, ...checksum(join(dir, p)) }));
  }
  writeFileSync(SOURCES_JSON, `${JSON.stringify(doc, null, 2)}\n`);
  console.log('fetch-data: updated data/sources.json');
}

await main();
