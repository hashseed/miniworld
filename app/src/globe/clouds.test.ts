import { describe, expect, it } from 'vitest';
import { CLOUD_COUNT, cloudLife, cloudPlace, cloudPuffs, puffGrowth } from './clouds.ts';

describe('clouds', () => {
  it('are the same on every run', () => {
    expect(cloudPuffs()).toEqual(cloudPuffs());
    expect(cloudPlace(3)).toEqual(cloudPlace(3));
  });

  it('stay away from the poles', () => {
    for (let c = 0; c < CLOUD_COUNT; c++) {
      const { lat } = cloudPlace(c);
      expect(lat).toBeGreaterThanOrEqual(-55);
      expect(lat).toBeLessThanOrEqual(70);
    }
  });

  it('grow ball by ball, shrink away and come back elsewhere (issue 133)', () => {
    const stands = (u: number) => [0, 1, 2, 3, 4, 5, 6].filter((b) => puffGrowth(4, b, u) > 0.01);
    expect(stands(0)).toEqual([]);
    expect(stands(0.15).length).toBeGreaterThan(0);
    expect(stands(0.15).length).toBeLessThan(7);
    expect(stands(0.5)).toHaveLength(7);
    expect(stands(0.99)).toEqual([]);
    // The middle ball is the first to stand and the last to go.
    expect(puffGrowth(4, 3, 0.1)).toBeGreaterThan(puffGrowth(4, 0, 0.1));
    expect(puffGrowth(4, 3, 0.9)).toBeGreaterThan(puffGrowth(4, 0, 0.9));
    const a = cloudLife(4, 0);
    const b = cloudLife(4, 11 * 60 * 1000);
    expect(b.life).toBeGreaterThan(a.life);
    expect(cloudPlace(4, a.life)).not.toEqual(cloudPlace(4, b.life));
    expect(cloudLife(4, 123456)).toEqual(cloudLife(4, 123456));
  });

  it('change slowly: no ball changes by more than a tenth of its size in a second', () => {
    for (let b = 0; b < 7; b++)
      for (let ms = 0; ms < 6 * 60 * 1000; ms += 1000)
        expect(
          Math.abs(puffGrowth(4, b, (ms + 1000) / 360000) - puffGrowth(4, b, ms / 360000)),
        ).toBeLessThan(0.1);
  });
});
