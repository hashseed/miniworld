import { describe, expect, it } from 'vitest';
import { climateStepYears, monotoneCubic, seaLevelCurve, sliceDay } from './ice.ts';

describe('ice steps', () => {
  it("takes the climate data's steps from the one before the start to today", () => {
    const years = climateStepYears([54000, 52000, 50000, 2000, 1000, 0], sliceDay(51950));
    expect(years).toEqual([52000, 50000, 2000, 1000, 0]);
  });

  it('samples the sea-level curve every 100 years', () => {
    const curve = seaLevelCurve(
      [
        [20000, -120],
        [0, 0],
      ],
      sliceDay(20000),
      sliceDay(0),
    );
    expect(curve.metres[0]).toBe(-120);
    expect(curve.metres[200]).toBe(0);
  });
});

describe('monotone cubic', () => {
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
