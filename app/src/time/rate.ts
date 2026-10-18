// The clock's uniform rate (spec section 2.1 and milestone 1, section 3.3):
// 25 years per minute, exactly 25 × 365.2425 = 146097 / 16 days per minute,
// so days and clock time convert in exact integer arithmetic.

import type { Day } from './calendar.ts';

export const YEARS_PER_MINUTE = 25;
/** Days per millisecond of clock time is DAY_NUM / MS_DEN. */
const DAY_NUM = 146097;
const MS_DEN = 960000;

/** The day at a clock time, in whole milliseconds since the start of the timeline. */
export function dayAtMs(ms: number, startDay: Day): Day {
  return startDay + Math.floor((ms * DAY_NUM) / MS_DEN);
}

/** The clock time at which a day begins: the smallest that gives that day. */
export function msAtDay(day: Day, startDay: Day): number {
  return Math.ceil(((day - startDay) * MS_DEN) / DAY_NUM);
}
