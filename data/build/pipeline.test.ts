// Pipeline tests (spec milestone 1, section 13): the manifest, chunk keys and
// content hashes of the built data. Like the golden tests they run on the
// data in app/public/data (`npm run golden`; in CI on the fixture dataset) and
// are skipped when nothing has been built.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Manifest, PartFile, StartupIndex } from '../../app/src/content/types.ts';
import { contentHash } from './lib/output.ts';

const DATA = join(import.meta.dirname, '../../app/public/data');
const built = existsSync(join(DATA, 'manifest.json'));

const read = (file: string) => readFileSync(join(DATA, file));
const json = <T>(file: string) => JSON.parse(read(file).toString('utf8')) as T;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(relative(DATA, p));
  }
  return out;
}

describe.skipIf(!built)('built data pipeline', () => {
  const manifest = built ? json<Manifest>('manifest.json') : ({} as Manifest);

  /** Every file the manifest names, directly or through a layer's part files. */
  function referenced(): Set<string> {
    const files = new Set<string>([manifest.lens.file]);
    for (const f of Object.values(manifest.index)) {
      files.add(f);
      // Card texts and structures are named by the startup index.
      const index = json<StartupIndex>(f);
      for (const e of [...index.vignettes, ...index.landmarks]) files.add(e.structure).add(e.text);
      for (const a of index.animals) files.add(a.text);
      for (const a of index.siteCards) files.add(a.text);
    }
    for (const f of manifest.climate.files) files.add(f);
    for (const f of manifest.foliage.files) files.add(f);
    for (const f of manifest.tree?.files ?? []) if (f) files.add(f);
    if (manifest.tree?.sites) files.add(manifest.tree.sites);
    for (const layer of Object.values(manifest.layers)) {
      for (const f of Object.values(layer.chunks)) files.add(f);
      for (const f of Object.values(layer.parts)) {
        files.add(f);
        for (const c of Object.values(json<PartFile>(f).chunks)) files.add(c);
      }
    }
    return files;
  }

  it('lists both languages, the time windows and matching slices', () => {
    expect(manifest.languages).toEqual(['en', 'de']);
    expect(Object.keys(manifest.index).sort()).toEqual(['de', 'en']);
    const w = manifest.windows;
    expect(w).toHaveLength(35);
    expect(w[0]).toBe(manifest.timelineStartDay);
    for (let k = 1; k < w.length; k++) {
      expect(Number.isInteger(w[k])).toBe(true);
      expect(w[k]).toBeGreaterThan(w[k - 1]!);
    }
    expect(w.at(-1)).toBeLessThan(manifest.cutoffDay);
    const days = manifest.climate.days;
    expect(manifest.climate.files).toHaveLength(days.length);
    for (let k = 1; k < days.length; k++) expect(days[k]).toBeGreaterThan(days[k - 1]!);
    expect(manifest.foliage.days).toEqual(days);
    expect(manifest.foliage.files).toHaveLength(days.length);
  });

  it('keys every chunk by place, window and language, under its part', () => {
    for (const [name, layer] of Object.entries(manifest.layers)) {
      const key = layer.timed ? /^\d\/[0-3]*\/\d+\/(xx|en|de)$/ : /^\d\/[0-3]*\/all\/(xx|en|de)$/;
      const levelOf = (k: string) => k.split('/')[1]!.length;
      for (const k of Object.keys(layer.chunks)) {
        expect(k, name).toMatch(key);
        expect(levelOf(k)).toBeLessThanOrEqual(1);
      }
      for (const [path, file] of Object.entries(layer.parts)) {
        expect(path).toMatch(/^\d\/[0-3]{2}$/);
        const part = json<PartFile>(file);
        for (const k of Object.keys(part.chunks)) {
          expect(k, name).toMatch(key);
          expect(k.startsWith(path), `${k} under ${path}`).toBe(true);
          expect(levelOf(k)).toBeGreaterThanOrEqual(2);
          expect(levelOf(k)).toBeLessThanOrEqual(layer.maxLevel);
        }
        for (const d of part.deep ?? [])
          expect(d.startsWith(path), `${d} under ${path}`).toBe(true);
      }
    }
  });

  it('names every file by the hash of its content, with a matching Brotli copy', () => {
    const files = referenced();
    for (const file of files) {
      const bytes = read(file);
      const hash = /\.([0-9a-f]{16})\.[a-z]+$/.exec(file)?.[1];
      expect(hash, file).toBe(contentHash(bytes));
      expect(brotliDecompressSync(read(`${file}.br`)).equals(bytes), `${file}.br`).toBe(true);
    }
  });

  it('holds no file the manifest does not name', () => {
    const files = referenced();
    files.add('manifest.json');
    const orphans = walk(DATA)
      .map((f) => f.replace(/\.br$/, ''))
      .filter((f) => !files.has(f));
    expect(orphans).toEqual([]);
  });

  it('keeps the startup index and manifest within their budgets (section 10.6)', () => {
    const br = (file: string) => statSync(join(DATA, `${file}.br`)).size;
    for (const file of Object.values(manifest.index)) {
      expect(br(file), file).toBeLessThanOrEqual(150 * 1024);
      expect(br('manifest.json') + br(file)).toBeLessThanOrEqual(200 * 1024);
    }
  });
});
