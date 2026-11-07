// The boundary between the engine and the packs (engine.md, section 1): the
// engine imports no pack, and a pack imports no other pack. Imports the engine
// still has on the history pack are listed in boundary-debt.json, which may
// only shrink.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import debt from './boundary-debt.json' with { type: 'json' };

const SRC = fileURLToPath(new URL('../../app/src', import.meta.url));

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const SPECIFIER = /(?:from\s+|import\(\s*|new URL\(\s*|import\s+)(['"])(\.{1,2}\/[^'"\n]*)\1/g;

/** [importing file, imported path] pairs relative to app/src, for every relative import of the files. */
function imports(dir: string): [string, string][] {
  const out: [string, string][] = [];
  for (const file of files(dir)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(SPECIFIER))
      out.push([relative(SRC, file), relative(SRC, normalize(join(dirname(file), m[2]!)))]);
  }
  return out;
}

const packs = readdirSync(join(SRC, 'packs'));

describe('engine and pack boundary', () => {
  it('the engine imports a pack only where boundary-debt.json lists it', () => {
    const found = imports(join(SRC, 'engine'))
      .filter(([, to]) => to.startsWith('packs/'))
      .map(([from, to]) => `${from} -> ${to}`);
    const listed = new Set(debt.debt);
    const added = found.filter((e) => !listed.has(e));
    expect(added, 'new imports of a pack in the engine (engine.md section 1)').toEqual([]);
    const stale = debt.debt.filter((e) => !found.includes(e));
    expect(stale, 'entries to remove from boundary-debt.json').toEqual([]);
  });

  for (const pack of packs) {
    it(`the ${pack} pack imports no other pack`, () => {
      const bad = imports(join(SRC, 'packs', pack)).filter(([, to]) => {
        const m = /^packs\/([^/]+)\//.exec(to);
        return m !== null && m[1] !== pack;
      });
      expect(bad).toEqual([]);
    });
  }
});
