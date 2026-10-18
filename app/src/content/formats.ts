// Binary chunk formats shared by the data build and the app
// (spec milestone 1, section 10.5). All numbers are little-endian.

import { TILE_N, type TileKey } from '../globe/cube.ts';

/** Samples per terrain tile edge, including a one-sample border for normals. */
export const TERRAIN_BORDERED = TILE_N + 3;
export const TERRAIN_SAMPLES = TILE_N + 1;

/**
 * Ocean channel: values 0..OCEAN_TOP × OCEAN_SCALE give the sea level
 * (−130 m + v / OCEAN_SCALE) at which a sample is sea. The build smooths this
 * level across coasts (section 5.1), so values above the highest sea level
 * still vary smoothly inland, and stores it in centimetres so flat coasts do
 * not show steps.
 */
export const OCEAN_MIN_LEVEL = -130;
/** Highest sea level in metres above OCEAN_MIN_LEVEL that the flood fill considers. */
export const OCEAN_RANGE = 140;
/** Highest stored ocean value; land that never joins the ocean is stored at OCEAN_MIN_LEVEL + 170 = +40 m. */
export const OCEAN_TOP = 170;
/** Stored ocean values per metre. */
export const OCEAN_SCALE = 100;
/** Raw flood fill result for cells that never join the ocean (build only). */
export const OCEAN_NEVER = 250;

export interface TerrainTile {
  key: TileKey;
  /** Heights in metres, TERRAIN_BORDERED², row-major (j, then i), starting one sample outside. */
  heights: Int16Array;
  /** Smoothed ocean level per sample, 0..OCEAN_TOP × OCEAN_SCALE, TERRAIN_SAMPLES². */
  ocean: Uint16Array;
  /** Smooth lake field 0..255 per sample; a lake where it passes 128. */
  lakes: Uint8Array;
  /** Smooth river field 0..255 per sample; a river where it passes 128. */
  rivers: Uint8Array;
  /** River flow phase as cosine and sine, 128 ± 127, interleaved per sample. */
  flow: Uint8Array;
  /**
   * Heavily smoothed bed height in metres per sample, TERRAIN_SAMPLES²: the
   * ground the ice sheets stand on, so their surface is smooth (section 5.2).
   */
  bed: Int16Array;
  /**
   * Distance from today's smoothed coast in km per sample, TERRAIN_SAMPLES²,
   * 0 at sea and 255 for 255 km or more: land rises no faster than a rounded
   * clay edge allows near the sea (section 4.2).
   */
  coast: Uint8Array;
}

const TERRAIN_MAGIC = 0x3554574d; // "MWT5"

export function encodeTerrainTile(t: TerrainTile): Uint8Array {
  const hb = TERRAIN_BORDERED * TERRAIN_BORDERED * 2;
  const sb = TERRAIN_SAMPLES * TERRAIN_SAMPLES;
  const buf = new ArrayBuffer(16 + hb + sb * 9);
  const dv = new DataView(buf);
  dv.setUint32(0, TERRAIN_MAGIC, true);
  dv.setUint8(4, t.key.level);
  dv.setUint8(5, t.key.face);
  dv.setUint32(8, t.key.x, true);
  dv.setUint32(12, t.key.y, true);
  const out = new Uint8Array(buf);
  const h = new Int16Array(buf, 16, TERRAIN_BORDERED * TERRAIN_BORDERED);
  h.set(t.heights);
  new Uint16Array(buf, 16 + hb, sb).set(t.ocean);
  out.set(t.lakes, 16 + hb + sb * 2);
  out.set(t.rivers, 16 + hb + sb * 3);
  out.set(t.flow, 16 + hb + sb * 4);
  new Int16Array(buf, 16 + hb + sb * 6, sb).set(t.bed);
  out.set(t.coast, 16 + hb + sb * 8);
  return out;
}

export function decodeTerrainTile(bytes: ArrayBuffer): TerrainTile {
  const dv = new DataView(bytes);
  if (dv.getUint32(0, true) !== TERRAIN_MAGIC) throw new Error('Not a terrain tile');
  const key = {
    level: dv.getUint8(4),
    face: dv.getUint8(5),
    x: dv.getUint32(8, true),
    y: dv.getUint32(12, true),
  };
  const hb = TERRAIN_BORDERED * TERRAIN_BORDERED * 2;
  const sb = TERRAIN_SAMPLES * TERRAIN_SAMPLES;
  return {
    key,
    heights: new Int16Array(bytes.slice(16, 16 + hb)),
    ocean: new Uint16Array(bytes.slice(16 + hb, 16 + hb + sb * 2)),
    lakes: new Uint8Array(bytes, 16 + hb + sb * 2, sb),
    rivers: new Uint8Array(bytes, 16 + hb + sb * 3, sb),
    flow: new Uint8Array(bytes, 16 + hb + sb * 4, sb * 2),
    bed: new Int16Array(bytes.slice(16 + hb + sb * 6, 16 + hb + sb * 8)),
    coast: new Uint8Array(bytes, 16 + hb + sb * 8, sb),
  };
}

/**
 * Climate slices (spec milestone 1, sections 4.3 and 5.2): one global file
 * per time step with the ice border distance on a 0.5° grid and the aridity
 * on a 1° grid, both latitude-longitude, row 0 at the north pole.
 */
export const ICE_GRID_W = 720;
export const ICE_GRID_H = 360;
export const ARID_GRID_W = 360;
export const ARID_GRID_H = 180;
/**
 * Km per step of the stored ice distance, and the byte of the ice border:
 * the distance runs from 128 km outside the ice to 892 km inside.
 */
export const ICE_DISTANCE_STEP_KM = 4;
export const ICE_DISTANCE_ZERO = 32;
/** Levels the aridity is stored at, so the slices stay small. */
export const ARIDITY_LEVELS = 16;

export interface ClimateSlice {
  day: number;
  /** Signed distance from the ice border, 32 + km / 4, positive inside the ice. */
  ice: Uint8Array;
  /** Aridity from 0 (green) to 255 (full desert). */
  aridity: Uint8Array;
}

const CLIMATE_MAGIC = 0x3143574d; // "MWC1"

export function encodeClimateSlice(c: ClimateSlice): Uint8Array {
  const ib = ICE_GRID_W * ICE_GRID_H;
  const ab = ARID_GRID_W * ARID_GRID_H;
  const out = new Uint8Array(16 + ib + ab);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, CLIMATE_MAGIC, true);
  dv.setInt32(4, c.day, true);
  dv.setUint16(8, ICE_GRID_W, true);
  dv.setUint16(10, ICE_GRID_H, true);
  dv.setUint16(12, ARID_GRID_W, true);
  dv.setUint16(14, ARID_GRID_H, true);
  // Each row is stored as differences from its left neighbour, so the
  // smooth fields compress well.
  out.set(rowDeltas(c.ice, ICE_GRID_W, 1), 16);
  out.set(rowDeltas(c.aridity, ARID_GRID_W, 1), 16 + ib);
  return out;
}

export function decodeClimateSlice(bytes: ArrayBuffer): ClimateSlice {
  const dv = new DataView(bytes);
  if (dv.getUint32(0, true) !== CLIMATE_MAGIC) throw new Error('Not a climate slice');
  if (dv.getUint16(8, true) !== ICE_GRID_W || dv.getUint16(12, true) !== ARID_GRID_W)
    throw new Error('Unexpected climate grid');
  const ib = ICE_GRID_W * ICE_GRID_H;
  const ab = ARID_GRID_W * ARID_GRID_H;
  return {
    day: dv.getInt32(4, true),
    ice: rowDeltas(new Uint8Array(bytes, 16, ib), ICE_GRID_W, -1),
    aridity: rowDeltas(new Uint8Array(bytes, 16 + ib, ab), ARID_GRID_W, -1),
  };
}

/** Row deltas modulo 256: direction 1 encodes, -1 decodes. */
function rowDeltas(g: Uint8Array, w: number, direction: 1 | -1): Uint8Array {
  const out = new Uint8Array(g.length);
  for (let i = 0; i < g.length; i++) {
    if (i % w === 0) out[i] = g[i]!;
    else if (direction === 1) out[i] = (g[i]! - g[i - 1]!) & 255;
    else out[i] = (g[i]! + out[i - 1]!) & 255;
  }
  return out;
}

/**
 * Foliage slices (spec foliage.md, section 2): one global file per climate
 * step with two bytes per 0.5° cell, latitude-longitude from 90°N to 60°S,
 * row 0 at the north pole: the foliage class (globe/foliageKinds.ts) and the
 * tree density (0..255 for 0..1), stored as two planes. South of it nothing grows.
 */
export const FOLIAGE_GRID_W = 720;
export const FOLIAGE_GRID_H = 300;
export const FOLIAGE_SOUTH = -60;

export interface FoliageSlice {
  day: number;
  cells: Uint8Array;
  density: Uint8Array;
}

const FOLIAGE_MAGIC = 0x3246574d; // "MWF2"

export function encodeFoliageSlice(f: FoliageSlice): Uint8Array {
  const n = FOLIAGE_GRID_W * FOLIAGE_GRID_H;
  const out = new Uint8Array(12 + 2 * n);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, FOLIAGE_MAGIC, true);
  dv.setInt32(4, f.day, true);
  dv.setUint16(8, FOLIAGE_GRID_W, true);
  dv.setUint16(10, FOLIAGE_GRID_H, true);
  out.set(f.cells, 12);
  out.set(f.density, 12 + n);
  return out;
}

export function decodeFoliageSlice(bytes: ArrayBuffer): FoliageSlice {
  const dv = new DataView(bytes);
  if (dv.getUint32(0, true) !== FOLIAGE_MAGIC) throw new Error('Not a foliage slice');
  if (dv.getUint16(8, true) !== FOLIAGE_GRID_W || dv.getUint16(10, true) !== FOLIAGE_GRID_H)
    throw new Error('Unexpected foliage grid');
  const n = FOLIAGE_GRID_W * FOLIAGE_GRID_H;
  return {
    day: dv.getInt32(4, true),
    cells: new Uint8Array(bytes.slice(12, 12 + n)),
    density: new Uint8Array(bytes.slice(12 + n, 12 + 2 * n)),
  };
}
