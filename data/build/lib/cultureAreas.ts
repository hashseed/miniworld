// Provisional culture areas for the tree of humankind (spec humankind.md,
// section 5), and the tree settings built from them.

import {
  astronomicalYear,
  dayOfYearStart,
  TIMELINE_START,
  type Day,
} from '../../../app/src/time/calendar.ts';
import { insideRing, MAX_CAMP_M, type Ring } from './habitat.ts';
import type { SiteMap } from './sites.ts';
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
}

/** Koobi Fora, on the eastern shore of Lake Turkana (section 3.5). */
export const FOUNDER = { lat: 3.95, lon: 36.2 };
/** The first person's culture and lodging. */
export const FOUNDER_CULTURE = 'african-stone-age';
export const FOUNDER_LODGING = 'shelter-grass-hut';
/** The prologue front reaches all of Africa south of the Sahara by 62,000 BCE (section 4.2). */
export const PROLOGUE_END: Day = dayOfYearStart(astronomicalYear(62_000, 'BCE'));
export const FRONT_KM_PER_YEAR = 0.8;
/** The tree runs to the last Neolithic threshold of the peopling plan, c. 6500 BCE (peopling.md section 3.5). */
export const TREE_END: Day = dayOfYearStart(astronomicalYear(6500, 'BCE'));

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
  }));
  /** The first area holding a point on a day. */
  const areaAt = (lat: number, lon: number, day: Day) => {
    for (const a of areas) {
      let ring: Ring | undefined;
      for (const s of a.snapshots) if (s.day <= day) ring = s.ring;
      if (ring && insideRing(ring, lat, lon)) return a;
    }
    return undefined;
  };
  return {
    sites: world.sites,
    seaLevel: world.seaLevel,
    walkFlood: world.walkFlood,
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
  };
}
