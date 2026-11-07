// Where a point of a miniature lies (history-lens.md section 4.2): a camp, a field, a pen or a
// hunt is laid out in drawn kilometres east and north of its centre ON THE DRAWN GLOBE, as the
// tree layer places it; this is the one mapping, so the data build's checks of the ground, the
// golden tests and the drawing all ask about the same spot. The point's true direction is the
// drawn point taken back through the inverse lens.

import type { Vec3 } from './cube.ts';
import { EARTH_RADIUS_KM } from './earth.ts';
import type { Lens } from './lens.ts';

/**
 * The true direction of the point `eastKm` east and `northKm` north of a true centre, in
 * drawn km on the drawn globe, along the drawn up's north and east (geo/earth.ts northEast).
 */
export function placedTrue(
  lens: Pick<Lens, 'toDrawn' | 'toTrue'>,
  centre: Vec3,
  eastKm: number,
  northKm: number,
  out: Vec3 = [0, 0, 0],
): Vec3 {
  const up = lens.toDrawn(centre, [0, 0, 0]);
  const ul = Math.hypot(up[0], up[1], up[2]);
  const [ux, uy, uz] = [up[0] / ul, up[1] / ul, up[2] / ul];
  // North and east at the drawn up, exactly as northEast sets them.
  let [nx, ny, nz] = [-ux * uy, 1 - uy * uy, -uz * uy];
  let nl = Math.hypot(nx, ny, nz);
  if (!(nl > 1e-3)) [nx, ny, nz, nl] = [0, 0, 1, 1];
  [nx, ny, nz] = [nx / nl, ny / nl, nz / nl];
  let [ex, ey, ez] = [ny * uz - nz * uy, nz * ux - nx * uz, nx * uy - ny * ux];
  const el = Math.hypot(ex, ey, ez) || 1;
  [ex, ey, ez] = [ex / el, ey / el, ez / el];
  const p: Vec3 = [
    ux * EARTH_RADIUS_KM + ex * eastKm + nx * northKm,
    uy * EARTH_RADIUS_KM + ey * eastKm + ny * northKm,
    uz * EARTH_RADIUS_KM + ez * eastKm + nz * northKm,
  ];
  const pl = Math.hypot(p[0], p[1], p[2]);
  return lens.toTrue([p[0] / pl, p[1] / pl, p[2] / pl], out);
}
