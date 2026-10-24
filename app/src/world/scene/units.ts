// Scales, paces and small geometry of the tree scene (spec milestone-2 section 5.1, humankind.md
// section 8.1): drawn and layout metres, figures' paces, places in microdegrees, looks by hash.

import { hash32 } from '../../core/hash.ts';
import { detCos, RAD } from '../../core/detmath.ts';
import type { TreeLodging } from '../tree.ts';
import type { FigureLook } from './types.ts';

/**
 * Drawn kilometres per life-size metre of a figure: 1.7 times a vignette's 50 (milestone 2,
 * section 5.1; Yang, 2026-10-18: "make the humans and their buildings/fire places 70% larger").
 */
export const FIGURE_KM_PER_M = 72.25;

/**
 * Figures act this many times faster than life: their clips play faster and they cover
 * ground faster, so the feet still do not slide (Yang, 2026-10-18: livelier camps).
 */
export const TEMPO = 3.6;

/** A figure's walking pace in life-size metres per second, matching the walk clip's stride. */
export const WALK_M_PER_S = 1.2;

/** Running and carrying paces, matching those clips' strides at the same leg length. */
export const RUN_M_PER_S = 4.2;

export const CARRY_M_PER_S = 0.87;

/** The camp layout is drawn three times smaller than the figures (milestone 2, section 5.1). */
export const LAYOUT_KM_PER_M = FIGURE_KM_PER_M / 3;

/** Drawn kilometres a figure covers per millisecond of watching. */
export const WALK_KM_PER_MS = (TEMPO * WALK_M_PER_S * FIGURE_KM_PER_M) / 1000;

/** Layout metres covered per millisecond of watching, by clip. */
export const PACE: Record<
  'walk' | 'run' | 'carry' | 'pole' | 'crouch' | 'bearBehind' | 'bearAhead',
  number
> = {
  walk: (WALK_M_PER_S * 3 * TEMPO) / 1000,
  run: (RUN_M_PER_S * 3 * TEMPO) / 1000,
  carry: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
  pole: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
  bearBehind: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
  bearAhead: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
  crouch: (WALK_M_PER_S * 0.55 * 3 * TEMPO) / 1000,
};

/** Moves shorter than this are within the camp and not walked. */
export const SAME_PLACE_KM = 1;

export const KM_PER_DEG = 111.195;

/** The look of a figure: the first person keeps hers; the others are women, men and children. */
export function lookOf(id: number): FigureLook {
  if (id === 0) return 'founder';
  return (['woman', 'man', 'child'] as const)[hash32(id, 31) % 3]!;
}

export const deg = (micro: number) => micro / 1e6;

/** Degrees east from one longitude to another, the short way round, across the date line too. */
export const eastOf = (from: number, to: number): number => {
  const d = to - from;
  return d > 180 ? d - 360 : d < -180 ? d + 360 : d;
};

/** A longitude brought back between -180 and 180. */
export const wrapLon = (lon: number): number =>
  lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon;

/** A place in degrees. */
export interface LatLon {
  lat: number;
  lon: number;
}

export function kmBetween(a: LatLon, b: LatLon): number {
  const x = eastOf(a.lon, b.lon) * detCos(((a.lat + b.lat) / 2) * RAD);
  const y = b.lat - a.lat;
  return Math.sqrt(x * x + y * y) * KM_PER_DEG;
}

export const placeOf = (l: TreeLodging): LatLon => ({ lat: deg(l.lat), lon: deg(l.lon) });

export interface Pt {
  x: number;
  z: number;
}

export const smoothstep = (x: number) => x * x * (3 - 2 * x);
