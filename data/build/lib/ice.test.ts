import { describe, expect, it } from 'vitest';
import { climateStepYears, closeIce, monotoneCubic, seaLevelCurve, sliceDay } from './ice.ts';

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

describe('closeIce', () => {
  const w = 720;
  const h = 360;
  const block = (c0: number, c1: number) => {
    const m = new Uint8Array(w * h);
    for (let r = 40; r < 60; r++) for (let c = c0; c < c1; c++) m[r * w + c] = 1;
    return m;
  };

  it('merges ice sheets with a narrow gap and keeps wide gaps', () => {
    const m = block(100, 140);
    for (let r = 40; r < 60; r++) for (let c = 143; c < 180; c++) m[r * w + c] = 1;
    for (let r = 40; r < 60; r++) for (let c = 200; c < 240; c++) m[r * w + c] = 1;
    closeIce(m, w, h, () => false);
    expect(m[50 * w + 141]).toBe(1);
    expect(m[50 * w + 190]).toBe(0);
  });

  it('fills a narrow strip of land between ice and sea and runs a little over the sea', () => {
    const m = block(100, 140);
    closeIce(m, w, h, (i) => i % w >= 145);
    expect(m[50 * w + 142]).toBe(1);
    expect(m[50 * w + 145]).toBe(1);
    expect(m[50 * w + 155]).toBe(0);
  });
});
