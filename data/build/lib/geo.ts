// Distances and drawn offsets on the globe for the data build (spec humankind.md, section 8.1),
// with the deterministic maths only.

import { detAtan2, detCos, detSin, RAD } from '../../../app/src/core/detmath.ts';
import { EARTH_RADIUS_KM } from '../../../app/src/geo/earth.ts';

export const KM_PER_DEG = 111.195;

/** Distance in km between two points, on a local flat map (good to a few per cent at camp range). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  else if (dLon < -180) dLon += 360;
  const x = dLon * detCos(((lat1 + lat2) / 2) * RAD);
  const y = lat2 - lat1;
  return Math.sqrt(x * x + y * y) * KM_PER_DEG;
}

/**
 * The place a drawn offset east and north of a point falls on, in km along the ground plane
 * there, as the globe draws it (humankind.md section 8.1): a camp's outings reach a thousand
 * kilometres and more at drawn size, where a flat map would miss the shore.
 */
export function onGlobe(lat: number, lon: number, eastKm: number, northKm: number) {
  const [sLat, cLat, sLon, cLon] = [
    detSin(lat * RAD),
    detCos(lat * RAD),
    detSin(lon * RAD),
    detCos(lon * RAD),
  ];
  // Up, north and east at the point, as the globe's frame (geo/earth.ts northEast).
  const x = cLat * sLon * EARTH_RADIUS_KM + cLon * eastKm - sLat * sLon * northKm;
  const y = sLat * EARTH_RADIUS_KM + cLat * northKm;
  const z = cLat * cLon * EARTH_RADIUS_KM - sLon * eastKm - sLat * cLon * northKm;
  return {
    lat: detAtan2(y, Math.sqrt(x * x + z * z)) / RAD,
    lon: detAtan2(x, z) / RAD,
  };
}
