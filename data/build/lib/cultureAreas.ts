// Provisional culture areas for the tree of humankind (spec humankind.md,
// section 5), and the tree settings built from them.

import {
  astronomicalYear,
  dayOfYearStart,
  TIMELINE_START,
  type Day,
} from '../../../app/src/time/calendar.ts';
import { insideRing, MAX_CAMP_M, type Ring } from './habitat.ts';
import { SITE_STEP_KM, type SiteMap } from './sites.ts';
import {
  DENSITIES,
  type Density,
  type Threshold,
  type TreeSettings,
  type Voyage,
} from './humankind.ts';
import { sliceDay } from './ice.ts';

export interface CultureAreas {
  areas: {
    culture: string;
    density: Density;
    /** The lowest annual mean temperature camps of the area may stand at (peopling.md section 5.2). */
    coldestC?: number;
    /** The highest ground for its camps; MAX_CAMP_M when not given. */
    highestM?: number;
    /** Its own camp spacing in km, overriding the density's (humankind.md section 4.1). */
    spacingKm?: number;
    /** At most this many bands, as [year BCE, count] pairs, each from its year on (sites.md section 4). */
    maxBands?: [number, number][];
    /** A coarser lattice of camp sites in the area, a multiple of SITE_STEP_KM (sites.md section 2). */
    siteStepKm?: number;
    snapshots: { fromBP: number; label: string; source: string; ring: Ring }[];
  }[];
}

/** What the tree needs of the world beyond the culture areas (peopling.md sections 3 to 6). */
export interface PeoplingInputs {
  elevation(lat: number, lon: number): number;
  /** Annual mean temperature in °C on a day, or undefined at sea. */
  temperature(lat: number, lon: number, day: Day): number | undefined;
  arrival(lat: number, lon: number): Day;
  lodgingOf(culture: string): string;
  voyages: Voyage[];
  thresholds: Threshold[];
  sites: SiteMap;
  seaLevel(day: Day): number;
  walkFlood(lat: number, lon: number): number;
  waterFlood?(lat: number, lon: number): number;
}

/** Koobi Fora, on the eastern shore of Lake Turkana (section 3.5). */
export const FOUNDER = { lat: 3.95, lon: 36.2 };
/** The first person's culture and lodging. */
export const FOUNDER_CULTURE = 'african-stone-age';
export const FOUNDER_LODGING = 'shelter-grass-hut';
/** The prologue front reaches all of Africa south of the Sahara by 62,000 BCE (section 4.2). */
export const PROLOGUE_END: Day = dayOfYearStart(astronomicalYear(62_000, 'BCE'));
export const FRONT_KM_PER_YEAR = 0.8;
/** The tree runs to the end of the timeline, 1991 CE: bands that have not changed stay hunter-gatherers (Yang, 2026-10-21). */
export const TREE_END: Day = dayOfYearStart(1991);

export function validateCultureAreas(c: CultureAreas): string[] {
  const errors: string[] = [];
  for (const a of c.areas) {
    if (!(a.density in DENSITIES)) errors.push(`${a.culture}: unknown density ${a.density}`);
    if (!a.snapshots.length) errors.push(`${a.culture}: no snapshots`);
    for (let i = 0; i < a.snapshots.length; i++) {
      const s = a.snapshots[i]!;
      if (!s.source) errors.push(`${a.culture} ${s.fromBP}: no source`);
      if (s.ring.length < 3) errors.push(`${a.culture} ${s.fromBP}: polygon needs three points`);
      if (i > 0 && s.fromBP >= a.snapshots[i - 1]!.fromBP)
        errors.push(`${a.culture}: snapshots out of order at ${s.fromBP}`);
    }
  }
  const first = c.areas.find((a) => a.culture === FOUNDER_CULTURE);
  if (!first || sliceDay(first.snapshots[0]!.fromBP) > TIMELINE_START)
    errors.push(`${FOUNDER_CULTURE}: needs an area at the start of the timeline`);
  else if (!insideRing(first.snapshots[0]!.ring, FOUNDER.lat, FOUNDER.lon))
    errors.push(`${FOUNDER_CULTURE}: the first person stands outside its area`);
  return errors;
}

/**
 * How many lattice steps apart the camp sites are at a point: the coarsest that any area
 * holding the point at some date asks for, else 1 (sites.md section 2).
 */
export function siteStepAt(c: CultureAreas, lat: number, lon: number): number {
  let step = 1;
  for (const a of c.areas)
    if (a.siteStepKm && a.snapshots.some((s) => insideRing(s.ring, lat, lon)))
      step = Math.max(step, Math.round(a.siteStepKm / SITE_STEP_KM));
  return step;
}

/** The index of every area whose polygon holds a point at some date, for the arrival map. */
export function areasAt(c: CultureAreas, lat: number, lon: number): number[] {
  return c.areas.flatMap((a, i) =>
    a.snapshots.some((s) => insideRing(s.ring, lat, lon)) ? [i] : [],
  );
}

export function humankindSettings(c: CultureAreas, world: PeoplingInputs): TreeSettings {
  const areas = c.areas.map((a) => ({
    ...a,
    snapshots: a.snapshots.map((s) => ({ day: sliceDay(s.fromBP), ring: s.ring })),
    caps: (a.maxBands ?? [])
      .map(([bce, count]) => [dayOfYearStart(astronomicalYear(bce, 'BCE')), count] as const)
      .sort((p, q) => p[0] - q[0]),
  }));
  const areaIndex = new Map(areas.map((a, i) => [a, i]));
  /** The first area holding a point on a day, worked out from the polygons. */
  const areaFromRings = (lat: number, lon: number, day: Day) => {
    for (const a of areas) {
      let ring: Ring | undefined;
      for (const s of a.snapshots) if (s.day <= day) ring = s.ring;
      if (ring && insideRing(ring, lat, lon)) return a;
    }
    return undefined;
  };
  // The areas only change on their snapshot days, so each place's area is worked out once
  // per stretch between them and looked up after (the tree asks for the same sites millions
  // of times; the build spent most of its time in the polygons).
  const changeDays = [...new Set(areas.flatMap((a) => a.snapshots.map((s) => s.day)))].sort(
    (a, b) => a - b,
  );
  const stretchOf = (day: Day) => {
    let lo = 0;
    let hi = changeDays.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (changeDays[mid]! <= day) lo = mid + 1;
      else hi = mid;
    }
    return lo; // stretch k holds from changeDays[k - 1] (or the start) to changeDays[k]
  };
  const byPlace = new Map<number, Map<number, (Area | undefined | null)[]>>();
  type Area = (typeof areas)[number];
  const areaAt = (lat: number, lon: number, day: Day): Area | undefined => {
    let lons = byPlace.get(lat);
    if (!lons) byPlace.set(lat, (lons = new Map()));
    let row = lons.get(lon);
    if (!row) lons.set(lon, (row = new Array(changeDays.length + 1).fill(null)));
    const k = stretchOf(day);
    let hit = row[k];
    if (hit === null) {
      hit = areaFromRings(lat, lon, k === 0 ? -Infinity : changeDays[k - 1]!);
      row[k] = hit;
    }
    return hit;
  };
  return {
    sites: world.sites,
    seaLevel: world.seaLevel,
    walkFlood: world.walkFlood,
    waterFlood: world.waterFlood,
    culture: (lat, lon, day) => areaAt(lat, lon, day)?.culture,
    livable: (lat, lon, day) => {
      const a = areaAt(lat, lon, day);
      if (!a) return false;
      if (world.elevation(lat, lon) >= (a.highestM ?? MAX_CAMP_M)) return false;
      const t = world.temperature(lat, lon, day);
      return a.coldestC === undefined || t === undefined || t >= a.coldestC;
    },
    arrival: world.arrival,
    lodgingOf: world.lodgingOf,
    voyages: world.voyages,
    thresholds: world.thresholds,
    founder: FOUNDER,
    lodgingKind: FOUNDER_LODGING,
    startDay: TIMELINE_START,
    endDay: TREE_END,
    prologueEndDay: PROLOGUE_END,
    frontKmPerYear: FRONT_KM_PER_YEAR,
    density: (lat, lon, day) => areaAt(lat, lon, day)?.density,
    spacing: (lat, lon, day) => areaAt(lat, lon, day)?.spacingKm,
    areaOf: (lat, lon, day) => {
      const a = areaAt(lat, lon, day);
      return a && areaIndex.get(a);
    },
    maxBands: (lat, lon, day) => {
      const caps = areaAt(lat, lon, day)?.caps;
      let cap: number | undefined;
      for (const [from, count] of caps ?? []) if (from <= day) cap = count;
      return cap;
    },
  };
}
