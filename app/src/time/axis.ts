// The timeline's logarithmic axis (spec milestone 1, section 7.2): a day sits at
// x = 1 − ln(1 + (end − day) / k) / ln(1 + (end − start) / k), from 0 at the
// start of the timeline to 1 at its end. Drawing and content windows only; the
// clock and the world never depend on it.

import { DAYS_PER_YEAR, type Day } from './calendar.ts';

/** The constant k, in years (Proposed). */
export const AXIS_K_YEARS = 50;

export interface LogAxis {
  startDay: Day;
  endDay: Day;
  /** k in days. */
  k: number;
}

export function logAxis(startDay: Day, endDay: Day, kYears = AXIS_K_YEARS): LogAxis {
  return { startDay, endDay, k: kYears * DAYS_PER_YEAR };
}

function total(a: LogAxis): number {
  return Math.log1p((a.endDay - a.startDay) / a.k);
}

/** Position of a (continuous) day on the axis, from 0 to 1. */
export function axisPosition(a: LogAxis, day: number): number {
  return 1 - Math.log1p(Math.max(0, a.endDay - day) / a.k) / total(a);
}

/** The continuous day at a position on the axis. */
export function dayAtPosition(a: LogAxis, x: number): number {
  return a.endDay - a.k * Math.expm1((1 - x) * total(a));
}
