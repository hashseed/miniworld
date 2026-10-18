// The vertex data of one terrain tile (spec milestone 1, section 4.2): a grid
// of (TILE_N + 1)² vertices plus skirts that hide cracks between levels.
// Positions are relative to the tile centre for precision; heights, ocean
// levels and coast distances are attributes the shader turns into the
// visible surface. Plain typed arrays and no Three.js, so a terrain worker
// can build them (section 11.5).

import { TERRAIN_BORDERED, TERRAIN_SAMPLES } from '../content/formats.ts';
import {
  TILE_N,
  faceUvToDir,
  tileAngularSize,
  tileSampleUv,
  type TileKey,
  type Vec3,
} from '../geo/cube.ts';
import { EARTH_RADIUS_KM } from '../geo/earth.ts';
import type { TileSamples } from './terrainStore.ts';

const S = TERRAIN_SAMPLES;
const B = TERRAIN_BORDERED;
const GRID_VERTS = S * S;
const SKIRT_VERTS = 4 * S;
export const TILE_VERTS = GRID_VERTS + SKIRT_VERTS;

/** Ocean level (m) above which a sample is land at every date. */
const NEVER_SEA_M = 10;

export interface TileArrays {
  position: Float32Array;
  normal: Int8Array;
  elev: Int16Array;
  extra: Uint8Array;
  flow: Int8Array;
  fieldUv: Uint16Array;
  /**
   * Ocean level (m), lake field and river field per sample as half floats,
   * which the fragment shader samples with a smooth cubic filter so coasts,
   * lakes and rivers stay smooth curves at every zoom (sections 4.3 and 5.1).
   */
  fieldData: Uint16Array;
  centre: Vec3;
  /** Bounding sphere radius in km, including relief. */
  radius: number;
  minHeight: number;
  maxHeight: number;
  /** Sea at every date, with no lake or river: drawn as the sea surface alone. */
  alwaysSea: boolean;
  /** Land at every date: needs no sea surface. */
  neverSea: boolean;
  /** True when the winding of the grid is flipped. */
  flip: boolean;
}

/**
 * Builds a tile's vertex data from its samples at the given elevation
 * exaggeration; samples below the lowest sea level of the timeline are sea
 * at every date.
 */
export function buildTileArrays(
  key: TileKey,
  samples: TileSamples,
  exaggeration: number,
  lowestSeaLevel = -130,
): TileArrays {
  const R = EARTH_RADIUS_KM;
  const k = exaggeration * 0.001;
  const c = tileSampleUv(key, TILE_N / 2, TILE_N / 2);
  const cd = faceUvToDir(key.face, c.u, c.v);
  const centre: Vec3 = [cd[0] * R, cd[1] * R, cd[2] * R];

  // Directions for every bordered sample.
  const dirs = new Float64Array(B * B * 3);
  const d: Vec3 = [0, 0, 0];
  for (let j = -1; j <= TILE_N + 1; j++)
    for (let i = -1; i <= TILE_N + 1; i++) {
      const { u, v } = tileSampleUv(key, i, j);
      faceUvToDir(key.face, u, v, d);
      const o = ((j + 1) * B + (i + 1)) * 3;
      dirs[o] = d[0];
      dirs[o + 1] = d[1];
      dirs[o + 2] = d[2];
    }
  const hb = samples.heights;
  const displaced = (i: number, j: number, out: number[]) => {
    const b = (j + 1) * B + (i + 1);
    const r = R + Math.max(hb[b]!, 0) * k;
    out[0] = dirs[b * 3]! * r;
    out[1] = dirs[b * 3 + 1]! * r;
    out[2] = dirs[b * 3 + 2]! * r;
  };

  const position = new Float32Array(TILE_VERTS * 3);
  const normal = new Int8Array(TILE_VERTS * 4);
  const elev = new Int16Array(TILE_VERTS * 3);
  const extra = new Uint8Array(TILE_VERTS * 4);
  const flow = new Int8Array(TILE_VERTS * 2);
  const fieldUv = new Uint16Array(TILE_VERTS * 2);
  const fieldData = new Uint16Array(S * S * 4);

  const pa = [0, 0, 0];
  const pb = [0, 0, 0];
  const pc = [0, 0, 0];
  const pd = [0, 0, 0];
  let minH = Infinity;
  let maxH = -Infinity;
  let flipCheck = 0;
  for (let j = 0; j <= TILE_N; j++)
    for (let i = 0; i <= TILE_N; i++) {
      const v = j * S + i;
      const b = (j + 1) * B + (i + 1);
      const h = hb[b]!;
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
      position[v * 3] = dirs[b * 3]! * R - centre[0];
      position[v * 3 + 1] = dirs[b * 3 + 1]! * R - centre[1];
      position[v * 3 + 2] = dirs[b * 3 + 2]! * R - centre[2];
      // Normal of the exaggerated land surface from central differences.
      displaced(i + 1, j, pa);
      displaced(i - 1, j, pb);
      displaced(i, j + 1, pc);
      displaced(i, j - 1, pd);
      const ux = pa[0]! - pb[0]!,
        uy = pa[1]! - pb[1]!,
        uz = pa[2]! - pb[2]!;
      const vx = pc[0]! - pd[0]!,
        vy = pc[1]! - pd[1]!,
        vz = pc[2]! - pd[2]!;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const dot = nx * dirs[b * 3]! + ny * dirs[b * 3 + 1]! + nz * dirs[b * 3 + 2]!;
      if (i === TILE_N / 2 && j === TILE_N / 2) flipCheck = dot;
      if (dot < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      normal[v * 4] = Math.round((nx / len) * 127);
      normal[v * 4 + 1] = Math.round((ny / len) * 127);
      normal[v * 4 + 2] = Math.round((nz / len) * 127);
      elev[v * 3] = Math.round(h);
      // Decimetres, so flat coasts do not move in whole-metre steps.
      elev[v * 3 + 1] = Math.max(-30000, Math.min(30000, Math.round(samples.oceanLevel[v]! * 10)));
      elev[v * 3 + 2] = Math.round(samples.bed[v]!);
      fieldUv[v * 2] = Math.round(((i + 0.5) / S) * 65535);
      fieldUv[v * 2 + 1] = Math.round(((j + 0.5) / S) * 65535);
      fieldData[v * 4] = toHalfFloat(samples.oceanLevel[v]!);
      fieldData[v * 4 + 1] = toHalfFloat(Math.min(1, samples.lake[v]!));
      fieldData[v * 4 + 2] = toHalfFloat(Math.min(1, samples.rivers[v]!));
      extra[v * 4] = Math.round(Math.min(1, samples.lake[v]!) * 255);
      extra[v * 4 + 1] = Math.round(Math.min(1, samples.rivers[v]!) * 255);
      extra[v * 4 + 3] = Math.round(samples.coast[v]!); // km from today's coast
      flow[v * 2] = Math.round(samples.flow[v * 2]! * 127);
      flow[v * 2 + 1] = Math.round(samples.flow[v * 2 + 1]! * 127);
    }
  // Skirt vertices copy their edge vertex and are pulled down in the shader.
  const edges = [
    (t: number) => t, // bottom j = 0
    (t: number) => TILE_N * S + t, // top
    (t: number) => t * S, // left i = 0
    (t: number) => t * S + TILE_N, // right
  ];
  for (let e = 0; e < 4; e++)
    for (let t = 0; t <= TILE_N; t++) {
      const src = edges[e]!(t);
      const dst = GRID_VERTS + e * S + t;
      position.copyWithin(dst * 3, src * 3, src * 3 + 3);
      normal.copyWithin(dst * 4, src * 4, src * 4 + 4);
      elev.copyWithin(dst * 3, src * 3, src * 3 + 3);
      extra.copyWithin(dst * 4, src * 4, src * 4 + 4);
      extra[dst * 4 + 2] = 255;
      flow.copyWithin(dst * 2, src * 2, src * 2 + 2);
      fieldUv.copyWithin(dst * 2, src * 2, src * 2 + 2);
    }

  const reliefKm = (Math.max(maxH, 0) + 9000) * k;
  const radius = R * tileAngularSize(key.level) * 0.75 + reliefKm;
  let alwaysSea = true;
  let neverSea = true;
  for (let v = 0; v < S * S; v++) {
    const level = samples.oceanLevel[v]!;
    if (level >= lowestSeaLevel || samples.lake[v]! > 0 || samples.rivers[v]! > 0)
      alwaysSea = false;
    if (level <= NEVER_SEA_M) neverSea = false;
  }
  return {
    position,
    normal,
    elev,
    extra,
    flow,
    fieldUv,
    fieldData,
    centre,
    radius,
    minHeight: minH,
    maxHeight: maxH,
    alwaysSea,
    neverSea,
    flip: flipCheck < 0,
  };
}

/** Every typed array of a tile, to transfer from a worker without copying. */
export function tileBuffers(t: TileArrays): ArrayBuffer[] {
  return [t.position, t.normal, t.elev, t.extra, t.flow, t.fieldUv, t.fieldData].map(
    (a) => a.buffer as ArrayBuffer,
  );
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** A number as a 16-bit float, truncating like Three.js's DataUtils.toHalfFloat. */
export function toHalfFloat(v: number): number {
  f32[0] = Math.max(-65504, Math.min(65504, v));
  const f = u32[0]!;
  const sign = (f >>> 16) & 0x8000;
  const e = ((f >>> 23) & 0xff) - 127;
  const m = f & 0x7fffff;
  if (e < -27) return sign;
  if (e < -14) return sign | ((0x0400 >> (-e - 14)) + (m >> (-e - 1)));
  if (e <= 15) return sign | ((e + 15) << 10) | (m >> 13);
  return sign | 0x7c00;
}
