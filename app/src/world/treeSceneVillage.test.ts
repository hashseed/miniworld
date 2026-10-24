// A Neolithic village in the tree scene (humankind.md section 8.5), on a chunk made in the test
// so that it runs without the built data: a farming camp with a field mask, and a herders' camp.

import { describe, expect, it } from 'vitest';
import { TIMELINE_START, DAYS_PER_YEAR } from '../time/calendar.ts';
import { msAtDay } from '../time/rate.ts';
import { encodeMask, MASK_RINGS, MASK_SECTORS } from './fieldMask.ts';
import { NEVER } from './tree.ts';
import { treeScene, type TreeChunk, type TreeScene } from './treeScene.ts';

const d0 = TIMELINE_START;
const years = (y: number) => Math.round(y * DAYS_PER_YEAR);
const land = encodeMask(new Array<boolean>(MASK_RINGS * MASK_SECTORS).fill(true));

const lodging = (id: number, camp: number, lon: number, extra: object) => ({
  id,
  camp,
  lat: 50_000_000,
  lon,
  built: d0,
  gone: NEVER,
  builder: camp,
  slot: id % 5,
  reach: [80, 80, 80, 80, 80],
  kind: 'hut',
  ...extra,
});

const chunk: TreeChunk = {
  fromDay: d0,
  toDay: d0 + years(10000),
  figures: Array.from({ length: 12 }, (_, i) => i).map((id) => ({
    id,
    parent: NEVER,
    born: d0,
    branch: id,
    depth: 0,
    homes: [[d0, id % 2, id >> 1]] as [number, number, number][],
    lost: NEVER,
  })),
  lodgings: [
    lodging(0, 0, 10_000_000, { culture: 'lbk-farmer', fieldLand: land }),
    lodging(1, 0, 10_000_000, { culture: 'lbk-farmer', fieldLand: land, slot: 1 }),
    lodging(2, 1, 40_000_000, { herding: true }),
  ],
};

/** The scene on many days of two years, a minute after the camps are built. */
function scenes(): TreeScene[] {
  const out: TreeScene[] = [];
  for (let k = 0; k < 24; k++) {
    const day = d0 + years(1) + Math.round((k * DAYS_PER_YEAR) / 12);
    out.push(treeScene(chunk, msAtDay(day, d0) + 90_000, d0));
  }
  return out;
}

describe('a Neolithic village in the tree scene', () => {
  const all = scenes();

  it('lays out fields for the farming camp and keeps the trees off them', () => {
    const s = all.find((x) => x.fields.length > 0);
    expect(s).toBeDefined();
    const f = s!.fields[0]!;
    expect(f.id.startsWith('0:')).toBe(true);
    expect(f.field.outline.length).toBeGreaterThan(2);
    expect(s!.clearings.length).toBeGreaterThanOrEqual(s!.fields.length);
    expect(s!.clearings.filter((c) => c.amount === 1 && !c.felling).length).toBeGreaterThanOrEqual(
      s!.fields.length,
    );
  });

  it('keeps a pen and a herd, grazing or looking up', () => {
    const s = all.find((x) => x.props.some((p) => p.kind === 'prop-pen'));
    expect(s).toBeDefined();
    const herd = s!.prey.filter((p) => p.id.startsWith('herd:'));
    expect(herd.length).toBeGreaterThan(0);
    const clips = new Set(
      all.flatMap((x) => x.prey.filter((p) => p.id.startsWith('herd:')).map((p) => p.clip)),
    );
    expect([...clips].every((c) => c === 'idle' || c === 'graze')).toBe(true);
    expect(s!.prey.some((p) => p.id.startsWith('herd:1:'))).toBe(true);
  });

  it('is the same scene every time', () => {
    const again = scenes();
    expect(JSON.stringify(again)).toBe(JSON.stringify(all));
  });
});
