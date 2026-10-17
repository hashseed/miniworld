// Terrain tiles for every quadtree level up to DATA_MAX_LEVEL
// (spec milestone 1, sections 4.2 and 10.5).

import {
  DATA_MAX_LEVEL,
  TILE_N,
  dirToLatLon,
  faceUvToDir,
  tileSampleUv,
  type TileKey,
  type Vec3,
} from '../../../app/src/globe/cube.ts';
import {
  OCEAN_LAKE,
  TERRAIN_BORDERED,
  TERRAIN_SAMPLES,
  type TerrainTile,
} from '../../../app/src/content/formats.ts';
import type { Grid, GridPyramid } from './grid.ts';
import { NO_LAKE } from './water.ts';

export const DEEP_CLAMP = -1000;

export interface TerrainInputs {
  heights: GridPyramid;
  /** Grids at the ocean-mask resolution. */
  ocean: Grid<Uint8Array>;
  lakeLevel: Grid<Int16Array>;
  rivers: Grid<Uint8Array>;
}

export function buildTerrainTile(key: TileKey, inputs: TerrainInputs): TerrainTile {
  const spacingDeg = (90 / (1 << key.level) / TILE_N) * 1.0;
  const hgrid = inputs.heights.forSpacing(spacingDeg);
  const heights = new Int16Array(TERRAIN_BORDERED * TERRAIN_BORDERED);
  const ocean = new Uint8Array(TERRAIN_SAMPLES * TERRAIN_SAMPLES);
  const rivers = new Uint8Array(TERRAIN_SAMPLES * TERRAIN_SAMPLES);
  const dir: Vec3 = [0, 0, 0];
  for (let j = -1; j <= TILE_N + 1; j++) {
    for (let i = -1; i <= TILE_N + 1; i++) {
      const { u, v } = tileSampleUv(key, i, j);
      faceUvToDir(key.face, u, v, dir);
      const { lat, lon } = dirToLatLon(dir);
      let height = hgrid.bilinear(lat, lon);
      const inner = i >= 0 && j >= 0 && i <= TILE_N && j <= TILE_N;
      const lake = inputs.lakeLevel.nearest(lat, lon);
      if (lake !== NO_LAKE) height = lake;
      if (inner) {
        const s = j * TERRAIN_SAMPLES + i;
        ocean[s] = lake !== NO_LAKE ? OCEAN_LAKE : inputs.ocean.nearest(lat, lon);
        rivers[s] = inputs.rivers.nearest(lat, lon);
      }
      heights[(j + 1) * TERRAIN_BORDERED + (i + 1)] = Math.max(DEEP_CLAMP, Math.round(height));
    }
  }
  return { key, heights, ocean, rivers };
}

/** True when a tile is entirely clamped deep ocean, so it needs no file. */
export function isDeepTile(t: TerrainTile): boolean {
  for (let k = 0; k < t.heights.length; k++) if (t.heights[k]! > DEEP_CLAMP) return false;
  for (let k = 0; k < t.ocean.length; k++) if (t.ocean[k] !== 0 || t.rivers[k] !== 0) return false;
  return true;
}

export function* allTileKeys(maxLevel = DATA_MAX_LEVEL): Generator<TileKey> {
  for (let level = 0; level <= maxLevel; level++) {
    const n = 1 << level;
    for (let face = 0; face < 6; face++)
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) yield { face, level, x, y };
  }
}
