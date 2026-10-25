// Pipeline tests (spec milestone 1, section 13): the manifest, chunk keys and
// content hashes of the built data. Like the golden tests they run on the
// data in app/public/data (`npm run golden`; in CI on the fixture dataset) and
// are skipped when nothing has been built. The check of every file's hash and Brotli copy
// is split over pipelineFiles*.test.ts, so vitest reads the files in parallel.

import { statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Manifest, PartFile } from '../../app/src/content/types.ts';
import { DATA, built, json, referenced, walk } from './lib/builtData.ts';

describe.skipIf(!built)('built data pipeline', () => {
  const manifest = built ? json<Manifest>('manifest.json') : ({} as Manifest);

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

  it('holds no file the manifest does not name', () => {
    const files = referenced(manifest);
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
