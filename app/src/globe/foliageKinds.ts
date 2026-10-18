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

/** Ground colour (linear 0..1 RGB) and strength of the vegetation tint (spec foliage.md, section 6). */
export type Ground = readonly [number, number, number, number];

const RAINFOREST_FLOOR: Ground = [0.13, 0.5, 0.22, 0.9];
const BROADLEAF_FLOOR: Ground = [0.27, 0.58, 0.22, 0.85];
const CONIFER_FLOOR: Ground = [0.22, 0.47, 0.3, 0.85];
const SAVANNA: Ground = [0.6, 0.72, 0.3, 0.8];
const GRASSLAND: Ground = [0.52, 0.74, 0.3, 0.85];
const MEDITERRANEAN: Ground = [0.56, 0.62, 0.32, 0.8];
const DRY_SHRUB: Ground = [0.79, 0.71, 0.4, 0.6];
const PARKLAND: Ground = [0.44, 0.59, 0.33, 0.8];
const TUNDRA: Ground = [0.62, 0.66, 0.46, 0.65];
const STEPPE_TUNDRA: Ground = [0.74, 0.7, 0.44, 0.7];
/** Ground of a forest whose trees the tree density removed: open steppe. */
const OPEN_STEPPE: readonly [number, number, number] = [0.72, 0.69, 0.42];

/** BIOME4 class to ground; missing classes (desert, barren, ice) keep the milestone 1 colours. */
const BIOME_GROUND: Readonly<Record<number, Ground>> = {
  1: RAINFOREST_FLOOR,
  2: RAINFOREST_FLOOR,
  3: [0.36, 0.62, 0.22, 0.8],
  4: BROADLEAF_FLOOR,
  5: CONIFER_FLOOR,
  6: BROADLEAF_FLOOR,
  7: [0.25, 0.53, 0.26, 0.85],
  8: CONIFER_FLOOR,
  9: CONIFER_FLOOR,
  10: CONIFER_FLOOR,
  11: CONIFER_FLOOR,
  12: SAVANNA,
  13: DRY_SHRUB,
  14: DRY_SHRUB,
  15: MEDITERRANEAN,
  16: [0.48, 0.68, 0.28, 0.8],
  17: PARKLAND,
  18: PARKLAND,
  19: [0.6, 0.74, 0.3, 0.8],
  20: GRASSLAND,
  22: STEPPE_TUNDRA,
  23: TUNDRA,
  24: [0.66, 0.68, 0.5, 0.6],
  25: [0.72, 0.72, 0.58, 0.5],
  26: [0.75, 0.74, 0.62, 0.4],
};

/** The ground under a stored foliage byte with a tree density (0..1). */
export function groundOf(code: number, density: number): Ground {
  if (code > HUMID_SAVANNA) {
    const s = (code - HUMID_SAVANNA) / 127;
    return [SAVANNA[0], SAVANNA[1], SAVANNA[2], SAVANNA[3] * s];
  }
  const g = BIOME_GROUND[code];
  if (!g) return [0, 0, 0, 0];
  // Thinned trees leave open steppe between them.
  const open = recipeOf(code).some(([kind]) => kind !== BUSH) ? 1 - density : 0;
  return [
    g[0] + (OPEN_STEPPE[0] - g[0]) * open,
    g[1] + (OPEN_STEPPE[1] - g[1]) * open,
    g[2] + (OPEN_STEPPE[2] - g[2]) * open,
    g[3],
  ];
}
