// Ice chunks and the sea-level curve (spec milestone 1, sections 5, 5.1 and
// 5.2): time steps, ice tile samples and chunk packing. The values come from
// the reconstructions read in climate.ts.

import { ICE_LEVEL, ICE_N, ICE_SAMPLES, type IceChunk } from '../../../app/src/content/formats.ts';
import { dirToLatLon, faceUvToDir, type TileKey, type Vec3 } from '../../../app/src/globe/cube.ts';
import { dayFromDate } from '../../../app/src/time/calendar.ts';

/** Model time step in years (spec section 5.2). */
export const ICE_STEP_YEARS = 1000;

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

/** Model dates from the step at or before startDay to today. */
export function iceStepYears(startDay: number): number[] {
  let oldest = 0;
  while (sliceDay(oldest) > startDay) oldest += ICE_STEP_YEARS;
  const years: number[] = [];
  for (let bp = oldest; bp >= 0; bp -= ICE_STEP_YEARS) years.push(bp);
  return years;
}

/** Latitude and longitude of every sample of an ice tile. */
export function iceTilePoints(key: TileKey): { lats: Float64Array; lons: Float64Array } {
  const lats = new Float64Array(ICE_SAMPLES * ICE_SAMPLES);
  const lons = new Float64Array(ICE_SAMPLES * ICE_SAMPLES);
  const dir: Vec3 = [0, 0, 0];
  const size = 2 / (1 << key.level);
  for (let j = 0; j <= ICE_N; j++) {
    for (let i = 0; i <= ICE_N; i++) {
      const u = -1 + (key.x + i / ICE_N) * size;
      const v = -1 + (key.y + j / ICE_N) * size;
      faceUvToDir(key.face, u, v, dir);
      const { lat, lon } = dirToLatLon(dir);
      lats[j * ICE_SAMPLES + i] = lat;
      lons[j * ICE_SAMPLES + i] = lon;
    }
  }
  return { lats, lons };
}

export function* iceTileKeys(): Generator<TileKey> {
  const n = 1 << ICE_LEVEL;
  for (let face = 0; face < 6; face++)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) yield { face, level: ICE_LEVEL, x, y };
}

/**
 * Splits one tile's ice into chunks per time window. Each window's chunk holds
 * the steps inside the window plus the nearest step on each side, so any date
 * in the window can be interpolated from one chunk. `days` ascend.
 */
export function iceChunksForTile(
  key: TileKey,
  days: number[],
  samples: Uint16Array[],
  aridity: Uint16Array[],
  windows: number[],
  endDay: number,
): Map<number, IceChunk> {
  const result = new Map<number, IceChunk>();
  for (let w = 0; w < windows.length; w++) {
    const start = windows[w]!;
    const end = windows[w + 1] ?? endDay + 1;
    let first = days.findIndex((d) => d >= start);
    if (first < 0) first = days.length - 1;
    first = Math.max(0, first - 1);
    let last = days.findIndex((d) => d >= end);
    if (last < 0) last = days.length - 1;
    const picked: number[] = [];
    for (let k = first; k <= last; k++) picked.push(k);
    const empty = (a: Uint16Array[]) => picked.every((k) => a[k]!.every((t) => t === 0));
    if (empty(samples) && empty(aridity)) continue;
    result.set(w, {
      key,
      days: picked.map((k) => days[k]!),
      thickness: picked.map((k) => samples[k]!),
      aridity: picked.map((k) => aridity[k]!),
    });
  }
  return result;
}
