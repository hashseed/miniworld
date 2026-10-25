// The fields around a village (spec neolithic/fields-and-crops.md section 3): plots side by side in a belt
// round the village, each a sector inset for paths, Chaikin-smoothed and wobbled, never overlapping
// each other, the lodging ring or whatever the caller blocks. Pure and deterministic: hashes and the
// engine-independent trigonometry only, in layout metres (x east, z north).

import { detAtan2, detCos, detSin } from '../core/detmath.ts';
import { hash01, hash32 } from '../core/hash.ts';

export interface Pt {
  x: number;
  z: number;
}

export interface Field {
  id: number;
  crop: string;
  /** Closed, counter-clockwise outline; the first point is not repeated. Star-shaped about `centre`. */
  outline: Pt[];
  centre: Pt;
  /** Area in square layout metres. */
  area: number;
  /** Direction of the furrows in the x-z plane, radians, 0 = east. */
  furrowAngle: number;
  /** The field's own delay of sowing, 0 to 14 whole days. */
  offsetDays: number;
}

export interface FieldInput {
  seed: number;
  /** The village centre. */
  centre: Pt;
  /** Outer radius of the ring of lodgings; fields keep `margin` beyond it. */
  ringRadius: number;
  /** Crops the village grows; the fields rotate through them. */
  crops: readonly string[];
  /** True on dry land of gentle slope. */
  isLand: (x: number, z: number) => boolean;
  /** True on rivers, lakes, mountains and anything else fields must keep off. */
  isBlocked: (x: number, z: number) => boolean;
  /** Most fields wanted, at most 10 (default 10). */
  want?: number;
}

export const MAX_FIELDS = 5;
/** Distance every outline keeps from anything blocked, from the ring and from the water. */
export const FIELD_MARGIN_M = 0.08;
/** A plot's width along the belt and its depth out from the village (layout metres of the field frame). */
const SITE_SPACING_M = 1.5;
const FIELD_DEPTH_M = 1.5;
/** Points along each of a plot's two arcs. */
const ARC_STEPS = 6;
const PATH_INSET_M = 0.09;
const MIN_AREA_M2 = 0.16;
const TAU = 6.283185307179586;

function area(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    s += p.x * q.z - q.x * p.z;
  }
  return s / 2;
}

function centroid(poly: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const w = p.x * q.z - q.x * p.z;
    a += w;
    cx += (p.x + q.x) * w;
    cz += (p.z + q.z) * w;
  }
  if (Math.abs(a) < 1e-9) return poly[0]!;
  return { x: cx / (3 * a), z: cz / (3 * a) };
}

function chaikin(poly: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    out.push(
      { x: 0.75 * p.x + 0.25 * q.x, z: 0.75 * p.z + 0.25 * q.z },
      { x: 0.25 * p.x + 0.75 * q.x, z: 0.25 * p.z + 0.75 * q.z },
    );
  }
  return out;
}

function inside(poly: Pt[], x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[i]!;
    const q = poly[j]!;
    if (p.z > z !== q.z > z && x < ((q.x - p.x) * (z - p.z)) / (q.z - p.z) + p.x) hit = !hit;
  }
  return hit;
}

/** Smallest area of a rectangle around the polygon, over 90 turns. */
export function boundingRectangleArea(poly: Pt[]): number {
  let best = Infinity;
  for (let k = 0; k < 90; k++) {
    const t = (k / 90) * (TAU / 4);
    const c = detCos(t);
    const s = detSin(t);
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (const p of poly) {
      const u = p.x * c + p.z * s;
      const v = -p.x * s + p.z * c;
      x0 = Math.min(x0, u);
      x1 = Math.max(x1, u);
      z0 = Math.min(z0, v);
      z1 = Math.max(z1, v);
    }
    best = Math.min(best, (x1 - x0) * (z1 - z0));
  }
  return best;
}

export function polygonArea(poly: Pt[]): number {
  return Math.abs(area(poly));
}

export function pointInPolygon(poly: Pt[], x: number, z: number): boolean {
  return inside(poly, x, z);
}

export function layoutFields(input: FieldInput): Field[] {
  const { seed, centre, ringRadius } = input;
  const want = Math.min(MAX_FIELDS, Math.max(0, Math.floor(input.want ?? MAX_FIELDS)));
  if (want === 0 || input.crops.length === 0) return [];
  const inner = ringRadius + FIELD_MARGIN_M;
  const free = (x: number, z: number): boolean => {
    const dx = x - centre.x;
    const dz = z - centre.z;
    if (dx * dx + dz * dz < inner * inner) return false;
    return input.isLand(x, z) && !input.isBlocked(x, z);
  };
  /** Free with a margin of four points around it. */
  const clear = (x: number, z: number): boolean => {
    const m = FIELD_MARGIN_M;
    return free(x, z) && free(x + m, z) && free(x - m, z) && free(x, z + m) && free(x, z - m);
  };

  const roomAround = (x: number, z: number): boolean => {
    let ok = 0;
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * TAU;
      if (clear(x + 0.3 * detCos(t), z + 0.3 * detSin(t))) ok++;
    }
    return ok >= 6;
  };
  // In order round the village (Yang, 2026-10-25: "make them more regularly ordered around the
  // village"): plots side by side in a belt just beyond the houses, each a sector of the ring
  // between two lines out from the village, from the most open way out; a second belt behind
  // the first where the first is short.
  const r1 = inner + FIELD_DEPTH_M / 2;
  const slots = Math.max(want, Math.round((TAU * r1) / SITE_SPACING_M));
  const step = TAU / slots;
  const a0 = hash01(seed, 0, 0, 3) * TAU;
  const mid = (belt: number, k: number) => {
    const a = a0 + k * step;
    const r = r1 + belt * FIELD_DEPTH_M;
    return { x: centre.x + r * detCos(a), z: centre.z + r * detSin(a) };
  };
  const free1 = Array.from({ length: slots }, (_, k) => {
    const p = mid(0, k);
    return clear(p.x, p.z) && roomAround(p.x, p.z);
  });
  // The longest run of free plots round the belt first, then the others, longest first.
  const runs: number[][] = [];
  if (free1.every(Boolean)) runs.push(Array.from({ length: slots }, (_, k) => k));
  else {
    const first = free1.indexOf(false);
    let run: number[] = [];
    // Once round from the first blocked plot, which closes the last run.
    for (let n = 1; n <= slots; n++) {
      const k = (first + n) % slots;
      if (free1[k]) run.push(k);
      else if (run.length) {
        runs.push(run);
        run = [];
      }
    }
  }
  runs.sort((a, b) => b.length - a.length || a[0]! - b[0]!);
  const plots: { belt: number; k: number }[] = [];
  for (const run of runs) for (const k of run) if (plots.length < want) plots.push({ belt: 0, k });
  for (const { k } of [...plots]) {
    const p = mid(1, k);
    if (plots.length < want && clear(p.x, p.z) && roomAround(p.x, p.z)) plots.push({ belt: 1, k });
  }
  /** A plot's ground: its sector of the belt, a path's width in from every side. */
  const sector = ({ belt, k }: { belt: number; k: number }): Pt[] => {
    const rIn = inner + belt * FIELD_DEPTH_M + PATH_INSET_M;
    const rOut = inner + (belt + 1) * FIELD_DEPTH_M - PATH_INSET_M;
    const a = a0 + k * step;
    const half = step / 2 - PATH_INSET_M / r1;
    const out: Pt[] = [];
    for (const [r, from, to] of [
      [rIn, a - half, a + half],
      [rOut, a + half, a - half],
    ] as const)
      for (let q = 0; q <= ARC_STEPS; q++) {
        const t = from + ((to - from) * q) / ARC_STEPS;
        out.push({ x: centre.x + r * detCos(t), z: centre.z + r * detSin(t) });
      }
    return out;
  };

  const fields: Field[] = [];
  const cropOffset = hash32(seed, 77) % input.crops.length;
  for (let i = 0; i < plots.length; i++) {
    const shaped = shapeField(sector(plots[i]!), seed, i, clear);
    if (!shaped) continue;
    fields.push({
      id: 0,
      crop: input.crops[0]!,
      outline: shaped.outline,
      centre: shaped.centre,
      area: shaped.area,
      // Furrows run out from the village, a little turned by the hash.
      furrowAngle: a0 + plots[i]!.k * step + (hash01(seed, i, 0, 31) - 0.5) * 0.3,
      offsetDays: hash32(seed, i, 0, 9) % 15,
    });
  }
  fields.sort((a, b) => {
    const da = (a.centre.x - centre.x) ** 2 + (a.centre.z - centre.z) ** 2;
    const db = (b.centre.x - centre.x) ** 2 + (b.centre.z - centre.z) ** 2;
    return da - db || a.centre.x - b.centre.x;
  });
  fields.forEach((f, i) => {
    f.id = i;
    f.crop = input.crops[(i + cropOffset) % input.crops.length]!;
  });
  return fields;
}

function shapeField(
  path: Pt[],
  seed: number,
  index: number,
  clear: (x: number, z: number) => boolean,
): { outline: Pt[]; centre: Pt; area: number } | undefined {
  const c0 = centroid(path);
  let outline = chaikin(chaikin(path));
  // Low-frequency wobble: the radius shrinks by up to 14%, never grows, so the cell still holds it.
  const p2 = hash01(seed, index, 0, 21) * TAU;
  const p3 = hash01(seed, index, 0, 22) * TAU;
  outline = outline.map((p) => {
    const a = detAtan2(p.z - c0.z, p.x - c0.x);
    const w = 0.6 * detSin(2 * a + p2) + 0.4 * detSin(3 * a + p3);
    const f = 1 - 0.06 * (0.5 - 0.5 * w);
    return { x: c0.x + (p.x - c0.x) * f, z: c0.z + (p.z - c0.z) * f };
  });

  let ok = false;
  for (let attempt = 0; attempt < 7 && !ok; attempt++) {
    if (attempt > 0) {
      outline = outline.map((p) => ({
        x: c0.x + (p.x - c0.x) * 0.85,
        z: c0.z + (p.z - c0.z) * 0.85,
      }));
    }
    // Pull failing vertices towards the centroid (still inside the cell) until they pass.
    outline = outline.map((p) => {
      let q = p;
      for (let k = 0; k < 12 && !clear(q.x, q.z); k++)
        q = { x: c0.x + (q.x - c0.x) * 0.9, z: c0.z + (q.z - c0.z) * 0.9 };
      return q;
    });
    ok = outlineIsClear(outline, c0, clear);
  }
  if (!ok) return undefined;
  const a = polygonArea(outline);
  if (a < MIN_AREA_M2) return undefined;
  const centre = centroid(outline);
  return { outline, centre, area: a };
}

function outlineIsClear(
  outline: Pt[],
  centre: Pt,
  clear: (x: number, z: number) => boolean,
): boolean {
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i]!;
    const q = outline[(i + 1) % outline.length]!;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dz * dz) / 0.05));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      if (!clear(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t)) return false;
    }
  }
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const p of outline) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  for (let x = x0; x <= x1; x += 0.2)
    for (let z = z0; z <= z1; z += 0.2) if (inside(outline, x, z) && !clear(x, z)) return false;
  return clear(centre.x, centre.z);
}
