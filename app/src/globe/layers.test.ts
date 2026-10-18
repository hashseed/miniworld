import { describe, expect, it } from 'vitest';
import { LAYER_HEIGHTS, layerHeight, layerTop } from './layers.ts';

describe('layerHeight', () => {
  it('keeps the sea floor and flattens land onto its layers', () => {
    expect(layerHeight(-80, 20)).toBe(-80);
    for (const top of LAYER_HEIGHTS) expect(layerHeight(top, 20)).toBeCloseTo(top, 6);
    expect(layerHeight(180, 20)).toBeCloseTo(150, 6);
    expect(layerTop(LAYER_HEIGHTS.length)).toBe(3500);
    expect(layerHeight(5050, 20)).toBeCloseTo(5000, 6);
  });

  it('rises monotonically, sharper with a narrower step', () => {
    let prev = layerHeight(1, 20);
    for (let h = 2; h < 6000; h++) {
      const v = layerHeight(h, 20);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    const mid = 225;
    expect(layerHeight(mid + 15, 20) - layerHeight(mid - 15, 20)).toBeGreaterThan(
      layerHeight(mid + 15, 60) - layerHeight(mid - 15, 60),
    );
  });
});
