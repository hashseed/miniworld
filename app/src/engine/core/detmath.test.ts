import { describe, expect, it } from 'vitest';
import { detCos, detSin } from './detmath.ts';

describe('detmath', () => {
  it('matches Math.sin and Math.cos within 1e-11 over several turns', () => {
    for (let x = -20; x <= 20; x += 0.0137) {
      expect(Math.abs(detSin(x) - Math.sin(x))).toBeLessThan(1e-11);
      expect(Math.abs(detCos(x) - Math.cos(x))).toBeLessThan(1e-11);
    }
  });

  it('gives fixed outputs for fixed inputs', () => {
    expect(detSin(1)).toBe(0.8414709848078937);
    expect(detCos(0.5)).toBe(0.8775825618903637);
  });
});
