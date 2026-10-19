// Watching time and history time (spec section 2.1 and milestone 1, section 3.3).
// Watching time is the clock: milliseconds of watching at regular speed since the
// start of the timeline. History time, the date, follows from it by the curve of
// curve.ts: about 560 years a minute at 70,000 BCE down to one year a minute from
// about 1800, the whole timeline in exactly 24 hours. Between the curve's knots the
// day runs linearly, so days and watching time convert in exact integer arithmetic.

import { DAYS_PER_YEAR, type Day } from './calendar.ts';
import { CURVE_DAYS, CURVE_MS } from './curve.ts';

/** The whole timeline at regular speed: exactly 24 hours. */
export const WATCH_TOTAL_MS = CURVE_MS.at(-1)!;

const LAST = CURVE_MS.length - 1;

/** The curve segment holding a watching time, the last one past the end. */
function segmentAtMs(w: number): number {
  let lo = 0;
  let hi = LAST - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (CURVE_MS[mid]! <= w) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The curve segment holding a day, the first before the start and the last past the end. */
function segmentAtDay(d: number): number {
  let lo = 0;
  let hi = LAST - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (CURVE_DAYS[mid]! <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The day at a watching time in whole milliseconds from the start of the timeline. */
export function dayAtWatch(w: number): Day {
  const i = segmentAtMs(w);
  const dMs = CURVE_MS[i + 1]! - CURVE_MS[i]!;
  const dDays = CURVE_DAYS[i + 1]! - CURVE_DAYS[i]!;
  return CURVE_DAYS[i]! + Math.floor(((w - CURVE_MS[i]!) * dDays) / dMs);
}

/** The watching time at which a day begins: the smallest that gives that day. */
export function watchAtDay(d: Day): number {
  const i = segmentAtDay(d);
  const dMs = CURVE_MS[i + 1]! - CURVE_MS[i]!;
  const dDays = CURVE_DAYS[i + 1]! - CURVE_DAYS[i]!;
  return CURVE_MS[i]! + Math.ceil(((d - CURVE_DAYS[i]!) * dMs) / dDays);
}

/** The day at a clock time, in whole milliseconds since `startDay` began. */
export function dayAtMs(ms: number, startDay: Day): Day {
  return dayAtWatch(ms + watchAtDay(startDay));
}

/** The clock time, since `startDay` began, at which a day begins. */
export function msAtDay(day: Day, startDay: Day): number {
  return watchAtDay(day) - watchAtDay(startDay);
}

/** History's rate at a day, in years per minute of watching at regular speed. */
export function yearsPerMinuteAt(day: number): number {
  const i = segmentAtDay(day);
  const years = (CURVE_DAYS[i + 1]! - CURVE_DAYS[i]!) / DAYS_PER_YEAR;
  return years / ((CURVE_MS[i + 1]! - CURVE_MS[i]!) / 60_000);
}
