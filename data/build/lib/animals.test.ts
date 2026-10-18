import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAnimals } from './animals.ts';

const RECORD = `---
id: lion
kind: animal
sources:
  - ref: iucn-red-list
---

## en

# Lion

Lions live in prides.

## de

# Löwe

Löwen leben in Rudeln.
`;

function fixture(records: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'animals-'));
  writeFileSync(join(dir, 'sources.yaml'), 'iucn-red-list:\n  title: Red List\n');
  mkdirSync(join(dir, 'animals'));
  for (const [name, text] of Object.entries(records))
    writeFileSync(join(dir, 'animals', name), text);
  return dir;
}

describe('buildAnimals (wildlife.md section 8)', () => {
  it('compiles a card per species in both languages', () => {
    const out = buildAnimals({
      curated: fixture({ 'lion.md': RECORD }),
      species: new Set(['lion']),
    });
    expect(out.errors).toEqual([]);
    expect(out.animals[0]!.text.de.title).toBe('Löwe');
    expect(out.animals[0]!.text.en.body).toBe('Lions live in prides.');
  });

  it('fails on a missing card, an unknown species, source or field', () => {
    const bad = RECORD.replace('iucn-red-list', 'nowhere').replace(
      'kind: animal',
      'kind: animal\nwhen: 1900',
    );
    const out = buildAnimals({
      curated: fixture({ 'lion.md': bad, 'dodo.md': RECORD.replace('id: lion', 'id: dodo') }),
      species: new Set(['lion', 'tiger']),
    });
    expect(out.errors.join('\n')).toMatch(/unknown source "nowhere"/);
    expect(out.errors.join('\n')).toMatch(/unknown field "when"/);
    expect(out.errors.join('\n')).toMatch(/no wildlife group has species "dodo"/);
    expect(out.errors.join('\n')).toMatch(/missing card for wildlife species "tiger"/);
  });
});
