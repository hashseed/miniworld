// The rounded clay edge at the coasts (spec milestone 1, section 4.2): near
// the sea, land rises at most cap(d) metres at d km from today's coast, after
// a flat beach. Shared by the terrain shader and the data build.

export const COAST_BEACH_KM = 2;
/** Metres per km at the coast. */
export const COAST_SLOPE = 6;
/** Extra metres per km². */
export const COAST_CURVE = 0.08;

/** Highest rise in metres the cap allows at d km from the coast. */
export function coastCap(dKm: number): number {
  const d = Math.max(0, dKm - COAST_BEACH_KM);
  return d * (COAST_SLOPE + COAST_CURVE * d);
}

/** Distance from the coast in km at which the cap allows a rise of riseM metres. */
export function coastKmForRise(riseM: number): number {
  const s = COAST_SLOPE;
  const c = COAST_CURVE;
  return COAST_BEACH_KM + (-s + Math.sqrt(s * s + 4 * c * Math.max(0, riseM))) / (2 * c);
}
