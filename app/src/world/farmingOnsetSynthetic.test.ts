// The farming queries on a small raster built in the test, so that they are covered
// without the built data (CI has none): three painted cells over an empty world.

import { afterEach, describe, expect, it } from 'vitest';
import {
  FARMING_COLS,
  FARMING_ROWS,
  FARMING_YEAR_BIAS,
  FarmingGrid,
  cropFarmingDay,
  dayOfFarmingYear,
  farmingCellOf,
  farmingGrid,
  farmingOnsetDay,
  farmingProfileAt,
  farmingStateAt,
  fieldToolOf,
  setFarmingGrid,
  settlementStage,
  type FarmingSeedInfo,
} from './farmingOnset.ts';

const N = FARMING_COLS * FARMING_ROWS;
const seed: FarmingSeedInfo = {
  id: 'test',
  bce: 7000,
  approximate: false,
  herdingOnly: false,
  en: 'Test',
  de: 'Test',
  package: { en: 'wheat', de: 'Weizen' },
};

/** Cells to paint: onset year BCE, the crop delay in years (null: never) and the seed (1-based, 0: none). */
interface Paint {
  lat: number;
  lon: number;
  onset: number;
  delay: number | null;
  seed: number;
}

function raster(paints: Paint[]): Uint8Array {
  const head = new TextEncoder().encode(JSON.stringify({ seeds: [seed] }));
  const out = new Uint8Array(4 + head.length + N * 5);
  new DataView(out.buffer).setUint32(0, head.length, true);
  out.set(head, 4);
  const base = 4 + head.length;
  for (const p of paints) {
    const i = farmingCellOf(p.lat, p.lon);
    const v = p.onset + FARMING_YEAR_BIAS;
    const d = p.delay ?? 0xffff;
    out[base + i] = v >> 8;
    out[base + N + i] = v & 255;
    out[base + 2 * N + i] = d >> 8;
    out[base + 3 * N + i] = d & 255;
    out[base + 4 * N + i] = p.seed;
  }
  return out;
}

const LBK = { lat: 50, lon: 10 };
const SAHARA = { lat: 21, lon: 30.7 };
const NOSEED = { lat: -30, lon: 140 };
const NEVER = { lat: 65, lon: 100 };

function setup(): void {
  setFarmingGrid(
    new FarmingGrid(
      raster([
        { ...LBK, onset: 5500, delay: 0, seed: 1 },
        { ...SAHARA, onset: 7000, delay: 1500, seed: 1 },
        { ...NOSEED, onset: 3000, delay: 0, seed: 0 },
        { ...NEVER, onset: 4000, delay: null, seed: 9 },
      ]),
    ),
  );
}

afterEach(() => setFarmingGrid(undefined));

describe('farming queries on a synthetic raster', () => {
  it('decodes the planes of a cell', () => {
    setup();
    const g = farmingGrid()!;
    expect(g.seeds).toHaveLength(1);
    const c = farmingCellOf(LBK.lat, LBK.lon);
    expect(g.onsetYear(c)).toBe(5500);
    expect(g.farmingYear(c)).toBe(5500);
    expect(g.seedOf(c)?.id).toBe('test');
    const s = farmingCellOf(SAHARA.lat, SAHARA.lon);
    expect(g.farmingYear(s)).toBe(5500);
    const empty = farmingCellOf(0, -140);
    expect(g.onsetYear(empty)).toBeNull();
    expect(g.farmingYear(empty)).toBeNull();
    expect(g.seedOf(empty)).toBeNull();
    expect(g.farmingYear(farmingCellOf(NEVER.lat, NEVER.lon))).toBeNull();
    expect(g.seedOf(farmingCellOf(NEVER.lat, NEVER.lon))).toBeNull();
    expect(g.seedOf(farmingCellOf(NOSEED.lat, NOSEED.lon))).toBeNull();
  });

  it('refuses a raster of the wrong size', () => {
    expect(() => new FarmingGrid(raster([]).subarray(0, N))).toThrow('wrong size');
  });

  it('clamps cells at the edges of the map', () => {
    expect(farmingCellOf(90, -180)).toBe(0);
    expect(farmingCellOf(-90, 180)).toBe(N - 1);
    expect(farmingCellOf(100, 500)).toBe(FARMING_COLS - 1);
  });

  it('gives onset and crop days', () => {
    setup();
    expect(farmingOnsetDay(LBK.lat, LBK.lon)).toBe(dayOfFarmingYear(5500));
    expect(cropFarmingDay(SAHARA.lat, SAHARA.lon)).toBe(dayOfFarmingYear(5500));
    expect(farmingOnsetDay(0, -140)).toBeNull();
    expect(cropFarmingDay(0, -140)).toBeNull();
    expect(cropFarmingDay(NEVER.lat, NEVER.lon)).toBeNull();
  });

  it('tells none, herding and farming by the day', () => {
    setup();
    const { lat, lon } = SAHARA;
    expect(settlementStage(lat, lon, dayOfFarmingYear(7500))).toBe('none');
    expect(settlementStage(lat, lon, dayOfFarmingYear(6500))).toBe('herding');
    expect(settlementStage(lat, lon, dayOfFarmingYear(5000))).toBe('farming');
    expect(settlementStage(NEVER.lat, NEVER.lon, dayOfFarmingYear(1000))).toBe('herding');
    expect(settlementStage(0, -140, 0)).toBe('none');
  });

  it('describes the state of a place', () => {
    setup();
    const before = farmingStateAt(LBK.lat, LBK.lon, dayOfFarmingYear(6000));
    expect(before).toMatchObject({ farming: false, stage: 'none', profile: null, package: null });
    const late = farmingStateAt(LBK.lat, LBK.lon, dayOfFarmingYear(2000));
    expect(late).toMatchObject({
      farming: true,
      stage: 'farming',
      profile: 'lbk-farmer',
      fieldTool: 'ard',
    });
    expect(late.sinceDays).toBe(dayOfFarmingYear(2000) - dayOfFarmingYear(5500));
    expect(late.package).toEqual(seed.package);
    const herding = farmingStateAt(SAHARA.lat, SAHARA.lon, dayOfFarmingYear(6500));
    expect(herding).toMatchObject({
      farming: true,
      stage: 'herding',
      profile: null,
      fieldTool: null,
    });
    const noProfile = farmingStateAt(NOSEED.lat, NOSEED.lon, dayOfFarmingYear(1000));
    expect(noProfile).toMatchObject({
      stage: 'farming',
      profile: null,
      fieldTool: null,
      package: null,
    });
  });

  it('answers none without a raster', () => {
    expect(farmingGrid()).toBeUndefined();
    expect(farmingOnsetDay(LBK.lat, LBK.lon)).toBeNull();
    expect(cropFarmingDay(LBK.lat, LBK.lon)).toBeNull();
    expect(farmingStateAt(LBK.lat, LBK.lon, 0).farming).toBe(false);
  });

  it('chooses profiles and tools', () => {
    expect(farmingProfileAt(50, 10)).toBe('lbk-farmer');
    expect(farmingProfileAt(0, -140)).toBeNull();
    expect(fieldToolOf('mesoamerican-farmer', dayOfFarmingYear(1000))).toBe('digging-stick');
    expect(fieldToolOf('lbk-farmer', dayOfFarmingYear(7000))).toBe('hoe');
  });
});
