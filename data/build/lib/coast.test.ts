import { describe, expect, it } from 'vitest';
import { OCEAN_MIN_LEVEL, OCEAN_NEVER, OCEAN_SCALE } from '../../../app/src/content/formats.ts';
import { carveStraits, polarWeight, smoothOcean, type Strait } from './coast.ts';
import { Grid } from './grid.ts';
import { oceanConnection } from './ocean.ts';

// A 0.1° world: deep ocean west of 0°, land east of it, and a basin at
// -2000 m behind a 2-cell land wall at 10°E, joined by a strait.
const W = 3600;
const H = 1800;
function world(): Grid {
  const d = new Int16Array(W * H).fill(500);
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const lon = -180 + (c + 0.5) / 10;
      if (lon < 0) d[r * W + c] = -4000;
      else if (lon > 10.2 && lon < 20) d[r * W + c] = -2000;
    }
  return new Grid(W, H, d);
}
const strait: Strait = {
  id: 'test',
  name: 'Test strait',
  source: 'test',
  sill: -100,
  line: [
    [9.5, 0],
    [10.8, 0],
  ],
};

describe('smooth coasts', () => {
  it('keeps a carved strait open above its sill and closed below', () => {
    const g = world();
    carveStraits(g, [strait]);
    // Join the strait to the ocean along the equator.
    for (let c = 1800; c < 1900; c++) g.data[899 * W + c] = Math.min(g.data[899 * W + c]!, -100);
    const conn = new Grid(W, H, oceanConnection(g));
    const basin = 899 * W + 1950;
    expect(conn.data[basin]).toBe(-100 - OCEAN_MIN_LEVEL);
    const smooth = smoothOcean(conn, [strait]);
    const level = (i: number) => OCEAN_MIN_LEVEL + smooth[i]! / OCEAN_SCALE;
    expect(level(basin)).toBeLessThanOrEqual(-99);
    // Inside the strait it is sea above the sill.
    expect(level(899 * W + 1902)).toBeLessThanOrEqual(-99);
    // Land far from any sea stays land at every sea level.
    expect(level(899 * W + 2500)).toBeGreaterThan(10);
  });

  it('smooths the coast so it is not a step', () => {
    const conn = new Grid(W, H, new Uint8Array(W * H).fill(OCEAN_NEVER));
    for (let i = 0; i < W * H; i++) if (i % W < 1800) conn.data[i] = 0;
    const smooth = smoothOcean(conn, []);
    const row = 899 * W;
    const values = [1797, 1799, 1800, 1802].map((c) => smooth[row + c]!);
    for (let k = 1; k < values.length; k++) expect(values[k]!).toBeGreaterThan(values[k - 1]!);
  });

  it('simplifies polar regions only', () => {
    expect(polarWeight(0)).toBe(0);
    expect(polarWeight(60)).toBe(0);
    expect(polarWeight(67)).toBeCloseTo(0.5);
    expect(polarWeight(-55)).toBeCloseTo(0.5);
    expect(polarWeight(-70)).toBe(1);
    expect(polarWeight(80)).toBe(1);
  });
});
