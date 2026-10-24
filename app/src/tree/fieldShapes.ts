// The fields around a village (spec neolithic/fields-and-crops.md section 3): organic closed outlines
// from relaxed power-diagram cells, inset for paths, Chaikin-smoothed and wobbled, never overlapping
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

export const MAX_FIELDS = 10;
/** Distance every outline keeps from anything blocked, from the ring and from the water. */
export const FIELD_MARGIN_M = 0.08;
const REACH_M = 3.2;
const SITE_SPACING_M = 1.1;
const CAP_RADIUS_M = 0.62;
const PATH_INSET_M = 0.09;
const MIN_AREA_M2 = 0.16;
const CAP_SIDES = 24;
const TAU = 6.283185307179586;

/** Convex polygon clipped to the half-plane a*x + b*z <= c (Sutherland-Hodgman). */
function clip(poly: Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const dp = a * p.x + b * p.z - c;
    const dq = a * q.x + b * q.z - c;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
    }
  }
  return out;
}

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

interface Site extends Pt {
  weight: number;
}

/** The convex cell of a site: its cap polygon cut by the power bisectors with the other sites. */
function cell(site: Site, sites: Site[]): Pt[] {
  let poly: Pt[] = [];
  for (let i = 0; i < CAP_SIDES; i++) {
    const t = (i / CAP_SIDES) * TAU;
    poly.push({ x: site.x + CAP_RADIUS_M * detCos(t), z: site.z + CAP_RADIUS_M * detSin(t) });
  }
  for (const o of sites) {
    if (o === site) continue;
    const dx = o.x - site.x;
    const dz = o.z - site.z;
    if (dx * dx + dz * dz > 4 * CAP_RADIUS_M * CAP_RADIUS_M) continue;
    // |p - s|^2 - ws <= |p - o|^2 - wo
    const a = 2 * dx;
    const b = 2 * dz;
    const c = o.x * o.x + o.z * o.z - site.x * site.x - site.z * site.z - (o.weight - site.weight);
    poly = clip(poly, a, b, c);
    if (poly.length < 3) return [];
  }
  return poly;
}

/** Moves a convex polygon's edges inwards by d (each edge's line shifted, the polygon cut by all). */
function inset(poly: Pt[], d: number): Pt[] {
  let out = poly;
  for (let i = 0; i < poly.length && out.length >= 3; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const ex = q.x - p.x;
    const ez = q.z - p.z;
    const len = Math.sqrt(ex * ex + ez * ez);
    if (len < 1e-9) continue;
    // Counter-clockwise polygon: the inside is on the left, the outward normal is (ez, -ex).
    const nx = ez / len;
    const nz = -ex / len;
    out = clip(out, nx, nz, nx * p.x + nz * p.z - d);
  }
  return out;
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

  // Candidate sites on a hashed, jittered spiral, nearest first with noise.
  const candidates: { x: number; z: number; score: number }[] = [];
  const step = 0.3;
  for (let r = inner + 0.45, ring = 0; r < ringRadius + REACH_M; r += step, ring++) {
    const count = Math.max(6, Math.floor((TAU * r) / step));
    for (let i = 0; i < count; i++) {
      const jr = hash01(seed, ring, i, 1) - 0.5;
      const ja = hash01(seed, ring, i, 2) - 0.5;
      const rr = r + jr * step;
      const a = ((i + ja) / count) * TAU + hash01(seed, ring, 0, 3) * TAU;
      const x = centre.x + rr * detCos(a);
      const z = centre.z + rr * detSin(a);
      candidates.push({ x, z, score: rr + 1.1 * hash01(seed, ring, i, 4) });
    }
  }
  candidates.sort((a, b) => a.score - b.score);

  const roomAround = (x: number, z: number): boolean => {
    let ok = 0;
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * TAU;
      if (clear(x + 0.45 * detCos(t), z + 0.45 * detSin(t))) ok++;
    }
    return ok >= 6;
  };
  const sites: Site[] = [];
  for (const c of candidates) {
    if (sites.length >= want) break;
    if (!clear(c.x, c.z) || !roomAround(c.x, c.z)) continue;
    let near = false;
    for (const s of sites) {
      const dx = s.x - c.x;
      const dz = s.z - c.z;
      if (dx * dx + dz * dz < SITE_SPACING_M * SITE_SPACING_M) {
        near = true;
        break;
      }
    }
    if (near) continue;
    const w = 0.35 * hash01(seed, sites.length, 0, 5);
    sites.push({ x: c.x, z: c.z, weight: w });
  }

  // Lloyd relaxation: a site moves to its cell's centroid when that spot is still free.
  for (let round = 0; round < 2; round++) {
    const moved = sites.map((s) => {
      const poly = cell(s, sites);
      if (poly.length < 3) return s;
      const c = centroid(poly);
      return clear(c.x, c.z) ? { ...s, x: c.x, z: c.z } : s;
    });
    for (let i = 0; i < sites.length; i++) sites[i] = moved[i]!;
  }

  const fields: Field[] = [];
  const cropOffset = hash32(seed, 77) % input.crops.length;
  for (let i = 0; i < sites.length; i++) {
    const shaped = shapeField(sites[i]!, sites, seed, i, clear);
    if (!shaped) continue;
    fields.push({
      id: 0,
      crop: input.crops[0]!,
      outline: shaped.outline,
      centre: shaped.centre,
      area: shaped.area,
      furrowAngle: shaped.furrowAngle,
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
  site: Site,
  sites: Site[],
  seed: number,
  index: number,
  clear: (x: number, z: number) => boolean,
): { outline: Pt[]; centre: Pt; area: number; furrowAngle: number } | undefined {
  const base = cell(site, sites);
  if (base.length < 3) return undefined;
  const path = inset(base, PATH_INSET_M);
  if (path.length < 3) return undefined;
  const c0 = centroid(path);
  let outline = chaikin(chaikin(path));
  // Low-frequency wobble: the radius shrinks by up to 14%, never grows, so the cell still holds it.
  const p2 = hash01(seed, index, 0, 21) * TAU;
  const p3 = hash01(seed, index, 0, 22) * TAU;
  outline = outline.map((p) => {
    const a = detAtan2(p.z - c0.z, p.x - c0.x);
    const w = 0.6 * detSin(2 * a + p2) + 0.4 * detSin(3 * a + p3);
    const f = 1 - 0.14 * (0.5 - 0.5 * w);
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
  return { outline, centre, area: a, furrowAngle: furrowAngleOf(outline, centre, seed, index) };
}

function outlineIsClear(
  outline: Pt[],
  centre: Pt,
  clear: (x: number, z: number) => boolean,
): boolean {
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i]!;
    const q = outline[(i + 1) % outline.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.05));
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

/** Long axis of the outline (second moments of its vertices), turned a little by the hash. */
function furrowAngleOf(outline: Pt[], c: Pt, seed: number, index: number): number {
  let sxx = 0,
    szz = 0,
    sxz = 0;
  for (const p of outline) {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    sxx += dx * dx;
    szz += dz * dz;
    sxz += dx * dz;
  }
  const axis = 0.5 * detAtan2(2 * sxz, sxx - szz);
  return axis + (hash01(seed, index, 0, 31) - 0.5) * 0.6;
}
