// Plant kinds and how the BIOME4 classes of the climate data choose them
// (spec foliage.md, sections 2 and 3). Shared by the data build, which
// writes the foliage slices, and the renderer, which places the plants.

export const KINDS = [
  'rainforest',
  'broadleaf',
  'conifer',
  'acacia',
  'palm',
  'olive',
  'cypress',
  'bush',
] as const;
export type Kind = (typeof KINDS)[number];

export const RAINFOREST = 0;
export const BROADLEAF = 1;
export const CONIFER = 2;
export const ACACIA = 3;
export const PALM = 4;
export const OLIVE = 5;
export const CYPRESS = 6;
export const BUSH = 7;

/** A recipe: plant kinds and the share of slots each one takes. */
export type Recipe = readonly (readonly [number, number])[];

/** BIOME4 class (Beyer, Krapp and Manica 2020) to plant kinds; missing classes are bare. */
export const BIOME_RECIPES: Readonly<Record<number, Recipe>> = {
  1: [[RAINFOREST, 1.0]], // tropical evergreen forest
  2: [
    [RAINFOREST, 0.85],
    [BROADLEAF, 0.1],
  ], // tropical semi-deciduous forest
  3: [
    [BROADLEAF, 0.45],
    [ACACIA, 0.15],
  ], // tropical deciduous forest or woodland
  4: [[BROADLEAF, 0.9]], // temperate deciduous forest
  5: [[CONIFER, 0.9]], // temperate conifer forest
  6: [
    [BROADLEAF, 0.6],
    [CONIFER, 0.25],
  ], // warm mixed forest
  7: [
    [BROADLEAF, 0.45],
    [CONIFER, 0.45],
  ], // cool mixed forest
  8: [[CONIFER, 0.9]], // cool conifer forest
  9: [
    [CONIFER, 0.6],
    [BROADLEAF, 0.2],
  ], // cold mixed forest
  10: [[CONIFER, 0.85]], // evergreen taiga or montane forest
  11: [[CONIFER, 0.7]], // deciduous taiga or montane forest
  12: [
    [ACACIA, 0.3],
    [BUSH, 0.1],
  ], // tropical savanna
  13: [
    [ACACIA, 0.12],
    [BUSH, 0.18],
  ], // tropical xerophytic shrubland
  14: [[BUSH, 0.22]], // temperate xerophytic shrubland
  15: [
    [OLIVE, 0.4],
    [CYPRESS, 0.12],
    [BUSH, 0.1],
  ], // temperate sclerophyll woodland
  16: [[BROADLEAF, 0.3]], // temperate broadleaved savanna
  17: [[CONIFER, 0.35]], // open conifer woodland
  18: [
    [CONIFER, 0.3],
    [BUSH, 0.1],
  ], // boreal parkland
  19: [[ACACIA, 0.05]], // tropical grassland
  20: [[BUSH, 0.03]], // temperate grassland
  22: [[BUSH, 0.04]], // steppe tundra
  23: [[BUSH, 0.22]], // shrub tundra
  24: [[BUSH, 0.1]], // dwarf shrub tundra
};

/** Dry classes: a humid period turns them to savanna, and their rivers get palms. */
export const DRY_CLASSES: ReadonlySet<number> = new Set([13, 14, 19, 20, 21, 22, 27]);

/**
 * A foliage slice stores one byte per 0.5° cell: the BIOME4 class (0 for
 * none), or HUMID_SAVANNA plus 1..127 for the strength of the savanna a
 * humid period makes of a dry class.
 */
export const HUMID_SAVANNA = 128;

/** The plant recipe of a stored foliage byte. */
export function recipeOf(code: number): Recipe {
  if (code > HUMID_SAVANNA) {
    const s = (code - HUMID_SAVANNA) / 127;
    return [
      [ACACIA, 0.3 * s],
      [BUSH, 0.15 * s],
    ];
  }
  return BIOME_RECIPES[code] ?? [];
}

/** Whether a stored foliage byte is dry land whose rivers get palms. */
export function isDry(code: number): boolean {
  return code < HUMID_SAVANNA && DRY_CLASSES.has(code);
}

/** The kind a slot's hash roll (0..1) picks from a recipe, or -1 for none. */
export function pickKind(recipe: Recipe, roll: number): number {
  let acc = 0;
  for (const [kind, share] of recipe) {
    acc += share;
    if (roll < acc) return kind;
  }
  return -1;
}
