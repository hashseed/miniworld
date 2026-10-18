// The third-party notices shipped with the app (spec section 13): the licence
// text of every runtime dependency, which must be on the allowed list.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Licences a runtime dependency may have (spec section 13). */
export const ALLOWED_LICENCES = new Set([
  'MIT',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'Apache-2.0',
  'Zlib',
  'OFL-1.1',
]);

export const NOTICES_FILE = 'app/public/third-party-notices.txt';

interface PackageJson {
  name: string;
  version: string;
  license?: string;
  dependencies?: Record<string, string>;
}

function readPackage(dir: string): PackageJson {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson;
}

/**
 * The notices text for the runtime dependencies of the project at `root`,
 * and the dependencies whose licence is not allowed.
 */
export function buildNotices(root: string): { text: string; disallowed: string[] } {
  const deps = Object.keys(readPackage(root).dependencies ?? {}).sort();
  const disallowed: string[] = [];
  const parts = [
    'Miniworld includes the following third-party software and fonts.\n' +
      'Their licences are reproduced below as they require.',
  ];
  for (const name of deps) {
    const dir = join(root, 'node_modules', name);
    const pkg = readPackage(dir);
    const licence = pkg.license ?? 'none';
    if (!ALLOWED_LICENCES.has(licence)) disallowed.push(`${name} (${licence})`);
    const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
    const body = file ? readFileSync(join(dir, file), 'utf8').trim() : `Licence: ${licence}`;
    parts.push(
      `${'='.repeat(72)}\n${pkg.name} ${pkg.version} (${licence})\n${'='.repeat(72)}\n\n${body}`,
    );
  }
  return { text: `${parts.join('\n\n')}\n`, disallowed };
}
