// Wildlife ground masks (spec wildlife.md, section 4): for every group, which
// cells around its home are open lowland, so its animals never climb into
// the mountains or walk into the sea; for sea animals, which cells are open
// sea deep enough to be sea at every date. The world picks spots only in
// open cells; birds fly over anything and get no mask.

import {
  encodeWildMask,
  flies,
  swims,
  roamOf,
  wildMaskCell,
  WILD_MASK_N,
  type WildGroup,
} from '../../../app/src/world/wildlife.ts';

/** Sea animals keep to water at least this deep (metres), sea at every date (section 4). */
export const SEA_DEPTH_M = 300;
/** Open ground lies at most this far above the home (metres). */
export const RISE_M = 500;
/** ... and climbs at most this much between points this far apart (metres, km). */
export const SLOPE_M = 300;
const SLOPE_KM = 40;
const KM_PER_DEG = 111.2;

export interface WildGround {
  /** Height of the drawn ground in metres. */
  height(lat: number, lon: number): number;
  /** Sea or lake at today's level. */
  wet(lat: number, lon: number): boolean;
}

/** Degrees of a point km east and north of a home. */
function at(g: WildGroup, east: number, north: number): [number, number] {
  const lat = g.lat + north / KM_PER_DEG;
  const lon = g.lon + east / (KM_PER_DEG * Math.cos((g.lat * Math.PI) / 180));
  return [lat, ((lon + 540) % 360) - 180];
}

/** Whether a point is open lowland for a group whose home stands at homeM. */
function openAt(ground: WildGround, lat: number, lon: number, homeM: number): boolean {
  if (ground.wet(lat, lon)) return false;
  const h = ground.height(lat, lon);
  if (h > homeM + RISE_M) return false;
  const dLat = SLOPE_KM / KM_PER_DEG;
  const dLon = dLat / Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  for (const [a, b] of [
    [dLat, 0],
    [-dLat, 0],
    [0, dLon],
    [0, -dLon],
  ] as const)
    if (Math.abs(ground.height(lat + a, lon + b) - h) > SLOPE_M) return false;
  return true;
}

/**
 * The ground mask of every group as hex strings in the order of the groups
 * (section 4), '' for birds. The home cell is always open.
 */
export function wildMasks(groups: readonly WildGroup[], ground: WildGround): string[] {
  return groups.map((g) => {
    if (flies(g)) return '';
    const homeM = ground.height(g.lat, g.lon);
    const sea = swims(g);
    const mask = new Uint8Array(WILD_MASK_N * WILD_MASK_N);
    for (let j = 0; j < WILD_MASK_N; j++)
      for (let i = 0; i < WILD_MASK_N; i++) {
        const [e, n] = wildMaskCell(g, i, j);
        const [lat, lon] = at(g, e, n);
        const open = sea
          ? ground.wet(lat, lon) && ground.height(lat, lon) < -SEA_DEPTH_M
          : openAt(ground, lat, lon, homeM);
        mask[j * WILD_MASK_N + i] = open ? 1 : 0;
      }
    const home = WILD_MASK_N / 2;
    for (const j of [home - 1, home])
      for (const i of [home - 1, home]) mask[j * WILD_MASK_N + i] = 1;
    return encodeWildMask(mask);
  });
}

/** Share of the cells within the roaming radius that are open, for the build log. */
export function openShare(g: WildGroup, hex: string): number {
  if (!hex) return 1;
  let open = 0;
  let all = 0;
  const roam = roamOf(g);
  for (let j = 0; j < WILD_MASK_N; j++)
    for (let i = 0; i < WILD_MASK_N; i++) {
      const [e, n] = wildMaskCell(g, i, j);
      if (e * e + n * n > roam * roam) continue;
      all++;
      const k = j * WILD_MASK_N + i;
      open += (parseInt(hex[k >> 2]!, 16) >> (3 - (k & 3))) & 1;
    }
  return all ? open / all : 1;
}
