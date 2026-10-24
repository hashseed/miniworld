import { describe, expect, it, vi } from 'vitest';
import { FarmingGrid, farmingCellOf } from '../../../app/src/world/farmingOnset.ts';
import {
  checkFarming,
  computeFarming,
  encodeFarming,
  type FarmingInput,
  type FarmingSeed,
} from './farming.ts';

vi.setConfig({ testTimeout: 60_000 });
// A flat world: land between 60 S and 70 N, a one-degree sea strip at 10 E.
const base = (seeds: FarmingSeed[], extra: Partial<FarmingInput> = {}): FarmingInput => ({
  seeds,
  zones: [],
  defaultKmPerYear: 1,
  seaMaxHopKm: 900,
  holds: [],
  noFarming: [],
  barriers: [],
  land: (lat, lon) => lat > -60 && lat < 70 && !(lon > 10 && lon < 11),
  habitable: () => true,
  ...extra,
});
const centre: FarmingSeed = { id: 'c', bce: 9000, lat: 30, lon: 0, kind: 'centre' };
const at = (r: ReturnType<typeof computeFarming>, lat: number, lon: number) =>
  r.onset[farmingCellOf(lat, lon)]!;

describe('computeFarming', () => {
  it('is deterministic', () => {
    const a = computeFarming(base([centre]));
    const b = computeFarming(base([centre]));
    expect(Array.from(a.onset.slice(0, 5000))).toEqual(Array.from(b.onset.slice(0, 5000)));
    expect(a.seed).toEqual(b.seed);
  }, 60_000);

  it('spreads monotonically from the centre at about the zone speed', () => {
    const r = computeFarming(base([centre]));
    expect(at(r, 30, 0)).toBe(9000);
    let last = Infinity;
    for (const lon of [1, 3, 6, 9, 15, 25, 40]) {
      const t = at(r, 30, lon);
      expect(t).toBeLessThan(last);
      last = t;
    }
    // 3 degrees of longitude at 30 N is about 290 km, one km a year.
    expect(at(r, 30, 3)).toBeGreaterThan(9000 - 330);
    expect(at(r, 30, 3)).toBeLessThan(9000 - 250);
  });

  it('crosses a short strait but not a barrier', () => {
    const open = computeFarming(base([centre]));
    expect(Number.isNaN(at(open, 30, 20))).toBe(false);
    const blocked = computeFarming(
      base([centre], { barriers: [{ id: 'b', box: { lat: [-90, 90], lon: [10, 11] } }] }),
    );
    // The wave can still go round the world the other way, but only far later.
    const t = at(blocked, 30, 20);
    expect(Number.isNaN(t) || t < at(open, 30, 20) - 1000).toBe(true);
  }, 60_000);

  it('keeps a hold as the earliest year and lets the wave go on from it', () => {
    const r = computeFarming(
      base([centre], {
        holds: [{ id: 'h', box: { lat: [0, 60], lon: [5, 8] }, notBeforeBce: 8000 }],
      }),
    );
    expect(at(r, 30, 6)).toBeLessThanOrEqual(8000);
    expect(at(r, 30, 6)).toBeGreaterThan(7800);
    expect(at(r, 30, 20)).toBeLessThan(8000);
  });

  it('starts a centre later with spreadBce but keeps its own date', () => {
    const r = computeFarming(base([{ ...centre, spreadBce: 8000 }]));
    expect(at(r, 30, 0)).toBe(9000);
    expect(at(r, 30, 3)).toBeLessThan(8000);
  });

  it('gives no onset to blocked and uninhabitable cells, except at a seed', () => {
    const r = computeFarming(
      base([centre], {
        noFarming: [{ id: 'n', box: { lat: [40, 50], lon: [-180, 180] } }],
        habitable: (lat) => lat < 35,
      }),
    );
    expect(Number.isNaN(at(r, 45, 0))).toBe(true);
    expect(Number.isNaN(at(r, 36, 0))).toBe(true);
    expect(Number.isNaN(at(r, 30, 0))).toBe(false);
  });

  it('puts herding before crops when the nearer seed is herding only', () => {
    const herders: FarmingSeed = {
      id: 'h',
      bce: 5000,
      lat: 30,
      lon: 40,
      herdingOnly: true,
      kind: 'waypoint',
    };
    const r = computeFarming(base([herders, { ...centre, bce: 6000 }]));
    const cell = farmingCellOf(30, 38);
    expect(r.onset[cell]!).toBeGreaterThan(r.farming[cell]!);
  });

  it('checks waypoints against their tolerance and the centres against their date', () => {
    const wp: FarmingSeed = { id: 'w', bce: 6000, lat: 30, lon: 3, kind: 'waypoint' };
    const input = base([centre, wp]);
    const r = computeFarming(input);
    // The wave reaches the waypoint about 8700 BCE, but the waypoint itself is 6000 BCE
    // (its own seed makes the cell 8700 BCE, earlier than the tolerance allows).
    const bad = checkFarming(input, r, new Map([['w', 200]]));
    expect(bad.errors.some((e) => e.startsWith('w:'))).toBe(true);
    const good = checkFarming(input, r, new Map([['w', 4000]]));
    expect(good.errors).toEqual([]);
  });
});

describe('the farming file', () => {
  it('round-trips through FarmingGrid', () => {
    const r = computeFarming(
      base([centre, { ...centre, id: 'late', bce: 3000, lat: -40, lon: 100 }]),
    );
    const info = (id: string, bce: number) => ({
      id,
      bce,
      approximate: false,
      herdingOnly: false,
      en: id,
      de: id,
      package: { en: 'a', de: 'b' },
    });
    const grid = new FarmingGrid(encodeFarming(r, [info('c', 9000), info('late', 3000)]));
    for (const [lat, lon] of [
      [30, 0],
      [30, 30],
      [-40, 100],
      [80, 0],
    ] as const) {
      const cell = farmingCellOf(lat, lon);
      const want = r.onset[cell]!;
      expect(grid.onsetYear(cell)).toBe(Number.isNaN(want) ? null : Math.round(want));
    }
    expect(grid.seedOf(farmingCellOf(-40, 100))?.id).toBe('late');
    expect(grid.onsetYear(farmingCellOf(-40, 100))).toBe(3000);
  });

  it('stores an arrival after 2000 CE as none, not as a wrapped year', () => {
    const r = computeFarming(base([{ ...centre, bce: -3000 }]));
    const cell = farmingCellOf(30, 0);
    r.onset[cell] = -3000;
    const grid = new FarmingGrid(
      encodeFarming(r, [
        {
          id: 'c',
          bce: -3000,
          approximate: false,
          herdingOnly: false,
          en: 'c',
          de: 'c',
          package: { en: 'a', de: 'b' },
        },
      ]),
    );
    expect(grid.onsetYear(cell)).toBeNull();
  });
});
