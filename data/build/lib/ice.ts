// Ice sheets and the sea-level curve (spec milestone 1, sections 5.1 and 5.2).
// Both come from one ice reconstruction, so coastlines and ice agree.

import { ICE_LEVEL, ICE_N, ICE_SAMPLES, type IceChunk } from '../../../app/src/content/formats.ts';
import { dirToLatLon, faceUvToDir, type TileKey, type Vec3 } from '../../../app/src/globe/cube.ts';
import { dayFromDate } from '../../../app/src/time/calendar.ts';
import { cellArea, type Grid } from './grid.ts';

export interface IceSlice {
  /** Years before present (1950). */
  yearsBP: number;
  /** Ice thickness in metres on a latitude-longitude grid. */
  thickness: Grid<Float32Array>;
}

export function sliceDay(yearsBP: number): number {
  return dayFromDate(1950 - yearsBP, 1, 1);
}

const ICE_DENSITY_RATIO = 0.917; // ice / water
const OCEAN_AREA_M2 = 3.618e14;

/** Global mean sea level (m) per slice from ice volume relative to the youngest slice. */
export function seaLevelFromIce(slices: IceSlice[]): number[] {
  const volumes = slices.map((s) => {
    const g = s.thickness;
    let v = 0;
    for (let r = 0; r < g.height; r++) {
      const a = cellArea(g, r);
      for (let c = 0; c < g.width; c++) v += g.data[r * g.width + c]! * a;
    }
    return v;
  });
  const youngest = slices.reduce((best, s, i) => (s.yearsBP < slices[best]!.yearsBP ? i : best), 0);
  const v0 = volumes[youngest]!;
  return volumes.map((v) => (-(v - v0) * ICE_DENSITY_RATIO) / OCEAN_AREA_M2);
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
  slices: IceSlice[],
  startDay: number,
  endDay: number,
): { startDay: number; stepDays: number; metres: number[] } {
  const levels = seaLevelFromIce(slices);
  const pts = slices
    .map((s, i) => ({ day: sliceDay(s.yearsBP), level: levels[i]! }))
    .sort((a, b) => a.day - b.day);
  const f = monotoneCubic(
    pts.map((p) => p.day),
    pts.map((p) => p.level),
  );
  const stepDays = SEA_LEVEL_STEP_YEARS * 365.2425;
  const metres: number[] = [];
  for (let d = startDay; d <= endDay + stepDays; d += stepDays) {
    metres.push(Math.round(f(d) * 10) / 10);
  }
  return { startDay, stepDays, metres };
}

/** Ice thickness of one slice over the samples of an ice tile. */
export function iceTileSamples(key: TileKey, slice: IceSlice): Uint16Array {
  const out = new Uint16Array(ICE_SAMPLES * ICE_SAMPLES);
  const dir: Vec3 = [0, 0, 0];
  const size = 2 / (1 << key.level);
  for (let j = 0; j <= ICE_N; j++) {
    for (let i = 0; i <= ICE_N; i++) {
      const u = -1 + (key.x + i / ICE_N) * size;
      const v = -1 + (key.y + j / ICE_N) * size;
      faceUvToDir(key.face, u, v, dir);
      const { lat, lon } = dirToLatLon(dir);
      out[j * ICE_SAMPLES + i] = Math.max(
        0,
        Math.min(65535, Math.round(slice.thickness.bilinear(lat, lon))),
      );
    }
  }
  return out;
}

export function* iceTileKeys(): Generator<TileKey> {
  const n = 1 << ICE_LEVEL;
  for (let face = 0; face < 6; face++)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) yield { face, level: ICE_LEVEL, x, y };
}

/**
 * Splits ice into chunks per tile and time window. Each window's chunk holds
 * the slices inside the window plus the nearest slice on each side, so any
 * date in the window can be interpolated from one chunk.
 */
export function iceChunksForTile(
  key: TileKey,
  slices: IceSlice[],
  windows: number[],
  endDay: number,
): Map<number, IceChunk> {
  const sorted = [...slices].sort((a, b) => sliceDay(a.yearsBP) - sliceDay(b.yearsBP));
  const days = sorted.map((s) => sliceDay(s.yearsBP));
  const samples = sorted.map((s) => iceTileSamples(key, s));
  const result = new Map<number, IceChunk>();
  for (let w = 0; w < windows.length; w++) {
    const start = windows[w]!;
    const end = windows[w + 1] ?? endDay + 1;
    let first = days.findIndex((d) => d >= start);
    if (first < 0) first = days.length - 1;
    first = Math.max(0, first - 1);
    let last = days.findIndex((d) => d >= end);
    if (last < 0) last = days.length - 1;
    const picked = [];
    for (let k = first; k <= last; k++) picked.push(k);
    if (picked.every((k) => samples[k]!.every((t) => t === 0))) continue;
    result.set(w, {
      key,
      days: picked.map((k) => days[k]!),
      thickness: picked.map((k) => samples[k]!),
    });
  }
  return result;
}
