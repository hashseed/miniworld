import { describe, expect, it } from 'vitest';
import { astronomicalYear } from './calendar.ts';
import { baseRate, snapSpeedLog2, speedLabel, zoomFactor } from './rateCurve.ts';
import { buildWatchTable, secondsAtYear, totalSeconds, yearAtSeconds } from './watchTable.ts';

const start = astronomicalYear(70000, 'BCE');
const table = buildWatchTable(start, 2026);

// Targets from spec section 2.1, in minutes of watching at normal speed.
const PERIODS: [number, number, number][] = [
  [astronomicalYear(70000, 'BCE'), astronomicalYear(10000, 'BCE'), 130],
  [astronomicalYear(10000, 'BCE'), astronomicalYear(3000, 'BCE'), 150],
  [astronomicalYear(3000, 'BCE'), astronomicalYear(500, 'BCE'), 210],
  [astronomicalYear(500, 'BCE'), 1500, 420],
  [1500, 1800, 130],
  [1800, 1900, 85],
  [1900, 1991, 190],
];

describe('rate curve', () => {
  it('matches the control points and stays continuous', () => {
    expect(baseRate(astronomicalYear(60000, 'BCE'))).toBeCloseTo(520);
    expect(baseRate(1950)).toBeCloseTo(0.45);
    expect(baseRate(2026)).toBeCloseTo(0.45);
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

  it('takes about 24 hours to the 1991 cutoff', () => {
    const hours = secondsAtYear(table, 1992) / 3600;
    expect(hours).toBeGreaterThan(22.5);
    expect(hours).toBeLessThan(25.5);
    expect(totalSeconds(table)).toBeGreaterThan(secondsAtYear(table, 1992));
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
    expect(zoomFactor(8000)).toBe(1);
    expect(zoomFactor(1000)).toBe(1 / 8);
    expect(zoomFactor(500)).toBe(1 / 8);
  });

  it('changes gradually in between', () => {
    expect(zoomFactor(Math.sqrt(8000 * 1000))).toBeCloseTo(Math.sqrt(1 / 8), 10);
    let prev = zoomFactor(1000);
    for (let a = 1000; a <= 8000; a *= 1.01) {
      const f = zoomFactor(a);
      expect(f).toBeGreaterThanOrEqual(prev);
      expect(f / prev).toBeLessThan(1.0101);
      prev = f;
    }
  });
});

describe('speed slider', () => {
  it('snaps to ×1 near the middle and clamps at the ends', () => {
    expect(snapSpeedLog2(0.2)).toBe(0);
    expect(snapSpeedLog2(-0.2)).toBe(0);
    expect(snapSpeedLog2(0.5)).toBe(0.5);
    expect(snapSpeedLog2(-8)).toBe(-6);
    expect(snapSpeedLog2(8)).toBe(6);
  });

  it('labels powers of two as fractions or whole numbers', () => {
    expect(speedLabel(-6)).toEqual({ fraction: true, value: 64 });
    expect(speedLabel(-3)).toEqual({ fraction: true, value: 8 });
    expect(speedLabel(0)).toEqual({ fraction: false, value: 1 });
    expect(speedLabel(6)).toEqual({ fraction: false, value: 64 });
    expect(speedLabel(Math.log2(3))).toEqual({ fraction: false, value: 3 });
    expect(speedLabel(-Math.log2(3))).toEqual({ fraction: true, value: 3 });
  });
});
