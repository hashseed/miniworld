import { describe, expect, it } from 'vitest';
import {
  TIMELINE_END,
  TIMELINE_START,
  astronomicalYear,
  dayFromDate,
  dayOfYearStart,
} from './calendar.ts';
import { WATCH_TOTAL_MS, dayAtMs, msAtDay, yearsPerMinuteAt } from './rate.ts';

const year = (y: number) => dayOfYearStart(y);
const bce = (y: number) => year(astronomicalYear(y, 'BCE'));

describe('watching time and history time (spec section 2.1)', () => {
  it('takes exactly 24 hours from the start to the end of the timeline', () => {
    expect(WATCH_TOTAL_MS).toBe(86_400_000);
    expect(msAtDay(TIMELINE_END, TIMELINE_START)).toBe(86_400_000);
    expect(dayAtMs(86_400_000, TIMELINE_START)).toBe(TIMELINE_END);
  });

  it('round-trips days at the start, the end and around year 0', () => {
    const days = [
      TIMELINE_START,
      TIMELINE_START + 1,
      dayOfYearStart(astronomicalYear(1, 'BCE')) - 1,
      dayOfYearStart(0),
      dayOfYearStart(1),
      dayFromDate(1914, 6, 28),
      TIMELINE_END - 1,
      TIMELINE_END,
    ];
    // The first watching millisecond at or past the day: in the deep past a millisecond
    // spans about three days, so not every day has one of its own.
    for (const d of days) {
      const ms = msAtDay(d, TIMELINE_START);
      expect(dayAtMs(ms, TIMELINE_START)).toBeGreaterThanOrEqual(d);
      if (ms > 0) expect(dayAtMs(ms - 1, TIMELINE_START)).toBeLessThan(d);
    }
    // From the time a day lasts at least a millisecond, each day has one exactly.
    for (const d of days.filter((x) => x >= dayOfYearStart(0)))
      expect(dayAtMs(msAtDay(d, TIMELINE_START), TIMELINE_START)).toBe(d);
  });

  it('never goes backwards', () => {
    let last = TIMELINE_START;
    for (let ms = 0; ms <= 86_400_000; ms += 9_973) {
      const d = dayAtMs(ms, TIMELINE_START);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
  });

  it('runs fast in the deep past and never slower than a year a minute', () => {
    expect(yearsPerMinuteAt(bce(70000))).toBeGreaterThan(300);
    expect(yearsPerMinuteAt(bce(10000))).toBeGreaterThan(yearsPerMinuteAt(bce(3000)));
    expect(yearsPerMinuteAt(year(1000))).toBeGreaterThan(yearsPerMinuteAt(year(1700)));
    for (const y of [1800, 1900, 1950, 1991])
      expect(yearsPerMinuteAt(year(y))).toBeGreaterThanOrEqual(0.99);
    expect(yearsPerMinuteAt(year(1950))).toBeLessThan(1.01);
  });

  it('counts clock time from any start day', () => {
    const d = year(-500);
    expect(dayAtMs(msAtDay(d, year(-3000)), year(-3000))).toBe(d);
    expect(msAtDay(year(-3000), year(-3000))).toBe(0);
  });
});
