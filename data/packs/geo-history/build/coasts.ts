// Today's coasts on the plates (geo-history.md, section 1): the Natural Earth
// land outlines, simplified, and cut into pieces that each move with the plate
// whose continent polygon of the model they lie in at 0 Ma.

import { simplifyLine, type Pt } from './line.ts';

type V3 = [number, number, number];

function unit(lat: number, lon: number): V3 {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

interface Poly {
  plate: number;
  pts: V3[];
  centre: V3;
  /** Cosine of the largest angle from the centre to a vertex, widened a little. */
  cosRadius: number;
}

export interface Land {
  plate: number;
  begin: number;
  end: number;
  rings: number[][];
}

/** The model's continent polygons that exist today. */
export function todaysPolygons(land: Land[]): Poly[] {
  const out: Poly[] = [];
  for (const f of land) {
    if (f.end > 0 || !f.rings[0]) continue;
    const r = f.rings[0];
    const pts: V3[] = [];
    for (let i = 0; i + 1 < r.length; i += 2) pts.push(unit(r[i]!, r[i + 1]!));
    const s: V3 = [0, 0, 0];
    for (const p of pts) for (let k = 0; k < 3; k++) s[k]! += p[k]!;
    const n = Math.hypot(...s) || 1;
    const centre: V3 = [s[0] / n, s[1] / n, s[2] / n];
    let min = 1;
    for (const p of pts)
      min = Math.min(min, centre[0] * p[0] + centre[1] * p[1] + centre[2] * p[2]);
    out.push({
      plate: f.plate,
      pts,
      centre,
      cosRadius: Math.cos(Math.acos(Math.max(-1, min)) + 0.02),
    });
  }
  return out;
}

/** Whether the point lies inside the polygon: the winding of the ring about the point, projected about it. */
function inside(p: V3, poly: Poly): boolean {
  const helper: V3 = Math.abs(p[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1: V3 = [
    helper[1] * p[2] - helper[2] * p[1],
    helper[2] * p[0] - helper[0] * p[2],
    helper[0] * p[1] - helper[1] * p[0],
  ];
  const l = Math.hypot(...e1);
  for (let k = 0; k < 3; k++) e1[k]! /= l;
  const e2: V3 = [
    p[1] * e1[2] - p[2] * e1[1],
    p[2] * e1[0] - p[0] * e1[2],
    p[0] * e1[1] - p[1] * e1[0],
  ];
  const xy: [number, number][] = poly.pts.map((q) => {
    const k = 1 / Math.max(1 + p[0] * q[0] + p[1] * q[1] + p[2] * q[2], 1e-6);
    return [
      (q[0] * e1[0] + q[1] * e1[1] + q[2] * e1[2]) * k,
      (q[0] * e2[0] + q[1] * e2[1] + q[2] * e2[2]) * k,
    ];
  });
  let wind = 0;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i]!;
    const b = xy[(i + 1) % xy.length]!;
    if (a[1] <= 0) {
      if (b[1] > 0 && a[0] * b[1] - a[1] * b[0] > 0) wind++;
    } else if (b[1] <= 0 && a[0] * b[1] - a[1] * b[0] < 0) wind--;
  }
  return wind !== 0;
}

/** The plate under a point: the polygon it lies in, else the one with the nearest vertex. */
export function plateAt(lat: number, lon: number, polys: Poly[]): number {
  const p = unit(lat, lon);
  let nearest = 0;
  let best = -2;
  for (const poly of polys) {
    const c = poly.centre[0] * p[0] + poly.centre[1] * p[1] + poly.centre[2] * p[2];
    if (c >= poly.cosRadius && inside(p, poly)) return poly.plate;
    if (c > best) {
      best = c;
      nearest = poly.plate;
    }
  }
  return nearest;
}

interface GeoJson {
  features: { geometry: { type: string; coordinates: unknown } }[];
}

/** Outer rings of the land polygons as [lat, lon] points. */
function landRings(doc: GeoJson): Pt[][] {
  const rings: Pt[][] = [];
  const add = (poly: number[][][]): void => {
    for (const ring of poly) rings.push(ring.map((c) => [c[1]!, c[0]!] as Pt));
  };
  for (const f of doc.features) {
    const g = f.geometry;
    if (g.type === 'Polygon') add(g.coordinates as number[][][]);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates as number[][][][]) add(p);
  }
  return rings;
}

/** Today's coastlines as polylines, each tagged with the plate it moves with. */
export function buildCoasts(doc: GeoJson, land: Land[]): { plate: number; line: number[] }[] {
  const polys = todaysPolygons(land);
  const out: { plate: number; line: number[] }[] = [];
  for (const ring of landRings(doc)) {
    if (ring.length < 4) continue;
    const kept = simplifyLine(ring, 0.1, true);
    if (kept.length < 3) continue;
    // Close the loop so its last edge is drawn.
    const pts = [...kept, kept[0]!];
    let plate = plateAt(pts[0]![0], pts[0]![1], polys);
    let run: number[] = [pts[0]![0], pts[0]![1]];
    for (let i = 1; i < pts.length; i++) {
      const [lat, lon] = pts[i]!;
      const p = plateAt(lat, lon, polys);
      if (p === plate) run.push(round(lat), round(lon));
      else {
        // The piece ends at this vertex, which is shared, and a new one starts there.
        run.push(round(lat), round(lon));
        if (run.length >= 4) out.push({ plate, line: run });
        plate = p;
        run = [round(lat), round(lon)];
      }
    }
    if (run.length >= 4) out.push({ plate, line: run });
  }
  return out;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
