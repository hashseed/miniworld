// Proves the build caches never change the result (spec milestone 1, section 10.7.2): builds
// the data without any cache, then with the caches filled, then with them used, and compares
// a hash of every output file. Extra arguments go to the build (`-- --fixture`).
//
// Usage: node data/build/verify-cache.ts [--fixture] [--max-level N]

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './stages/context.ts';

const OUT = join(ROOT, 'app/public/data');

function outputHash(): string {
  const h = createHash('sha256');
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else h.update(relative(OUT, path)).update(readFileSync(path));
    }
  };
  walk(OUT);
  return h.digest('hex');
}

const extra = process.argv.slice(2);
const runs: [string, string[]][] = [
  ['no cache', ['--no-cache']],
  ['clean, caches filled', ['--clean']],
  ['caches used', []],
];
const hashes: string[] = [];
for (const [label, flags] of runs) {
  const t = performance.now();
  const r = spawnSync('node', [join(ROOT, 'data/build/build-data.ts'), ...extra, ...flags], {
    stdio: 'ignore',
  });
  if (r.status !== 0) throw new Error(`${label}: the build failed`);
  hashes.push(outputHash());
  console.log(
    `${label}: ${((performance.now() - t) / 1000).toFixed(1)} s, output ${hashes.at(-1)!.slice(0, 16)}`,
  );
}
if (new Set(hashes).size !== 1) {
  console.error('verify-cache: a cached build differs from a fresh one');
  process.exit(1);
}
console.log('verify-cache: all three builds wrote identical files');
