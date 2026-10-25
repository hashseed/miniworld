// The culture profiles (spec milestone 2, section 4; neolithic/people-profiles.md),
// until culture records exist. The ids are listed here, one list for the models,
// the card build and the review sheets; everything else about a profile is its
// row of the culture table data/curated/cultures.json, which the data build
// checks against its schema (data/schema/tables.ts).

import type { Table } from '../../../data/schema/tables.ts';
import { onWorldTables } from './tables.ts';

export const PROFILES = [
  'african-stone-age',
  'neanderthal',
  'coastal-asia-hunter',
  'first-australians',
  'ice-age-hunter',
  'steppe-beringia-hunter',
  'natufian',
  'old-kingdom-egyptian',
  // Peopling the world (peopling.md section 5.1).
  'west-asia-hunter',
  'east-asia-hunter',
  'first-americans',
  // Farmers and herders of the Neolithic (docs/spec/neolithic/people-profiles.md).
  'pre-pottery-neolithic-levant',
  'anatolian-farmer',
  'lbk-farmer',
  'indus-farmer',
  'nile-neolithic',
  'yellow-river-millet-farmer',
  'yangtze-rice-farmer',
  'mesoamerican-farmer',
  'andean-farmer',
  'new-guinea-highland-farmer',
] as const;
export type Profile = (typeof PROFILES)[number];

/** One profile's row of the culture table. */
export type Culture = Table<'cultures.json'>['cultures'][number];

const rows = new Map<string, Culture>();
/** Every profile's row, by id, once the world has its tables (tables.ts). */
export const CULTURES: ReadonlyMap<string, Culture> = rows;
onWorldTables((t) => {
  rows.clear();
  for (const c of t.cultures.cultures) rows.set(c.id, c);
});

/** The founder's people, whose prey a profile without its own hunts. */
const FOUNDER_PROFILE: Profile = 'african-stone-age';

/** The asset id of a profile's camp lodging, if it has one. */
export function campLodgingOf(profile: string | undefined): string | undefined {
  return profile === undefined ? undefined : CULTURES.get(profile)?.lodging;
}

/** The animals a profile hunts (peopling.md sections 5.5 and 9.1). */
export function huntsOf(profile: string | undefined): readonly string[] {
  return (
    (profile === undefined ? undefined : CULTURES.get(profile)?.hunts) ??
    CULTURES.get(FOUNDER_PROFILE)?.hunts ??
    []
  );
}
