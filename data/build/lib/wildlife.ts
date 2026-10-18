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
import { dirToLatLon, latLonToDir } from '../../../app/src/geo/cube.ts';
import { EARTH_RADIUS_KM, northEast, type Vec3Like } from '../../../app/src/geo/earth.ts';

/** Sea animals keep to water at least this deep (metres), sea at every date (section 4). */
export const SEA_DEPTH_M = 300;
/** ... and stay at least this far from any land (km; Yang, 2026-10-18: "sea cows are too close the land"). */
export const SEA_COAST_KM = 150;
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
  /** A lake (not the sea). */
  lake?(lat: number, lon: number): boolean;
}

function vec(x: number, y: number, z: number): Vec3Like {
  const v = {
    x,
    y,
    z,
    set: (a: number, b: number, c: number) => Object.assign(v, { x: a, y: b, z: c }),
  };
  return v;
}

/**
 * Degrees of a point km east and north of a home, on the plane touching the
 * globe there, as the wildlife layer places animals.
 */
function at(g: WildGroup, east: number, north: number): [number, number] {
  const home = latLonToDir(g.lat, g.lon);
  const up = vec(...home);
  const n = vec(0, 0, 0);
  const e = vec(0, 0, 0);
  northEast(up, n, e);
  const d: [number, number, number] = [
    home[0] * EARTH_RADIUS_KM + e.x * east + n.x * north,
    home[1] * EARTH_RADIUS_KM + e.y * east + n.y * north,
    home[2] * EARTH_RADIUS_KM + e.z * east + n.z * north,
  ];
  const len = Math.hypot(...d);
  const { lat, lon } = dirToLatLon([d[0] / len, d[1] / len, d[2] / len]);
  return [lat, lon];
}

/**
 * Keeps only the open cells a walk can reach from the open cell nearest the
 * home, through open cells, so animals never cross a sea or strait to other
 * land (or land to other seas) inside their roaming area (section 4).
 */
function reachable(mask: Uint8Array): void {
  const N = WILD_MASK_N;
  let start = -1;
  let best = Infinity;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const d = (i - (N - 1) / 2) ** 2 + (j - (N - 1) / 2) ** 2;
      if (mask[j * N + i] === 1 && d < best) {
        best = d;
        start = j * N + i;
      }
    }
  const seen = new Uint8Array(N * N);
  if (start >= 0) {
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const k = stack.pop()!;
      const i = k % N;
      const j = (k - i) / N;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const q = b * N + a;
        if (mask[q] === 1 && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
  }
  mask.set(seen);
}

/** Whether a point is open sea, deep enough and at least SEA_COAST_KM from any land. */
function openSea(ground: WildGround, g: WildGroup, east: number, north: number): boolean {
  const deep = (e: number, n: number) => {
    const [lat, lon] = at(g, e, n);
    return ground.wet(lat, lon) && ground.height(lat, lon) < -SEA_DEPTH_M;
  };
  if (!deep(east, north)) return false;
  const d = SEA_COAST_KM;
  const r = d * 0.7071;
  return (
    [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
      [r, r],
      [r, -r],
      [-r, r],
      [-r, -r],
    ] as const
  ).every(([de, dn]) => {
    const [lat, lon] = at(g, east + de, north + dn);
    return ground.wet(lat, lon);
  });
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
    // The sea floor beyond a coast is no slope to climb.
    if (!ground.wet(lat + a, lon + b) && Math.abs(ground.height(lat + a, lon + b) - h) > SLOPE_M)
      return false;
  return true;
}

/**
 * The ground mask of every group as hex strings in the order of the groups
 * (section 4), '' for birds.
 */
export function wildMasks(groups: readonly WildGroup[], ground: WildGround): string[] {
  return groups.map((g) => {
    if (flies(g)) return '';
    const homeM = ground.height(g.lat, g.lon);
    const sea = swims(g);
    const cellKm = wildMaskCell(g, 1, 0)[0] - wildMaskCell(g, 0, 0)[0];
    const mask = new Uint8Array(WILD_MASK_N * WILD_MASK_N);
    for (let j = 0; j < WILD_MASK_N; j++)
      for (let i = 0; i < WILD_MASK_N; i++) {
        const [e, n] = wildMaskCell(g, i, j);
        // The whole cell must fit: its middle and the middles of its edges, so
        // no animal stands half in the sea or half on land (section 4).
        const q = cellKm / 2;
        const open = (
          [
            [0, 0],
            [q, 0],
            [-q, 0],
            [0, q],
            [0, -q],
          ] as const
        ).every(([de, dn]) => {
          const [lat, lon] = at(g, e + de, n + dn);
          return sea ? openSea(ground, g, e + de, n + dn) : openAt(ground, lat, lon, homeM);
        });
        // A land cell is also free of lakes at its corners, so lakes smaller than a cell are not walked over.
        const dry =
          sea ||
          !ground.lake ||
          (
            [
              [q, q],
              [q, -q],
              [-q, q],
              [-q, -q],
            ] as const
          ).every(([de, dn]) => !ground.lake!(...at(g, e + de, n + dn)));
        mask[j * WILD_MASK_N + i] = open && dry ? 1 : 0;
      }
    reachable(mask);
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
