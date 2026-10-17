import { describe, expect, it } from 'vitest';
import { CLOUD_COUNT, cloudPlace, cloudPuffs } from './clouds.ts';

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
});
