// Curated claymation palette and canonical scale constants (docs/spec/art-direction.md).
// Refactored from neolithicHouses.ts, eastAsiaAmericasHouses.ts, and shelters.ts while keeping
// exact hex values so approved model geometry hashes remain bit-identical.

export const ART_SCALE = {
  adultHeightM: 1.7,
  childHeightM: 1.05,
  doorWidthRangeM: [0.75, 0.9] as const,
  doorHeightRangeM: [1.1, 1.5] as const,
  minShelterHeightM: 1.85,
  plinthDepthM: 1.5,
  maxShelterTris: 1000,
  maxCropTris: 120,
} as const;

export const TIMBER = {
  pole: '#7a5030',
  oakWest: '#b88a54',
  oakEast: '#c9a064',
  bark: '#7d6650',
  cane: '#d9bb7c',
  lash: '#8a5f38',
  firewoodDark: '#5a3a22',
  firewoodLight: '#6a4528',
  canoeHull: '#9a6438',
  canoeRim: '#d9b27a',
} as const;

export const EARTH = {
  mud: '#cdb184',
  brick: '#c9a577',
  plaster: '#e2d3ac',
  earth: '#c3ab7c',
  daubWest: '#d6bf92',
  daubEast: '#cdb48a',
  loess: '#c2a15f',
  reedBase: '#b59a6a',
  natufianBase: '#9a8463',
  ochre: '#b5502f',
  burialEarth: '#7a5a3c',
  burialShroud: '#a88f68',
  burialOchre: '#a3412a',
} as const;

export const ROOF = {
  thatchGold: '#d2b865',
  thatchStraw: '#cdb26a',
  reed: '#d6c27c',
  palmLeaf: '#6f8a45',
  brushLeaf: '#6f8a3c',
  burialStraw: '#b9a766',
} as const;

export const OPENING = {
  door: '#3a2a20',
  grassDoor: '#5b3b26',
  trench: '#2b211a',
  canoeHollow: '#3e2a1c',
  roastMeat: '#8b3a26',
} as const;

export const SHELTER = {
  hide: '#b58b5c',
  dryingHide: '#c9a171',
  bone: '#ece2cc',
  ivoryBead: '#efe6d2',
  ivorySpear: '#e9dfc6',
  rockDark: '#8e877c',
  rockLight: '#a39b8e',
  rockShadow: '#857e72',
  flameOuter: '#f08a2c',
  flameMid: '#f6b23b',
  flameCore: '#ffe08a',
  torchEmber: '#ffd166',
  signSteel: '#8e9aa6',
  signBlue: '#3d86e6',
  signWhite: '#f4f1e8',
} as const;

export const PLINTH = {
  levant: '#9b8362',
  anatolia: '#9c8566',
  lbk: '#8f7a5c',
  mehrgarh: '#9a7f5e',
  egypt: '#9a825c',
  loess: '#9e824c',
  mesoamerica: '#9b8460',
  andeanStone: '#8c867b',
  hide: '#8c7a5b',
  boneHut: '#8a795d',
  windbreak: '#857e72',
  leanTo: '#8b785a',
} as const;
