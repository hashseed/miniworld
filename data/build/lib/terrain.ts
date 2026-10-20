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
} from '../../../app/src/geo/cube.ts';
import {
  DEEP_HEIGHT,
  TERRAIN_BORDERED,
  TERRAIN_SAMPLES,
  type TerrainTile,
} from '../../../app/src/content/formats.ts';
import { Grid, type GridPyramid } from './grid.ts';
import { NO_LAKE } from './water.ts';

export interface TerrainInputs {
  heights: GridPyramid;
  /** Grids at the ocean-mask resolution. */
  ocean: Grid<Uint16Array>;
  /** Ocean fields for coarse levels, by level, prefiltered for their sample spacing. */
  coarseOcean?: Map<number, Grid<Uint16Array>>;
  /** Lake surface level per cell, spread to cover the smoothed lakes, or NO_LAKE. */
  lakeLevel: Grid<Int16Array>;
  lakes: Grid<Uint8Array>;
  /** The level of the nearest lake for cells near one (within its smoothed field), or NO_LAKE (lakeNear). */
  lakeNear?: Grid<Int16Array>;
  rivers: Grid<Uint8Array>;
  /** River flow phase cosine and sine, 128 ± 127. */
  flowCos: Grid<Uint8Array>;
  flowSin: Grid<Uint8Array>;
  /** Smoothed bed under the ice sheets, in metres (section 5.2). */
  bed: (lat: number, lon: number) => number;
  /** Distance from today's smoothed coast in km, 0..255 (section 4.2). */
  coast: Grid<Uint8Array>;
}

/** The lake field from which a lake's shore starts sloping down to it (0..255, the shore at 127). */
const SHORE_FROM = 10;

/**
 * For every cell within a lake's smoothed field, the level of the nearest lake cell, spread
 * outwards from the lakes; NO_LAKE elsewhere.
 */
export function lakeNear(lakeLevel: Grid<Int16Array>, lakes: Grid<Uint8Array>): Grid<Int16Array> {
  const { width: w, height: h } = lakeLevel;
  const out = new Int16Array(w * h).fill(NO_LAKE);
  let ring: number[] = [];
  for (let i = 0; i < w * h; i++)
    if (lakeLevel.data[i] !== NO_LAKE) {
      out[i] = lakeLevel.data[i]!;
      ring.push(i);
    }
  while (ring.length) {
    const next: number[] = [];
    for (const i of ring) {
      const r = (i / w) | 0;
      const c = i - r * w;
      for (const j of [r * w + ((c + 1) % w), r * w + ((c - 1 + w) % w), i - w, i + w])
        if (j >= 0 && j < w * h && out[j] === NO_LAKE && lakes.data[j]! > 0) {
          out[j] = out[i]!;
          next.push(j);
        }
    }
    ring = next;
  }
  return new Grid(w, h, out);
}

export function buildTerrainTile(key: TileKey, inputs: TerrainInputs): TerrainTile {
  const spacingDeg = (90 / (1 << key.level) / TILE_N) * 1.0;
  const hgrid = inputs.heights.forSpacing(spacingDeg);
  const heights = new Int16Array(TERRAIN_BORDERED * TERRAIN_BORDERED);
  const ocean = new Uint16Array(TERRAIN_SAMPLES * TERRAIN_SAMPLES);
  const lakes = new Uint8Array(TERRAIN_SAMPLES * TERRAIN_SAMPLES);
  const rivers = new Uint8Array(TERRAIN_SAMPLES * TERRAIN_SAMPLES);
  const flow = new Uint8Array(TERRAIN_SAMPLES * TERRAIN_SAMPLES * 2);
  const bed = new Int16Array(TERRAIN_SAMPLES * TERRAIN_SAMPLES);
  const coast = new Uint8Array(TERRAIN_SAMPLES * TERRAIN_SAMPLES);
  const oceanGrid = inputs.coarseOcean?.get(key.level) ?? inputs.ocean;
  const dir: Vec3 = [0, 0, 0];
  for (let j = -1; j <= TILE_N + 1; j++) {
    for (let i = -1; i <= TILE_N + 1; i++) {
      const { u, v } = tileSampleUv(key, i, j);
      faceUvToDir(key.face, u, v, dir);
      const { lat, lon } = dirToLatLon(dir);
      let height = hgrid.bilinear(lat, lon);
      const inner = i >= 0 && j >= 0 && i <= TILE_N && j <= TILE_N;
      const lakeField = inputs.lakes.bilinear(lat, lon);
      const lake = inputs.lakeLevel.nearest(lat, lon);
      if (lake !== NO_LAKE && lakeField >= 100) height = lake;
      else if (inputs.lakeNear) {
        // A lake's shore slopes down to its water instead of standing over it as a wall
        // (section 4.3): the land's rise above the nearest lake shrinks as its field rises.
        const near = inputs.lakeNear.nearest(lat, lon);
        if (near !== NO_LAKE && lakeField > SHORE_FROM) {
          const t = Math.min(1, (lakeField - SHORE_FROM) / (100 - SHORE_FROM));
          height = near + Math.max(0, height - near) * (1 - t * t * (3 - 2 * t));
        }
      }
      if (inner) {
        const s = j * TERRAIN_SAMPLES + i;
        ocean[s] = Math.round(oceanGrid.bilinear(lat, lon));
        lakes[s] = Math.round(lakeField);
        rivers[s] = Math.round(inputs.rivers.bilinear(lat, lon));
        flow[s * 2] = Math.round(inputs.flowCos.bilinear(lat, lon));
        flow[s * 2 + 1] = Math.round(inputs.flowSin.bilinear(lat, lon));
        bed[s] = Math.round(inputs.bed(lat, lon));
        coast[s] = Math.round(inputs.coast.bilinear(lat, lon));
      }
      heights[(j + 1) * TERRAIN_BORDERED + (i + 1)] = Math.max(DEEP_HEIGHT, Math.round(height));
    }
  }
  return { key, heights, ocean, lakes, rivers, flow, bed, coast };
}

/** True when a tile is entirely clamped deep ocean, so it needs no file. */
export function isDeepTile(t: TerrainTile): boolean {
  for (let k = 0; k < t.heights.length; k++) if (t.heights[k]! > DEEP_HEIGHT) return false;
  for (let k = 0; k < t.ocean.length; k++)
    if (t.ocean[k] !== 0 || t.lakes[k] !== 0 || t.rivers[k] !== 0) return false;
  return true;
}

export function* allTileKeys(maxLevel = DATA_MAX_LEVEL): Generator<TileKey> {
  for (let level = 0; level <= maxLevel; level++) {
    const n = 1 << level;
    for (let face = 0; face < 6; face++)
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) yield { face, level, x, y };
  }
}
