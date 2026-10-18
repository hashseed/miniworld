import { describe, expect, it } from 'vitest';
import { DynamicResolution, FrameStats, QUALITY } from './quality.ts';

describe('quality', () => {
  it('is the one fixed high quality', () => {
    expect(QUALITY.renderScaleCap).toBe(2);
    expect(QUALITY.errorTargetPx).toBe(1.5);
    expect(QUALITY.animatedFigures).toBe(5000);
  });
});

describe('dynamic resolution', () => {
  it('steps down when slow and back up when fast', () => {
    const d = new DynamicResolution(2, 16.7);
    for (let t = 0; t < 2000; t += 25) d.frame(25);
    expect(d.scale).toBeLessThan(2);
    expect(d.scale).toBeGreaterThanOrEqual(1);
    for (let t = 0; t < 120000; t += 8) d.frame(8);
    expect(d.scale).toBeCloseTo(2);
  });

  it('never goes below half the cap', () => {
    const d = new DynamicResolution(1, 33.3);
    for (let t = 0; t < 60000; t += 100) d.frame(100);
    expect(d.scale).toBeCloseTo(0.5);
  });
});

describe('frame stats', () => {
  it('reports average and percentiles', () => {
    const s = new FrameStats();
    for (let i = 1; i <= 100; i++) s.push(i);
    expect(s.average).toBeCloseTo(50.5);
    expect(s.percentile(99)).toBe(100);
  });
});
