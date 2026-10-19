// Caches of the data build (spec milestone 1, section 10): results of slow stages kept in
// data/out/cache/ under a key, a hash of everything they depend on, so a build that changes
// none of it reads them back instead of computing them again. Values are stored exactly, with
// V8's serialisation (typed arrays, Maps, infinities and NaN included); class instances come
// back as plain objects, so callers store their data and rebuild the instances.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import { Grid, type GridData } from './grid.ts';

export class BuildCache {
  /** Off: nothing is read, nothing written (`--fresh`). */
  readonly on: boolean;
  readonly key: string;
  private readonly root: string;
  private readonly dir: string;
  private pruned = false;

  constructor(root: string, key: string, on = true) {
    this.root = root;
    this.key = key;
    this.on = on;
    this.dir = join(root, key);
  }

  get<T>(name: string): T | undefined {
    const path = join(this.dir, `${name}.v8`);
    if (!this.on || !existsSync(path)) return undefined;
    return deserialize(readFileSync(path)) as T;
  }

  put(name: string, value: unknown): void {
    if (!this.on) return;
    // Only the newest key's results are kept.
    if (!this.pruned && existsSync(this.root))
      for (const old of readdirSync(this.root))
        if (old !== this.key) rmSync(join(this.root, old), { recursive: true, force: true });
    this.pruned = true;
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, `${name}.v8`), serialize(value));
  }

  /** The cached value, or the computed one, which is then cached. */
  through<T>(name: string, compute: () => T): T {
    const hit = this.get<T>(name);
    if (hit !== undefined) return hit;
    const value = compute();
    this.put(name, value);
    return value;
  }
}

/** A hash of files and values, for a cache key. */
export function cacheKey(files: string[], values: unknown): string {
  const h = createHash('sha256');
  for (const f of files) h.update(f).update(readFileSync(f));
  h.update(JSON.stringify(values));
  return h.digest('hex').slice(0, 16);
}

/** A grid as plain data for the cache, and back. */
export interface PlainGrid<T extends GridData> {
  width: number;
  height: number;
  data: T;
}
export const plainGrid = <T extends GridData>(g: Grid<T>): PlainGrid<T> => ({
  width: g.width,
  height: g.height,
  data: g.data,
});
export const fromPlain = <T extends GridData>(p: PlainGrid<T>): Grid<T> =>
  new Grid(p.width, p.height, p.data);
