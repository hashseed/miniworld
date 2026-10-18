// Base rate curve of the historical clock (spec milestone 1, section 3.3).

import { astronomicalYear } from './calendar.ts';

export interface RatePoint {
  year: number; // astronomical year
  yearsPerMinute: number;
}

/**
 * Control points, tuned by hand; log-rate is interpolated linearly between
 * them. The whole timeline takes about 24 hours at ×1.
 */
export const RATE_POINTS: readonly RatePoint[] = [
  { year: astronomicalYear(60000, 'BCE'), yearsPerMinute: 520 },
  { year: astronomicalYear(12000, 'BCE'), yearsPerMinute: 354 },
  { year: astronomicalYear(6000, 'BCE'), yearsPerMinute: 52 },
  { year: astronomicalYear(2000, 'BCE'), yearsPerMinute: 14.6 },
  { year: astronomicalYear(500, 'BCE'), yearsPerMinute: 5.9 },
  { year: 1000, yearsPerMinute: 4.25 },
  { year: 1500, yearsPerMinute: 2.83 },
  { year: 1750, yearsPerMinute: 2.0 },
  { year: 1880, yearsPerMinute: 0.94 },
  { year: 1950, yearsPerMinute: 0.45 },
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

/** The speed slider runs over the base-2 logarithm of the multiplier: ×1/64 to ×64. */
export const MIN_SPEED_LOG2 = -6;
export const MAX_SPEED_LOG2 = 6;
/** Released this close to ×1 (in log2 units), the slider snaps to it. */
export const SPEED_SNAP_LOG2 = 0.25;

/** Clamps a slider position to the speed range. */
export function clampSpeedLog2(v: number): number {
  return Math.min(MAX_SPEED_LOG2, Math.max(MIN_SPEED_LOG2, v));
}

/** The slider position after release: snapped to ×1 when close to it. */
export function snapSpeedLog2(v: number): number {
  const c = clampSpeedLog2(v);
  return Math.abs(c) < SPEED_SNAP_LOG2 ? 0 : c;
}

/** The label of a speed: a power of two as ×1/8 or ×4, otherwise two significant figures. */
export function speedLabel(log2: number): { fraction: boolean; value: number } {
  const whole = Math.abs(log2 - Math.round(log2)) < 1e-6;
  if (whole) {
    const n = 2 ** Math.abs(Math.round(log2));
    return { fraction: log2 < 0, value: n };
  }
  const speed = 2 ** log2;
  if (speed < 1) return { fraction: true, value: Number((1 / speed).toPrecision(2)) };
  return { fraction: false, value: Number(speed.toPrecision(2)) };
}

export const ZOOM_FULL_RATE_ALTITUDE_KM = 8000;
export const ZOOM_SLOWEST_ALTITUDE_KM = 1000;
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
