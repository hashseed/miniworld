import { describe, expect, it } from 'vitest';
import { TIMELINE_START, dayFromDate, dayOfYearStart, astronomicalYear } from './calendar.ts';
import { dayAtMs, msAtDay } from './rate.ts';

const END = dayFromDate(1991, 12, 26);

describe('clock rate', () => {
  it('is exactly 25 years of 365.2425 days per minute', () => {
    expect(dayAtMs(60000, 0)).toBe(9131); // 9131.0625 days
    expect(dayAtMs(16 * 60000, 0)).toBe(146097); // 400 years exactly
  });

  it('round-trips days at the start, the end and around year 0', () => {
    const days = [
      TIMELINE_START,
      TIMELINE_START + 1,
      dayOfYearStart(astronomicalYear(1, 'BCE')) - 1,
      dayOfYearStart(0),
      dayOfYearStart(1),
      END - 1,
      END,
    ];
    for (const d of days) {
      const ms = msAtDay(d, TIMELINE_START);
      expect(dayAtMs(ms, TIMELINE_START)).toBe(d);
      expect(dayAtMs(ms - 1, TIMELINE_START)).toBe(d - 1);
    }
  });

  it('makes the whole timeline about 48 hours', () => {
    const hours = msAtDay(END, TIMELINE_START) / 3_600_000;
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThan(48.1);
    const fromOpening =
      (msAtDay(END, TIMELINE_START) -
        msAtDay(dayOfYearStart(astronomicalYear(50000, 'BCE')), TIMELINE_START)) /
      3_600_000;
    expect(fromOpening).toBeCloseTo(34.66, 1);
  });
});
