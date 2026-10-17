// Base rate curve of the historical clock (spec milestone 1, section 3.3).

import { astronomicalYear } from './calendar.ts';

export interface RatePoint {
  year: number; // astronomical year
  yearsPerMinute: number;
}

/** Control points, tuned by hand; log-rate is interpolated linearly between them. */
export const RATE_POINTS: readonly RatePoint[] = [
  { year: astronomicalYear(60000, 'BCE'), yearsPerMinute: 2200 },
  { year: astronomicalYear(12000, 'BCE'), yearsPerMinute: 1500 },
  { year: astronomicalYear(6000, 'BCE'), yearsPerMinute: 220 },
  { year: astronomicalYear(2000, 'BCE'), yearsPerMinute: 62 },
  { year: astronomicalYear(500, 'BCE'), yearsPerMinute: 25 },
  { year: 1000, yearsPerMinute: 18 },
  { year: 1500, yearsPerMinute: 12 },
  { year: 1750, yearsPerMinute: 8.5 },
  { year: 1880, yearsPerMinute: 4 },
  { year: 1950, yearsPerMinute: 1.9 },
];

const LOG_POINTS = RATE_POINTS.map((p) => ({ year: p.year, log: Math.log(p.yearsPerMinute) }));

/** Base rate in years per minute at a continuous astronomical year. */
export function baseRate(year: number): number {
  const first = LOG_POINTS[0]!;
  const last = LOG_POINTS[LOG_POINTS.length - 1]!;
  if (year <= first.year) return Math.exp(first.log);
  if (year >= last.year) return Math.exp(last.log);
  let lo = 0;
  let hi = LOG_POINTS.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (LOG_POINTS[mid]!.year <= year) lo = mid;
    else hi = mid;
  }
  const a = LOG_POINTS[lo]!;
  const b = LOG_POINTS[hi]!;
  const t = (year - a.year) / (b.year - a.year);
  return Math.exp(a.log + (b.log - a.log) * t);
}

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 16] as const;
export const DEFAULT_SPEED_INDEX = 2;

export const ZOOM_FULL_RATE_ALTITUDE_KM = 1000;
export const ZOOM_SLOWEST_ALTITUDE_KM = 10;
export const ZOOM_SLOWEST_FACTOR = 1 / 8;

/** Factor by which zooming in slows history (spec milestone 1, section 3.3). */
export function zoomFactor(altitudeKm: number): number {
  if (altitudeKm >= ZOOM_FULL_RATE_ALTITUDE_KM) return 1;
  if (altitudeKm <= ZOOM_SLOWEST_ALTITUDE_KM) return ZOOM_SLOWEST_FACTOR;
  const t =
    Math.log(altitudeKm / ZOOM_SLOWEST_ALTITUDE_KM) /
    Math.log(ZOOM_FULL_RATE_ALTITUDE_KM / ZOOM_SLOWEST_ALTITUDE_KM);
  return Math.exp(Math.log(ZOOM_SLOWEST_FACTOR) * (1 - t));
}
