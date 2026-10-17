import { describe, expect, it } from 'vitest';
import { OCEAN_LAKE, OCEAN_NEVER } from '../../../app/src/content/formats.ts';
import { Grid } from './grid.ts';
import { floodInlandSeas, oceanConnection } from './ocean.ts';

// A 12 × 6 world: deep ocean on the left, a shelf at -60 m, a ridge, and an
// inland basin at -200 m behind land at +20 m.
const W = 12;
const H = 6;
function world(): Grid {
  const d = new Int16Array(W * H);
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      let v = 100;
      if (c <= 2) v = -4000;
      else if (c <= 4) v = -60;
      else if (c === 5) v = -20;
      else if (c >= 8 && c <= 9 && r >= 2 && r <= 3) v = -200;
      else if (c >= 6) v = 20;
      d[r * W + c] = v;
    }
  return new Grid(W, H, d);
}

describe('ocean connection', () => {
  it('finds the sea level at which each cell joins the ocean', () => {
    const conn = oceanConnection(world());
    const at = (c: number, r: number) => conn[r * W + c]!;
    expect(at(0, 0)).toBe(0); // open ocean: sea at any level from -130 m
    expect(at(3, 0)).toBe(70); // shelf at -60 m: sea from -60 m
    expect(at(5, 0)).toBe(110); // -20 m
    expect(at(7, 0)).toBe(OCEAN_NEVER); // land at +20 m never floods (> +10 m)
    expect(at(8, 2)).toBe(OCEAN_NEVER); // inland basin behind land is never ocean
  });

  it('floods inland seas from a seed', () => {
    const g = world();
    const marks = new Map<number, number>();
    const seas = [{ id: 'basin', lat: 90 - 2.5 * 30, lon: -180 + 8.5 * 30, level: -100 }];
    floodInlandSeas(g, seas, (i, level) => marks.set(i, level));
    expect(marks.size).toBe(4);
    expect([...marks.values()]).toEqual([-100, -100, -100, -100]);
    expect(OCEAN_LAKE).toBe(254);
  });
});
