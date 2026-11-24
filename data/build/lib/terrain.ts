// Terrain tiles for every quadtree level up to DATA_MAX_LEVEL
// (spec milestone 1, sections 4.2 and 10.5).

import {
  DATA_MAX_LEVEL,
  TILE_N,
  dirToLatLon,
  faceUvToDir,
  type TileKey,
  type Vec3,
} from '../../../app/src/geo/cube.ts';
import {
  DEEP_HEIGHT,
  TERRAIN_BORDERED,
  TERRAIN_SAMPLES,
  type TerrainTile,
} from '../../../app/src/content/formats.ts';
import { Grid, type GridData, type GridPyramid } from './grid.ts';
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
  const size = 2 / (1 << key.level);
  const w = inputs.lakes.width;
  const h = inputs.lakes.height;
  const sameSize =
    inputs.lakeLevel.width === w &&
    inputs.lakeLevel.height === h &&
    oceanGrid.width === w &&
    oceanGrid.height === h &&
    inputs.rivers.width === w &&
    inputs.rivers.height === h &&
    inputs.flowCos.width === w &&
    inputs.flowCos.height === h &&
    inputs.flowSin.width === w &&
    inputs.flowSin.height === h &&
    inputs.coast.width === w &&
    inputs.coast.height === h &&
    (!inputs.lakeNear || (inputs.lakeNear.width === w && inputs.lakeNear.height === h));
  const hSame = sameSize && hgrid.width === w && hgrid.height === h;
  const lakeData = inputs.lakes.data;
  const lakeLevelData = inputs.lakeLevel.data;
  const lakeNearData = inputs.lakeNear?.data;
  const oceanData = oceanGrid.data;
  const riverData = inputs.rivers.data;
  const flowCosData = inputs.flowCos.data;
  const flowSinData = inputs.flowSin.data;
  const coastData = inputs.coast.data;
  const hData = hgrid.data;

  for (let j = -1; j <= TILE_N + 1; j++) {
    const v = -1 + (key.y + j / TILE_N) * size;
    const jOk = j >= 0 && j <= TILE_N;
    for (let i = -1; i <= TILE_N + 1; i++) {
      const u = -1 + (key.x + i / TILE_N) * size;
      faceUvToDir(key.face, u, v, dir);
      const { lat, lon } = dirToLatLon(dir);
      const inner = i >= 0 && jOk && i <= TILE_N;
      let height: number;
      let lakeField: number;
      let lake: number;
      let near = NO_LAKE;
      let oceanVal = 0;
      let riverVal = 0;
      let flowCosVal = 0;
      let flowSinVal = 0;
      let coastVal = 0;
      if (sameSize) {
        const c = ((lon + 180) / 360) * w - 0.5;
        const r = ((90 - lat) / 180) * h - 0.5;
        const c0 = Math.floor(c);
        const r0 = Math.floor(r);
        const fc = c - c0;
        const fr = r - r0;
        const cc0 = ((c0 % w) + w) % w;
        const cc1 = cc0 === w - 1 ? 0 : cc0 + 1;
        const rr0 = r0 < 0 ? 0 : r0 >= h ? h - 1 : r0;
        const rr1 = r0 + 1 < 0 ? 0 : r0 + 1 >= h ? h - 1 : r0 + 1;
        const i00 = rr0 * w + cc0;
        const i10 = rr0 * w + cc1;
        const i01 = rr1 * w + cc0;
        const i11 = rr1 * w + cc1;
        const nc = ((Math.round(c) % w) + w) % w;
        const nrRaw = Math.round(r);
        const nr = nrRaw < 0 ? 0 : nrRaw >= h ? h - 1 : nrRaw;
        const iNear = nr * w + nc;
        const omfc = 1 - fc;
        const omfr = 1 - fr;
        const sample = (g: GridData) =>
          (g[i00]! * omfc + g[i10]! * fc) * omfr + (g[i01]! * omfc + g[i11]! * fc) * fr;
        height = hSame ? sample(hData) : hgrid.bilinear(lat, lon);
        lakeField = sample(lakeData);
        lake = lakeLevelData[iNear]!;
        if (lakeNearData) near = lakeNearData[iNear]!;
        if (inner) {
          oceanVal = sample(oceanData);
          riverVal = sample(riverData);
          flowCosVal = sample(flowCosData);
          flowSinVal = sample(flowSinData);
          coastVal = sample(coastData);
        }
      } else {
        height = hgrid.bilinear(lat, lon);
        lakeField = inputs.lakes.bilinear(lat, lon);
        lake = inputs.lakeLevel.nearest(lat, lon);
        if (inputs.lakeNear) near = inputs.lakeNear.nearest(lat, lon);
        if (inner) {
          oceanVal = oceanGrid.bilinear(lat, lon);
          riverVal = inputs.rivers.bilinear(lat, lon);
          flowCosVal = inputs.flowCos.bilinear(lat, lon);
          flowSinVal = inputs.flowSin.bilinear(lat, lon);
          coastVal = inputs.coast.bilinear(lat, lon);
        }
      }
      if (lake !== NO_LAKE && lakeField >= 100) height = lake;
      else if (near !== NO_LAKE && lakeField > SHORE_FROM) {
        // A lake's shore slopes down to its water instead of standing over it as a wall
        // (section 4.3): the land's rise above the nearest lake shrinks as its field rises.
        const t = Math.min(1, (lakeField - SHORE_FROM) / (100 - SHORE_FROM));
        height = near + Math.max(0, height - near) * (1 - t * t * (3 - 2 * t));
      }
      if (inner) {
        const s = j * TERRAIN_SAMPLES + i;
        ocean[s] = Math.round(oceanVal);
        lakes[s] = Math.round(lakeField);
        rivers[s] = Math.round(riverVal);
        flow[s * 2] = Math.round(flowCosVal);
        flow[s * 2 + 1] = Math.round(flowSinVal);
        bed[s] = Math.round(inputs.bed(lat, lon));
        coast[s] = Math.round(coastVal);
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
