import { describe, expect, it } from 'vitest';
import { Grid } from './grid.ts';
import { monotoneCubic, seaLevelFromIce, type IceSlice } from './ice.ts';

describe('sea level from ice', () => {
  it('lowers the sea by the volume of extra ice', () => {
    const w = 36;
    const h = 18;
    const none = new Float32Array(w * h);
    const some = new Float32Array(w * h).fill(100); // 100 m of ice everywhere
    const slices: IceSlice[] = [
      { yearsBP: 0, thickness: new Grid(w, h, none) },
      { yearsBP: 20000, thickness: new Grid(w, h, some) },
    ];
    const [today, lgm] = seaLevelFromIce(slices);
    expect(today).toBeCloseTo(0);
    // Earth area 5.1e14 m² × 100 m × 0.917 / 3.618e14 m² ≈ 129 m.
    expect(lgm).toBeCloseTo(-129.3, 0);
  });

  it('interpolates monotonically without overshoot', () => {
    const f = monotoneCubic([0, 1, 2, 3], [-120, -120, -40, 0]);
    let prev = -Infinity;
    for (let x = 0; x <= 3; x += 0.01) {
      const y = f(x);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(y).toBeGreaterThanOrEqual(-120 - 1e-9);
      expect(y).toBeLessThanOrEqual(0);
      prev = y;
    }
  });
});
