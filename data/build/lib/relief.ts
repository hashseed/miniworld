// The famous mountains that keep their real shape among the smoother land
// (spec milestone 1, section 4.2).

import { forCellsNearLine } from './coast.ts';
import { Grid } from './grid.ts';

/** Width (km) over which a listed mountain blends into the steps around it. */
export const MOUNTAIN_BLEND_KM = 60;

export interface Mountain {
  id: string;
  name: string;
  /** Why history needs it; kept in the data only. */
  reason: string;
  source: string;
  /** A range is a crest line; a peak is a single point. */
  kind: 'range' | 'peak';
  /** [lon, lat] points along the crest, or the one point of a peak. */
  line: [number, number][];
  /** Half-width of a range, or radius of a peak's cone, in km. */
  widthKm: number;
}

export function validateMountains(mountains: Mountain[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const m of mountains) {
    if (ids.has(m.id)) errors.push(`mountain ${m.id}: duplicate id`);
    ids.add(m.id);
    if (!m.source) errors.push(`mountain ${m.id}: no source`);
    if (!m.reason) errors.push(`mountain ${m.id}: no reason`);
    if (m.kind !== 'range' && m.kind !== 'peak') errors.push(`mountain ${m.id}: bad kind`);
    if (m.kind === 'range' && m.line.length < 2)
      errors.push(`mountain ${m.id}: range needs a line`);
    if (m.kind === 'peak' && m.line.length !== 1)
      errors.push(`mountain ${m.id}: peak needs one point`);
    if (!(m.widthKm > 0)) errors.push(`mountain ${m.id}: bad width`);
    for (const [lon, lat] of m.line)
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) errors.push(`mountain ${m.id}: bad position`);
  }
  return errors;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Weight per cell, 0 to 1, of how much a kind of listed mountain keeps its
 * real height: 1 within its width, falling smoothly to 0 over MOUNTAIN_BLEND_KM.
 */
export function mountainWeights(
  g: { width: number; height: number },
  mountains: Mountain[],
  kind: Mountain['kind'],
): Float32Array {
  const w = new Float32Array(g.width * g.height);
  for (const m of mountains) {
    if (m.kind !== kind) continue;
    const line = m.line.length === 1 ? [m.line[0]!, m.line[0]!] : m.line;
    forCellsNearLine(g, line, m.widthKm + MOUNTAIN_BLEND_KM, (i, d) => {
      const k = 1 - smoothstep(m.widthKm, m.widthKm + MOUNTAIN_BLEND_KM, d);
      if (k > w[i]!) w[i] = k;
    });
  }
  return w;
}

/**
 * Lays a smooth cone for every listed peak (section 4.2): its height is the
 * highest value of `peak` within half its radius, falling to nothing at its
 * radius with a rounded top and foot; land is never lowered.
 */
export function addPeaks(out: Int16Array, g: Grid, peak: Grid, mountains: Mountain[]): void {
  for (const m of mountains) {
    if (m.kind !== 'peak') continue;
    const at = [m.line[0]!, m.line[0]!];
    let top = 0;
    forCellsNearLine(g, at, m.widthKm / 2, (i) => (top = Math.max(top, peak.data[i]!)));
    forCellsNearLine(g, at, m.widthKm, (i, d) => {
      if (out[i]! <= 0) return;
      const t = d / m.widthKm;
      const cone = top * (1 - t * t) * (1 - t * t);
      if (cone > out[i]!) out[i] = Math.round(cone);
    });
  }
}

/**
 * The land (section 4.2): `plain` (smoothed more), except where a listed
 * range keeps `range` (smoothed less) and a listed peak stands as a cone from
 * `peak`; land and sea floor are decided by `normal` (the normal smoothing). The layers are drawn by the
 * app.
 */
export function famousRelief(
  plain: Grid,
  normal: Grid,
  range: Grid,
  peak: Grid,
  mountains: Mountain[],
): Grid {
  const n = plain.width * plain.height;
  const out = new Int16Array(n);
  const ranges = mountainWeights(plain, mountains, 'range');
  for (let i = 0; i < n; i++) {
    const real = normal.data[i]!;
    if (real <= 0) {
      out[i] = real;
      continue;
    }
    let h = Math.max(plain.data[i]!, 1);
    h += (Math.max(range.data[i]!, 1) - h) * ranges[i]!;
    out[i] = Math.max(1, Math.round(h));
  }
  addPeaks(out, plain, peak, mountains);
  return new Grid(plain.width, plain.height, out);
}
