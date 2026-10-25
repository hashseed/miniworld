// The built data in app/public/data, for the pipeline tests (spec milestone 1, section 13):
// reading its files and listing every file the manifest names.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Manifest, PartFile, StartupIndex } from '../../../app/src/content/types.ts';

export const DATA = join(import.meta.dirname, '../../../app/public/data');
export const built = existsSync(join(DATA, 'manifest.json'));

export const read = (file: string) => readFileSync(join(DATA, file));
export const json = <T>(file: string) => JSON.parse(read(file).toString('utf8')) as T;

export function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(relative(DATA, p));
  }
  return out;
}

/** Every file the manifest names, directly or through a layer's part files. */
export function referenced(manifest: Manifest): Set<string> {
  const files = new Set<string>([manifest.lens.file]);
  for (const f of Object.values(manifest.index)) {
    files.add(f);
    // Card texts and structures are named by the startup index.
    const index = json<StartupIndex>(f);
    for (const a of index.animals) files.add(a.text);
    for (const a of index.siteCards) files.add(a.text);
  }
  for (const f of manifest.climate.files) files.add(f);
  for (const f of manifest.foliage.files) files.add(f);
  for (const f of manifest.tree?.files ?? []) if (f) files.add(f);
  if (manifest.tree?.sites) files.add(manifest.tree.sites);
  if (manifest.farming) files.add(manifest.farming);
  for (const layer of Object.values(manifest.layers)) {
    for (const f of Object.values(layer.chunks)) files.add(f);
    for (const f of Object.values(layer.parts)) {
      files.add(f);
      for (const c of Object.values(json<PartFile>(f).chunks)) files.add(c);
    }
  }
  return files;
}
