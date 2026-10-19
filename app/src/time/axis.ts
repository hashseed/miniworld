// The timeline's axis (spec section 7.1 and milestone 1, section 7.2): linear in
// watching time, so a day sits where the clock reaches it, from 0 at the start of
// the timeline to 1 at its end. Positions are continuous, for drawing; the content
// time windows are cut on it too (section 10.3).

import { CURVE_DAYS, CURVE_MS } from './curve.ts';

const LAST = CURVE_MS.length - 1;
const TOTAL = CURVE_MS[LAST]!;

/** Position of a (continuous) day on the watching-time axis, from 0 to 1. */
export function axisPosition(day: number): number {
  let i = 0;
  let hi = LAST - 1;
  while (i < hi) {
    const mid = (i + hi + 1) >> 1;
    if (CURVE_DAYS[mid]! <= day) i = mid;
    else hi = mid - 1;
  }
  const f = (day - CURVE_DAYS[i]!) / (CURVE_DAYS[i + 1]! - CURVE_DAYS[i]!);
  return (CURVE_MS[i]! + f * (CURVE_MS[i + 1]! - CURVE_MS[i]!)) / TOTAL;
}

/** The continuous day at a position on the watching-time axis. */
export function dayAtPosition(x: number): number {
  const w = x * TOTAL;
  let i = 0;
  let hi = LAST - 1;
  while (i < hi) {
    const mid = (i + hi + 1) >> 1;
    if (CURVE_MS[mid]! <= w) i = mid;
    else hi = mid - 1;
  }
  const f = (w - CURVE_MS[i]!) / (CURVE_MS[i + 1]! - CURVE_MS[i]!);
  return CURVE_DAYS[i]! + f * (CURVE_DAYS[i + 1]! - CURVE_DAYS[i]!);
}
