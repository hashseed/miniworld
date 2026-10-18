// Earth constants and the local compass frame, shared by the renderer and
// the data build. Pure TypeScript with no three.js, so a worker can use it.

/** Mean Earth radius of the globe, in km. */
export const EARTH_RADIUS_KM = 6371;
/** Kilometres per degree of latitude, as used by the data build's grids. */
export const KM_PER_DEG = 111.32;

/** Anything with x, y, z and a setter, such as a THREE.Vector3. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): unknown;
}

/**
 * The local north and east at a unit direction `up` (Y-up frame, see
 * cube.ts), written into `north` and `east`. At the poles, where north is
 * undefined, north is +Z.
 */
export function northEast(up: Vec3Like, north: Vec3Like, east: Vec3Like): void {
  let nx = -up.x * up.y;
  let ny = 1 - up.y * up.y;
  let nz = -up.z * up.y;
  let len = Math.hypot(nx, ny, nz);
  if (!(len > 1e-3)) {
    [nx, ny, nz, len] = [0, 0, 1, 1];
  }
  nx /= len;
  ny /= len;
  nz /= len;
  north.set(nx, ny, nz);
  // east = north × up
  const ex = ny * up.z - nz * up.y;
  const ey = nz * up.x - nx * up.z;
  const ez = nx * up.y - ny * up.x;
  const el = Math.hypot(ex, ey, ez) || 1;
  east.set(ex / el, ey / el, ez / el);
}
