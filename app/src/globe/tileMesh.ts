// Three.js geometry for one terrain tile (spec milestone 1, section 4.2) from
// its vertex data (tileArrays.ts), with the shared index buffers of the grid
// and its skirts; ice and deserts come from the global climate slices.

import * as THREE from 'three';
import { TERRAIN_SAMPLES } from '../content/formats.ts';
import { TILE_N } from '../geo/cube.ts';
import type { TileArrays } from './tileArrays.ts';

const S = TERRAIN_SAMPLES;
const GRID_VERTS = S * S;

const sharedIndex = new Map<string, THREE.BufferAttribute>();

/**
 * Triangles over every step-th vertex of the grid, with skirts along the
 * edges at the same step (section 4.2).
 */
export function indexFor(flip: boolean, step = 1): THREE.BufferAttribute {
  const id = `${flip}:${step}`;
  const cached = sharedIndex.get(id);
  if (cached) return cached;
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => {
    if (flip) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  };
  for (let j = 0; j < TILE_N; j += step)
    for (let i = 0; i < TILE_N; i += step)
      quad(j * S + i, j * S + i + step, (j + step) * S + i, (j + step) * S + i + step);
  // Skirts: edges in order bottom, top, left, right.
  const edge = (k: number) => GRID_VERTS + k;
  for (let i = 0; i < TILE_N; i += step) {
    const n = i + step;
    quad(edge(i), edge(n), i, n); // bottom (j = 0)
    quad(TILE_N * S + i, TILE_N * S + n, edge(S + i), edge(S + n)); // top
    quad(edge(2 * S + i), i * S, edge(2 * S + n), n * S); // left (i = 0)
    quad(i * S + TILE_N, edge(3 * S + i), n * S + TILE_N, edge(3 * S + n)); // right
  }
  const attr = new THREE.BufferAttribute(new Uint16Array(idx), 1);
  sharedIndex.set(id, attr);
  return attr;
}

export interface TileGeometry {
  geometry: THREE.BufferGeometry;
  /** The field texture of the tile (TileArrays.fieldData). */
  fields: THREE.DataTexture;
  centre: THREE.Vector3;
  alwaysSea: boolean;
  neverSea: boolean;
  flip: boolean;
}

/** Wraps a tile's vertex data in a geometry and a field texture. */
export function tileGeometry(t: TileArrays): TileGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(t.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(t.normal, 4, true));
  geometry.setAttribute('elev', new THREE.BufferAttribute(t.elev, 3, false));
  geometry.setAttribute('extra', new THREE.BufferAttribute(t.extra, 4, true));
  geometry.setAttribute('flow', new THREE.BufferAttribute(t.flow, 2, true));
  geometry.setAttribute('fieldUv', new THREE.BufferAttribute(t.fieldUv, 2, true));
  geometry.setAttribute('coastGrad', new THREE.BufferAttribute(t.coastGrad, 4, true));
  // Winding: the cross product of +i and +j must point outward.
  geometry.setIndex(indexFor(t.flip));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), t.radius);
  const fields = new THREE.DataTexture(t.fieldData, S, S, THREE.RGBAFormat, THREE.HalfFloatType);
  fields.magFilter = THREE.LinearFilter;
  fields.minFilter = THREE.LinearFilter;
  fields.wrapS = THREE.ClampToEdgeWrapping;
  fields.wrapT = THREE.ClampToEdgeWrapping;
  fields.needsUpdate = true;
  return {
    geometry,
    fields,
    centre: new THREE.Vector3(...t.centre),
    alwaysSea: t.alwaysSea,
    neverSea: t.neverSea,
    flip: t.flip,
  };
}
