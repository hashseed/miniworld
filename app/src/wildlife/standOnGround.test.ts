import { describe, expect, it } from 'vitest';
import { standOnGround } from './wildlifeLayer.ts';

describe('standOnGround (issue 129)', () => {
  it('keeps its feet out of a hillside steeper than it leans', () => {
    // A 40 degree slope rising to the front; the elephant is 3 km tall, its points 1 km away.
    const slope = Math.tan((40 * Math.PI) / 180);
    const half = 1;
    const r = standOnGround(0, slope * half, -slope * half, 0, 0, half, 3);
    expect(r.along).toBeLessThan(slope);
    expect(r.ground + r.along * half).toBeGreaterThanOrEqual(slope * half - 1e-9);
    expect(r.ground).toBeLessThanOrEqual(0.3 * 3 + 1e-9);
  });

  it('stands on flat ground exactly, and lifts a valley floor by at most a tenth of its height', () => {
    expect(standOnGround(2, 2, 2, 2, 2, 1, 3)).toEqual({ ground: 2, along: 0, across: 0 });
    const r = standOnGround(0, 0.1, 0.1, 0.1, 0.1, 1, 3);
    expect(r.ground).toBeCloseTo(0.1, 9);
    expect(standOnGround(0, 5, 5, 5, 5, 1, 3).ground).toBeCloseTo(0.3, 9);
  });
});
