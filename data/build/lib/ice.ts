// Climate slices and the sea-level curve (spec milestone 1, sections 5, 5.1
// and 5.2): time steps, the global ice cover grid and the sea-level curve.
// The values come from the reconstructions read in climate.ts.

import {
  ICE_DISTANCE_STEP_KM,
  ICE_DISTANCE_ZERO,
  ICE_GRID_H,
  ICE_GRID_W,
} from '../../../app/src/content/formats.ts';
import { blurFieldPolar } from './coast.ts';
import { distanceKm, signedDistanceKm } from './distance.ts';
import { dayFromDate } from '../../../app/src/time/calendar.ts';

export function sliceDay(yearsBP: number): number {
  return dayFromDate(1950 - yearsBP, 1, 1);
}

/** Monotone cubic interpolation (Fritsch–Carlson) through points with ascending x. */
export function monotoneCubic(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const d: number[] = [];
  const m: number[] = new Array<number>(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  m[0] = d[0] ?? 0;
  m[n - 1] = d[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1]! * d[i]! <= 0) m[i] = 0;
    else {
      const w1 = 2 * (xs[i + 1]! - xs[i]!) + (xs[i]! - xs[i - 1]!);
      const w2 = xs[i + 1]! - xs[i]! + 2 * (xs[i]! - xs[i - 1]!);
      m[i] = (w1 + w2) / (w1 / d[i - 1]! + w2 / d[i]!);
    }
  }
  return (x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let k = 0;
    while (x > xs[k + 1]!) k++;
    const h = xs[k + 1]! - xs[k]!;
    const t = (x - xs[k]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[k]! +
      (t3 - 2 * t2 + t) * h * m[k]! +
      (-2 * t3 + 3 * t2) * ys[k + 1]! +
      (t3 - t2) * h * m[k + 1]!
    );
  };
}

export const SEA_LEVEL_STEP_YEARS = 100;

/** Sea level sampled every 100 years from startDay to endDay (spec section 5.1). */
export function seaLevelCurve(
  points: [number, number][],
  startDay: number,
  endDay: number,
): { startDay: number; stepDays: number; metres: number[] } {
  const pts = points.map(([bp, m]) => ({ day: sliceDay(bp), m })).sort((a, b) => a.day - b.day);
  const f = monotoneCubic(
    pts.map((p) => p.day),
    pts.map((p) => p.m),
  );
  const stepDays = SEA_LEVEL_STEP_YEARS * 365.2425;
  const metres: number[] = [];
  for (let d = startDay; d <= endDay + stepDays; d += stepDays) {
    metres.push(Math.round(f(d) * 10) / 10);
  }
  return { startDay, stepDays, metres };
}

/** The climate data's steps (years BP, descending) from the one at or before startDay to today. */
export function climateStepYears(available: number[], startDay: number): number[] {
  const years = [...available].sort((x, y) => y - x);
  let first = years.findIndex((bp) => sliceDay(bp) > startDay);
  if (first < 0) first = years.length;
  return years.slice(Math.max(0, first - 1));
}

/** Smoothing sigmas (km) of the ice border: everywhere, polar and Antarctic (section 5.2). */
export const ICE_BORDER_SIGMA_KM = 30;
export const ICE_BORDER_POLAR_SIGMA_KM = 60;
export const ICE_BORDER_ANTARCTIC_SIGMA_KM = 120;
/** Smoothed thickness (m) from which a place counts as covered by ice. */
export const ICE_COVER_M = 60;
/**
 * Gaps up to twice this many km between ice, or between ice and the sea, are
 * filled with ice (a morphological closing), so neighbouring ice sheets merge
 * into one and reach the coast instead of leaving narrow strips (section 5.2).
 */
export const ICE_MERGE_KM = 80;
/**
 * Ice reaches this many km out over the sea from where it meets it, so its
 * smoothed border lies offshore and no strip of bare coast shows between the
 * ice and the sea (section 5.2).
 */
export const ICE_SHELF_KM = 50;

/**
 * Ice cover at a date on the global ice grid (section 5.2), as the smoothed
 * signed distance from the ice border in bytes of ICE_DISTANCE_STEP_KM.
 */
export function iceGrid(
  thicknessAt: (lats: Float64Array, lons: Float64Array) => Uint16Array,
  isSea: (lat: number, lon: number) => boolean = () => false,
): Uint8Array {
  const w = ICE_GRID_W;
  const h = ICE_GRID_H;
  const lats = new Float64Array(w * h);
  const lons = new Float64Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      lats[r * w + c] = 90 - ((r + 0.5) * 180) / h;
      lons[r * w + c] = -180 + ((c + 0.5) * 360) / w;
    }
  const thickness = thicknessAt(lats, lons);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = thickness[i]! >= ICE_COVER_M ? 1 : 0;
  closeIce(mask, w, h, (i) => isSea(lats[i]!, lons[i]!));
  // Clamped a little beyond the stored range, so the blur sees a plain field.
  const sdf = signedDistanceKm(mask, w, h).map((v) => Math.max(-200, Math.min(1000, v)));
  const smooth = blurFieldPolar(
    sdf,
    w,
    h,
    ICE_BORDER_SIGMA_KM,
    ICE_BORDER_POLAR_SIGMA_KM,
    ICE_BORDER_ANTARCTIC_SIGMA_KM,
  );
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++)
    out[i] = Math.max(
      0,
      Math.min(255, Math.round(ICE_DISTANCE_ZERO + smooth[i]! / ICE_DISTANCE_STEP_KM)),
    );
  return out;
}

/**
 * Fills gaps narrower than 2 × ICE_MERGE_KM between ice, or between ice and
 * the sea, with ice: the ice together with the sea is grown by ICE_MERGE_KM
 * and shrunk back again, and only land is added, so the sea stays open; then
 * the ice runs ICE_SHELF_KM out over the sea it meets.
 */
export function closeIce(
  mask: Uint8Array,
  w: number,
  h: number,
  isSea: (index: number) => boolean,
): void {
  const n = w * h;
  const sea = new Uint8Array(n);
  const seed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    sea[i] = isSea(i) ? 1 : 0;
    seed[i] = mask[i] || sea[i] ? 1 : 0;
  }
  const grown = new Uint8Array(n);
  const out = distanceKm(seed, w, h);
  for (let i = 0; i < n; i++) grown[i] = out[i]! <= ICE_MERGE_KM ? 0 : 1; // outside the grown area
  const back = distanceKm(grown, w, h);
  for (let i = 0; i < n; i++) if (!mask[i] && !sea[i] && back[i]! > ICE_MERGE_KM) mask[i] = 1;
  // The ice runs on a little over the sea it meets.
  const shelf = distanceKm(mask, w, h);
  for (let i = 0; i < n; i++) if (sea[i] && shelf[i]! <= ICE_SHELF_KM) mask[i] = 1;
}
