import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, TIMELINE_START } from '../time/calendar.ts';
import { msAtDay } from '../time/rate.ts';
import { NEVER } from './tree.ts';
import {
  BLEND_MS,
  POLE_ON_SHOULDERS_M,
  TAKE_DOWN_MS,
  lodgingSpot,
  lookOf,
  treeScene,
  type TreeChunk,
} from './treeScene.ts';

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
        [d0, 0, 0],
        [moveDay, 1, 0],
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
        [d0 + years(20), 0, 1],
        [moveDay, 1, 1],
      ],
      lost: NEVER,
    },
  ],
  lodgings: [
    {
      id: 0,
      camp: 0,
      lat: 0,
      lon: 36_000_000,
      built: d0,
      gone: moveDay,
      builder: 0,
      slot: 0,
      reach: [80, 80, 80, 80, 80],
      kind: 'hut',
    },
    {
      id: 1,
      camp: 0,
      lat: 0,
      lon: 39_000_000,
      built: moveDay,
      gone: NEVER,
      builder: 0,
      slot: 0,
      reach: [80, 80, 80, 80, 80],
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

  // The scene every 50 ms over the first 20 seconds after the band sets off.
  const trip = () => {
    const left = ms(moveDay);
    return Array.from({ length: 400 }, (_, k) => ({
      t: k * 50,
      scene: treeScene(chunk, left + k * 50, d0),
    }));
  };
  const between = (lon: number) => lon > 36 && lon < 39;

  it('walks the band out of its old camp, across the land and into the new one', () => {
    const frames = trip();
    const crossing = frames.filter((f) => f.scene.figures.some((g) => between(g.lon)));
    expect(crossing.length).toBeGreaterThan(0);
    for (const { scene } of crossing)
      for (const g of scene.figures.filter((g) => between(g.lon))) {
        expect(g.clip).toBe('walk');
        expect(g.dirX).toBeCloseTo(1);
      }
    // The new hut appears only once its builder has walked in.
    const first = crossing[0]!.t;
    expect(frames.find((f) => f.t === first)!.scene.lodgings.some((l) => l.id === 1)).toBe(false);
    const after = frames.at(-1)!.scene;
    expect(after.figures.every((f) => f.lon === 39 && f.clip !== 'walk')).toBe(true);
    expect(after.lodgings.map((l) => l.id)).toEqual([1]);
  });

  it('has the band build the hut together before they go to their spots', () => {
    const frames = trip();
    const hut = lodgingSpot(chunk.lodgings[1]!);
    const rising = frames.filter((f) => {
      const l = f.scene.lodgings.find((l) => l.id === 1);
      return l && l.built > 0.3 && l.built < 0.7;
    });
    expect(rising.length).toBeGreaterThan(0);
    for (const { scene } of rising)
      for (const f of scene.figures) {
        expect(f.clip).toBe('work');
        expect(f.lon).toBe(39);
        // Facing the hut, close by it.
        expect(f.dirX * (hut.x - f.x) + f.dirZ * (hut.z - f.z)).toBeGreaterThan(0);
        expect((hut.x - f.x) ** 2 + (hut.z - f.z) ** 2).toBeLessThan(7.5 ** 2);
      }
    // The hut never shrinks while it goes up, and is up in the end.
    let last = 0;
    for (const { scene } of frames) {
      const l = scene.lodgings.find((l) => l.id === 1);
      if (!l) continue;
      expect(l.built).toBeGreaterThanOrEqual(last);
      last = l.built;
    }
    expect(last).toBe(1);
  });

  it('crosses at the pace of the walk clip', () => {
    // 333 km at 306 km per second of watching: about 1.1 seconds between the camps.
    const crossing = trip().filter((f) => f.scene.figures.some((g) => between(g.lon)));
    const seconds = (crossing.at(-1)!.t - crossing[0]!.t) / 1000;
    expect(seconds).toBeGreaterThan(0.9);
    expect(seconds).toBeLessThan(1.5);
  });

  it('never walks through the fire on the way out or in', () => {
    for (const { scene } of trip())
      for (const f of scene.figures)
        if (f.lon === 36 || f.lon === 39)
          expect(f.x ** 2 + f.z ** 2).toBeGreaterThanOrEqual(2.9 ** 2);
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

  it('takes the old hut down before the band leaves', () => {
    const left = ms(moveDay);
    const hut = treeScene(chunk, left - TAKE_DOWN_MS / 2, d0);
    const old = hut.lodgings.find((l) => l.id === 0)!;
    expect(old.built).toBeGreaterThan(0);
    expect(old.built).toBeLessThan(1);
    for (const f of hut.figures) expect(f.clip).toBe('work');
    expect(treeScene(chunk, left + 10, d0).lodgings.some((l) => l.id === 0)).toBe(false);
  });

  it('sends people out gathering or hunting and keeps every path clear of the fire', () => {
    let out = 0;
    for (let t = ms(d0 + years(25)); t < ms(moveDay) - 10_000; t += 500)
      for (const f of treeScene(chunk, t, d0).figures) {
        if (f.lon !== 36) continue;
        const r2 = f.x ** 2 + f.z ** 2;
        expect(r2).toBeGreaterThanOrEqual(2.9 ** 2);
        if (r2 > 25 ** 2) out++;
      }
    expect(out).toBeGreaterThan(0);
  });

  it('has grown-ups knap stone hand axes by the fire, but not children', () => {
    const knappers = new Set<string>();
    for (let t = ms(d0 + years(25)); t < ms(moveDay) - 10_000; t += 997)
      for (const f of treeScene(chunk, t, d0).figures)
        if (f.clip === 'knap') knappers.add(f.id === 0 ? 'founder' : lookOf(f.id));
    expect(knappers.has('founder')).toBe(true);
    expect(knappers.has('child')).toBe(false);
  });

  it('has hunters spear a zebra or an eland and carry it home on a pole (section 8.1)', () => {
    const clips = new Set<string>();
    let flying = 0;
    let missed = 0;
    let carried = 0;
    for (let t = ms(d0 + years(25)); t < ms(moveDay) - 10_000; t += 97) {
      const scene = treeScene(chunk, t, d0);
      for (const p of scene.prey) {
        clips.add(p.clip);
        expect(['animal-zebra', 'animal-eland']).toContain(p.kind);
        // Out beyond the people's ring, or laid down between them and the lodgings.
        expect(Math.sqrt(p.x * p.x + p.z * p.z)).toBeGreaterThan(13);
      }
      for (const sp of scene.spears) {
        expect(sp.height).toBeGreaterThan(0);
        expect(sp.height).toBeLessThan(3);
        if (sp.slope > -0.3 && sp.height > 1) flying++;
        if (sp.height === 0.55) missed++;
      }
      // While a spear is away, its hunter's hand is empty.
      if (scene.spears.length)
        expect(scene.figures.some((f) => f.unarmed || f.clip === 'throw')).toBe(true);
      // The kill hangs under the pole, at shoulder height, between two carriers in step.
      for (const p of scene.prey.filter((q) => q.clip === 'hung')) {
        const pole = scene.poles.find((q) => Math.abs(q.x - p.x) + Math.abs(q.z - p.z) < 0.01);
        expect(pole?.height).toBeCloseTo(POLE_ON_SHOULDERS_M, 5);
        const carriers = scene.figures.filter(
          (f) => f.clip === 'pole' && Math.sqrt((f.x - p.x) ** 2 + (f.z - p.z) ** 2) < 4.6,
        );
        if (carriers.length < 2) continue;
        carried++;
        expect(
          Math.sqrt(
            (carriers[0]!.x - carriers[1]!.x) ** 2 + (carriers[0]!.z - carriers[1]!.z) ** 2,
          ),
        ).toBeCloseTo(9, 1);
        expect(carriers[0]!.clipMs).toBe(carriers[1]!.clipMs);
      }
    }
    expect(clips).toEqual(new Set(['idle', 'run', 'fall', 'bound', 'hung']));
    expect(flying).toBeGreaterThan(0);
    expect(missed).toBeGreaterThan(0);
    expect(carried).toBeGreaterThan(0);
  });

  it('fells the trees where the band arrives and lets them grow back where it left', () => {
    const left = ms(moveDay);
    const later = treeScene(chunk, left + 9000, d0).clearings;
    const there = later.find((c) => c.lon === 39)!;
    expect(there.felling).toBe(true);
    expect(there.amount).toBe(1);
    const back = later.find((c) => c.lon === 36)!;
    expect(back.felling).toBe(false);
    expect(back.amount).toBeGreaterThan(0);
    expect(back.amount).toBeLessThan(1);
  });

  it('is the same at the same clock time', () => {
    expect(treeScene(chunk, 123_456, d0)).toEqual(treeScene(chunk, 123_456, d0));
  });

  it('gives everyone but the first person an ordinary look', () => {
    const looks = new Set(Array.from({ length: 30 }, (_, i) => lookOf(i + 1)));
    expect(looks).toEqual(new Set(['woman', 'man', 'child']));
  });
});
