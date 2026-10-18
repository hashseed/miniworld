import { describe, expect, it } from 'vitest';
import { TIMELINE_START, astronomicalYear, dayFromDate, dayOfYearStart } from './calendar.ts';
import { axisPosition, dayAtPosition, logAxis } from './axis.ts';

const END = dayFromDate(1991, 12, 26);
const a = logAxis(TIMELINE_START, END);
const year = (y: number) => dayOfYearStart(y);

describe('log timeline axis', () => {
  it('runs from 0 at the start to 1 at the end', () => {
    expect(axisPosition(a, TIMELINE_START)).toBeCloseTo(0, 12);
    expect(axisPosition(a, END)).toBe(1);
  });

  it('round-trips', () => {
    for (const d of [TIMELINE_START, year(-20000), year(0), year(1500), year(1945), END]) {
      expect(dayAtPosition(a, axisPosition(a, d))).toBeCloseTo(d, 3);
    }
  });

  it('gives the shares of the spec (section 7.2)', () => {
    const share = (from: number, to: number) => axisPosition(a, to) - axisPosition(a, from);
    expect(share(TIMELINE_START, year(astronomicalYear(3000, 'BCE')))).toBeCloseTo(0.34, 1);
    expect(share(year(1900), END)).toBeCloseTo(0.15, 1);
  });
});
