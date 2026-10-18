// Provisional culture areas for the tree of humankind (spec humankind.md,
// section 5), and the tree settings built from them.

import {
  astronomicalYear,
  dayOfYearStart,
  TIMELINE_START,
  type Day,
} from '../../../app/src/time/calendar.ts';
import { insideRing, type Ring } from './habitat.ts';
import { DENSITIES, type Density, type TreeSettings } from './humankind.ts';
import { sliceDay } from './ice.ts';

export interface CultureAreas {
  areas: {
    culture: string;
    density: Density;
    snapshots: { fromBP: number; label: string; source: string; ring: Ring }[];
  }[];
}

/** Koobi Fora, on the eastern shore of Lake Turkana (section 3.5). */
export const FOUNDER = { lat: 3.95, lon: 36.2 };
/** The first person's culture and lodging. */
export const FOUNDER_CULTURE = 'african-stone-age';
export const FOUNDER_LODGING = 'shelter-grass-hut';
/** The prologue front reaches all of Africa south of the Sahara by 62,000 BCE (section 4.2). */
export const PROLOGUE_END: Day = dayOfYearStart(astronomicalYear(62_000, 'BCE'));
export const FRONT_KM_PER_YEAR = 0.8;
/** The first slice of the tree ends where Out of Africa begins, c. 60,000 BCE (section 7). */
export const TREE_END: Day = dayOfYearStart(astronomicalYear(60_000, 'BCE'));

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

export function humankindSettings(c: CultureAreas): TreeSettings {
  const areas = c.areas.map((a) => ({
    density: a.density,
    snapshots: a.snapshots.map((s) => ({ day: sliceDay(s.fromBP), ring: s.ring })),
  }));
  return {
    founder: FOUNDER,
    lodgingKind: FOUNDER_LODGING,
    startDay: TIMELINE_START,
    endDay: TREE_END,
    prologueEndDay: PROLOGUE_END,
    frontKmPerYear: FRONT_KM_PER_YEAR,
    density: (lat, lon, day) => {
      for (const a of areas) {
        let ring: Ring | undefined;
        for (const s of a.snapshots) if (s.day <= day) ring = s.ring;
        if (ring && insideRing(ring, lat, lon)) return a.density;
      }
      return undefined;
    },
  };
}
