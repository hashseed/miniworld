import { describe, expect, it } from 'vitest';
import { ANIMALS } from '../../../assets/src/animals.ts';
import { latLonToDir } from '../geo/cube.ts';
import { EARTH_RADIUS_KM } from '../geo/earth.ts';
import { astronomicalYear, dayOfYearStart } from '../time/calendar.ts';
import { WILD_GROUPS, cosSinTurn, groupGrowth, groupSize, wildlifeAt } from './wildlife.ts';

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
        expect(Math.sqrt(a.eastKm ** 2 + a.northKm ** 2)).toBeLessThan(170);
        expect(a.lat).toBe(g.lat);
        expect(Math.sqrt(a.heading[0] ** 2 + a.heading[1] ** 2)).toBeCloseTo(1, 5);
        expect(a.clip).toBe(
          g.model === 'animal-parrot' || g.model === 'animal-kea' ? 'fly' : a.clip,
        );
        counts.set(a.clip, (counts.get(a.clip) ?? 0) + 1);
      }
    // Mostly grazing, sometimes walking.
    expect(counts.get('idle')!).toBeGreaterThan(counts.get('walk')!);
    expect(counts.get('walk')!).toBeGreaterThan(0);
  });

  it('shows about 85 animals at one date', () => {
    const n = wildlifeAt(day(1500), 0).length;
    expect(n).toBeGreaterThan(60);
    expect(n).toBeLessThan(110);
  });

  it('gives lion groups one lion and lionesses', () => {
    const lions = wildlifeAt(day(1500), 0).filter((a) => a.model.startsWith('animal-lion'));
    expect(lions.filter((a) => a.model === 'animal-lion').length).toBe(2);
    expect(lions.length).toBeGreaterThanOrEqual(4);
  });
});
