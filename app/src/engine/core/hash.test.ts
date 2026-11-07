import { describe, expect, it } from 'vitest';
import { hash01, hash32, valueNoise } from './hash.ts';

describe('hash', () => {
  it('is stable across runs', () => {
    // Golden values: a change here changes every procedural detail.
    expect(hash32(1, 2, 3, 4)).toBe(hash32(1, 2, 3, 4));
    expect([hash32(0), hash32(1), hash32(42, 7)]).toMatchSnapshot();
  });

  it('spreads values evenly', () => {
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) sum += hash01(i, 99);
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
  });

  it('makes continuous noise', () => {
    expect(Math.abs(valueNoise(1.5, 2.5, 3) - valueNoise(1.5001, 2.5, 3))).toBeLessThan(0.01);
  });
});
