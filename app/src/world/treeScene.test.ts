import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, TIMELINE_START } from '../time/calendar.ts';
import { msAtDay } from '../time/rate.ts';
import { NEVER } from './tree.ts';
import { BLEND_MS, BUILD_MS, lodgingSpot, lookOf, treeScene, type TreeChunk } from './treeScene.ts';

const d0 = TIMELINE_START;
const years = (y: number) => Math.round(y * DAYS_PER_YEAR);
const moveDay = d0 + years(100);
const ms = (day: number) => msAtDay(day, d0);

// The first person alone in her hut; a child comes out after 20 years; after
// 100 years both walk 3 degrees (about 333 km) east and build a new hut.
const chunk: TreeChunk = {
  fromDay: d0,
  toDay: d0 + years(1000),
  figures: [
    {
      id: 0,
      parent: NEVER,
      born: d0,
      branch: 0,
      depth: 0,
      homes: [
        [d0, 0],
        [moveDay, 1],
      ],
      lost: NEVER,
    },
    {
      id: 1,
      parent: 0,
      born: d0 + years(20),
      branch: 0,
      depth: 1,
      homes: [
        [d0 + years(20), 0],
        [moveDay, 1],
      ],
      lost: NEVER,
    },
  ],
  lodgings: [
    { id: 0, camp: 0, lat: 0, lon: 36_000_000, built: d0, gone: moveDay, builder: 0, kind: 'hut' },
    {
      id: 1,
      camp: 0,
      lat: 0,
      lon: 39_000_000,
      built: moveDay,
      gone: NEVER,
      builder: 0,
      kind: 'hut',
    },
  ],
};

describe('the tree scene', () => {
  it('shows the first person alone at her hearth at the start', () => {
    const s = treeScene(chunk, 5000, d0);
    expect(s.figures.map((f) => f.id)).toEqual([0]);
    expect(s.figures[0]!.look).toBe('founder');
    expect(s.hearths).toEqual([{ camp: 0, lat: 0, lon: 36 }]);
    expect(s.lodgings).toHaveLength(1);
  });

  it('lets a new figure come out of the door and walk to its spot', () => {
    const born = ms(d0 + years(20));
    const out = treeScene(chunk, born + 10, d0).figures.find((f) => f.id === 1)!;
    expect(out.clip).toBe('walk');
    const later = treeScene(chunk, born + 60_000, d0).figures.find((f) => f.id === 1)!;
    expect(['idle', 'work']).toContain(later.clip);
    expect(later.x ** 2 + later.z ** 2).toBeLessThan(out.x ** 2 + out.z ** 2);
  });

  it('walks the band to its new camp and puts up the hut when they arrive', () => {
    const left = ms(moveDay);
    const mid = treeScene(chunk, left + 2000, d0);
    for (const f of mid.figures) {
      expect(f.clip).toBe('walk');
      expect(f.lon).toBeGreaterThan(36);
      expect(f.lon).toBeLessThan(39);
      expect(f.dirX).toBeCloseTo(1);
    }
    expect(mid.lodgings.map((l) => l.id)).toEqual([]);
    const after = treeScene(chunk, left + 20_000, d0);
    expect(after.figures.every((f) => f.lon === 39 && f.clip !== 'walk')).toBe(true);
    expect(after.lodgings.map((l) => l.id)).toEqual([1]);
  });

  it('has the band build the hut together before they go to their spots', () => {
    const left = ms(moveDay);
    // Arrival after about 5.5 seconds; then 8 seconds of building.
    const building = treeScene(chunk, left + 8000, d0);
    const hut = lodgingSpot(1);
    for (const f of building.figures) {
      expect(f.clip).toBe('work');
      expect(f.lon).toBe(39);
      // Facing the hut, close by it.
      expect(f.dirX * (hut.x - f.x) + f.dirZ * (hut.z - f.z)).toBeGreaterThan(0);
      expect((hut.x - f.x) ** 2 + (hut.z - f.z) ** 2).toBeLessThan(9 ** 2);
    }
    const rising = building.lodgings[0]!;
    expect(rising.built).toBeGreaterThan(0);
    expect(rising.built).toBeLessThan(1);
    const later = treeScene(chunk, left + 6000 + BUILD_MS, d0);
    expect(later.lodgings[0]!.built).toBe(1);
    // The hut never shrinks while it goes up.
    let last = 0;
    for (let t = 5000; t < 15_000; t += 250) {
      const l = treeScene(chunk, left + t, d0).lodgings[0];
      if (!l) continue;
      expect(l.built).toBeGreaterThanOrEqual(last);
      last = l.built;
    }
  });

  it('walks at the pace of the walk clip', () => {
    // 333 km at 60 km per second of watching.
    const left = ms(moveDay);
    const walking = (t: number) =>
      treeScene(chunk, left + t, d0).figures.every((f) => f.clip === 'walk');
    expect(walking(5000)).toBe(true);
    expect(walking(6000)).toBe(false);
  });

  it('eases between clips', () => {
    let eased = 0;
    for (let t = 0; t < 120_000; t += BLEND_MS / 2) {
      const f = treeScene(chunk, ms(d0 + years(30)) + t, d0).figures.find((g) => g.id === 1)!;
      if (f.from) {
        eased++;
        expect(f.from.weight).toBeGreaterThanOrEqual(0);
        expect(f.from.weight).toBeLessThan(1);
      }
    }
    expect(eased).toBeGreaterThan(0);
  });

  it('is the same at the same clock time', () => {
    expect(treeScene(chunk, 123_456, d0)).toEqual(treeScene(chunk, 123_456, d0));
  });

  it('gives everyone but the first person an ordinary look', () => {
    const looks = new Set(Array.from({ length: 30 }, (_, i) => lookOf(i + 1)));
    expect(looks).toEqual(new Set(['woman', 'man', 'child']));
  });
});
