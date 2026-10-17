import { describe, expect, it } from 'vitest';
import { iceStepYears, monotoneCubic, seaLevelCurve, sliceDay } from './ice.ts';

describe('ice steps', () => {
  it('steps every 1,000 years back to the start', () => {
    const years = iceStepYears(sliceDay(51950));
    expect(years[0]).toBe(52000);
    expect(years[years.length - 1]).toBe(0);
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
