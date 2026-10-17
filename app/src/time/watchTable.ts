// Watching-time axis (spec milestone 1, section 3.3): maps a date to the
// seconds of watching at ×1 since the start of the timeline, and back.

import { baseRate } from './rateCurve.ts';

export const WATCH_TABLE_STEP_YEARS = 10;

export interface WatchTable {
  startYear: number; // continuous astronomical year of the first sample
  stepYears: number;
  seconds: number[]; // cumulative watching seconds at each sample
}

/** Integrates the base rate curve (Simpson's rule per step). */
export function buildWatchTable(startYear: number, endYear: number): WatchTable {
  const step = WATCH_TABLE_STEP_YEARS;
  const n = Math.ceil((endYear - startYear) / step);
  const seconds = new Array<number>(n + 1);
  seconds[0] = 0;
  const inv = (y: number) => 60 / baseRate(y);
  for (let i = 0; i < n; i++) {
    const a = startYear + i * step;
    const b = a + step;
    const s = (step / 6) * (inv(a) + 4 * inv((a + b) / 2) + inv(b));
    seconds[i + 1] = seconds[i]! + s;
  }
  return { startYear, stepYears: step, seconds };
}

export function totalSeconds(table: WatchTable): number {
  return table.seconds[table.seconds.length - 1]!;
}

/** Watching seconds at a continuous astronomical year. */
export function secondsAtYear(table: WatchTable, year: number): number {
  const f = (year - table.startYear) / table.stepYears;
  const last = table.seconds.length - 1;
  if (f <= 0) return 0;
  if (f >= last) return table.seconds[last]!;
  const i = Math.floor(f);
  const t = f - i;
  return table.seconds[i]! + (table.seconds[i + 1]! - table.seconds[i]!) * t;
}

/** Continuous astronomical year at a watching time in seconds. */
export function yearAtSeconds(table: WatchTable, s: number): number {
  const sec = table.seconds;
  const last = sec.length - 1;
  if (s <= 0) return table.startYear;
  if (s >= sec[last]!) return table.startYear + last * table.stepYears;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sec[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - sec[lo]!) / (sec[hi]! - sec[lo]!);
  return table.startYear + (lo + t) * table.stepYears;
}
