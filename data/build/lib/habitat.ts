// Where people may live at a date (spec milestone 2, section 3.1): land at
// the sea level of the date, not under ice, not desert and not high
// mountains; and how good a camp site is (section 3.2): near a river, lake
// or coast is better, high ground worse.

import { detCos, detSin, RAD } from '../../../app/src/core/detmath.ts';
import {
  ARID_GRID_H,
  ARID_GRID_W,
  ICE_DISTANCE_STEP_KM,
  ICE_DISTANCE_ZERO,
  ICE_GRID_H,
  ICE_GRID_W,
} from '../../../app/src/content/formats.ts';
import type { Day } from '../../../app/src/time/calendar.ts';
import type { Habitat } from './humankind.ts';

/** Aridity at which land counts as desert (milestone 2, section 3.1). */
export const DESERT_ARIDITY = 0.8;
/** Camps keep this far from the ice border. */
export const ICE_CLEAR_KM = 20;
/** No camps above this height (Proposed). */
export const MAX_CAMP_M = 3500;
/** Water within this distance makes a better camp site. */
export const NEAR_WATER_KM = 60;

const KM_PER_DEG = 111.195;

export interface HabitatInputs {
  /** Climate slices in ascending order of day (milestone 1, section 5.2). */
  slices: { day: Day; ice: Uint8Array; aridity: Uint8Array }[];
  /** Whether the sea covers a point at a day. */
  isSea(lat: number, lon: number, day: Day): boolean;
  /** Whether a lake covers a point; rivers do not stop camps. */
  isLake(lat: number, lon: number): boolean;
  isRiver(lat: number, lon: number): boolean;
  /** Ground height in metres. */
  elevation(lat: number, lon: number): number;
}

/** The cell value of a centred latitude-longitude grid at a point. */
function cell(grid: Uint8Array, w: number, h: number, lat: number, lon: number): number {
  const c = Math.min(w - 1, Math.max(0, Math.floor(((lon + 180) / 360) * w)));
  const r = Math.min(h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * h)));
  return grid[r * w + c]!;
}

export function climateHabitat(input: HabitatInputs): Habitat {
  const { slices } = input;
  /** The climate slice in force on a day: the latest one at or before it. */
  const sliceAt = (day: Day) => {
    let lo = 0;
    let hi = slices.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (slices[mid]!.day <= day) lo = mid;
      else hi = mid - 1;
    }
    return slices[lo]!;
  };
  const aridity = (lat: number, lon: number, day: Day) =>
    cell(sliceAt(day).aridity, ARID_GRID_W, ARID_GRID_H, lat, lon) / 255;
  const iceKm = (lat: number, lon: number, day: Day) =>
    (cell(sliceAt(day).ice, ICE_GRID_W, ICE_GRID_H, lat, lon) - ICE_DISTANCE_ZERO) *
    ICE_DISTANCE_STEP_KM;

  const habitable = (lat: number, lon: number, day: Day) =>
    !input.isSea(lat, lon, day) &&
    !input.isLake(lat, lon) &&
    iceKm(lat, lon, day) < -ICE_CLEAR_KM &&
    aridity(lat, lon, day) < DESERT_ARIDITY &&
    input.elevation(lat, lon) < MAX_CAMP_M;

  /** Whether sea, a lake or a river lies at the point or around it. */
  const nearWater = (lat: number, lon: number, day: Day) => {
    const wet = (a: number, b: number) =>
      input.isSea(a, b, day) || input.isLake(a, b) || input.isRiver(a, b);
    if (wet(lat, lon)) return true;
    // Four rings of eight points, so a river a few km wide is not missed.
    const shrink = 1 / Math.max(0.1, detCos(lat * RAD));
    for (let ring = 1; ring <= 4; ring++) {
      const dLat = (NEAR_WATER_KM * ring) / 4 / KM_PER_DEG;
      for (let k = 0; k < 8; k++) {
        const a = ((k + ring / 2) * Math.PI) / 4;
        if (wet(lat + dLat * detCos(a), lon + dLat * shrink * detSin(a))) return true;
      }
    }
    return false;
  };

  return {
    habitable,
    score: (lat, lon, day) =>
      0.4 * (1 - aridity(lat, lon, day)) +
      0.3 * (1 - Math.min(1, Math.max(0, input.elevation(lat, lon)) / 3000)) +
      (nearWater(lat, lon, day) ? 0.3 : 0),
  };
}

/** A polygon of [lon, lat] points; the edge closes back to the first point. */
export type Ring = [number, number][];

/** Whether a point lies inside a polygon, by crossings (good for areas away from the poles). */
export function insideRing(ring: Ring, lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
