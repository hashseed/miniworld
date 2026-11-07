// Douglas-Peucker simplification of a line or ring of [lat, lon] points, in
// degrees, with longitudes unwrapped so a shape across the antimeridian is
// simplified as one piece.

export type Pt = [number, number];

function unwrap(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  let shift = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (i > 0) {
      const prev = pts[i - 1]!;
      const d = p[1] - prev[1];
      if (d > 180) shift -= 360;
      else if (d < -180) shift += 360;
    }
    out.push([p[0], p[1] + shift]);
  }
  return out;
}

function wrap(lon: number): number {
  let v = lon;
  while (v > 180) v -= 360;
  while (v < -180) v += 360;
  return v;
}

function distance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[1] - a[1];
  const dy = b[0] - a[0];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[1] - a[1]) * dx + (p[0] - a[0]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[1] - (a[1] + t * dx), p[0] - (a[0] + t * dy));
}

function dp(pts: Pt[], first: number, last: number, tol: number, keep: boolean[]): void {
  const stack: [number, number][] = [[first, last]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = distance(pts[i]!, pts[lo]!, pts[hi]!);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tol && at > 0) {
      keep[at] = true;
      stack.push([lo, at], [at, hi]);
    }
  }
}

/** Simplified copy of `points`; a closed ring keeps at least three points. */
export function simplifyLine(points: Pt[], tolerance: number, closed: boolean): Pt[] {
  if (points.length <= (closed ? 3 : 2)) return points.map((p) => [p[0], p[1]]);
  const pts = unwrap(points);
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  if (closed) {
    // Split the ring at its farthest point from the start, so it simplifies as two lines.
    let far = 1;
    let best = -1;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i]![0] - pts[0]![0], pts[i]![1] - pts[0]![1]);
      if (d > best) {
        best = d;
        far = i;
      }
    }
    keep[far] = true;
    dp(pts, 0, far, tolerance, keep);
    dp(pts, far, pts.length - 1, tolerance, keep);
  } else dp(pts, 0, pts.length - 1, tolerance, keep);
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push([pts[i]![0], wrap(pts[i]![1])]);
  return out;
}
