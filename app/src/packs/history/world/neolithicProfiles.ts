// The Neolithic culture profiles (docs/spec/neolithic/people-profiles.md): labels,
// areas, architecture set, tools, activity mix, herd and crops, read from the
// farming blocks of the culture table data/curated/cultures.json. The vocabularies
// of roles and tools are here, and the table's schema checks the rows against them.
// The looks are in assets/src/people.ts; when a profile begins at a place is in
// data/curated/farming.json.

import { CULTURES } from './cultures.ts';
import { onWorldTables } from './tables.ts';

/** The roles of the farmer's day (spec section 4); the hunter-gatherer roles keep their old ids. */
export const NEOLITHIC_ROLES = [
  'farmer',
  'reaper',
  'herder',
  'potter',
  'weaver',
  'builder',
  'grinder',
  'hunter',
  'gatherer',
  'fisher',
  'toolmaker',
] as const;
export type NeolithicRole = (typeof NEOLITHIC_ROLES)[number];

/** The tool each role holds in place of the profile's own (the role's cast rule `tool`). */
export const ROLE_TOOL: Partial<Record<NeolithicRole, string>> = {
  reaper: 'sickle',
  herder: 'crook',
  potter: 'pot',
  weaver: 'spindle',
  grinder: 'grinding-stone',
  gatherer: 'basket',
  fisher: 'fishing-spear',
  hunter: 'spear',
};

export const NEOLITHIC_TOOLS = [
  'sickle',
  'hoe',
  'digging-stick',
  'ard',
  'grinding-stone',
  'basket',
  'pot',
  'crook',
  'spindle',
  'none',
] as const;

/** The id of a farming profile: a profile whose row in the culture table has a `farming` block. */
export type NeolithicProfileId = string;

export interface NeolithicProfile {
  en: string;
  de: string;
  /** Regions of data/curated/farming.json whose onset date starts the profile (Proposed ids). */
  farmingRegions: string[];
  /** Interim boxes [south, north, west, east] where it applies. */
  areas: [number, number, number, number][];
  /** Where boxes of several profiles overlap, the lower rank wins. */
  areaRank: number;
  /** The field tool before the ard. */
  fieldTool: 'hoe' | 'digging-stick';
  /** Shelter ids of the camp, the first being the camp's own lodging. */
  architecture: string[];
  /** Tools by kind, as in LOOKS of assets/src/people.ts. */
  tools: { man: string; woman: string; child: string };
  /** Share of the grown-ups doing each role; sums to 100. */
  mix: Record<NeolithicRole, number>;
  /** Herd animals as asset ids or vocabulary ids. */
  herd: string[];
  /** The crops its fields grow, rotating through the fields (assets/src/crops.ts ids). */
  crops: string[];
  /** From when the farmer's field tool is the ard, in years BCE; absent where it never is. */
  ardFromBce?: number;
  /** How its village is laid out (neolithic/villages.md section 5). */
  layout: 'rows' | 'cluster' | 'hamlet' | 'pits' | 'stilts';
  /** The longest a house is drawn, in figure metres, where not the usual LODGING_MAX_M. */
  houseM?: number;
  /** The profile it succeeds in place or by replacement (culture-succession.md); it has no spread areas. */
  follows?: string;
  /** How many people one house holds, where not the usual four. */
  houseCapacity?: number;
  /** Where the village keeps its grain (villages.md section 8); none for root crops. */
  store?: 'granary' | 'silo-pit' | 'pots';
}

function farmingProfiles(): Record<NeolithicProfileId, NeolithicProfile> {
  const out: Record<NeolithicProfileId, NeolithicProfile> = {};
  for (const c of CULTURES.values()) {
    const f = c.farming;
    if (!f || c.en === undefined || c.de === undefined) continue;
    out[c.id] = {
      en: c.en,
      de: c.de,
      // A successor has none: it comes by a succession record, not the farming spread.
      farmingRegions: f.regions ?? [],
      areas: f.areas ?? [],
      areaRank: f.areaRank ?? 0,
      ...(f.follows !== undefined ? { follows: f.follows } : {}),
      architecture: f.architecture,
      tools: f.tools,
      fieldTool: f.fieldTool,
      mix: f.mix,
      herd: f.herd,
      crops: f.crops,
      ...(f.ardFromBce !== undefined ? { ardFromBce: f.ardFromBce } : {}),
      layout: f.layout,
      ...(f.houseM !== undefined ? { houseM: f.houseM } : {}),
      ...(f.houseCapacity !== undefined ? { houseCapacity: f.houseCapacity } : {}),
      ...(f.store !== undefined ? { store: f.store } : {}),
    };
  }
  return out;
}

const profiles: Record<NeolithicProfileId, NeolithicProfile> = {};
/** The farming profiles, from the culture table (people-profiles.md section 4), once the world has its tables. */
export const NEOLITHIC_PROFILES: Readonly<Record<NeolithicProfileId, NeolithicProfile>> = profiles;
// After CULTURES, which this module's import of cultures.ts filled first.
onWorldTables(() => {
  for (const id of Object.keys(profiles)) delete profiles[id];
  Object.assign(profiles, farmingProfiles());
});

/** Whether a culture is a farming profile. */
export const isNeolithicProfile = (culture: string | undefined): culture is NeolithicProfileId =>
  culture !== undefined && Object.hasOwn(NEOLITHIC_PROFILES, culture);

/** A farming profile's record; fails for a culture that is not one. */
export function neolithicProfile(id: NeolithicProfileId): NeolithicProfile {
  const p = isNeolithicProfile(id) ? NEOLITHIC_PROFILES[id] : undefined;
  if (!p) throw new Error(`${id} is not a farming profile of data/curated/cultures.json`);
  return p;
}
