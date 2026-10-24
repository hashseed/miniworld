import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tableErrors, TABLES } from '../../schema/tables.ts';
import type { AssetManifest } from '../../schema/assets.ts';
import { checkAssetRefs, readAssetManifest, tableAssetRefs, validateTables } from './tables.ts';

const ROOT = new URL('../../..', import.meta.url).pathname;
const CURATED = join(ROOT, 'data/curated');
const read = (name: string): unknown => JSON.parse(readFileSync(join(CURATED, name), 'utf8'));

describe('curated tables', () => {
  it('all pass their schemas', () => {
    const { errors, tables } = validateTables(CURATED);
    expect(errors).toEqual([]);
    expect(Object.keys(tables).sort()).toEqual(Object.keys(TABLES).sort());
  });

  it('reject unknown fields, missing languages, bad places and duplicate ids', () => {
    const anchors = read('anchors.json') as { anchors: Record<string, unknown>[] };
    const first = anchors.anchors[0]!;
    const withRow = (row: Record<string, unknown>, ...rest: Record<string, unknown>[]) => ({
      ...anchors,
      anchors: [row, ...rest],
    });
    expect(tableErrors('anchors.json', withRow({ ...first, colour: 'red' })).join()).toMatch(
      /colour/,
    );
    const noGerman = { ...first };
    delete noGerman.de;
    expect(tableErrors('anchors.json', withRow(noGerman)).join()).toMatch(/de/);
    expect(tableErrors('anchors.json', withRow({ ...first, lat: 91 }))).not.toEqual([]);
    expect(tableErrors('anchors.json', withRow(first, first)).join()).toMatch(/duplicate id/);
    expect(
      tableErrors('anchors.json', withRow({ ...first, scene: { kind: 'feast', prop: 'x' } })),
    ).not.toEqual([]);
  });

  it('report a JSON file without a schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tables-'));
    for (const name of Object.keys(TABLES))
      writeFileSync(join(dir, name), readFileSync(join(CURATED, name)));
    writeFileSync(join(dir, 'settlements.json'), '{}');
    expect(validateTables(dir).errors).toEqual([
      expect.stringMatching(/^settlements\.json: no schema/),
    ]);
  });
});

describe('asset references', () => {
  const m: AssetManifest = {
    assets: [
      {
        id: 'a-approved',
        file: 'f',
        kind: 'prop',
        generated: 'g',
        status: 'approved',
        note: '',
        reviewed: '2026-10-24',
      },
      { id: 'a-generated', file: 'f', kind: 'prop', generated: 'g', status: 'generated', note: '' },
      { id: 'a-rejected', file: 'f', kind: 'prop', generated: 'g', status: 'rejected', note: '' },
    ],
  };

  it('fail on unknown and rejected assets and count those waiting', () => {
    const r = checkAssetRefs(
      [
        { id: 'a-approved', from: 'x' },
        { id: 'a-generated', from: 'x' },
        { id: 'a-generated', from: 'y' },
        { id: 'a-rejected', from: 'x' },
        { id: 'a-missing', from: 'x' },
      ],
      m,
    );
    expect(r.waiting).toEqual(['a-generated']);
    expect(r.errors).toEqual([
      'x: asset a-rejected was rejected',
      'x: asset a-missing is not in data/assets/manifest.json',
    ]);
  });

  it('of the real tables are all in the real manifest', () => {
    const { manifest: real, errors } = readAssetManifest(join(ROOT, 'data/assets/manifest.json'));
    expect(errors).toEqual([]);
    const refs = tableAssetRefs(validateTables(CURATED).tables);
    expect(refs.length).toBeGreaterThan(0);
    expect(checkAssetRefs(refs, real!).errors).toEqual([]);
  });
});
