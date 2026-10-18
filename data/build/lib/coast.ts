// Smooth coasts, straits, lakes and polar simplification (spec milestone 1,
// sections 4.2, 4.3 and 5.1). Coastlines are drawn where the smoothed ocean
// level crosses the date's sea level, so they are smooth curves like the
// rivers; named straits are carved so the smoothing never closes them.

import {
  OCEAN_MIN_LEVEL,
  OCEAN_NEVER,
  OCEAN_SCALE,
  OCEAN_TOP,
} from '../../../app/src/content/formats.ts';
import { distanceKm } from './distance.ts';
import { Grid, type GridData } from './grid.ts';
import { blurLine, boxRadius } from './simplify.ts';

const KM_PER_DEG = 111.32;

/** Gaussian sigma (km) of the coast smoothing, and of the coast in polar regions. */
export const COAST_SIGMA_KM = 28;
export const POLAR_COAST_SIGMA_KM = 60;
/** Gaussian sigma (km) of Antarctica's coast, which is simplified even more. */
export const ANTARCTIC_COAST_SIGMA_KM = 120;

/** Weight of the Antarctic simplification: 1 south of 60°S, 0 north of 50°S. */
export function antarcticWeight(lat: number): number {
  return Math.max(0, Math.min(1, (-50 - lat) / 10));
}
/**
 * Distance (km) every coast grows seaward before the smoothing, so narrow
 * peninsulas and islands survive the blur and come out slightly larger.
 */
export const COAST_GROW_KM = 34;
/** Level (m) given to land that never joins the ocean before smoothing. */
export const NEVER_LEVEL_M = OCEAN_MIN_LEVEL + OCEAN_TOP;

/**
 * Weight of the polar simplification at a latitude: 1 south of 60°S and north
 * of 80°N, 0 within 50°S..70°N, blending linearly between (section 4.2).
 */
export function polarWeight(lat: number): number {
  if (lat <= -60) return 1;
  if (lat >= 72) return 1;
  if (lat < -50) return (-50 - lat) / 10;
  if (lat > 62) return (lat - 62) / 10;
  return 0;
}

/** Latitude of the centre of a grid row. */
export function rowLat(g: { height: number }, r: number): number {
  return 90 - ((r + 0.5) * 180) / g.height;
}

/** Gaussian blur (three box passes) of a field on a global grid, normalised at the poles. */
export function blurField(
  values: Float32Array,
  w: number,
  h: number,
  sigmaKm: number,
): Float32Array {
  const cellDeg = 360 / w;
  const cellKm = cellDeg * KM_PER_DEG;
  const value = Float32Array.from(values);
  const weight = new Float32Array(w * h).fill(1);
  const prefix = new Float64Array(Math.max(w, h) + 1);
  // At least one cell, so a coarse grid is still smoothed.
  const radius = (sigmaCells: number) =>
    sigmaCells >= 0.5 ? Math.max(1, boxRadius(sigmaCells)) : 0;
  const colRadius = radius(sigmaKm / cellKm);
  const rowRadius = new Int32Array(h);
  for (let r = 0; r < h; r++) {
    const lat = 90 - (r + 0.5) * cellDeg;
    const kmPerCol = Math.max(cellKm * Math.cos((lat * Math.PI) / 180), 1e-3);
    rowRadius[r] = Math.min(Math.floor((w - 1) / 2), radius(sigmaKm / kmPerCol));
  }
  for (let pass = 0; pass < 3; pass++) {
    for (const buf of [value, weight]) {
      for (let r = 0; r < h; r++) blurLine(buf, r * w, 1, w, rowRadius[r]!, true, prefix);
      for (let c = 0; c < w; c++) blurLine(buf, c, w, h, colRadius, false, prefix);
    }
  }
  for (let i = 0; i < w * h; i++) value[i] = value[i]! / weight[i]!;
  return value;
}

/** Sliding-window maximum of radius r along a row, wrapping around, into out. */
function rowMax(src: Float32Array, off: number, w: number, r: number, out: Float32Array): void {
  if (r <= 0) {
    out.set(src.subarray(off, off + w));
    return;
  }
  // Van Herk / Gil-Werman: block prefix and suffix maxima over the padded row.
  const k = 2 * r + 1;
  const n = w + 2 * r;
  const pad = new Float32Array(n);
  for (let i = 0; i < n; i++) pad[i] = src[off + ((((i - r) % w) + w) % w)]!;
  const pre = new Float32Array(n);
  const suf = new Float32Array(n);
  for (let i = 0; i < n; i++) pre[i] = i % k === 0 ? pad[i]! : Math.max(pre[i - 1]!, pad[i]!);
  for (let i = n - 1; i >= 0; i--)
    suf[i] = i === n - 1 || (i + 1) % k === 0 ? pad[i]! : Math.max(suf[i + 1]!, pad[i]!);
  for (let c = 0; c < w; c++) out[c] = Math.max(suf[c]!, pre[c + 2 * r]!);
}

/** Maximum of a field over a disc of radiusKm around every cell (land grows into the sea). */
export function growField(
  values: Float32Array,
  w: number,
  h: number,
  radiusKm: number,
): Float32Array {
  const cellDeg = 360 / w;
  const cellKm = cellDeg * KM_PER_DEG;
  const R = Math.floor(radiusKm / cellKm);
  const out = Float32Array.from(values);
  if (radiusKm <= 0) return out;
  const tmp = new Float32Array(w);
  for (let r = 0; r < h; r++) {
    const lat = 90 - (r + 0.5) * cellDeg;
    const kmPerCol = Math.max(cellKm * Math.cos((lat * Math.PI) / 180), 1e-3);
    for (let dr = -R; dr <= R; dr++) {
      const rr = r + dr;
      if (rr < 0 || rr >= h) continue;
      const half = Math.sqrt(Math.max(0, radiusKm * radiusKm - (dr * cellKm) ** 2));
      const cr = Math.min(Math.floor((w - 1) / 2), Math.floor(half / kmPerCol));
      rowMax(values, rr * w, w, cr, tmp);
      for (let c = 0; c < w; c++) if (tmp[c]! > out[r * w + c]!) out[r * w + c] = tmp[c]!;
    }
  }
  return out;
}

/**
 * Blurs with sigmaKm, with polarSigmaKm in the polar regions and with
 * antarcticSigmaKm (when given) around Antarctica, blending by latitude.
 */
export function blurFieldPolar(
  values: Float32Array,
  w: number,
  h: number,
  sigmaKm: number,
  polarSigmaKm: number,
  antarcticSigmaKm?: number,
): Float32Array {
  const near = blurField(values, w, h, sigmaKm);
  const far = blurField(values, w, h, polarSigmaKm);
  const south = antarcticSigmaKm ? blurField(values, w, h, antarcticSigmaKm) : undefined;
  for (let r = 0; r < h; r++) {
    const lat = rowLat({ height: h }, r);
    const k = polarWeight(lat);
    if (k === 0) continue;
    const a = south ? antarcticWeight(lat) : 0;
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      const polar = a > 0 ? far[i]! * (1 - a) + south![i]! * a : far[i]!;
      near[i] = near[i]! * (1 - k) + polar * k;
    }
  }
  return near;
}

export interface Strait {
  id: string;
  name: string;
  source: string;
  /** Depth of the shallowest point on the deepest way through, in metres (negative). */
  sill: number;
  /** [lon, lat] points from one sea to the other. */
  line: [number, number][];
}

export function validateStraits(straits: Strait[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const s of straits) {
    if (ids.has(s.id)) errors.push(`strait ${s.id}: duplicate id`);
    ids.add(s.id);
    if (!s.source) errors.push(`strait ${s.id}: no source`);
    if (!(s.sill < 0)) errors.push(`strait ${s.id}: sill must be below 0`);
    if (s.line.length < 2) errors.push(`strait ${s.id}: needs at least two points`);
  }
  return errors;
}

export interface KeptIsland {
  id: string;
  name: string;
  /** Why history needs it; kept in the data only. */
  reason: string;
  source: string;
  lat: number;
  lon: number;
}

export function validateIslands(islands: KeptIsland[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const k of islands) {
    if (ids.has(k.id)) errors.push(`island ${k.id}: duplicate id`);
    ids.add(k.id);
    if (!k.source) errors.push(`island ${k.id}: no source`);
    if (!k.reason) errors.push(`island ${k.id}: no reason`);
    if (Math.abs(k.lat) > 90 || Math.abs(k.lon) > 180) errors.push(`island ${k.id}: bad position`);
  }
  return errors;
}

/** Radius (km) of the land core laid in for a kept small island, and of its sloping shore. */
export const ISLAND_CORE_KM = 10;
export const ISLAND_BANK_KM = 10;

/** Half-width (km) of the always-open core of a strait, and the width of its banks. */
export const STRAIT_CORE_KM = 12;
export const STRAIT_BANK_KM = 12;
/** Half-width (km) carved to the sill before the flood. */
export const STRAIT_CARVE_KM = 6;

/**
 * Calls visit(index, distanceKm) for every cell within reachKm of a polyline,
 * with the distance to the line.
 */
export function forCellsNearLine(
  g: { width: number; height: number },
  line: number[][],
  reachKm: number,
  visit: (index: number, distanceKm: number) => void,
): void {
  const { width: w, height: h } = g;
  const cellDeg = 360 / w;
  for (let s = 1; s < line.length; s++) {
    const a = line[s - 1]!;
    const b = line[s]!;
    const kx = KM_PER_DEG * Math.max(0.05, Math.cos((((a[1]! + b[1]!) / 2) * Math.PI) / 180));
    let dLon = b[0]! - a[0]!;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const bx = dLon * kx;
    const by = (b[1]! - a[1]!) * KM_PER_DEG;
    const len2 = bx * bx + by * by;
    const lon0 = Math.min(a[0]!, a[0]! + dLon) - reachKm / kx;
    const lon1 = Math.max(a[0]!, a[0]! + dLon) + reachKm / kx;
    const lat0 = Math.min(a[1]!, b[1]!) - reachKm / KM_PER_DEG;
    const lat1 = Math.max(a[1]!, b[1]!) + reachKm / KM_PER_DEG;
    const c0 = Math.floor((lon0 + 180) / cellDeg - 0.5);
    const c1 = Math.ceil((lon1 + 180) / cellDeg - 0.5);
    const r0 = Math.max(0, Math.floor((90 - lat1) / cellDeg - 0.5));
    const r1 = Math.min(h - 1, Math.ceil((90 - lat0) / cellDeg - 0.5));
    for (let r = r0; r <= r1; r++) {
      const py = (90 - (r + 0.5) * cellDeg - a[1]!) * KM_PER_DEG;
      for (let c = c0; c <= c1; c++) {
        const px = (-180 + (c + 0.5) * cellDeg - a[0]!) * kx;
        const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
        const dx = px - t * bx;
        const dy = py - t * by;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < reachKm) visit(r * w + (((c % w) + w) % w), d);
      }
    }
  }
}

/**
 * Lowers every cell along each strait to at most its sill depth, about one
 * cell either side, so the flood fill finds the way through (section 5.1).
 */
export function carveStraits(g: Grid<GridData>, straits: Strait[]): void {
  const reach = Math.max(STRAIT_CARVE_KM, (360 / g.width) * KM_PER_DEG);
  for (const s of straits) {
    forCellsNearLine(g, s.line, reach, (i) => {
      if (g.data[i]! > s.sill) g.data[i] = s.sill;
    });
  }
}

/**
 * Smooths the flood fill result into the stored ocean channel: levels in
 * metres, land that never joins the ocean at NEVER_LEVEL_M, grown by
 * COAST_GROW_KM and blurred, then the
 * straits laid in with a flat core and sloping banks so they are open exactly
 * when the sea is above their sill. Returns bytes 0..OCEAN_TOP.
 */
export function smoothOcean(
  connection: Grid<Uint8Array>,
  straits: Strait[],
  keep: KeptIsland[] = [],
  growKm = COAST_GROW_KM,
): Uint16Array {
  const { width: w, height: h } = connection;
  const n = w * h;
  const level = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = connection.data[i]!;
    level[i] = v === OCEAN_NEVER ? NEVER_LEVEL_M : Math.min(NEVER_LEVEL_M, OCEAN_MIN_LEVEL + v);
  }
  const grown = growField(level, w, h, growKm);
  const smooth = blurFieldPolar(
    grown,
    w,
    h,
    COAST_SIGMA_KM,
    POLAR_COAST_SIGMA_KM,
    ANTARCTIC_COAST_SIGMA_KM,
  );
  for (const s of straits) {
    forCellsNearLine(connection, s.line, STRAIT_CORE_KM + STRAIT_BANK_KM, (i, d) => {
      const t = Math.max(0, d - STRAIT_CORE_KM) / STRAIT_BANK_KM;
      const v = s.sill + (NEVER_LEVEL_M - s.sill) * t;
      if (v < smooth[i]!) smooth[i] = v;
    });
  }
  // Kept small islands get a round core that the smoothing cannot wash away.
  for (const k of keep) {
    const p: [number, number] = [k.lon, k.lat];
    forCellsNearLine(connection, [p, p], ISLAND_CORE_KM + ISLAND_BANK_KM, (i, d) => {
      const t = Math.max(0, d - ISLAND_CORE_KM) / ISLAND_BANK_KM;
      const v = NEVER_LEVEL_M - (NEVER_LEVEL_M - OCEAN_MIN_LEVEL) * t;
      if (v > smooth[i]!) smooth[i] = v;
    });
  }
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(OCEAN_TOP, smooth[i]! - OCEAN_MIN_LEVEL));
    out[i] = Math.round(v * OCEAN_SCALE);
  }
  return out;
}

/**
 * Ocean field for tiles whose samples lie spacingKm apart (section 4.2): the
 * coast grows by COARSE_GROW of a spacing and is blurred by COARSE_SIGMA of
 * one, so the shader's smooth interpolation neither loses islands and
 * peninsulas narrower than a few samples nor shrinks the coasts. Straits are
 * laid in again at least half a spacing wide.
 */
export const COARSE_GROW = 0.4;
export const COARSE_SIGMA = 0.5;
/** Levels whose samples lie at least this far apart (km) get a prefiltered coast. */
export const COARSE_MIN_SPACING_KM = 30;
export function coarseOcean(
  ocean: Grid<Uint16Array>,
  spacingKm: number,
  straits: Strait[],
): Uint16Array {
  const { width: w, height: h } = ocean;
  const n = w * h;
  const level = new Float32Array(n);
  for (let i = 0; i < n; i++) level[i] = OCEAN_MIN_LEVEL + ocean.data[i]! / OCEAN_SCALE;
  const smooth = blurField(
    growField(level, w, h, spacingKm * COARSE_GROW),
    w,
    h,
    spacingKm * COARSE_SIGMA,
  );
  const core = Math.max(STRAIT_CORE_KM, spacingKm / 2);
  for (const s of straits) {
    forCellsNearLine(ocean, s.line, core + spacingKm / 2, (i, d) => {
      const t = Math.max(0, d - core) / (spacingKm / 2);
      const v = s.sill + (NEVER_LEVEL_M - s.sill) * t;
      if (v < smooth[i]!) smooth[i] = v;
    });
  }
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(OCEAN_TOP, smooth[i]! - OCEAN_MIN_LEVEL));
    out[i] = Math.round(v * OCEAN_SCALE);
  }
  return out;
}

/**
 * Smooth lake field (section 4.3): the lake mask blurred with the coast's
 * Gaussian, as bytes 0..255 (a lake where it passes 128). Lake levels are
 * spread a few cells outwards so every cell the smoothed lake covers has one.
 */
export function smoothLakes(lakeLevel: Grid<Int16Array>, noLake: number): Uint8Array {
  const { width: w, height: h } = lakeLevel;
  const n = w * h;
  const mask = new Float32Array(n);
  for (let i = 0; i < n; i++) mask[i] = lakeLevel.data[i] !== noLake ? 1 : 0;
  const field = blurFieldPolar(mask, w, h, COAST_SIGMA_KM, POLAR_COAST_SIGMA_KM);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(Math.min(1, field[i]!) * 255);
  const cellKm = (360 / w) * KM_PER_DEG;
  const rounds = Math.ceil((COAST_SIGMA_KM * 2) / cellKm);
  for (let k = 0; k < rounds; k++) {
    const next = Int16Array.from(lakeLevel.data);
    for (let i = 0; i < n; i++) {
      if (lakeLevel.data[i] !== noLake || out[i]! === 0) continue;
      const r = (i / w) | 0;
      const c = i - r * w;
      for (const j of [r * w + ((c + 1) % w), r * w + ((c - 1 + w) % w), i - w, i + w]) {
        if (j >= 0 && j < n && lakeLevel.data[j] !== noLake) {
          next[i] = lakeLevel.data[j]!;
          break;
        }
      }
    }
    lakeLevel.data.set(next);
  }
  return out;
}

/** Metres the joined level rises per step of the lake field (0..255) below one half. */
export const JOIN_SLOPE_M = 2;

/**
 * Where the sea reaches a drawn lake (such as the Baltic), the lake's outline
 * is the coast (section 5.1): every cell of the smooth lake field takes the
 * level at which the nearest lake cell joins the ocean, raised by JOIN_SLOPE_M
 * per step the field lies below one half, if lower. The joined level changes
 * smoothly with the field, so wherever the lake is drawn the sea is too, and
 * the coast follows the lake's smooth outline. Changes ocean in place.
 */
export function joinInlandSeas(
  ocean: Uint16Array,
  connection: Grid<Uint8Array>,
  lakes: Uint8Array,
): void {
  const { width: w, height: h } = connection;
  const n = w * h;
  const level = new Float32Array(n).fill(Infinity);
  let front: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = connection.data[i]!;
    if (lakes[i]! >= 128 && v !== OCEAN_NEVER) {
      level[i] = OCEAN_MIN_LEVEL + v;
      front.push(i);
    }
  }
  // Spread outwards through the lake field, one ring of cells at a time.
  while (front.length) {
    const next: number[] = [];
    for (const i of front) {
      const r = (i / w) | 0;
      const c = i - r * w;
      for (const j of [r * w + ((c + 1) % w), r * w + ((c - 1 + w) % w), i - w, i + w]) {
        if (j < 0 || j >= n || lakes[j]! === 0 || level[j] !== Infinity) continue;
        level[j] = level[i]!;
        next.push(j);
      }
    }
    front = next;
  }
  for (let i = 0; i < n; i++) {
    if (level[i] === Infinity) continue;
    level[i] = level[i]! + (128 - lakes[i]!) * JOIN_SLOPE_M;
    const v = Math.round(
      Math.max(0, Math.min(OCEAN_TOP, level[i]! - OCEAN_MIN_LEVEL)) * OCEAN_SCALE,
    );
    if (v < ocean[i]!) ocean[i] = v;
  }
}

/** Blends two elevation grids by the polar weight of each row (section 4.2). */
export function blendPolar(near: Grid, far: Grid): Grid {
  const { width: w, height: h } = near;
  const out = Int16Array.from(near.data);
  for (let r = 0; r < h; r++) {
    const k = polarWeight(rowLat(near, r));
    if (k === 0) continue;
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      out[i] = Math.round(near.data[i]! * (1 - k) + far.data[i]! * k);
    }
  }
  return new Grid(w, h, out);
}

/**
 * Distance in km from today's smoothed coast for every cell, 0 at sea and
 * capped at 255 (section 4.2): the shader lets land rise only as fast as a
 * rounded clay edge allows near the sea.
 */
export function coastDistance(ocean: Grid<Uint16Array>): Uint8Array {
  const { width: w, height: h } = ocean;
  const seaBelow = -OCEAN_MIN_LEVEL * OCEAN_SCALE; // field value of today's sea level
  const sea = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) sea[i] = ocean.data[i]! < seaBelow ? 1 : 0;
  const d = distanceKm(sea, w, h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.min(255, Math.round(d[i]!));
  return out;
}
