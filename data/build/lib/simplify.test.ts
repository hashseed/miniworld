import { describe, expect, it } from 'vitest';
import { Grid } from './grid.ts';
import { enlargeIslands, islandGrowthKm, smoothElevation } from './simplify.ts';

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

  it('enlarges mid-sized islands but not continents', () => {
    // 1/8 degree cells: a 10×10 island of about 19,000 km² and a big continent.
    const w = 2880;
    const h = 1440;
    const data = new Int16Array(w * h).fill(-2000);
    for (let r = 715; r < 725; r++) for (let c = 1430; c < 1440; c++) data[r * w + c] = 400;
    for (let r = 400; r < 600; r++) for (let c = 100; c < 600; c++) data[r * w + c] = 300;
    const g = new Grid(w, h, data);
    expect(enlargeIslands(g)).toBe(1);
    // It grows by 25 km, just under two cells of 13.9 km.
    expect(g.data[719 * w + 1440]!).toBeGreaterThan(0);
    expect(g.data[719 * w + 1429]!).toBeGreaterThan(0);
    expect(g.data[719 * w + 1442]!).toBe(-2000);
    expect(g.data[500 * w + 600]!).toBe(-2000);
    expect(g.data[719 * w + 1439]!).toBe(400);
  });

  it('grows islands by 6 to 25 km', () => {
    expect(islandGrowthKm(100)).toBe(6);
    expect(islandGrowthKm(10400)).toBeCloseTo(23, 0);
    expect(islandGrowthKm(60000)).toBe(25);
  });
});
