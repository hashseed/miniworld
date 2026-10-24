// The stage cache of the data build (spec milestone 1, section 10.7.2): the result of a slow
// stage, and the files it wrote, kept in data/out/stages/ under a key that hashes everything
// the stage depends on. A later build whose inputs are the same replays the stage instead of
// running it, and writes exactly the bytes a clean build would.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { deserialize, serialize } from 'node:v8';

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

const closures = new Map<string, string[]>();

/** The file and every relative import it reaches, transitively, sorted (code and JSON). */
export function importClosure(entry: string): string[] {
  const hit = closures.get(entry);
  if (hit) return hit;
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!file.endsWith('.ts')) return;
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(IMPORT)) {
      const path = resolve(dirname(file), m[1]!);
      if (existsSync(path)) walk(path);
    }
  };
  walk(entry);
  const files = [...seen].sort();
  closures.set(entry, files);
  return files;
}

const fileHashes = new Map<string, { stamp: string; hash: string }>();
/** The hash of a file, kept while its size and modification time stay the same. */
const hashFile = (path: string) => {
  const st = statSync(path);
  const stamp = `${st.size}:${st.mtimeMs}`;
  const known = fileHashes.get(path);
  if (known?.stamp === stamp) return known.hash;
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  fileHashes.set(path, { stamp, hash });
  return hash;
};

/** A hash of the code a stage runs: its file and everything it imports. */
export function codeKey(root: string, entry: string): string {
  const h = createHash('sha256');
  for (const f of importClosure(entry)) h.update(f.slice(root.length)).update(hashFile(f));
  return h.digest('hex').slice(0, 16);
}

export interface Written {
  name: string;
  bytes: Uint8Array;
}

interface Entry<T> {
  value: T;
  writes: Written[];
}

interface Deps {
  key: string;
  /** The curated files the stage read, with the hash of each. */
  reads: [string, string][];
}

export class StageCache {
  private readonly dir: string;
  private readonly root: string;
  private readonly curatedDir: string;
  readonly on: boolean;

  constructor(dir: string, root: string, curatedDir: string, on: boolean) {
    this.dir = dir;
    this.root = root;
    this.curatedDir = curatedDir;
    this.on = on;
  }

  /**
   * The cached result of a stage when its key and every curated file it read last time are
   * unchanged, else the stage run, then cached. `run` returns the value; `recorded` gives the
   * files written while it ran, `replay` writes cached ones again.
   */
  through<T>(
    name: string,
    key: unknown,
    entry: string,
    io: {
      reads(): string[];
      startRecording(): void;
      stopRecording(): Written[];
      replay(writes: Written[]): void;
    },
    run: () => T,
  ): { value: T; hit: boolean } {
    const k = createHash('sha256')
      .update(codeKey(this.root, entry))
      .update(JSON.stringify(key))
      .digest('hex')
      .slice(0, 16);
    const depsPath = join(this.dir, `${name}.json`);
    const dataPath = join(this.dir, `${name}.v8`);
    if (this.on && existsSync(depsPath) && existsSync(dataPath)) {
      const deps = JSON.parse(readFileSync(depsPath, 'utf8')) as Deps;
      const fresh =
        deps.key === k &&
        deps.reads.every(([f, h]) => {
          const p = join(this.curatedDir, f);
          return existsSync(p) && hashFile(p) === h;
        });
      if (fresh) {
        const entryData = deserialize(readFileSync(dataPath)) as Entry<T>;
        io.replay(entryData.writes);
        return { value: entryData.value, hit: true };
      }
    }
    io.startRecording();
    const value = run();
    const writes = io.stopRecording();
    if (this.on) {
      mkdirSync(this.dir, { recursive: true });
      // Data first, then the deps that make it valid, so a stopped build leaves no half entry.
      rmSync(depsPath, { force: true });
      writeFileSync(dataPath, serialize({ value, writes } satisfies Entry<T>));
      const reads = [...new Set(io.reads())]
        .sort()
        .map((f): [string, string] => [f, hashFile(join(this.curatedDir, f))]);
      writeFileSync(depsPath, JSON.stringify({ key: k, reads } satisfies Deps));
    }
    return { value, hit: false };
  }
}
