// Foliage (spec foliage.md): a few big clay plants over the land, chosen by
// the biome class of the date from the foliage slices, on one fixed grid of
// slots about 150 km apart. Each kind is one instanced mesh.

import * as THREE from 'three';
import {
  decodeFoliageSlice,
  FOLIAGE_GRID_H,
  FOLIAGE_GRID_W,
  type FoliageSlice,
} from '../content/formats.ts';
import type { ChunkSource } from '../content/loader.ts';
import { hash01, valueNoise } from '../core/hash.ts';
import {
  FACE_COUNT,
  TILE_N,
  dirToLatLon,
  faceUvToDir,
  tileAngularSize,
  tileId,
  tileSampleUv,
  type TileKey,
  type Vec3,
} from '../geo/cube.ts';
import { BUSH, isDry, KINDS, PALM, pickKind, recipeOf } from './foliageKinds.ts';
import { plantGeometry } from './foliageModels.ts';
import { EXAGGERATION, LAND_LIFT_M, type Globe } from './globe.ts';
import { iceSlicePair, type PlanetState } from './planet.ts';
import { foliageFragment, foliageVertex } from './shaders.ts';
import { CAP_KM_PER_M, snowCap } from './snowCap.ts';
import { sampleTile, type TileSamples } from './terrainStore.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';

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
const CROWN = 1.1;
/** Where plants never stand (section 4). */
const MIN_COAST_KM = 2.5;
const MAX_WATER_FIELD = 0.42;
const ICE_CLEARANCE_KM = 25;
/** River field of the bank band that gets palms in dry land. */
const BANK_FIELD = 0.03;
/** Range of the slot hash over which a plant grows in as the lens raises its share. */
const GROW_ROLL = 0.02;
/** Share of the trees removed by a low tree density that become bushes. */
const THINNED_BUSH = 0.25;
/** Most plants of one kind in view; at most about 1,500 plants are on the visible side. */
const CAPACITY = 4000;
/** Coast cap of the terrain shader (milestone-1.md, section 4.2). */
const COAST_BEACH_KM = 2;
const COAST_SLOPE = 12;
const COAST_CURVE = 0.15;

/** A plant a slot can hold; whether it shows, and where, depends on the lens. */
interface Plant {
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

/** Ground height in metres as the terrain shader draws it, away from ice. */
function drawnGround(h: number, seaLevel: number, coastKm: number): number {
  const surface = Math.max(h, seaLevel) + LAND_LIFT_M;
  const d = Math.max(coastKm - COAST_BEACH_KM, 0);
  const cap = d * (COAST_SLOPE + COAST_CURVE * d) + 1e-3;
  const rise = Math.max(surface - seaLevel, 0);
  const q = rise / cap;
  return seaLevel + rise / Math.sqrt(Math.sqrt(1 + q ** 4));
}

export class Foliage {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  private globe: Globe;
  private loader: ChunkSource;
  private meshes: THREE.InstancedMesh[] = [];
  private keys: TileKey[] = [];
  private days: number[] = [];
  private files: string[] = [];
  private slices: (FoliageSlice | undefined)[] = [];
  private requested: boolean[] = [];
  private samples = new Map<string, TileSamples>();
  private placed = new Map<string, Plant[]>();
  private lastKey = '';
  /** Plants drawn last frame. */
  count = 0;
  /** Set once the first view is ready; until then nothing is loaded or drawn. */
  active = false;

  constructor(globe: Globe, loader: ChunkSource) {
    this.globe = globe;
    this.loader = loader;
    this.material = new THREE.ShaderMaterial({
      vertexShader: foliageVertex,
      fragmentShader: foliageFragment,
      // Palm fronds are thin strips, seen from both sides.
      side: THREE.DoubleSide,
      vertexColors: true,
      uniforms: {
        lightDir: { value: new THREE.Vector3(0, 0, 1) },
        screenUp: { value: new THREE.Vector3(0, 1, 0) },
        cameraWorld: { value: new THREE.Vector3() },
      },
    });
    KINDS.forEach((_, kind) => {
      const mesh = new THREE.InstancedMesh(plantGeometry(kind), this.material, CAPACITY);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
    });
    for (let face = 0; face < FACE_COUNT; face++)
      for (let y = 0; y < 1 << SLOT_LEVEL; y++)
        for (let x = 0; x < 1 << SLOT_LEVEL; x++) this.keys.push({ face, level: SLOT_LEVEL, x, y });
  }

  update(camera: THREE.Camera, planet: PlanetState, day: number, lightDir: THREE.Vector3): void {
    const u = this.material.uniforms;
    u.lightDir!.value.copy(lightDir);
    const e = camera.matrixWorld.elements;
    u.screenUp!.value.set(e[4]!, e[5]!, e[6]!);
    u.cameraWorld!.value.copy(camera.position);
    if (!this.active) return;

    if (this.days.length === 0 && this.loader.manifest?.foliage) {
      this.days = this.loader.manifest.foliage.days;
      this.files = this.loader.manifest.foliage.files;
      this.slices = this.days.map(() => undefined);
      this.requested = this.days.map(() => false);
    }
    if (this.days.length === 0) return;
    const { a, b, t } = iceSlicePair(this.days, day);
    const ka = Math.max(0, this.days.indexOf(a));
    const kb = Math.max(0, this.days.indexOf(b));
    this.request(ka, 0);
    this.request(kb, 0);
    const sa = this.slices[ka];
    const sb = this.slices[kb];
    if (!sa || !sb) return;

    // Only the slot tiles on the visible side of the globe.
    const camPos = camera.position;
    const camDir = camPos.clone().normalize();
    const horizon = Math.acos(Math.min(1, EARTH_RADIUS_KM / camPos.length())) + 0.25;
    const lens = this.globe.lens;
    const visible = this.keys.filter((key) => {
      const c = tileSampleUv(key, TILE_N / 2, TILE_N / 2);
      const d = lens.toDrawn(faceUvToDir(key.face, c.u, c.v));
      const dot = d[0] * camDir.x + d[1] * camDir.y + d[2] * camDir.z;
      return Math.acos(Math.max(-1, Math.min(1, dot))) < horizon;
    });
    // Plants change only with the slices, the sea level and the lens, never with the camera alone.
    const state = `${ka}:${kb}:${t.toFixed(3)}:${planet.seaLevel.toFixed(1)}`;
    const frameKey = `${state}|${lens.blend}|${visible.map(tileId).join(',')}|${this.placed.size}`;
    if (frameKey === this.lastKey) return;
    this.lastKey = frameKey;

    const counts = this.meshes.map(() => 0);
    const tint = new THREE.Color();
    const m = new THREE.Matrix4();
    for (const key of visible) {
      const id = `${tileId(key)}|${state}`;
      let plants = this.placed.get(id);
      if (!plants) {
        plants = this.place(key, planet, day, sa, sb, t);
        if (!plants) continue;
        this.placed.set(id, plants);
      }
      for (const p of plants) {
        const n = counts[p.kind]!;
        if (n >= CAPACITY || !this.matrixOf(p, m)) continue;
        const mesh = this.meshes[p.kind]!;
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, tint.setScalar(p.tint));
        counts[p.kind] = n + 1;
      }
    }
    // Keep the cache to the current state.
    if (this.placed.size > this.keys.length * 2)
      for (const k of [...this.placed.keys()]) if (!k.endsWith(state)) this.placed.delete(k);
    this.count = 0;
    this.meshes.forEach((m, k) => {
      m.count = counts[k]!;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.count += counts[k]!;
    });
  }

  private request(k: number, priority: number): void {
    if (this.requested[k]) return;
    this.requested[k] = true;
    void this.loader.fetchChunk(this.files[k]!, priority).then((buf) => {
      if (!buf) {
        this.requested[k] = false;
        return;
      }
      try {
        this.slices[k] = decodeFoliageSlice(buf);
      } catch (e) {
        console.error(`${this.files[k]}: ${(e as Error).message}`); // stays requested: not asked for again
        return;
      }
      this.lastKey = '';
    });
  }

  /** The foliage cell of a point, looked up with a wobble so forest edges are soft, or -1. */
  private cell(lat: number, lon: number): number {
    const jl = (valueNoise(lon * 1.7, lat * 1.7, 5) - 0.5) * 0.9;
    const jo = (valueNoise(lon * 1.7, lat * 1.7, 9) - 0.5) * 0.9;
    const r = Math.floor((90 - (lat + jl)) / 0.5);
    if (r < 0 || r >= FOLIAGE_GRID_H) return -1;
    const c =
      ((Math.floor((lon + jo + 180) / 0.5) % FOLIAGE_GRID_W) + FOLIAGE_GRID_W) % FOLIAGE_GRID_W;
    return r * FOLIAGE_GRID_W + c;
  }

  /**
   * A plant's drawn transform at the current lens, or false when its slot is
   * not used. Enlarged land holds more plants: a slot is used when its hash
   * is below the share of slots the lens's area factor asks for, and a plant
   * grows in smoothly as the share passes its hash.
   */
  private matrixOf(p: Plant, out: THREE.Matrix4): boolean {
    const lens = this.globe.lens;
    const width = lens.widthAt(p.dir);
    const grow = Math.min(1, (p.share * width * width - p.roll) / GROW_ROLL);
    if (grow <= 0) return false;
    const size = p.size * grow;
    const drawn = lens.toDrawn(p.dir);
    const up = new THREE.Vector3(drawn[0], drawn[1], drawn[2]);
    const pos = up.clone().multiplyScalar(EARTH_RADIUS_KM + p.groundKm * width - size * 0.06);
    const north = new THREE.Vector3();
    const east = new THREE.Vector3();
    northEast(up, north, east);
    // x west, y up, z south: the plants were placed facing this way when approved.
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(east.negate(), up, north.negate()),
    );
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.turn));
    out.compose(pos, q, new THREE.Vector3(size, size, size));
    return true;
  }

  /** Plants of one slot tile, or undefined while its terrain is not loaded. */
  private place(
    key: TileKey,
    planet: PlanetState,
    day: number,
    sa: FoliageSlice,
    sb: FoliageSlice,
    t: number,
  ): Plant[] | undefined {
    const sid = tileId(key);
    let s = this.samples.get(sid);
    if (!s) {
      const src = this.globe.store.sourceFor(key, 1e5);
      if (!src) return undefined;
      s = sampleTile(key, src);
      this.samples.set(sid, s);
    }
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
      if (ocean <= planet.seaLevel + 1) return;
      const river = bilinear(s.rivers, fi, fj);
      if (bilinear(s.lake, fi, fj) > 0.3 || river > MAX_WATER_FIELD) return;
      const coastKm = bilinear(s.coast, fi, fj);
      if (coastKm < MIN_COAST_KM) return;
      const uv = tileSampleUv(key, fi, fj);
      const dir = faceUvToDir(key.face, uv.u, uv.v) as Vec3;
      const height = bilinearBordered(s.heights, fi, fj);
      const { lat, lon } = dirToLatLon(dir);
      if (height > treeLine(lat)) return;
      // Clear of the mountain snow caps as of the ice (section 5.2).
      const cap = snowCap(height, bilinear(s.bed, fi, fj), Math.abs(lat), planet.glacialIndex);
      if (cap * CAP_KM_PER_M > -ICE_CLEARANCE_KM) return;
      if (this.globe.climate.iceKmAt(dir, day) > -ICE_CLEARANCE_KM) return;
      // Between two slices each slot switches at its own hashed moment.
      const slice = h(4) < t ? sb : sa;
      const i = this.cell(lat, lon);
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
        groundKm: drawnGround(height, planet.seaLevel, coastKm) * EXAGGERATION * 0.001,
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
}

const S = TILE_N + 1;
const B = TILE_N + 3;

/** Bilinear sample of a per-sample field (TILE_N + 1 squared) at fractional sample coordinates. */
function bilinear(f: Float32Array, fi: number, fj: number): number {
  return bilinearGrid(f, S, fi, fj);
}

/** The same for the heights, which start one sample outside the tile. */
function bilinearBordered(f: Float32Array, fi: number, fj: number): number {
  return bilinearGrid(f, B, fi + 1, fj + 1);
}

function bilinearGrid(f: Float32Array, w: number, x: number, y: number): number {
  const i0 = Math.min(w - 2, Math.max(0, Math.floor(x)));
  const j0 = Math.min(w - 2, Math.max(0, Math.floor(y)));
  const a = x - i0;
  const b = y - j0;
  const at = (i: number, j: number) => f[j * w + i]!;
  return (
    (at(i0, j0) * (1 - a) + at(i0 + 1, j0) * a) * (1 - b) +
    (at(i0, j0 + 1) * (1 - a) + at(i0 + 1, j0 + 1) * a) * b
  );
}
