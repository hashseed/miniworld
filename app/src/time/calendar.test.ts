import { describe, expect, it } from 'vitest';
import {
  OPENING_DAY,
  TIMELINE_START,
  astronomicalYear,
  dateFromDay,
  dayFromDate,
} from './calendar.ts';

describe('calendar', () => {
  it('counts days from 1 January 2000', () => {
    expect(dayFromDate(2000, 1, 1)).toBe(0);
    expect(dayFromDate(2000, 3, 1)).toBe(60); // 2000 is a leap year
    expect(dayFromDate(1999, 12, 31)).toBe(-1);
    expect(dayFromDate(1970, 1, 1)).toBe(-10957);
  });

  it('handles leap years', () => {
    expect(dayFromDate(1900, 3, 1) - dayFromDate(1900, 2, 28)).toBe(1); // 1900 is not leap
    expect(dayFromDate(2024, 3, 1) - dayFromDate(2024, 2, 28)).toBe(2);
  });

  it('handles the year 0 boundary', () => {
    // 1 BCE is year 0 and is a leap year in the proleptic Gregorian calendar.
    expect(dayFromDate(1, 1, 1) - dayFromDate(0, 1, 1)).toBe(366);
    expect(astronomicalYear(1, 'BCE')).toBe(0);
    expect(astronomicalYear(753, 'BCE')).toBe(-752);
  });

  it('round-trips across the whole timeline', () => {
    for (let d = TIMELINE_START; d < 20000; d += 99991) {
      const { year, month, day } = dateFromDay(d);
      expect(dayFromDate(year, month, day)).toBe(d);
    }
  });

  it('places the timeline start and opening day', () => {
    expect(dateFromDay(TIMELINE_START)).toEqual({ year: -69999, month: 1, day: 1 });
    expect(dateFromDay(OPENING_DAY)).toEqual({ year: -69999, month: 1, day: 1 });
    expect(TIMELINE_START).toBeGreaterThan(-(2 ** 31));
    expect(Math.round(TIMELINE_START / 1e5) / 10).toBe(-26.3);
  });
});
