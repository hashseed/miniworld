import { describe, expect, it } from 'vitest';
import { iceSlicePair, seaLevelAt, windowAt } from './planet.ts';

describe('planet', () => {
  const curve = { startDay: 0, stepDays: 100, metres: [-120, -100, -20, 0] };

  it('interpolates sea level', () => {
    expect(seaLevelAt(curve, 0)).toBe(-120);
    expect(seaLevelAt(curve, 50)).toBe(-110);
    expect(seaLevelAt(curve, 250)).toBe(-10);
    expect(seaLevelAt(curve, 1000)).toBe(0);
    expect(seaLevelAt(curve, -5)).toBe(-120);
  });

  it('finds the ice slices around a date', () => {
    expect(iceSlicePair([0, 10, 20], 15)).toEqual({ a: 10, b: 20, t: 0.5 });
    expect(iceSlicePair([0, 10, 20], 25)).toEqual({ a: 20, b: 20, t: 0 });
    expect(iceSlicePair([0, 10, 20], 10)).toEqual({ a: 10, b: 20, t: 0 });
  });

  it('finds the time window of a date', () => {
    expect(windowAt([0, 10, 20], 5)).toBe(0);
    expect(windowAt([0, 10, 20], 10)).toBe(1);
    expect(windowAt([0, 10, 20], 99)).toBe(2);
  });
});
