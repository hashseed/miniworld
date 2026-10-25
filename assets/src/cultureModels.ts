// The models that load with their culture (spec section 10, "Models per culture"): the Neolithic
// houses, tools and village props, and the crops. Their ids are here so the shelters and the app
// can name them without loading them; each module records its builder here when it loads, and
// assets/src/allCultureModels.ts loads them all for the tools and tests.

import type * as THREE from 'three';
import type { Model } from './kit.ts';

/** Houses of the western Old World Neolithic (neolithicHouses.ts). */
export const NEOLITHIC_HOUSES = [
  'shelter-pre-pottery-levant-house',
  'shelter-anatolian-house',
  'shelter-anatolian-house-joined',
  'shelter-lbk-longhouse',
  'shelter-mehrgarh-house',
  'shelter-egyptian-neolithic-hut',
] as const;
export type NeolithicHouseId = (typeof NEOLITHIC_HOUSES)[number];

/** Houses of the East Asian, American and New Guinea Neolithic (eastAsiaAmericasHouses.ts). */
export const EAST_ASIA_AMERICAS_HOUSES = [
  'shelter-yangtze-stilt-house',
  'shelter-yellow-river-pit-house',
  'shelter-mesoamerican-hut',
  'shelter-andean-stone-house',
  'shelter-highland-new-guinea-house',
] as const;
export type EastAsiaAmericasHouseId = (typeof EAST_ASIA_AMERICAS_HOUSES)[number];

/** Neolithic hand tools and village props (neolithicTools.ts). */
export const TOOL_PROPS = [
  'prop-sickle',
  'prop-digging-stick',
  'prop-hoe',
  'prop-ard',
  'prop-yoke',
  'prop-quern',
  'prop-basket',
  'prop-pot-small',
  'prop-pot-large',
  'prop-pot-jar',
  'prop-kiln',
  'prop-granary',
  'prop-silo-pit',
  'prop-pen',
  'prop-well',
] as const;
export type ToolPropId = (typeof TOOL_PROPS)[number];

export function isToolProp(id: string): id is ToolPropId {
  return (TOOL_PROPS as readonly string[]).includes(id);
}

/** Crops of the fields (crops.ts). */
export const CROPS = [
  'emmer',
  'einkorn',
  'barley',
  'millet',
  'rice',
  'maize',
  'squash',
  'potato',
  'quinoa',
  'taro',
  'banana',
  'flax',
  'lentil',
] as const;
export type CropId = (typeof CROPS)[number];

/** The five named stages: bare, sprout, green, ripe, stubble. */
export const STAGES = [0, 0.25, 0.5, 0.75, 1] as const;
/** The stage the approved model is built at. */
export const RIPE_STAGE = 0.75;

/** Spacing of the tufts in a field, in layout metres (spec neolithic/fields-and-crops.md section 1.2). */
export const CROP_SPACING_M: Record<CropId, number> = {
  emmer: 0.11,
  einkorn: 0.11,
  barley: 0.11,
  flax: 0.11,
  lentil: 0.11,
  millet: 0.2,
  rice: 0.2,
  maize: 0.2,
  squash: 0.2,
  potato: 0.2,
  quinoa: 0.2,
  taro: 0.2,
  banana: 0.4,
};

const shelters = new Map<string, (id: string) => Model>();
let crops: ((id: CropId, stage: number) => THREE.BufferGeometry) | undefined;

/** Records the builder of shelters and props of a module that has loaded. */
export function registerShelters(ids: readonly string[], build: (id: string) => Model): void {
  for (const id of ids) shelters.set(id, build);
}

/** The builder of a culture's shelter or prop, once its module has loaded. */
export function cultureShelter(id: string): ((id: string) => Model) | undefined {
  return shelters.get(id);
}

/** Records the crops' builder, when crops.ts has loaded. */
export function registerCrops(build: (id: CropId, stage: number) => THREE.BufferGeometry): void {
  crops = build;
}

/** The crops' builder, once crops.ts has loaded. */
export function cropBuilder(): ((id: CropId, stage: number) => THREE.BufferGeometry) | undefined {
  return crops;
}
