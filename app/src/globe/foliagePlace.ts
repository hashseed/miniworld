// Where the plants of a slot tile stand (spec foliage.md, section 4), as a pure function of
// the tile's terrain samples, the sea level, the ice age and the foliage slices, so it runs in
// the foliage worker as well as on the main thread. The ice sheets of the day are checked
// afterwards on the main thread, which holds them (iceFree).

import { FOLIAGE_GRID_H, FOLIAGE_GRID_W, type FoliageSlice } from '../content/formats.ts';
import { hash01, valueNoise } from '../core/hash.ts';
import {
  TILE_N,
  dirToLatLon,
  faceUvToDir,
  tileAngularSize,
  tileSampleUv,
  type TileKey,
  type Vec3,
} from '../geo/cube.ts';
import { EARTH_RADIUS_KM } from '../geo/earth.ts';
import { BUSH, isDry, PALM, pickKind, recipeOf } from './foliageKinds.ts';
import { bilinear as bilinearGrid, bilinearBordered } from '../planet/sample.ts';
import { groundM } from '../planet/surface.ts';
import { EXAGGERATION } from './exaggeration.ts';
import { CAP_KM_PER_M, snowCap } from './snowCap.ts';
import type { TileSamples } from './terrainStore.ts';

/**
 * Slots (section 4): with the true sizes, plants stand about one per
 * (tile / SLOTS)² of each tile at this level, about 260 km apart. The slots
 * lie on a finer grid of TREE_SLOTS, and where the history lens enlarges the
 * land more of them hold a plant, so plants keep their drawn size and spacing.
 */
export const SLOT_LEVEL = 4;
export const SLOTS = 2.4;
const TREE_SLOTS = 8;
/** Desert rivers get a finer row of palm slots (section 4). */
const PALM_SLOTS = 12;
/** Palm crowns relative to the main slot spacing: palms are as big as other trees. */
const PALM_SCALE = 1;
/** Share of the palm slots on a desert river bank that hold a palm, at true size. */
const PALM_SHARE = 0.1;
/** Smallest plant and size range, relative to the kind's size (section 4). */
const SIZE_MIN = 0.6;
const SIZE_RANGE = 0.8;
/** Crown width relative to the slot spacing, per kind. */
const KIND_SCALE = [1.15, 1.05, 0.85, 1.1, 1.0, 0.85, 0.65, 0.6];
const CROWN = 0.935;
/** Where plants never stand (section 4). */
const MIN_COAST_KM = 2.5;
const MAX_WATER_FIELD = 0.42;
export const ICE_CLEARANCE_KM = 25;
/** River field of the bank band that gets palms in dry land. */
const BANK_FIELD = 0.03;
/** Share of the trees removed by a low tree density that become bushes. */
const THINNED_BUSH = 0.25;

/** A plant a slot can hold; whether it shows, and where, depends on the lens. */
export interface Plant {
  kind: number;
  /** True direction of its spot. */
  dir: Vec3;
  /** Crown size in km and drawn ground height in km before the lens's width factor. */
  size: number;
  groundKm: number;
  /** The slot's hash and its share of used slots at true size (section 4). */
  roll: number;
  share: number;
  turn: number;
  tint: number;
}

/** Tree line in metres: high in the tropics, lower towards the poles. */
export function treeLine(lat: number): number {
  return 3800 - Math.max(0, Math.abs(lat) - 25) * 75;
}

/** The foliage cell of a point, looked up with a wobble so forest edges are soft, or -1. */
function cellOf(lat: number, lon: number): number {
  const jl = (valueNoise(lon * 1.7, lat * 1.7, 5) - 0.5) * 0.9;
  const jo = (valueNoise(lon * 1.7, lat * 1.7, 9) - 0.5) * 0.9;
  const r = Math.floor((90 - (lat + jl)) / 0.5);
  if (r < 0 || r >= FOLIAGE_GRID_H) return -1;
  const c =
    ((Math.floor((lon + jo + 180) / 0.5) % FOLIAGE_GRID_W) + FOLIAGE_GRID_W) % FOLIAGE_GRID_W;
  return r * FOLIAGE_GRID_W + c;
}

const S = TILE_N + 1;

/** Bilinear sample of a per-sample field (TILE_N + 1 squared) at fractional sample coordinates. */
function bilinear(f: Float32Array, fi: number, fj: number): number {
  return bilinearGrid(f, S, fi, fj);
}

/** The plants of one slot tile, before the ice sheets of the day are checked. */
export function placePlants(
  key: TileKey,
  s: TileSamples,
  seaLevel: number,
  glacialIndex: number,
  sa: FoliageSlice,
  sb: FoliageSlice,
  t: number,
): Plant[] {
  const plants: Plant[] = [];
  const seed = key.face * 1000003 + key.level * 7919;
  const edgeKm = EARTH_RADIUS_KM * tileAngularSize(key.level);
  const slot = (n: number, ii: number, jj: number, palmsOnly: boolean) => {
    const gx = key.x * n + ii;
    const gy = key.y * n + jj;
    const h = (k: number) => hash01(seed + n, gx, gy, k);
    const fi = ((ii + 0.15 + 0.7 * h(2)) / n) * TILE_N;
    const fj = ((jj + 0.15 + 0.7 * h(3)) / n) * TILE_N;
    const ocean = bilinear(s.oceanLevel, fi, fj);
    if (ocean <= seaLevel + 1) return;
    const river = bilinear(s.rivers, fi, fj);
    const lake = bilinear(s.lake, fi, fj);
    if (lake > 0.3 || river > MAX_WATER_FIELD) return;
    const coastKm = bilinear(s.coast, fi, fj);
    if (coastKm < MIN_COAST_KM) return;
    const uv = tileSampleUv(key, fi, fj);
    const dir = faceUvToDir(key.face, uv.u, uv.v) as Vec3;
    const height = bilinearBordered(s.heights, fi, fj);
    const { lat, lon } = dirToLatLon(dir);
    if (height > treeLine(lat)) return;
    // Clear of the mountain snow caps as of the ice (section 5.2).
    const cap = snowCap(height, bilinear(s.bed, fi, fj), Math.abs(lat), glacialIndex);
    if (cap * CAP_KM_PER_M > -ICE_CLEARANCE_KM) return;
    // Between two slices each slot switches at its own hashed moment.
    const slice = h(4) < t ? sb : sa;
    const i = cellOf(lat, lon);
    if (i < 0) return;
    const code = slice.cells[i]!;
    let kind: number;
    if (palmsOnly) {
      if (!(river > BANK_FIELD && isDry(code))) return;
      kind = PALM;
    } else kind = isDry(code) && river > BANK_FIELD ? -1 : pickKind(recipeOf(code), h(1));
    // Near the ice and in cold or dry climates trees thin out to open land
    // with a bush here and there (spec foliage.md, section 2).
    if (kind >= 0 && kind !== BUSH && kind !== PALM && h(9) * 255 >= slice.density[i]!)
      kind = h(10) < THINNED_BUSH ? BUSH : -1;
    if (kind < 0) return;

    // Plants keep their size whatever the lens does.
    const spacing = (edgeKm / SLOTS) * (palmsOnly ? PALM_SCALE : 1);
    // Most plants are mid-sized, a few are much bigger.
    plants.push({
      kind,
      dir,
      size: spacing * KIND_SCALE[kind]! * CROWN * (SIZE_MIN + SIZE_RANGE * h(5) * h(5)),
      groundKm:
        groundM({ height, oceanLevel: ocean, lake, bed: height, coastKm }, seaLevel) *
        EXAGGERATION *
        0.001,
      roll: h(8),
      share: palmsOnly ? PALM_SHARE : (SLOTS * SLOTS) / (n * n),
      turn: h(6) * Math.PI * 2,
      tint: 0.88 + 0.24 * h(7),
    });
  };
  for (let jj = 0; jj < TREE_SLOTS; jj++)
    for (let ii = 0; ii < TREE_SLOTS; ii++) slot(TREE_SLOTS, ii, jj, false);
  for (let jj = 0; jj < PALM_SLOTS; jj++)
    for (let ii = 0; ii < PALM_SLOTS; ii++) slot(PALM_SLOTS, ii, jj, true);
  return plants;
}
