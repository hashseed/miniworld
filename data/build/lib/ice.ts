// Ice sheets and the sea-level curve (spec milestone 1, sections 5, 5.1 and
// 5.2) from the rough hand-made model in data/curated/ice-age.json.

import { valueNoise } from '../../../app/src/core/hash.ts';
import { ICE_LEVEL, ICE_N, ICE_SAMPLES, type IceChunk } from '../../../app/src/content/formats.ts';
import { dirToLatLon, faceUvToDir, type TileKey, type Vec3 } from '../../../app/src/globe/cube.ts';
import { dayFromDate } from '../../../app/src/time/calendar.ts';

interface Reference {
  title: string;
  publisher: string;
  url: string;
}

export interface IceSheet {
  id: string;
  name: { en: string; de: string };
  source: string;
  /** [latitude, longitude] the sheet shrinks towards. */
  centre: [number, number];
  /** Central thickness in metres at size 1. */
  maxThickness: number;
  /** Ice only lies where the bedrock is above this height in metres. */
  minBed: number;
  /** [latitude, longitude] points of the extent at size 1, ordered around the centre. */
  outline: [number, number][];
  /** [years before present, size] control points. */
  size: [number, number][];
}

export interface IceAgeModel {
  description: string;
  sources: Record<string, Reference>;
  seaLevel: { source: string; points: [number, number][] };
  sheets: IceSheet[];
}

/** Model time step in years (spec section 5.2). */
export const ICE_STEP_YEARS = 1000;

export function sliceDay(yearsBP: number): number {
  return dayFromDate(1950 - yearsBP, 1, 1);
}

/** Problems with the model file; empty when it is valid. */
export function validateIceModel(model: IceAgeModel): string[] {
  const errors: string[] = [];
  const known = (id: string, what: string) => {
    if (!model.sources[id]) errors.push(`${what}: unknown source ${id}`);
  };
  known(model.seaLevel.source, 'sea level');
  const pts = model.seaLevel.points;
  for (let i = 1; i < pts.length; i++)
    if (pts[i]![0] >= pts[i - 1]![0]) errors.push('sea level: years must descend');
  for (const s of model.sheets) {
    known(s.source, s.id);
    if (!s.name.en || !s.name.de) errors.push(`${s.id}: needs en and de names`);
    if (s.outline.length < 3) errors.push(`${s.id}: outline needs at least 3 points`);
    for (let i = 1; i < s.size.length; i++)
      if (s.size[i]![0] >= s.size[i - 1]![0]) errors.push(`${s.id}: size years must descend`);
  }
  return errors;
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
  model: IceAgeModel,
  startDay: number,
  endDay: number,
): { startDay: number; stepDays: number; metres: number[] } {
  const pts = model.seaLevel.points
    .map(([bp, m]) => ({ day: sliceDay(bp), m }))
    .sort((a, b) => a.day - b.day);
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

/** Size of a sheet at a date, linear between its control points. */
export function sheetSize(sheet: IceSheet, yearsBP: number): number {
  const p = sheet.size;
  if (yearsBP >= p[0]![0]) return p[0]![1];
  for (let i = 1; i < p.length; i++) {
    const [x1, y1] = p[i]!;
    if (yearsBP >= x1) {
      const [x0, y0] = p[i - 1]!;
      return y1 + ((yearsBP - x1) / (x0 - x1)) * (y0 - y1);
    }
  }
  return p[p.length - 1]![1];
}

const RAD = Math.PI / 180;

/** Angular distance (radians) and bearing (radians) from a centre to a point. */
function polar(lat0: number, lon0: number, lat: number, lon: number): [number, number] {
  const p0 = lat0 * RAD;
  const p = lat * RAD;
  const dl = (lon - lon0) * RAD;
  const cosd = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
  const d = Math.acos(Math.max(-1, Math.min(1, cosd)));
  const bearing = Math.atan2(
    Math.sin(dl) * Math.cos(p),
    Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl),
  );
  return [d, bearing];
}

/** The outline as a radius per bearing, interpolated linearly between its points. */
function outlineRadius(sheet: IceSheet): (bearing: number) => number {
  const [lat0, lon0] = sheet.centre;
  const pts = sheet.outline
    .map(([lat, lon]) => {
      const [d, b] = polar(lat0, lon0, lat, lon);
      return { b, d };
    })
    .sort((a, b) => a.b - b.b);
  return (bearing: number) => {
    const k = pts.findIndex((p) => p.b > bearing);
    const hi = k < 0 ? pts[0]! : pts[k]!;
    const lo = k <= 0 ? pts[pts.length - 1]! : pts[k - 1]!;
    let span = hi.b - lo.b;
    let off = bearing - lo.b;
    if (span <= 0) span += 2 * Math.PI;
    if (off < 0) off += 2 * Math.PI;
    return lo.d + (hi.d - lo.d) * (off / span);
  };
}

/**
 * Prepares the model at a set of points: for each sheet, the point's distance
 * from the centre as a fraction of the outline (with seeded edge noise), or
 * Infinity where the bed is too deep. Thickness at any date is then cheap.
 */
export class IceField {
  private readonly model: IceAgeModel;
  private readonly rho: Float32Array[];

  constructor(
    model: IceAgeModel,
    lats: Float64Array,
    lons: Float64Array,
    bed: (lat: number, lon: number) => number,
  ) {
    this.model = model;
    this.rho = model.sheets.map((sheet, s) => {
      const radius = outlineRadius(sheet);
      const [lat0, lon0] = sheet.centre;
      const out = new Float32Array(lats.length);
      for (let i = 0; i < lats.length; i++) {
        const [d, b] = polar(lat0, lon0, lats[i]!, lons[i]!);
        const r = d / radius(b);
        if (r > 1.6 || bed(lats[i]!, lons[i]!) < sheet.minBed) {
          out[i] = Infinity;
          continue;
        }
        // Noise in the sheet's own plane so it is continuous across the date line.
        const x = (d / RAD) * Math.cos(b);
        const y = (d / RAD) * Math.sin(b);
        const n =
          (valueNoise(x / 2.5, y / 2.5, 101 + s) - 0.5) * 0.16 +
          (valueNoise(x / 0.8, y / 0.8, 202 + s) - 0.5) * 0.06;
        out[i] = r * (1 + n);
      }
      return out;
    });
  }

  /** Ice thickness in whole metres at every point at a date. */
  thickness(yearsBP: number): Uint16Array {
    const out = new Uint16Array(this.rho[0]?.length ?? 0);
    this.model.sheets.forEach((sheet, s) => {
      const size = sheetSize(sheet, yearsBP);
      if (size <= 0) return;
      const h0 = sheet.maxThickness * Math.sqrt(size);
      const rho = this.rho[s]!;
      for (let i = 0; i < rho.length; i++) {
        const x = rho[i]! / size;
        if (x >= 1) continue;
        // Vialov profile: thickest in the middle, steep at the edge. The outer
        // quarter is tapered so the edge, 35 km samples apart and exaggerated
        // like the land, slopes instead of standing as a wall.
        const e = Math.min(1, (1 - x) / 0.25);
        const h = h0 * Math.pow(1 - Math.pow(x, 4 / 3), 3 / 8) * e * e * (3 - 2 * e);
        const t = Math.min(65535, Math.round(h));
        if (t > out[i]!) out[i] = t;
      }
    });
    return out;
  }
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
