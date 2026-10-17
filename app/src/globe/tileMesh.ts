// Geometry for one terrain tile (spec milestone 1, section 4.2): a grid of
// (TILE_N + 1)² vertices plus skirts that hide cracks between levels.
// Positions are relative to the tile centre for precision; heights, ocean
// levels and ice are attributes the shader turns into the visible surface.

import * as THREE from 'three';
import { TERRAIN_BORDERED, TERRAIN_SAMPLES } from '../content/formats.ts';
import {
  TILE_N,
  faceUvToDir,
  tileAngularSize,
  tileSampleUv,
  type TileKey,
  type Vec3,
} from './cube.ts';
import type { TileSamples } from './terrainStore.ts';

export const EARTH_RADIUS_KM = 6371;

const S = TERRAIN_SAMPLES;
const B = TERRAIN_BORDERED;
const GRID_VERTS = S * S;
const SKIRT_VERTS = 4 * S;
export const TILE_VERTS = GRID_VERTS + SKIRT_VERTS;

let sharedIndex: Map<boolean, THREE.BufferAttribute> | undefined;

function indexFor(flip: boolean): THREE.BufferAttribute {
  sharedIndex ??= new Map();
  const cached = sharedIndex.get(flip);
  if (cached) return cached;
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => {
    if (flip) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  };
  for (let j = 0; j < TILE_N; j++)
    for (let i = 0; i < TILE_N; i++)
      quad(j * S + i, j * S + i + 1, (j + 1) * S + i, (j + 1) * S + i + 1);
  // Skirts: edges in order bottom, top, left, right.
  const edge = (k: number) => GRID_VERTS + k;
  for (let i = 0; i < TILE_N; i++) {
    quad(edge(i), edge(i + 1), i, i + 1); // bottom (j = 0)
    quad(TILE_N * S + i, TILE_N * S + i + 1, edge(S + i), edge(S + i + 1)); // top
    quad(edge(2 * S + i), i * S, edge(2 * S + i + 1), (i + 1) * S); // left (i = 0)
    quad(i * S + TILE_N, edge(3 * S + i), (i + 1) * S + TILE_N, edge(3 * S + i + 1)); // right
  }
  const attr = new THREE.BufferAttribute(new Uint16Array(idx), 1);
  sharedIndex.set(flip, attr);
  return attr;
}

export interface TileGeometry {
  geometry: THREE.BufferGeometry;
  centre: THREE.Vector3;
  /** Bounding sphere radius in km, including relief. */
  radius: number;
  minHeight: number;
  maxHeight: number;
}

/** Builds a tile's geometry from its samples at the given elevation exaggeration. */
export function buildTileGeometry(
  key: TileKey,
  samples: TileSamples,
  exaggeration: number,
): TileGeometry {
  const R = EARTH_RADIUS_KM;
  const k = exaggeration * 0.001;
  const c = tileSampleUv(key, TILE_N / 2, TILE_N / 2);
  const cd = faceUvToDir(key.face, c.u, c.v);
  const centre = new THREE.Vector3(cd[0] * R, cd[1] * R, cd[2] * R);

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
  const elev = new Int16Array(TILE_VERTS * 2);
  const extra = new Uint8Array(TILE_VERTS * 4);
  const ice = new Uint16Array(TILE_VERTS * 4); // ice A, ice B, aridity A, aridity B

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
      position[v * 3] = dirs[b * 3]! * R - centre.x;
      position[v * 3 + 1] = dirs[b * 3 + 1]! * R - centre.y;
      position[v * 3 + 2] = dirs[b * 3 + 2]! * R - centre.z;
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
      elev[v * 2] = Math.round(h);
      elev[v * 2 + 1] = Math.min(10000, Math.round(samples.oceanLevel[v]!));
      extra[v * 4] = samples.lake[v]! ? 255 : 0;
      extra[v * 4 + 1] = Math.round(Math.min(1, samples.rivers[v]!) * 255);
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
      elev.copyWithin(dst * 2, src * 2, src * 2 + 2);
      extra.copyWithin(dst * 4, src * 4, src * 4 + 4);
      extra[dst * 4 + 2] = 255;
    }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 4, true));
  geometry.setAttribute('elev', new THREE.BufferAttribute(elev, 2, false));
  geometry.setAttribute('extra', new THREE.BufferAttribute(extra, 4, true));
  const iceAttr = new THREE.BufferAttribute(ice, 4, false);
  iceAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('ice', iceAttr);
  // Winding: the cross product of +i and +j must point outward.
  geometry.setIndex(indexFor(flipCheck < 0));

  const reliefKm = (Math.max(maxH, 0) + 9000) * k;
  const radius = R * tileAngularSize(key.level) * 0.75 + reliefKm;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
  return { geometry, centre, radius, minHeight: minH, maxHeight: maxH };
}
