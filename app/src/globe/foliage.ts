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
import { BUSH, groundOf, isDry, KINDS, PALM, pickKind, recipeOf } from './foliageKinds.ts';
import { plantGeometry } from './foliageModels.ts';
import { bilinear as bilinearGrid, bilinearBordered } from '../planet/sample.ts';
import { iceSlicePair, type PlanetState } from '../planet/state.ts';
import { groundM } from '../planet/surface.ts';
import { EXAGGERATION, type Globe } from './globe.ts';
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
/** Drawn radius of the clearing around a vignette stage, so trees never hide a diorama (section 4). */
export const CLEARING_KM = 800;
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
/**
 * A plant's rotation standing on the unit vector up, turned about it by turn
 * radians: model y along up, x west and z north, the way the plants faced
 * when they were approved. The basis must stay right-handed, or the
 * quaternion of a mirrored basis tilts every plant.
 */
export function plantRotation(up: THREE.Vector3, turn: number): THREE.Quaternion {
  const north = new THREE.Vector3();
  const east = new THREE.Vector3();
  northEast(up, north, east);
  const q = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(east.negate(), up, north),
  );
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn));
}

export function treeLine(lat: number): number {
  return 3800 - Math.max(0, Math.abs(lat) - 25) * 75;
}

/**
 * A place plants make way for: a direction, a radius in drawn kilometres and how far
 * they have gone, 0 to 1. While `felling`, trees tip over as the amount rises; otherwise
 * they shrink away, or grow back as it falls.
 */
export interface Clearing {
  dir: Vec3;
  km: number;
  amount: number;
  felling?: boolean;
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
  /** Ground tint per slice (section 6). */
  private grounds: (THREE.DataTexture | undefined)[] = [];
  private requested: boolean[] = [];
  private samples = new Map<string, TileSamples>();
  private placed = new Map<string, Plant[]>();
  private lastKey = '';
  /** Plants drawn last frame. */
  count = 0;
  /** Set once the first view is ready; until then nothing is loaded or drawn. */
  active = false;
  /** Places plants make way for now: vignette stages, camps and wildlife; they shrink away by `amount`. */
  clearings: Clearing[] = [];

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
      this.grounds = this.days.map(() => undefined);
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
    const gu = this.globe.material.uniforms;
    gu.groundA!.value = this.grounds[ka];
    gu.groundB!.value = this.grounds[kb];
    gu.groundT!.value = t;

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
    // Amounts in twentieths, so plants shrink and grow back smoothly without a rebuild every frame.
    // Only clearings that reach the side of the globe in view.
    const clear = this.clearings
      .map((c) => ({ c, at: lens.toDrawn(c.dir) }))
      .filter(({ c, at }) => {
        const dot = at[0] * camDir.x + at[1] * camDir.y + at[2] * camDir.z;
        return Math.acos(Math.max(-1, Math.min(1, dot))) < horizon + c.km / EARTH_RADIUS_KM;
      })
      .map(({ c, at }) => ({
        at,
        cos: Math.cos(c.km / EARTH_RADIUS_KM),
        amount: Math.round(c.amount * 20) / 20,
        felling: !!c.felling,
      }));
    const clearKey = clear
      .map((c) => `${c.at.map((x) => x.toFixed(4)).join(',')}:${c.cos}:${c.amount}:${c.felling}`)
      .join(';');
    const frameKey = `${state}|${lens.blend}|${visible.map(tileId).join(',')}|${this.placed.size}|${clearKey}`;
    /** The clearing a plant at a matrix's position gives way to most, if any. */
    const clearing = (e: number[]) => {
      const len = Math.hypot(e[12]!, e[13]!, e[14]!);
      let most: (typeof clear)[number] | undefined;
      for (const c of clear)
        if ((c.at[0] * e[12]! + c.at[1] * e[13]! + c.at[2] * e[14]!) / len > c.cos)
          if (!most || c.amount > most.amount) most = c;
      return most;
    };
    const shrink = new THREE.Matrix4();
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
        const c = clear.length > 0 ? clearing(m.elements) : undefined;
        if (c && c.amount >= 1) continue;
        // Felled trees tip over about their foot; others shrink away or grow back.
        if (c && c.amount > 0)
          m.multiply(
            c.felling
              ? shrink.makeRotationX(c.amount * c.amount * 1.5)
              : shrink.makeScale(1 - c.amount, 1 - c.amount, 1 - c.amount),
          );
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
      this.grounds[k] = groundTexture(this.slices[k]);
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
    out.compose(pos, plantRotation(up, p.turn), new THREE.Vector3(size, size, size));
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
      const cap = snowCap(height, bilinear(s.bed, fi, fj), Math.abs(lat), planet.glacialIndex);
      if (cap * CAP_KM_PER_M > -ICE_CLEARANCE_KM) return;
      if (this.globe.query.iceKmAt(dir, day) > -ICE_CLEARANCE_KM) return;
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
        groundKm:
          groundM({ height, oceanLevel: ocean, lake, bed: height, coastKm }, planet.seaLevel) *
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
}

/** The ground tint of a foliage slice as an RGBA texture on its grid (section 6). */
function groundTexture(slice: FoliageSlice): THREE.DataTexture {
  const n = FOLIAGE_GRID_W * FOLIAGE_GRID_H;
  const data = new Uint8Array(n * 4);
  // Colours are blurred premultiplied by their strength, so untinted cells do not darken edges.
  let a: Float32Array = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b, w] = groundOf(slice.cells[i]!, slice.density[i]! / 255);
    a.set([r * w, g * w, b * w, w], i * 4);
  }
  // Two passes of a 3 × 3 blur, so the 0.5° cells blend into soft edges.
  for (let pass = 0; pass < 2; pass++) a = blurGrid(a);
  for (let i = 0; i < n; i++) {
    const w = a[i * 4 + 3]!;
    for (let k = 0; k < 3; k++) data[i * 4 + k] = w > 0 ? Math.round((a[i * 4 + k]! / w) * 255) : 0;
    data[i * 4 + 3] = Math.round(w * 255);
  }
  const tex = new THREE.DataTexture(data, FOLIAGE_GRID_W, FOLIAGE_GRID_H, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** A 3 × 3 box blur of an RGBA grid on the foliage grid, wrapping in longitude. */
function blurGrid(src: Float32Array): Float32Array {
  const W = FOLIAGE_GRID_W;
  const H = FOLIAGE_GRID_H;
  const out = new Float32Array(src.length);
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      let count = 0;
      const o = (r * W + c) * 4;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= H) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const i = (rr * W + ((c + dc + W) % W)) * 4;
          for (let k = 0; k < 4; k++) out[o + k]! += src[i + k]!;
          count++;
        }
      }
      for (let k = 0; k < 4; k++) out[o + k]! /= count;
    }
  return out;
}

const S = TILE_N + 1;

/** Bilinear sample of a per-sample field (TILE_N + 1 squared) at fractional sample coordinates. */
function bilinear(f: Float32Array, fi: number, fj: number): number {
  return bilinearGrid(f, S, fi, fj);
}
