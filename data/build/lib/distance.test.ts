import { describe, expect, it } from 'vitest';
import { distanceKm, signedDistanceKm } from './distance.ts';

describe('distances on a global grid', () => {
  it('measures km along a row at the equator and wraps round the antimeridian', () => {
    const w = 360;
    const h = 180;
    const seed = new Uint8Array(w * h);
    seed[90 * w + 0] = 1; // just south of the equator, at 180°W
    const d = distanceKm(seed, w, h);
    expect(d[90 * w + 10]!).toBeCloseTo(1113, -1);
    expect(d[90 * w + (w - 10)]!).toBeCloseTo(1113, -1);
  });

  it('is positive inside a mask and negative outside, half a cell from the border', () => {
    const w = 36;
    const h = 18;
    const mask = new Uint8Array(w * h);
    for (let c = 10; c < 20; c++) mask[9 * w + c] = 1;
    const s = signedDistanceKm(mask, w, h);
    const cellKm = (180 / h) * 111.32;
    expect(s[9 * w + 15]!).toBeGreaterThan(0);
    expect(s[9 * w + 10]!).toBeCloseTo(cellKm / 2, -1);
    expect(s[9 * w + 5]!).toBeLessThan(0);
  });
});
