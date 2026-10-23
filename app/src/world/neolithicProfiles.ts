// The records of the Neolithic culture profiles (docs/spec/neolithic/people-profiles.md):
// labels, architecture set, tools, activity mix and herd animals. The looks are in
// assets/src/people.ts; when a profile begins at a place is in data/curated/farming.json.

import type { Profile } from './cultures.ts';

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

export type NeolithicProfileId = Extract<
  Profile,
  | 'pre-pottery-neolithic-levant'
  | 'anatolian-farmer'
  | 'lbk-farmer'
  | 'indus-farmer'
  | 'nile-neolithic'
  | 'yellow-river-millet-farmer'
  | 'yangtze-rice-farmer'
  | 'mesoamerican-farmer'
  | 'andean-farmer'
  | 'new-guinea-highland-farmer'
>;

export interface NeolithicProfile {
  en: string;
  de: string;
  /** Regions of data/curated/farming.json whose onset date starts the profile (Proposed ids). */
  farmingRegions: string[];
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
}

const mix = (
  farmer: number,
  reaper: number,
  herder: number,
  potter: number,
  weaver: number,
  builder: number,
  grinder: number,
  hunter: number,
  gatherer: number,
  fisher: number,
  toolmaker: number,
): Record<NeolithicRole, number> => ({
  farmer,
  reaper,
  herder,
  potter,
  weaver,
  builder,
  grinder,
  hunter,
  gatherer,
  fisher,
  toolmaker,
});

export const NEOLITHIC_PROFILES: Record<NeolithicProfileId, NeolithicProfile> = {
  'pre-pottery-neolithic-levant': {
    en: 'Pre-Pottery Neolithic farmers of the Levant',
    de: 'Frühe Bauern der Levante (vorkeramisches Neolithikum)',
    farmingRegions: ['fertile-crescent'],
    architecture: ['shelter-pre-pottery-levant-house', 'shelter-natufian-house'],
    tools: { man: 'sickle', woman: 'grinding-stone', child: 'basket' },
    mix: mix(20, 12, 10, 0, 6, 12, 14, 12, 8, 0, 6),
    herd: ['animal-goat', 'animal-sheep', 'animal-dog'],
    crops: ['emmer', 'einkorn', 'barley', 'lentil'],
  },
  'anatolian-farmer': {
    en: 'Farmers of Anatolia',
    de: 'Bauern Anatoliens',
    farmingRegions: ['fertile-crescent'],
    architecture: ['shelter-anatolian-house'],
    tools: { man: 'hoe', woman: 'pot', child: 'basket' },
    mix: mix(20, 10, 12, 8, 8, 12, 10, 8, 6, 0, 6),
    herd: ['animal-goat', 'animal-sheep', 'animal-cattle', 'animal-dog'],
    crops: ['einkorn', 'emmer', 'barley', 'lentil', 'flax'],
    ardFromBce: 4500,
  },
  'lbk-farmer': {
    en: 'Linear Pottery farmers of central Europe',
    de: 'Bandkeramik-Bauern Mitteleuropas',
    farmingRegions: ['fertile-crescent'],
    architecture: ['shelter-lbk-longhouse'],
    tools: { man: 'hoe', woman: 'pot', child: 'basket' },
    mix: mix(22, 10, 14, 10, 8, 12, 8, 6, 6, 0, 4),
    herd: ['animal-cattle', 'animal-sheep', 'animal-goat', 'animal-pig', 'animal-dog'],
    crops: ['emmer', 'einkorn', 'barley', 'flax', 'lentil'],
    ardFromBce: 4000,
  },
  'indus-farmer': {
    en: 'Farmers of the Indus borderlands',
    de: 'Bauern am Indus',
    farmingRegions: ['south-asia-farming'],
    architecture: ['shelter-mehrgarh-house'],
    tools: { man: 'sickle', woman: 'grinding-stone', child: 'basket' },
    mix: mix(18, 12, 16, 8, 8, 10, 10, 6, 6, 0, 6),
    herd: ['animal-zebu', 'animal-goat', 'animal-sheep', 'animal-dog'],
    crops: ['barley', 'emmer', 'lentil'],
    ardFromBce: 3500,
  },
  'nile-neolithic': {
    en: 'Neolithic farmers and herders of the Nile',
    de: 'Bauern und Hirten am Nil',
    farmingRegions: ['fertile-crescent'],
    architecture: ['shelter-egyptian-neolithic-hut'],
    tools: { man: 'sickle', woman: 'pot', child: 'basket' },
    mix: mix(18, 10, 14, 8, 10, 8, 8, 6, 6, 10, 2),
    herd: ['animal-cattle', 'animal-goat', 'animal-sheep', 'animal-pig', 'animal-dog'],
    crops: ['emmer', 'barley', 'flax'],
    ardFromBce: 3500,
  },
  'yellow-river-millet-farmer': {
    en: 'Millet farmers of the Yellow River',
    de: 'Hirsebauern am Gelben Fluss',
    farmingRegions: ['yellow-river'],
    architecture: ['shelter-yellow-river-pit-house'],
    tools: { man: 'hoe', woman: 'pot', child: 'basket' },
    mix: mix(22, 10, 8, 10, 8, 12, 10, 8, 6, 2, 4),
    herd: ['animal-pig', 'animal-dog'],
    crops: ['millet'],
  },
  'yangtze-rice-farmer': {
    en: 'Rice farmers of the Yangtze',
    de: 'Reisbauern am Jangtse',
    farmingRegions: ['yangtze'],
    architecture: ['shelter-yangtze-stilt-house'],
    tools: { man: 'hoe', woman: 'pot', child: 'basket' },
    mix: mix(22, 12, 4, 8, 8, 12, 8, 6, 6, 12, 2),
    herd: ['animal-pig', 'animal-dog', 'animal-water-buffalo'],
    crops: ['rice'],
  },
  'mesoamerican-farmer': {
    en: 'Maize farmers of Mesoamerica',
    de: 'Maisbauern Mesoamerikas',
    farmingRegions: ['mesoamerica'],
    architecture: ['shelter-mesoamerican-hut'],
    tools: { man: 'digging-stick', woman: 'grinding-stone', child: 'basket' },
    mix: mix(26, 8, 0, 6, 8, 10, 16, 10, 10, 0, 6),
    herd: ['animal-dog'],
    crops: ['maize', 'squash'],
  },
  'andean-farmer': {
    en: 'Farmers and herders of the Andes',
    de: 'Bauern und Hirten der Anden',
    farmingRegions: ['andes'],
    architecture: ['shelter-andean-stone-house'],
    tools: { man: 'hoe', woman: 'basket', child: 'basket' },
    mix: mix(22, 8, 16, 0, 14, 10, 6, 6, 8, 6, 4),
    herd: ['animal-llama', 'animal-guinea-pig', 'animal-dog'],
    crops: ['potato', 'quinoa'],
  },
  'new-guinea-highland-farmer': {
    en: 'Highland gardeners of New Guinea',
    de: 'Gartenbauern im Hochland Neuguineas',
    farmingRegions: ['new-guinea'],
    architecture: ['shelter-highland-new-guinea-house'],
    tools: { man: 'digging-stick', woman: 'basket', child: 'none' },
    mix: mix(34, 6, 0, 0, 6, 12, 4, 12, 16, 0, 10),
    herd: ['animal-dog'],
    crops: ['taro', 'banana'],
  },
};
