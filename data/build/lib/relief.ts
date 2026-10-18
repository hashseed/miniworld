// The famous mountains that keep their shape on the smoothed map (spec
// milestone 1, section 4.2): ranges with less smoothing, peaks as cones.

import { coastKmForRise } from '../../../app/src/planet/surface.ts';
import { forCellsNearLine } from './coast.ts';
import { Grid } from './grid.ts';

/** Width (km) over which a listed range blends into the land around it. */
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
  /** A peak's summit height in metres. */
  heightM?: number;
}

/**
 * Share of a peak's real height its cone reaches: a little more than the
 * smoothing leaves of the ranges, so snow-capped peaks such as Mount Fuji
 * and Kilimanjaro carry a broad cap above the snow line (section 5.2).
 */
export const PEAK_HEIGHT_SHARE = 0.7;
/**
 * Under a peak's cone the coast distance may grow at most this many times,
 * so a peak near the sea, such as Mount Fuji, stands whole but still slopes
 * down to the shore instead of standing as a wall.
 */
export const PEAK_COAST_STRETCH = 10;

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
    if (m.kind === 'peak' && !(m.heightM! > 0 && m.heightM! < 9000))
      errors.push(`mountain ${m.id}: peak needs its height`);
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

/** Height in metres of a peak's cone at t of its radius (0 at the summit, 1 at the foot). */
function coneM(m: Mountain, t: number): number {
  const k = 1 - t * t;
  return (m.heightM ?? 0) * PEAK_HEIGHT_SHARE * k * k;
}

/**
 * Raises the stored coast distance under every listed peak's cone, so the
 * rounded coast edge (section 4.2) never flattens a peak near the sea, such
 * as Mount Fuji. Changes the grid in place.
 */
export function allowPeaksAtCoast(coast: Grid<Uint8Array>, mountains: Mountain[]): void {
  for (const m of mountains) {
    if (m.kind !== 'peak') continue;
    const at = [m.line[0]!, m.line[0]!];
    forCellsNearLine(coast, at, m.widthKm, (i, d) => {
      const km = coast.data[i]!;
      // Room for twice the cone and the land's lift, so the soft cap leaves it whole.
      const need = Math.ceil(coastKmForRise(2 * coneM(m, d / m.widthKm) + 500));
      const raised = Math.min(255, need, km * PEAK_COAST_STRETCH);
      if (raised > km) coast.data[i] = raised;
    });
  }
}

/**
 * Lays a smooth cone for every listed peak (section 4.2): PEAK_HEIGHT_SHARE
 * of its summit height, falling to nothing at its radius with a rounded top
 * and foot; nothing is lowered.
 */
export function addPeaks(out: Int16Array, g: Grid, mountains: Mountain[]): void {
  for (const m of mountains) {
    if (m.kind !== 'peak') continue;
    const at = [m.line[0]!, m.line[0]!];
    // Also over smoothed sea floor: the coast decides what is land, and
    // narrow islands such as Honshu are below sea level once smoothed.
    forCellsNearLine(g, at, m.widthKm, (i, d) => {
      const cone = coneM(m, d / m.widthKm);
      if (cone > out[i]!) out[i] = Math.round(cone);
    });
  }
}

/**
 * The land (section 4.2): `plain` (the normal smoothing), except where a
 * listed range keeps `range` (smoothed less) and a listed peak stands as a
 * cone; the sea floor stays as in `plain`.
 */
export function famousRelief(plain: Grid, range: Grid, mountains: Mountain[]): Grid {
  const n = plain.width * plain.height;
  const out = new Int16Array(n);
  const ranges = mountainWeights(plain, mountains, 'range');
  for (let i = 0; i < n; i++) {
    const h = plain.data[i]!;
    if (h <= 0 || ranges[i]! <= 0) {
      out[i] = h;
      continue;
    }
    out[i] = Math.round(h + (Math.max(range.data[i]!, 1) - h) * ranges[i]!);
  }
  addPeaks(out, plain, mountains);
  return new Grid(plain.width, plain.height, out);
}
