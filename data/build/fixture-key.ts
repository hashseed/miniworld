// Prints a hash of everything the fixture data build reads: the build code
// and every module it imports, the data inputs and the spec's event lists
// (spec milestone 1, section 2.4). CI keeps built fixture
// data under this key and build again only when it changes.
//
// Usage: node data/build/fixture-key.ts [build arguments...]

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const ENTRY = join(ROOT, 'data/build/build-data.ts');
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

/** The entry file and every file it imports by a relative path, transitively. */
function importClosure(entry: string): string[] {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(ts|tsx|js)$/.test(file)) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      stack.push(resolve(dirname(file), (m[1] ?? m[2])!));
    }
  }
  return [...seen];
}

/** Every file under a folder, recursively. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile());
}

const files = [
  ...importClosure(ENTRY),
  ...filesUnder(join(ROOT, 'data/curated')),
  ...filesUnder(join(ROOT, 'data/sources')),
  ...filesUnder(join(ROOT, 'data/assets')),
  join(ROOT, 'data/sources.json'),
  join(ROOT, 'package-lock.json'),
  join(ROOT, 'docs/spec/events.md'),
  join(ROOT, 'docs/spec/wars.md'),
  ...filesUnder(join(ROOT, 'docs/spec/events')),
];

const hash = createHash('sha256');
hash.update(JSON.stringify(process.argv.slice(2)));
for (const file of [...new Set(files)].sort()) {
  hash.update(relative(ROOT, file));
  hash.update('\0');
  hash.update(readFileSync(file));
  hash.update('\0');
}
console.log(hash.digest('hex').slice(0, 16));
