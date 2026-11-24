// Shared terrain-grounding policies (specs humankind.md section 8.1,
// neolithic/villages.md section 7, wildlife.md section 5): upright buildings
// with deep foundation plinth skirts, terrain-aligned animals and ring props,
// and draped ground patches/fields. Pure math so both renderer and world tests
// can evaluate grounding deterministically.

import { northEast, EARTH_RADIUS_KM } from '../geo/earth.ts';
import type { Vec3 } from '../geo/cube.ts';

/** Parameters for grounding an upright building with a foundation plinth skirt. */
export interface UprightPlinthParams {
  centerDir: Vec3;
  /** Facing in the local (east, north) tangent plane (model +Z door). */
  dirX: number;
  dirZ: number;
  /** Footprint bounds in drawn km along model X (or half-width symmetric via +/-). */
  minXKm?: number;
  maxXKm?: number;
  /** Footprint bounds in drawn km along model Z (or half-depth symmetric via +/-). */
  minZKm?: number;
  maxZKm?: number;
  halfWidthKm: number;
  halfDepthKm: number;
  /** How far the plinth extends below model y = 0, in drawn km. */
  plinthDepthKm: number;
  /** Maximum depth the uphill side may sink into the slope, in drawn km. */
  maxBuryKm: number;
  surfaceAt: (dir: Vec3) => number;
}

export interface UprightPlinthResult {
  baseH: number;
  centerH: number;
  minH: number;
  maxH: number;
  reliefKm: number;
  plinthBottomH: number;
  grounded: boolean;
}

/** How far the ground around an animal may lift it, in body heights (wildlife.md section 5). */
const MAX_LIFT = 0.1;
/** The most the ground may lift an animal to keep its feet out of a slope steeper than it leans. */
const MAX_SLOPE_LIFT = 0.3;
/** The steepest an animal leans with the ground, as a slope (about 15 degrees). */
const MAX_TILT = 0.27;
const SLOPE_REACH = 0.35;
const END_REACH = 0.5;

const tmpNorth = {
  x: 0,
  y: 0,
  z: 0,
  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  },
};
const tmpEast = {
  x: 0,
  y: 0,
  z: 0,
  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  },
};

/**
 * Steps `eastKm` east and `northKm` north on the unit sphere around `dir` and normalizes
 * into a unit `Vec3` direction.
 */
function offsetUnitDir(
  dir: Vec3,
  north: { x: number; y: number; z: number },
  east: { x: number; y: number; z: number },
  eastKm: number,
  northKm: number,
): Vec3 {
  const sEast = eastKm / EARTH_RADIUS_KM;
  const sNorth = northKm / EARTH_RADIUS_KM;
  const x = dir[0] + east.x * sEast + north.x * sNorth;
  const y = dir[1] + east.y * sEast + north.y * sNorth;
  const z = dir[2] + east.z * sEast + north.z * sNorth;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/**
 * Policy 1 (`upright-plinth`): places a building upright at its center, sampling
 * its center and 4 oriented footprint corners so the downhill plinth never hovers
 * and the uphill side never buries past `maxBuryKm`.
 *
 * Frame matches `TreeLayer.place()` + `figures.ts:turned()`:
 *   model `+Z` -> `(dirX, dirZ)` in `(east, north)`
 *   model `+X` -> `(-dirZ, dirX)` in `(east, north)`
 */
export function groundUprightPlinth(params: UprightPlinthParams): UprightPlinthResult {
  const { centerDir, plinthDepthKm, maxBuryKm, surfaceAt } = params;
  const len = Math.hypot(params.dirX, params.dirZ);
  const dx = len > 1e-9 ? params.dirX / len : 1;
  const dz = len > 1e-9 ? params.dirZ / len : 0;

  const minX = params.minXKm ?? -params.halfWidthKm;
  const maxX = params.maxXKm ?? params.halfWidthKm;
  const minZ = params.minZKm ?? -params.halfDepthKm;
  const maxZ = params.maxZKm ?? params.halfDepthKm;

  northEast({ x: centerDir[0], y: centerDir[1], z: centerDir[2], set() {} }, tmpNorth, tmpEast);

  const centerH = surfaceAt(centerDir);
  let minH = centerH;
  let maxH = centerH;
  for (const mx of [minX, maxX]) {
    for (const mz of [minZ, maxZ]) {
      const eastKm = mz * dx - mx * dz;
      const northKm = mz * dz + mx * dx;
      const h = surfaceAt(offsetUnitDir(centerDir, tmpNorth, tmpEast, eastKm, northKm));
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }
  const reliefKm = maxH - minH;
  const baseH = Math.min(Math.max(centerH, maxH - maxBuryKm), minH + plinthDepthKm);
  const plinthBottomH = baseH - plinthDepthKm;
  return {
    baseH,
    centerH,
    minH,
    maxH,
    reliefKm,
    plinthBottomH,
    grounded: plinthBottomH <= minH + 1e-6,
  };
}

/**
 * Policy 2 (`terrain-aligned`): where an animal stands given the ground under its
 * middle and a distance `halfKm` in front, behind, right and left of it (spec
 * wildlife.md, section 5).
 */
export function groundTerrainAligned(
  middle: number,
  front: number,
  back: number,
  right: number,
  left: number,
  halfKm: number,
  heightKm: number,
  ends?: { front: number; back: number; right: number; left: number },
): { ground: number; along: number; across: number } {
  const mean = (front + back + right + left) / 4;
  let ground = middle + Math.min(Math.max(mean - middle, 0), heightKm * MAX_LIFT);
  let along = (front - back) / (2 * halfKm);
  let across = (right - left) / (2 * halfKm);
  const steep = Math.sqrt(along * along + across * across);
  if (steep > MAX_TILT) {
    along *= MAX_TILT / steep;
    across *= MAX_TILT / steep;
    const buried = Math.max(
      front - (ground + along * halfKm),
      back - (ground - along * halfKm),
      right - (ground + across * halfKm),
      left - (ground - across * halfKm),
    );
    if (buried > 0) ground += Math.min(buried, heightKm * MAX_SLOPE_LIFT);
  }
  // Nose, tail and flanks reach further than the slope points: none may lie above its feet,
  // even on gentle ground.
  if (ends) {
    const reach = (halfKm * END_REACH) / SLOPE_REACH;
    const buried = Math.max(
      ends.front - (ground + along * reach),
      ends.back - (ground - along * reach),
      ends.right - (ground + across * reach),
      ends.left - (ground - across * reach),
    );
    if (buried > 0) ground += Math.min(buried, heightKm * MAX_SLOPE_LIFT);
  }
  return { ground, along, across };
}

export { groundTerrainAligned as standOnGround };

/**
 * Policy 2b (`terrain-aligned` ring props, e.g. `prop-pen`): best-fit plane over `steps`
 * samples on a ring of `radiusKm`, lowered until no point on the ring sits above the ground.
 */
export function groundRingPlane(
  centerDir: Vec3,
  radiusKm: number,
  steps: number,
  surfaceAt: (dir: Vec3) => number,
): { lift: number; east: number; north: number } {
  northEast({ x: centerDir[0], y: centerDir[1], z: centerDir[2], set() {} }, tmpNorth, tmpEast);
  const h: number[] = [];
  let [a, b, c] = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const g = surfaceAt(
      offsetUnitDir(centerDir, tmpNorth, tmpEast, Math.cos(t) * radiusKm, Math.sin(t) * radiusKm),
    );
    h.push(g);
    a += g / steps;
    b += (2 * g * Math.cos(t)) / steps;
    c += (2 * g * Math.sin(t)) / steps;
  }
  let sink = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    sink = Math.max(sink, a + b * Math.cos(t) + c * Math.sin(t) - h[i]!);
  }
  const here = surfaceAt(centerDir);
  return { lift: a - sink - here, east: b / radiusKm, north: c / radiusKm };
}

/** Policy 3 (`draped`): ground patches and crop tiles ride just above the sampled surface. */
export function groundDraped(surfaceKm: number, liftKm: number): number {
  return surfaceKm + liftKm;
}
