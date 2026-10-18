// Simplified map (spec milestone 1, section 4.2): the elevation is smoothed
// so the globe shows the Earth's shapes rather than all its details. Land and
// continental shelf are smoothed separately from the deep sea floor, so
// shelves and land bridges keep their depth, and land that is land today
// stays land, so small islands never vanish.

import { Grid } from './grid.ts';

const KM_PER_DEGREE = 111.32;
/** Cells above this height (m) are smoothed together; deeper ones separately. */
export const SHELF_SPLIT_M = -150;

/** Radius of one of three box passes that together approximate a Gaussian of sigma cells. */
export function boxRadius(sigmaCells: number): number {
  return Math.max(0, Math.round((Math.sqrt(4 * sigmaCells * sigmaCells + 1) - 1) / 2));
}

/** Box blur of one line in place, through a scratch buffer of prefix sums. */
export function blurLine(
  data: Float32Array,
  start: number,
  stride: number,
  n: number,
  radius: number,
  wrap: boolean,
  prefix: Float64Array,
): void {
  if (radius <= 0) return;
  prefix[0] = 0;
  for (let k = 0; k < n; k++) prefix[k + 1] = prefix[k]! + data[start + k * stride]!;
  const total = prefix[n]!;
  for (let k = 0; k < n; k++) {
    let a = k - radius;
    let b = k + radius + 1;
    let sum: number;
    if (wrap) {
      // Longitude wraps around; the window never exceeds the line.
      sum = 0;
      if (a < 0) {
        sum += total - prefix[n + a]!;
        a = 0;
      }
      if (b > n) {
        sum += prefix[b - n]!;
        b = n;
      }
      sum += prefix[b]! - prefix[a]!;
    } else {
      a = Math.max(0, a);
      b = Math.min(n, b);
      sum = prefix[b]! - prefix[a]!;
    }
    data[start + k * stride] = sum;
  }
}

/** Smooths an elevation grid with a Gaussian of about sigmaKm (section 4.2). */
export function smoothElevation(g: Grid, sigmaKm: number): Grid {
  const { width: w, height: h } = g;
  const n = w * h;
  const out = new Int16Array(n);
  const value = new Float32Array(n);
  const weight = new Float32Array(n);
  const prefix = new Float64Array(Math.max(w, h) + 1);
  const cellKm = g.cellDegrees * KM_PER_DEGREE;
  const rowRadius = new Int32Array(h);
  for (let r = 0; r < h; r++) {
    const lat = 90 - (r + 0.5) * g.cellDegrees;
    const kmPerCol = Math.max(cellKm * Math.cos((lat * Math.PI) / 180), 1e-3);
    rowRadius[r] = Math.min(Math.floor((w - 1) / 2), boxRadius(sigmaKm / kmPerCol));
  }
  const colRadius = boxRadius(sigmaKm / cellKm);

  for (const high of [true, false]) {
    for (let i = 0; i < n; i++) {
      const inPart = g.data[i]! > SHELF_SPLIT_M === high ? 1 : 0;
      value[i] = g.data[i]! * inPart;
      weight[i] = inPart;
    }
    for (let pass = 0; pass < 3; pass++) {
      for (const buf of [value, weight]) {
        for (let r = 0; r < h; r++) blurLine(buf, r * w, 1, w, rowRadius[r]!, true, prefix);
        for (let c = 0; c < w; c++) blurLine(buf, c, w, h, colRadius, false, prefix);
      }
    }
    for (let i = 0; i < n; i++) {
      if (g.data[i]! > SHELF_SPLIT_M !== high) continue;
      out[i] = Math.round(value[i]! / weight[i]!);
    }
  }
  for (let i = 0; i < n; i++) if (g.data[i]! > 0 && out[i]! < 1) out[i] = 1;
  return new Grid(w, h, out);
}

/** Islands under ISLAND_MIN_KM2 are removed unless kept; those up to ISLAND_MAX_KM2 are enlarged. */
export const ISLAND_MIN_KM2 = 5000;
export const ISLAND_MAX_KM2 = 250000;
/** Islands above this area (such as Honshu, Cuba and Java) grow by BIG_ISLAND_GROWTH_KM. */
export const SMALL_ISLAND_MAX_KM2 = 60000;
export const BIG_ISLAND_GROWTH_KM = 15;
/** Height (m) the sea floor is set to where a small island is removed. */
export const REMOVED_ISLAND_DEPTH = -150;

/**
 * How far (km) an island of an area grows outwards: 40% of its equivalent
 * radius, 6 to 30 km, and BIG_ISLAND_GROWTH_KM for the big islands.
 */
export function islandGrowthKm(areaKm2: number): number {
  if (areaKm2 > SMALL_ISLAND_MAX_KM2) return BIG_ISLAND_GROWTH_KM;
  const radius = Math.sqrt(areaKm2 / Math.PI);
  return Math.max(6, Math.min(30, 0.4 * radius));
}

/**
 * Removes small islands and makes the rest of the islands larger (section
 * 4.2). Islands under ISLAND_MIN_KM2 become sea floor at REMOVED_ISLAND_DEPTH
 * unless one of the kept points lies on them or within one cell; every other
 * island up to ISLAND_MAX_KM2 grows into the surrounding sea by
 * islandGrowthKm, as a low shore sloping down from its coast.
 */
export function enlargeIslands(
  g: Grid,
  keep: { lat: number; lon: number }[] = [],
): { grown: number; removed: number } {
  const { width: w, height: h } = g;
  const n = w * h;
  const kept = new Uint8Array(n);
  for (const k of keep) {
    const { c, r } = g.position(k.lat, k.lon);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = Math.round(r) + dr;
        if (rr >= 0 && rr < h) kept[g.index(Math.round(c) + dc, rr)] = 1;
      }
  }
  const cellKm = g.cellDegrees * KM_PER_DEGREE;
  const colKm = new Float64Array(h);
  for (let r = 0; r < h; r++) {
    const lat = 90 - (r + 0.5) * g.cellDegrees;
    colKm[r] = Math.max(cellKm * Math.cos((lat * Math.PI) / 180), 1e-3);
  }
  const label = new Int32Array(n).fill(-1);
  const raised = new Int16Array(n);
  const stack: number[] = [];
  let grown = 0;
  let removed = 0;
  for (let start = 0; start < n; start++) {
    if (label[start] !== -1 || g.data[start]! <= 0) continue;
    // Flood one land mass, 4-connected and wrapping at the date line.
    const cells: number[] = [];
    let area = 0;
    label[start] = start;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      cells.push(i);
      const r = (i / w) | 0;
      const c = i - r * w;
      area += cellKm * colKm[r]!;
      const next = [
        r * w + ((c + 1) % w),
        r * w + ((c - 1 + w) % w),
        r > 0 ? i - w : -1,
        r < h - 1 ? i + w : -1,
      ];
      for (const j of next) {
        if (j < 0 || label[j] !== -1 || g.data[j]! <= 0) continue;
        label[j] = start;
        stack.push(j);
      }
    }
    if (area > ISLAND_MAX_KM2) continue;
    if (area < ISLAND_MIN_KM2 && !cells.some((i) => kept[i])) {
      for (const i of cells) g.data[i] = REMOVED_ISLAND_DEPTH;
      removed++;
      continue;
    }
    grown++;
    const reach = islandGrowthKm(area);
    const dr = Math.ceil(reach / cellKm);
    for (const i of cells) {
      const r = (i / w) | 0;
      const c = i - r * w;
      const coast =
        g.data[r * w + ((c + 1) % w)]! <= 0 ||
        g.data[r * w + ((c - 1 + w) % w)]! <= 0 ||
        (r > 0 && g.data[i - w]! <= 0) ||
        (r < h - 1 && g.data[i + w]! <= 0);
      if (!coast) continue;
      const top = g.data[i]!;
      for (let rr = Math.max(0, r - dr); rr <= Math.min(h - 1, r + dr); rr++) {
        const dy = (rr - r) * cellKm;
        const dc = Math.min(Math.floor((w - 1) / 2), Math.ceil(reach / colKm[rr]!));
        for (let k = -dc; k <= dc; k++) {
          const dx = k * colKm[rr]!;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > reach) continue;
          const j = rr * w + ((((c + k) % w) + w) % w);
          if (g.data[j]! > 0) continue;
          const height = Math.max(1, Math.round(top * (1 - d / reach) * 0.5 + 1));
          if (raised[j]! < height) raised[j] = height;
        }
      }
    }
  }
  for (let j = 0; j < n; j++) if (raised[j]! > 0 && g.data[j]! <= 0) g.data[j] = raised[j]!;
  return { grown, removed };
}

export interface RemovedArea {
  id: string;
  name: string;
  reason: string;
  /** [lon, lat] points. */
  polygon: [number, number][];
}

export function validateRemovedAreas(areas: RemovedArea[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const a of areas) {
    if (ids.has(a.id)) errors.push(`removed area ${a.id}: duplicate id`);
    ids.add(a.id);
    if (!a.reason) errors.push(`removed area ${a.id}: no reason`);
    if (a.polygon.length < 3) errors.push(`removed area ${a.id}: needs at least three points`);
  }
  return errors;
}

/** Depth (m) given to the sea floor of removed areas. */
export const REMOVED_AREA_DEPTH = -1000;
/** Kept islands within this distance (km) stay inside a removed area. */
const REMOVED_AREA_KEEP_KM = 25;

function insidePolygon(lon: number, lat: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Turns every cell inside a removed area into deep sea floor (section 4.2),
 * except near kept islands. Returns the number of cells changed.
 */
export function removeAreas(
  g: Grid,
  areas: RemovedArea[],
  keep: { lat: number; lon: number }[] = [],
): number {
  const { width: w, height: h } = g;
  let changed = 0;
  for (const a of areas) {
    const lons = a.polygon.map((p) => p[0]);
    const lats = a.polygon.map((p) => p[1]);
    const near = keep.filter(
      (k) =>
        k.lon > Math.min(...lons) - 1 &&
        k.lon < Math.max(...lons) + 1 &&
        k.lat > Math.min(...lats) - 1 &&
        k.lat < Math.max(...lats) + 1,
    );
    const r0 = Math.max(0, Math.floor((90 - Math.max(...lats)) / g.cellDegrees));
    const r1 = Math.min(h - 1, Math.ceil((90 - Math.min(...lats)) / g.cellDegrees));
    const c0 = Math.floor((Math.min(...lons) + 180) / g.cellDegrees);
    const c1 = Math.ceil((Math.max(...lons) + 180) / g.cellDegrees);
    for (let r = r0; r <= r1; r++) {
      const lat = 90 - (r + 0.5) * g.cellDegrees;
      for (let c = c0; c <= c1; c++) {
        const lon = -180 + (c + 0.5) * g.cellDegrees;
        if (!insidePolygon(lon, lat, a.polygon)) continue;
        const kept = near.some((k) => {
          const dx = (k.lon - lon) * Math.cos((lat * Math.PI) / 180);
          return Math.hypot(dx, k.lat - lat) * KM_PER_DEGREE < REMOVED_AREA_KEEP_KM;
        });
        if (kept) continue;
        const i = r * w + (((c % w) + w) % w);
        if (g.data[i]! > REMOVED_AREA_DEPTH) {
          g.data[i] = REMOVED_AREA_DEPTH;
          changed++;
        }
      }
    }
  }
  return changed;
}
