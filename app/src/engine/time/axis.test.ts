import { describe, expect, it } from 'vitest';
import { TIMELINE_END, TIMELINE_START, dayOfYearStart } from './calendar.ts';
import { axisPosition, dayAtPosition } from './axis.ts';
import { WATCH_TOTAL_MS, watchAtDay } from './rate.ts';

const year = (y: number) => dayOfYearStart(y);

describe('watching-time axis (milestone 1, section 7.2)', () => {
  it('runs from 0 at the start to 1 at the end', () => {
    expect(axisPosition(TIMELINE_START)).toBe(0);
    expect(axisPosition(TIMELINE_END)).toBe(1);
  });

  it('round-trips', () => {
    for (const d of [TIMELINE_START, year(-20000), year(0), year(1500), year(1945), TIMELINE_END])
      expect(dayAtPosition(axisPosition(d))).toBeCloseTo(d, 3);
  });

  it('is linear in watching time', () => {
    for (const d of [year(-40000), year(-3000), year(800), year(1914)])
      expect(axisPosition(d)).toBeCloseTo(watchAtDay(d) / WATCH_TOTAL_MS, 6);
  });
});
