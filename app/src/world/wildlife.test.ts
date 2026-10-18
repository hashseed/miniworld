import { describe, expect, it } from 'vitest';
import { ANIMALS } from '../../../assets/src/animals.ts';
import { detCos, RAD } from '../core/detmath.ts';
import { latLonToDir } from '../geo/cube.ts';
import { EARTH_RADIUS_KM } from '../geo/earth.ts';
import { astronomicalYear, dayOfYearStart } from '../time/calendar.ts';
import {
  WILD_GROUPS,
  WILD_MASK_N,
  cosSinTurn,
  decodeWildMask,
  encodeWildMask,
  flies,
  groupGrowth,
  groupSpanAt,
  groupSize,
  keepOutsOf,
  roamOf,
  type KeepOut,
  wildClearings,
  wildMaskCell,
  wildlifeAt,
} from './wildlife.ts';

const day = (year: number) => dayOfYearStart(year < 0 ? astronomicalYear(-year, 'BCE') : year);
/** Straight-line distance in km, close to the distance over the ground at these ranges. */
const km = (a: number[], b: number[]) =>
  Math.sqrt((a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2) * EARTH_RADIUS_KM;

describe('wildlife groups (wildlife.md section 3)', () => {
  it('every group has a model, a home, a source and ordered spans', () => {
    for (const g of WILD_GROUPS) {
      expect(ANIMALS as readonly string[]).toContain(g.model);
      expect(g.source.length).toBeGreaterThan(3);
      expect(Math.abs(g.lat)).toBeLessThanOrEqual(90);
      for (const s of g.spans ?? [])
        if (s.from !== undefined && s.to !== undefined) expect(s.from).toBeLessThan(s.to);
    }
  });

  it('has at most two groups of each species, of 2 or 3 animals', () => {
    const per = new Map<string, number>();
    WILD_GROUPS.forEach((g, i) => {
      per.set(g.species, (per.get(g.species) ?? 0) + 1);
      expect([2, 3]).toContain(groupSize(g, i));
    });
    for (const n of per.values()) expect(n).toBeLessThanOrEqual(2);
  });

  it('keeps the homes of groups shown at the same time apart', () => {
    for (let i = 0; i < WILD_GROUPS.length; i++)
      for (let j = i + 1; j < WILD_GROUPS.length; j++) {
        const a = WILD_GROUPS[i]!;
        const b = WILD_GROUPS[j]!;
        const together = [-60000, -15000, -5000, 1000, 1990].some(
          (y) => groupGrowth(a, day(y)) > 0 && groupGrowth(b, day(y)) > 0,
        );
        if (!together) continue;
        const d = km(latLonToDir(a.lat, a.lon), latLonToDir(b.lat, b.lon));
        expect(d, `${a.home} and ${b.home}`).toBeGreaterThan(330);
      }
  });

  it('follows history: horses leave the Americas and come back, mammoths die out', () => {
    const plains = WILD_GROUPS.find((g) => g.home === 'Southern Great Plains')!;
    expect(groupGrowth(plains, day(-20000))).toBe(1);
    expect(groupGrowth(plains, day(-5000))).toBe(0);
    expect(groupGrowth(plains, day(1800))).toBe(1);
    const wrangel = WILD_GROUPS.find((g) => g.home === 'Wrangel Island')!;
    expect(groupGrowth(wrangel, day(-3000))).toBe(1);
    expect(groupGrowth(wrangel, day(-1000))).toBe(0);
    // Growing in takes a few years.
    const g = groupGrowth(plains, day(1702));
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(1);
  });
});

describe('wildlifeAt (wildlife.md section 4)', () => {
  it('turns angles into cosine and sine without engine maths', () => {
    for (const t of [0, 0.125, 0.25, 0.4, -0.3, 7.9]) {
      const [c, s] = cosSinTurn(t);
      const a = t * 2 * Math.PI;
      // eslint-disable-next-line no-restricted-properties -- the reference only
      expect(c).toBeCloseTo(Math.cos(a), 5);
      // eslint-disable-next-line no-restricted-properties -- the reference only
      expect(s).toBeCloseTo(Math.sin(a), 5);
    }
  });

  it('is a pure function of the date and the clock', () => {
    expect(wildlifeAt(day(1500), 123.4)).toEqual(wildlifeAt(day(1500), 123.4));
  });

  it('keeps every animal near its home, grazing or walking, birds flying', () => {
    const counts = new Map<string, number>();
    for (let t = 0; t < 600; t += 7.3)
      for (const a of wildlifeAt(day(1500), t)) {
        const g = WILD_GROUPS[Number(a.key.split(':')[0])]!;
        expect(Math.sqrt(a.eastKm ** 2 + a.northKm ** 2)).toBeLessThan(roamOf(g) + 100);
        expect(a.lat).toBe(g.lat);
        expect(Math.sqrt(a.heading[0] ** 2 + a.heading[1] ** 2)).toBeCloseTo(1, 5);
        expect(a.clip).toBe(flies(g) ? 'fly' : a.clip);
        counts.set(a.clip, (counts.get(a.clip) ?? 0) + 1);
      }
    // Mostly grazing, sometimes walking.
    expect(counts.get('idle')!).toBeGreaterThan(counts.get('walk')!);
    expect(counts.get('walk')!).toBeGreaterThan(0);
  });

  it('drifts across its range a few hundred km per round', () => {
    const at = new Map<string, [number, number]>();
    for (let t = 0; t < 600; t += 1)
      for (const a of wildlifeAt(day(1500), t)) {
        const last = at.get(a.key);
        if (last)
          expect(Math.sqrt((a.eastKm - last[0]) ** 2 + (a.northKm - last[1]) ** 2)).toBeLessThan(
            250,
          );
        at.set(a.key, [a.eastKm, a.northKm]);
      }
  });

  it('roams up to about 1000 km from home over time', () => {
    let far = 0;
    for (let t = 0; t < 3000; t += 13)
      for (const a of wildlifeAt(day(1500), t))
        far = Math.max(far, Math.sqrt(a.eastKm ** 2 + a.northKm ** 2));
    expect(far).toBeGreaterThan(600);
  });

  it('clears the trees wherever the animals graze or walk (section 5)', () => {
    for (let t = 0; t < 300; t += 3.7) {
      const clear = wildClearings(day(1500), t);
      for (const a of wildlifeAt(day(1500), t)) {
        const g = WILD_GROUPS[Number(a.key.split(':')[0])]!;
        const inside = clear.some(
          (c) =>
            c.lat === g.lat &&
            c.lon === g.lon &&
            Math.sqrt((c.eastKm - a.eastKm) ** 2 + (c.northKm - a.northKm) ** 2) < c.km,
        );
        expect(inside).toBe(true);
      }
    }
  });

  it('shows about 115 animals at one date', () => {
    const n = wildlifeAt(day(1500), 0).length;
    expect(n).toBeGreaterThan(85);
    expect(n).toBeLessThan(145);
  });

  it('gives lion groups one lion and lionesses', () => {
    const lions = wildlifeAt(day(1500), 0).filter((a) => a.model.startsWith('animal-lion'));
    expect(lions.filter((a) => a.model === 'animal-lion').length).toBe(2);
    expect(lions.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps walking animals on the open ground of their masks', () => {
    // Open only east of the home: every spot of a walking group must lie there.
    const masks = WILD_GROUPS.map((g) => {
      if (flies(g)) return undefined;
      const m = new Uint8Array(WILD_MASK_N * WILD_MASK_N);
      for (let j = 0; j < WILD_MASK_N; j++)
        for (let i = 0; i < WILD_MASK_N; i++)
          m[j * WILD_MASK_N + i] = wildMaskCell(g, i, j)[0] > -40 ? 1 : 0;
      return decodeWildMask(encodeWildMask(m));
    });
    for (const s of [0, 7, 31, 90, 200, 333])
      for (const a of wildlifeAt(day(1800), s, WILD_GROUPS, masks)) {
        const g = WILD_GROUPS[Number(a.key.split(':')[0])]!;
        if (flies(g)) continue;
        // The curve between open spots may bow a little beyond them.
        expect(a.eastKm).toBeGreaterThan(-40 - 0.2 * roamOf(g));
      }
  });

  it('keeps clear of a camp while it stands and walks round it without jumping (section 4)', () => {
    const gi = WILD_GROUPS.findIndex((g) => g.species === 'plains-zebra');
    // A camp right where the group grazes at 500 s, standing from 400 to 900 s.
    const at = wildlifeAt(day(1500), 500).find((a) => a.key === `${gi}:0`)!;
    const camp: KeepOut = { x: at.eastKm, y: at.northKm, r: 300, from: 400, to: 900 };
    const keepOuts = WILD_GROUPS.map((_, i) => (i === gi ? [camp] : []));
    const last = new Map<string, [number, number]>();
    for (let t = 300; t < 1000; t += 0.25)
      for (const a of wildlifeAt(day(1500), t, WILD_GROUPS, [], () => 0, keepOuts)) {
        if (!a.key.startsWith(`${gi}:`)) continue;
        const d = Math.sqrt((a.eastKm - camp.x) ** 2 + (a.northKm - camp.y) ** 2);
        if (t >= camp.from && t < camp.to) expect(d).toBeGreaterThan(camp.r - 1e-6);
        const before = last.get(a.key);
        if (before)
          expect(
            Math.sqrt((a.eastKm - before[0]) ** 2 + (a.northKm - before[1]) ** 2),
          ).toBeLessThan(60); // a brisk walk away, never a jump of hundreds of km
        last.set(a.key, [a.eastKm, a.northKm]);
      }
  });

  it("lays a camp on the plane at a group's home", () => {
    const g = WILD_GROUPS.find((w) => w.species === 'giraffe')!;
    const [k] = keepOutsOf(
      g,
      [{ lat: Math.round(g.lat * 1e6), lon: Math.round((g.lon + 2) * 1e6), from: 0, to: 9 }],
      500,
    );
    const east = 2 * 111.195 * detCos(g.lat * RAD);
    expect(k!.x).toBeCloseTo(east, -1);
    expect(Math.abs(k!.y)).toBeLessThan(10);
    expect(
      keepOutsOf(
        WILD_GROUPS.find((w) => flies(w))!,
        [],
        500,
      ),
    ).toEqual([]);
  });

  it('round-trips a mask through its hex string', () => {
    const m = Uint8Array.from({ length: WILD_MASK_N * WILD_MASK_N }, (_, i) =>
      (i * 7) % 3 === 0 ? 1 : 0,
    );
    expect(decodeWildMask(encodeWildMask(m))).toEqual(m);
  });
});

describe('groupSpanAt (wildlife.md section 8)', () => {
  it('gives the span shown on a day, none for groups shown always', () => {
    const plains = WILD_GROUPS.find((g) => g.home === 'Southern Great Plains')!;
    expect(groupSpanAt(plains, day(1800))).toEqual({
      from: { day: day(1700), year: 1700 },
      to: undefined,
    });
    expect(groupSpanAt(plains, day(-20000))!.to!.year).toBe(-10000);
    expect(
      groupSpanAt(
        WILD_GROUPS.find((g) => g.species === 'giraffe')!,
        day(1800),
      ),
    ).toBe(undefined);
  });
});
