import { describe, expect, it } from 'vitest';
import { OCEAN_MIN_LEVEL, OCEAN_SCALE, OCEAN_TOP } from '../../../app/src/content/formats.ts';
import { coarseOcean, smoothLakes, type Strait } from './coast.ts';
import { Grid } from './grid.ts';

const LAND = OCEAN_TOP * OCEAN_SCALE;
const level = (v: number) => OCEAN_MIN_LEVEL + v / OCEAN_SCALE;

describe('coarse ocean', () => {
  // A 1° world: sea west of 0°, land east of it.
  const W = 360;
  const H = 180;
  const halves = () => {
    const d = new Uint16Array(W * H);
    for (let i = 0; i < W * H; i++) d[i] = i % W < 180 ? 0 : LAND;
    return new Grid(W, H, d);
  };

  it('keeps open sea and inland ground and grades the coast between', () => {
    const out = coarseOcean(halves(), 300, []);
    const row = 90 * W;
    expect(out[row + 90]).toBe(0);
    expect(out[row + 270]).toBe(LAND);
    const coast = [176, 178, 180, 182].map((c) => out[row + c]!);
    for (let k = 1; k < coast.length; k++) expect(coast[k]!).toBeGreaterThanOrEqual(coast[k - 1]!);
    expect(coast[0]!).toBeLessThan(coast[3]!);
  });

  it('closes a sea narrower than the coast grows', () => {
    const g = new Grid(W, H, new Uint16Array(W * H).fill(LAND));
    g.data[90 * W + 200] = 0;
    expect(coarseOcean(g, 300, [])[90 * W + 200]).toBe(LAND);
  });

  it('lays a strait in again down to its sill', () => {
    const g = new Grid(W, H, new Uint16Array(W * H).fill(LAND));
    const strait: Strait = {
      id: 'test',
      name: 'Test strait',
      source: 'test',
      sill: -50,
      line: [
        [10, 0.5],
        [20, 0.5],
      ],
    };
    const out = coarseOcean(g, 300, [strait]);
    expect(level(out[89 * W + 195]!)).toBeCloseTo(-50, 1);
    expect(out[89 * W + 300]).toBe(LAND);
  });
});

describe('smooth lakes', () => {
  // A 0.25° world with a 2.5° square lake at 300 m on the equator.
  const W = 1440;
  const H = 720;
  const NO = -32768;
  const lakeLevel = new Grid(W, H, new Int16Array(W * H).fill(NO));
  for (let r = 355; r < 365; r++) for (let c = 720; c < 730; c++) lakeLevel.data[r * W + c] = 300;
  const field = smoothLakes(lakeLevel, NO);

  it('is full inside the lake, empty far away and graded at the shore', () => {
    expect(field[360 * W + 725]).toBe(255);
    expect(field[360 * W + 100]).toBe(0);
    const shore = field[360 * W + 730]!;
    expect(shore).toBeGreaterThan(0);
    expect(shore).toBeLessThan(255);
  });

  it('spreads the lake level under the smoothed shore only', () => {
    expect(lakeLevel.data[360 * W + 730]).toBe(300);
    expect(lakeLevel.data[360 * W + 100]).toBe(NO);
    expect(lakeLevel.data[360 * W + 725]).toBe(300);
  });
});
