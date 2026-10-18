// Regenerates app/public/third-party-notices.txt from the runtime
// dependencies (spec section 13). `npm run check` fails when it is stale.
//
// Usage: node data/build/notices.ts

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NOTICES_FILE, buildNotices } from './lib/notices.ts';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const { text, disallowed } = buildNotices(ROOT);
if (disallowed.length) {
  console.error(`licences not allowed (spec section 13): ${disallowed.join(', ')}`);
  process.exit(1);
}
writeFileSync(join(ROOT, NOTICES_FILE), text);
console.log(`wrote ${NOTICES_FILE}`);
