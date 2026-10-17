import { describe, expect, it } from 'vitest';
import { Grid } from './grid.ts';
import { smoothElevation } from './simplify.ts';

function grid(fill: (c: number, r: number) => number, w = 360, h = 180): Grid {
  const data = new Int16Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) data[r * w + c] = fill(c, r);
  return new Grid(w, h, data);
}

describe('simplified map', () => {
  it('smooths a spike into a hill', () => {
    const g = grid((c, r) => (c === 180 && r === 90 ? 3000 : 100));
    const s = smoothElevation(g, 300);
    const peak = s.data[90 * 360 + 180]!;
    expect(peak).toBeLessThan(1000);
    expect(peak).toBeGreaterThan(100);
    expect(s.data[90 * 360 + 181]!).toBeGreaterThan(100);
  });

  it('keeps small islands as land', () => {
    const g = grid((c, r) => (c === 100 && r === 50 ? 50 : -3000));
    const s = smoothElevation(g, 300);
    expect(s.data[50 * 360 + 100]!).toBeGreaterThan(0);
  });

  it('keeps shelves apart from the deep sea floor', () => {
    // A shallow shelf next to an abyss stays shallow.
    const g = grid((c) => (c < 180 ? -60 : -4000));
    const s = smoothElevation(g, 300);
    expect(s.data[90 * 360 + 178]!).toBe(-60);
    expect(s.data[90 * 360 + 182]!).toBe(-4000);
  });

  it('wraps around the date line', () => {
    const g = grid((c) => (c === 0 ? 2000 : 0));
    const s = smoothElevation(g, 300);
    expect(s.data[90 * 360 + 359]!).toBe(s.data[90 * 360 + 1]!);
  });
});
