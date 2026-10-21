import { describe, expect, it } from 'vitest';
import {
  DAYS_PER_YEAR,
  TIMELINE_START,
  astronomicalYear,
  dayOfYearStart,
} from '../time/calendar.ts';
import { msAtDay } from '../time/rate.ts';
import { NEVER } from './tree.ts';
import {
  BLEND_MS,
  burialTimes,
  MONUMENT_BUILD_SESSIONS,
  MONUMENT_DANCE_SESSIONS,
  MONUMENT_FILL_SESSIONS,
  MONUMENT_SINK_DAYS,
  stageSessions,
  POLE_ON_SHOULDERS_M,
  TAKE_DOWN_MS,
  lodgingSpot,
  lookOf,
  treeScene,
  type TreeChunk,
} from './treeScene.ts';

const d0 = TIMELINE_START;
const bce = (y: number) => dayOfYearStart(astronomicalYear(y, 'BCE'));
const years = (y: number) => Math.round(y * DAYS_PER_YEAR);
// At the history rate of the deep past (about 560 years a minute), these spans give
// the camp minutes of watching between its moments.
const moveDay = d0 + years(2000);
const ms = (day: number) => msAtDay(day, d0);

// The first person alone in her hut; a child comes out after 300 years; after
// 2000 years both walk 3 degrees (about 333 km) east and build a new hut.
const chunk: TreeChunk = {
  fromDay: d0,
  toDay: d0 + years(10000),
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
      born: d0 + years(300),
      branch: 0,
      depth: 1,
      homes: [
        [d0 + years(300), 0, 1],
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
    expect(s.hearths).toEqual([{ camp: 0, lat: 0, lon: 36, lit: 1 }]);
    expect(s.lodgings).toHaveLength(1);
  });

  it('lets a new figure crouch out of the door and walk to its spot', () => {
    const born = ms(d0 + years(300));
    const out = treeScene(chunk, born + 10, d0).figures.find((f) => f.id === 1)!;
    expect(out.clip).toBe('crouch');
    const later = treeScene(chunk, born + 60_000, d0).figures.find((f) => f.id === 1)!;
    expect(['idle', 'work']).toContain(later.clip);
    expect(later.x ** 2 + later.z ** 2).toBeLessThan(out.x ** 2 + out.z ** 2);
  });

  it('leaves out figures whose camps are out of view, and keeps the ones in view', () => {
    const t = ms(d0 + years(300)) + 60_000;
    const all = treeScene(chunk, t, d0).figures.map((f) => f.id);
    expect(all).toContain(1);
    expect(treeScene(chunk, t, d0, () => true).figures.map((f) => f.id)).toEqual(all);
    expect(treeScene(chunk, t, d0, () => false).figures).toHaveLength(0);
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
    // Everyone has arrived (some may already be off on an outing from the new camp).
    expect(after.figures.every((f) => f.lon === 39)).toBe(true);
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
      const f = treeScene(chunk, ms(d0 + years(310)) + t, d0).figures.find((g) => g.id === 1)!;
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
    expect(clips).toEqual(new Set(['walk', 'idle', 'run', 'fall', 'bound', 'hung']));
    expect(flying).toBeGreaterThan(0);
    expect(missed).toBeGreaterThan(0);
    expect(carried).toBeGreaterThan(0);
  });

  it('roasts the meat of a kill on a spit over the fire (section 8.1)', () => {
    // Four grown-ups at a camp that stands for 20,000 years (about half an hour of watching),
    // so kills and free cooks meet.
    const ids = Array.from({ length: 60 }, (_, k) => k + 1)
      .filter((id) => lookOf(id) !== 'child')
      .slice(0, 4);
    const camp: TreeChunk = {
      fromDay: d0,
      toDay: d0 + years(20_000),
      figures: ids.map((id, k) => ({
        id,
        parent: NEVER,
        born: d0 + 1,
        branch: 0,
        depth: 1,
        homes: [[d0 + 1, k < 2 ? 0 : 1, k]],
        lost: NEVER,
      })),
      lodgings: [0, 1].map((id) => ({
        id,
        camp: 5,
        lat: 0,
        lon: 20_000_000,
        built: d0,
        gone: NEVER,
        builder: ids[id * 2]!,
        slot: id,
        reach: [80, 80, 80, 80, 80],
        kind: 'hut',
      })),
    };
    let roasting = 0;
    for (let t = 60_000; t < ms(d0 + years(20_000)) - 10_000; t += 250)
      if (treeScene(camp, t, d0).props.some((p) => p.kind === 'prop-spit')) roasting++;
    expect(roasting).toBeGreaterThan(0);
  });

  it('has the hunted animal and its herd walk in from the trees, and the herd bolt (section 8.1)', () => {
    let walkedIn = 0;
    let fled = 0;
    let herd = 0;
    for (let t = ms(d0 + years(25)); t < ms(moveDay) - 10_000; t += 97)
      for (const p of treeScene(chunk, t, d0).prey) {
        const r = Math.sqrt(p.x * p.x + p.z * p.z);
        if (p.id.split(':').length > 2) herd++;
        if (p.clip === 'walk') {
          walkedIn++;
          // In from the far end of the lane, never closer than the grazing place.
          expect(r).toBeGreaterThan(33);
          expect(p.dirX * p.x + p.dirZ * p.z).toBeLessThan(0);
        }
        if (p.clip === 'run' && p.id.split(':').length > 2 && p.dirX * p.x + p.dirZ * p.z > 0)
          fled++;
      }
    expect(walkedIn).toBeGreaterThan(0);
    expect(herd).toBeGreaterThan(0);
    expect(fled).toBeGreaterThan(0);
  });

  it('has Siberian hunters hunt mammoths too, butchered where they fall, until 10,000 BCE', () => {
    // A camp of four grown-ups of the steppe hunters, standing from `from` for 4,000 years.
    const campAt = (from: number): TreeChunk => {
      const ids = Array.from({ length: 60 }, (_, k) => k + 1)
        .filter((id) => lookOf(id) !== 'child')
        .slice(0, 4);
      return {
        fromDay: from,
        toDay: from + years(4000),
        figures: ids.map((id, k) => ({
          id,
          parent: NEVER,
          born: from + 1,
          branch: 0,
          depth: 1,
          homes: [[from + 1, k < 2 ? 0 : 1, k]],
          lost: NEVER,
        })),
        lodgings: [0, 1].map((id) => ({
          id,
          camp: 7,
          lat: 60_000_000,
          lon: 100_000_000,
          built: from,
          gone: NEVER,
          builder: ids[id * 2]!,
          slot: id,
          reach: [80, 80, 80, 80, 80],
          kind: 'hut',
          culture: 'steppe-beringia-hunter',
        })),
      };
    };
    const kinds = (camp: TreeChunk, from: number) => {
      const seen = new Map<string, Set<string>>();
      for (let t = ms(from) + 60_000; t < ms(from + years(4000)) - 10_000; t += 211)
        for (const p of treeScene(camp, t, d0).prey)
          if (p.id.split(':').length === 2) {
            const clips = seen.get(p.kind) ?? new Set();
            clips.add(p.clip);
            seen.set(p.kind, clips);
          }
      return seen;
    };
    const early = d0 + years(1000);
    const before = kinds(campAt(early), early);
    expect([...before.keys()].sort()).toEqual(['animal-mammoth', 'animal-reindeer']);
    // Never carried on the pole: it falls and lies where it fell.
    expect(before.get('animal-mammoth')!.has('fall')).toBe(true);
    expect(before.get('animal-mammoth')!.has('hung')).toBe(false);
    const late = d0 + years(61_500); // 8500 BCE
    expect([...kinds(campAt(late), late).keys()]).toEqual(['animal-reindeer']);
  }, 30_000);

  it('lets the herd scatter and stand a while, each fading on its own (section 8.1)', () => {
    // Per herd mate: the frames it stood idle after running off, and when it was last seen.
    const stood = new Map<string, number>();
    const last = new Map<string, number>();
    const ran = new Set<string>();
    for (let t = ms(d0 + years(25)); t < ms(moveDay) - 10_000; t += 97)
      for (const p of treeScene(chunk, t, d0).prey) {
        if (p.id.split(':').length <= 2) continue;
        if (p.clip === 'run') ran.add(p.id);
        else if (ran.has(p.id) && p.clip === 'idle') stood.set(p.id, (stood.get(p.id) ?? 0) + 1);
        last.set(p.id, t);
      }
    expect(ran.size).toBeGreaterThan(0);
    // Each stands for seconds after it ran, not a moment.
    for (const id of ran) expect((stood.get(id) ?? 0) * 97).toBeGreaterThan(2000);
    // Two mates of one hunt fade at their own times.
    const pairs = [...ran].filter((id) => id.endsWith(':0') && ran.has(id.replace(/:0$/, ':1')));
    expect(pairs.some((id) => last.get(id) !== last.get(id.replace(/:0$/, ':1')))).toBe(true);
  });

  it('thins the trees before the band arrives and lets them grow back where it left', () => {
    const left = ms(moveDay);
    // Withering ahead of the band, planned from the tree (sites.md section 6), never felled.
    const before = treeScene(chunk, left - 5000, d0).clearings.find((c) => c.lon === 39)!;
    expect(before.felling).toBe(false);
    expect(before.amount).toBeGreaterThan(0);
    expect(before.amount).toBeLessThan(1);
    const later = treeScene(chunk, left + 9000, d0).clearings;
    const there = later.find((c) => c.lon === 39)!;
    expect(there.felling).toBe(false);
    expect(there.amount).toBe(1);
    const back = later.find((c) => c.lon === 36)!;
    expect(back.felling).toBe(false);
    expect(back.amount).toBeGreaterThan(0);
    expect(back.amount).toBeLessThan(1);
  });

  it('keeps the dead of a burial by the fire before it falls ill, never in its lodging (issue 134)', () => {
    const figure = (id: number) => ({
      id,
      parent: id === 0 ? NEVER : 0,
      born: d0,
      branch: 0,
      depth: id === 0 ? 0 : 1,
      homes: [[d0, 0, id]] as [number, number, number][],
      lost: NEVER,
    });
    const stage = {
      id: 'sungir',
      kind: 'burial' as const,
      prop: 'prop-burial',
      camp: 2,
      lat: 0,
      lon: 36_000_000,
      slot: 2,
      beyond: 8,
      dead: 3,
      shown: d0 + years(250),
      from: d0 + years(402),
      until: d0 + years(1500),
      keep: d0 + years(1600),
    };
    const burial: TreeChunk = {
      ...chunk,
      figures: [0, 1, 2, 3, 4].map(figure),
      lodgings: [{ ...chunk.lodgings[0]!, camp: 2 }],
      stages: [stage],
    };
    const g = burialTimes(stage, d0)!;
    const at = (t: number) => treeScene(burial, t, d0).figures.find((f) => f.id === 3)!;
    const before = at(g.start - 1);
    const after = at(g.start);
    expect(Math.sqrt((after.x - before.x) ** 2 + (after.z - before.z) ** 2)).toBeLessThan(1);
    expect(at(g.start).clip).toBe('ill');
  });

  it('raises a monument session by session, dances round it, then fills it with earth as it sinks', () => {
    const figure = (id: number) => ({
      id,
      parent: id === 0 ? NEVER : 0,
      born: d0,
      branch: 0,
      depth: id === 0 ? 0 : 1,
      homes: [[d0, 0, id]] as [number, number, number][],
      lost: NEVER,
    });
    const stage = {
      id: 'gobekli-tepe',
      kind: 'monument' as const,
      prop: 'prop-gobekli-ring',
      camp: 2,
      lat: 0,
      lon: 36_000_000,
      slot: 2,
      beyond: 10,
      shown: bce(9600),
      from: bce(9500),
      until: bce(8000),
      keep: bce(7900),
    };
    const monument: TreeChunk = {
      ...chunk,
      figures: Array.from({ length: 14 }, (_, i) => figure(i)),
      lodgings: [{ ...chunk.lodgings[0]!, camp: 2 }],
      stages: [stage],
    };
    const sessions = stageSessions(stage, d0);
    expect(sessions.length).toBe(
      MONUMENT_BUILD_SESSIONS + MONUMENT_DANCE_SESSIONS + MONUMENT_FILL_SESSIONS,
    );
    const mid = (k: number) => Math.round((sessions[k]!.begin + sessions[k]!.stop) / 2);
    const ring = (t: number) =>
      treeScene(monument, t, d0).props.find((q) => q.kind === 'prop-gobekli-ring');
    const last = mid(MONUMENT_BUILD_SESSIONS - 1);
    const building = treeScene(monument, mid(0), d0);
    expect(building.figures.filter((f) => f.clip === 'work').length).toBeGreaterThan(3);
    expect(ring(mid(0))!.built).toBeGreaterThan(0);
    expect(ring(last)!.built).toBeGreaterThan(ring(mid(0))!.built!);
    const dancing = treeScene(monument, mid(MONUMENT_BUILD_SESSIONS + 1), d0);
    expect(dancing.figures.filter((f) => f.clip === 'dance').length).toBeGreaterThan(3);
    // Dancing adds nothing to the ring; the filling then builds the rest.
    const raised = MONUMENT_BUILD_SESSIONS / (MONUMENT_BUILD_SESSIONS + MONUMENT_FILL_SESSIONS);
    expect(ring(mid(MONUMENT_BUILD_SESSIONS + 1))!.built).toBeCloseTo(raised);
    expect(ring(mid(0))!.rise).toBe(1);
    const filling = mid(MONUMENT_BUILD_SESSIONS + MONUMENT_DANCE_SESSIONS + 1);
    expect(
      treeScene(monument, filling, d0).figures.filter((f) => f.clip === 'work').length,
    ).toBeGreaterThan(2);
    expect(ring(filling)!.built).toBeGreaterThan(raised);
    expect(ring(filling)!.rise).toBeLessThan(1);
    expect(ring(mid(sessions.length - 1) + 60_000)!.built).toBe(1);
    // It stands for a thousand years, then sinks over the last five hundred.
    const sinking = msAtDay(stage.until - Math.round(MONUMENT_SINK_DAYS / 2), d0);
    expect(ring(sinking)!.rise).toBeGreaterThan(0.4);
    expect(ring(sinking)!.rise).toBeLessThan(0.6);
    expect(ring(msAtDay(stage.until + 10, d0))).toBeUndefined();
    expect(ring(msAtDay(stage.shown, d0))).toBeUndefined();
  });

  it('is the same at the same clock time', () => {
    expect(treeScene(chunk, 123_456, d0)).toEqual(treeScene(chunk, 123_456, d0));
  });

  it('gives everyone but the first person an ordinary look', () => {
    const looks = new Set(Array.from({ length: 30 }, (_, i) => lookOf(i + 1)));
    expect(looks).toEqual(new Set(['woman', 'man', 'child']));
  });
});
