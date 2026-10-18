import { describe, expect, it } from 'vitest';
import { astronomicalYear } from './calendar.ts';
import { baseRate, zoomFactor } from './rateCurve.ts';
import { buildWatchTable, secondsAtYear, totalSeconds, yearAtSeconds } from './watchTable.ts';

const start = astronomicalYear(70000, 'BCE');
const table = buildWatchTable(start, 2026);

// Targets from spec section 2.1, in minutes of watching at normal speed.
const PERIODS: [number, number, number][] = [
  [astronomicalYear(70000, 'BCE'), astronomicalYear(10000, 'BCE'), 30],
  [astronomicalYear(10000, 'BCE'), astronomicalYear(3000, 'BCE'), 35],
  [astronomicalYear(3000, 'BCE'), astronomicalYear(500, 'BCE'), 50],
  [astronomicalYear(500, 'BCE'), 1500, 100],
  [1500, 1800, 30],
  [1800, 1900, 20],
  [1900, 2026, 60],
];

describe('rate curve', () => {
  it('matches the control points and stays continuous', () => {
    expect(baseRate(astronomicalYear(60000, 'BCE'))).toBeCloseTo(2200);
    expect(baseRate(1950)).toBeCloseTo(1.9);
    expect(baseRate(2026)).toBeCloseTo(1.9);
    for (let y = start; y < 2026; y += 7) {
      expect(Math.abs(Math.log(baseRate(y + 1) / baseRate(y)))).toBeLessThan(0.02);
    }
  });

  it.each(PERIODS)(
    'keeps the watching time from %d to %d within 15%% of %d min',
    (a, b, target) => {
      const minutes = (secondsAtYear(table, b) - secondsAtYear(table, a)) / 60;
      expect(Math.abs(minutes - target) / target).toBeLessThan(0.15);
    },
  );

  it('takes about five and a half hours in total', () => {
    const hours = totalSeconds(table) / 3600;
    expect(hours).toBeGreaterThan(5.2);
    expect(hours).toBeLessThan(6.0);
  });

  it('round-trips between years and watching seconds', () => {
    for (const y of [-69000, -50000, -9000, -2560, 79, 1492, 1789, 1969, 2020]) {
      expect(yearAtSeconds(table, secondsAtYear(table, y))).toBeCloseTo(y, 6);
    }
  });
});

describe('zoom factor', () => {
  it('is 1 from orbit and 1/8 close to the ground', () => {
    expect(zoomFactor(20000)).toBe(1);
    expect(zoomFactor(1000)).toBe(1);
    expect(zoomFactor(10)).toBe(1 / 8);
    expect(zoomFactor(2)).toBe(1 / 8);
  });

  it('changes gradually in between', () => {
    expect(zoomFactor(100)).toBeCloseTo(Math.sqrt(1 / 8), 10);
    let prev = zoomFactor(10);
    for (let a = 10; a <= 1000; a *= 1.01) {
      const f = zoomFactor(a);
      expect(f).toBeGreaterThanOrEqual(prev);
      expect(f / prev).toBeLessThan(1.01);
      prev = f;
    }
  });
});
