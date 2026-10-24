import { describe, expect, it } from 'vitest';
import { buildPlaceholderFigure } from './placeholderFigure.ts';
import { lodDistanceKm } from './stressScene.ts';

describe('stress scene levels of detail (spec milestone 1, section 11.4)', () => {
  it('draws the far figure with a third of the triangles and the same skeleton', () => {
    const near = buildPlaceholderFigure(false);
    const far = buildPlaceholderFigure(true);
    expect(far.triangles).toBeLessThanOrEqual(150);
    expect(far.triangles).toBeLessThan(near.triangles / 2);
    expect(near.triangles).toBeGreaterThan(300);
  });

  it('swaps by size on screen: smaller things swap at a shorter distance', () => {
    const fig = lodDistanceKm(0.03, 16, 45);
    expect(lodDistanceKm(0.03, 8, 45)).toBeCloseTo(fig * 2, 6);
    expect(lodDistanceKm(0.06, 16, 45)).toBeCloseTo(fig * 2, 6);
    // A 30 m figure is 16 pixels tall at about 1.8 km in a 45 degree, 800 pixel view.
    expect(fig).toBeGreaterThan(1.5);
    expect(fig).toBeLessThan(2.2);
  });
});
