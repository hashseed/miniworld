// Fills a polygon on the sphere with small triangles (geo-history.md, section
// 5.2). The ring is projected stereographically about its own centre, which
// keeps it undistorted for any polygon smaller than a hemisphere, cut into
// triangles by ear clipping, and the triangles are split until none is longer
// than a degree or two, so the drawn surface follows the sphere.

import * as THREE from 'three';

export type V3 = [number, number, number];

export function latLonToUnit(lat: number, lon: number): V3 {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  // The engine's drawn frame (geo/cube.ts): y north, longitude 0 along +z.
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}

function normalize(v: V3): V3 {
  const n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
}

function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Direction of the middle of the ring's points. */
export function centreOf(points: V3[]): V3 {
  const s: V3 = [0, 0, 0];
  for (const p of points) {
    s[0] += p[0];
    s[1] += p[1];
    s[2] += p[2];
  }
  return Math.hypot(s[0], s[1], s[2]) < 1e-9 ? points[0]! : normalize(s);
}

/**
 * Triangles (flat x, y, z of unit vectors) filling the polygon of `rings`
 * (flat lat, lon pairs; the first ring is the outline, the others are holes).
 * `maxAngle` is the longest edge allowed, in radians.
 */
export function tessellate(rings: number[][], maxAngle = 0.03): number[] {
  const unit = rings.map((r) => {
    const pts: V3[] = [];
    for (let i = 0; i + 1 < r.length; i += 2) pts.push(latLonToUnit(r[i]!, r[i + 1]!));
    return pts;
  });
  const outline = unit[0];
  if (!outline || outline.length < 3) return [];
  const c = centreOf(outline);
  // An axis that is not near the centre, to build the projection plane.
  const helper: V3 = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = normalize(cross(helper, c));
  const e2 = cross(c, e1);
  const project = (p: V3): THREE.Vector2 => {
    const k = 1 / Math.max(1 + dot(p, c), 1e-6);
    return new THREE.Vector2(dot(p, e1) * k, dot(p, e2) * k);
  };
  const contour = outline.map(project);
  const holes = unit.slice(1).map((h) => h.map(project));
  const all = [...outline, ...unit.slice(1).flat()];
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  const out: number[] = [];
  const split = (a: V3, b: V3, d: V3): void => {
    const longest = Math.min(dot(a, b), dot(b, d), dot(d, a));
    if (Math.acos(Math.max(-1, longest)) <= maxAngle) {
      out.push(...a, ...b, ...d);
      return;
    }
    const ab = normalize([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
    const bd = normalize([b[0] + d[0], b[1] + d[1], b[2] + d[2]]);
    const da = normalize([d[0] + a[0], d[1] + a[1], d[2] + a[2]]);
    split(a, ab, da);
    split(ab, b, bd);
    split(da, bd, d);
    split(ab, bd, da);
  };
  for (const f of faces) split(all[f[0]!]!, all[f[1]!]!, all[f[2]!]!);
  return out;
}
