// Fails the production build when JavaScript and CSS exceed their share of
// the first-view budget (spec milestone 1, section 10.6): 500 KB compressed.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';

const BUDGET_BYTES = 500 * 1024;
const dist = fileURLToPath(new URL('../../dist', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'data') walk(p, out);
    } else if (/\.(js|css|html)$/.test(name)) out.push(p);
  }
  return out;
}

let total = 0;
for (const file of walk(dist)) {
  const size = brotliCompressSync(readFileSync(file)).length;
  total += size;
  console.log(`check-size: ${file.slice(dist.length + 1)} ${(size / 1024).toFixed(1)} KB`);
}
console.log(`check-size: total ${(total / 1024).toFixed(1)} KB of ${BUDGET_BYTES / 1024} KB`);
if (total > BUDGET_BYTES) {
  console.error('check-size: JavaScript and CSS exceed the budget');
  process.exit(1);
}
