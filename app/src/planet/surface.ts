// How the drawn surface follows from the data at a place (spec milestone 1,
// sections 4.2, 4.4 and 5.2). The terrain shader takes these constants, and
// the planet query and the foliage apply the same rules, so whatever stands
// on the ground stands on the surface that is drawn.

/** Metres every land vertex stands above its height, so continents read as toy slabs (section 4.2). */
export const LAND_LIFT_M = 250;
/**
 * Ice sheets rise from their border as smooth domes, ICE_DOME_M at most,
 * reaching 63% of it ICE_DOME_KM inside; the relief under them is hidden over
 * the first ICE_HIDE_KM (section 5.2).
 */
export const ICE_DOME_M = 1200;
export const ICE_DOME_KM = 250;
export const ICE_HIDE_KM = 120;
/**
 * Near the sea, land may rise at most coastCap(d) metres at d km from today's
 * coast (after a flat beach), so at 100x relief every coast and ice margin is
 * a rounded clay edge rather than a wall; further inland the cap grows fast
 * enough to leave mountains alone (section 4.2).
 */
export const COAST_BEACH_KM = 2;
export const COAST_SLOPE = 12; // m per km at the coast
export const COAST_CURVE = 0.15; // extra m per km²
/** The lake field marks a lake where it passes this value (section 5.1). */
export const LAKE_FIELD = 0.5;

/** The terrain data at one place, interpolated. */
export interface Ground {
  /** Smoothed height in metres. */
  height: number;
  /** Sea level in metres at which the place is sea (section 5.1). */
  oceanLevel: number;
  /** Lake field 0..1. */
  lake: number;
  /** Heavily smoothed bed under the ice sheets in metres. */
  bed: number;
  /** Distance from today's coast in km, 255 meaning far inland. */
  coastKm: number;
}

/** Whether the ocean reaches a place at a sea level. */
export function isSea(g: Ground, seaLevel: number): boolean {
  return seaLevel - g.oceanLevel > 0;
}

/** Drawn surface in metres without ice: the sea, or land and lake beds on their lift with rounded coasts. */
export function groundM(g: Ground, seaLevel: number): number {
  if (isSea(g, seaLevel)) return seaLevel;
  // The smoothed coast can leave sea floor on the land side.
  let surface = g.lake > LAKE_FIELD ? g.height : Math.max(g.height, seaLevel);
  surface += LAND_LIFT_M;
  const d = Math.max(g.coastKm - COAST_BEACH_KM, 0);
  const cap = d * (COAST_SLOPE + COAST_CURVE * d) + 1e-3;
  const rise = Math.max(surface - seaLevel, 0);
  const q = rise / cap;
  return seaLevel + rise / Math.sqrt(Math.sqrt(1 + q * q * q * q));
}

/** Drawn surface in metres including the ice sheets, iceKm being the signed distance inside the ice border. */
export function surfaceM(g: Ground, seaLevel: number, iceKm: number): number {
  const surface = groundM(g, seaLevel);
  const sheet = smoothstep(0, ICE_HIDE_KM, iceKm);
  if (sheet <= 0) return surface;
  const iceTop =
    Math.max(g.bed, seaLevel) +
    LAND_LIFT_M +
    ICE_DOME_M * (1 - Math.exp(-Math.max(iceKm, 0) / ICE_DOME_KM));
  return surface + (iceTop - surface) * sheet;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
