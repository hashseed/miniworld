// A Neolithic village in the tree scene (humankind.md section 8.5), on a chunk made in the test
// so that it runs without the built data: a farming camp with a field mask, and a herders' camp.

import { describe, expect, it } from 'vitest';
import { TIMELINE_START, DAYS_PER_YEAR } from '../time/calendar.ts';
import { msAtDay } from '../time/rate.ts';
import { encodeMask, MASK_RINGS, MASK_SECTORS } from './fieldMask.ts';
import { pointInPolygon } from './fieldShapes.ts';
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

  it('keeps the fields off the pen and the herd (Yang, 2026-10-24)', () => {
    const s = all.find((x) => x.fields.length > 0 && x.props.some((p) => p.id === 'pen:0'))!;
    const pen = s.props.find((p) => p.id === 'pen:0')!;
    const herd = s.prey.filter((p) => p.id.startsWith('herd:0:'));
    for (const f of s.fields) {
      for (const p of f.field.outline)
        expect(Math.sqrt((p.x - pen.x) ** 2 + (p.z - pen.z) ** 2)).toBeGreaterThan(6);
      for (const a of herd) expect(pointInPolygon(f.field.outline, a.x, a.z)).toBe(false);
    }
  });

  it('changes a field only when it is worked: stages hold still between jobs', () => {
    const start = msAtDay(d0 + years(1), d0) + 90_000;
    const seen = new Map<string, number[]>();
    for (let t = 0; t < 600_000; t += 5_000)
      for (const f of treeScene(chunk, start + t, d0).fields)
        seen.set(f.id, [...(seen.get(f.id) ?? []), f.stage]);
    for (const stages of seen.values()) {
      const changes = stages.filter((v, i) => i > 0 && v !== stages[i - 1]).length;
      // 600 s is 20 job slots: a field of n has one job in n slots, each easing over a few readings.
      expect(changes).toBeLessThan(stages.length / 2);
    }
  });

  it("has no fire in a village, but keeps the herders' (Yang, 2026-10-24)", () => {
    for (const s of all) {
      expect(s.hearths.some((h) => h.camp === 0)).toBe(false);
      expect(s.sparks.length).toBe(0);
      expect(s.props.some((p) => p.kind === 'prop-spit' && p.id.includes('0'))).toBe(false);
    }
    expect(all.some((s) => s.hearths.some((h) => h.camp === 1))).toBe(true);
  });

  it('has villagers who never crack nuts by a fire', () => {
    const start = msAtDay(d0 + years(1), d0) + 90_000;
    for (let t = 0; t < 300_000; t += 7_000)
      for (const f of treeScene(chunk, start + t, d0).figures)
        if (f.id % 2 === 0) expect(f.clip).not.toBe('crack');
  });

  it('is the same scene every time', () => {
    const again = scenes();
    expect(JSON.stringify(again)).toBe(JSON.stringify(all));
  });
});
