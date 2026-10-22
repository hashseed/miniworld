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
import {
  FACE_COUNT,
  TILE_N,
  dirToLatLon,
  faceUvToDir,
  tileId,
  tileSampleUv,
  type TileKey,
  type Vec3,
} from '../geo/cube.ts';
import { groundOf, KINDS } from './foliageKinds.ts';
import { plantGeometry } from './foliageModels.ts';
import { iceSlicePair, type PlanetState } from '../planet/state.ts';
import type { Globe } from './globe.ts';
import { foliageFragment, foliageVertex } from './shaders.ts';
import { sampleTile, type TileSamples } from './terrainStore.ts';
import {
  ICE_CLEARANCE_KM,
  placePlants,
  SLOT_LEVEL,
  SLOTS,
  treeLine,
  type Plant,
} from './foliagePlace.ts';
import type { FoliageMessage } from './foliageWorker.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';

/** Range of the slot hash over which a plant grows in as the lens raises its share. */
const GROW_ROLL = 0.02;
/** Most plants of one kind in view; at most about 1,500 plants are on the visible side. */
const CAPACITY = 4000;
/**
 * Each kind's sway (section 5.1, Proposed): how far its top swings, as a share of its height,
 * and its base period in seconds. Kinds in the order of KINDS.
 */
const SWAY: [number, number][] = [
  [0.035, 4.0], // rainforest
  [0.045, 3.4], // broadleaf
  [0.02, 4.5], // conifer
  [0.035, 4.2], // acacia
  [0.07, 3.0], // palm
  [0.035, 3.6], // olive
  [0.018, 4.8], // cypress
  [0.06, 2.6], // bush
];
/** The wind's time wraps after this many seconds (a whole number of every cycle's periods is not needed: it only keeps the float precise). */
const WIND_LOOP_S = 3600;

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

export { treeLine, SLOT_LEVEL, SLOTS };

/**
 * A place plants make way for: a direction, a radius in drawn kilometres and how far
 * they have gone, 0 to 1. While `felling`, trees tip over as the amount rises; otherwise
 * they shrink away, or grow back as it falls.
 */
/** The plants in view: kind, place in the kind's list and matrix of each, and the plants of each cell of a degree. */
interface DrawnPlants {
  kinds: Uint8Array;
  slots: Uint32Array;
  matrices: Float32Array;
  cells: Map<number, number[]>;
}

const RAD = Math.PI / 180;

/** The cell of a degree of latitude and longitude of a place, as one number; longitudes wrap. */
const cellKey = (lat: number, lon: number) =>
  (lat + 90) * 360 + ((((lon + 180) % 360) + 360) % 360);

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
  /** The worker that places plants off the main thread (section 7), the tiles it is placing (with their day) and the slices it has. */
  private worker = startFoliageWorker((a) => this.placed_(a.id, a.plants));
  private pending = new Map<string, number>();
  /** Each tile's latest plants, drawn while its plants for a new state are being worked out. */
  private latest = new Map<string, Plant[]>();
  private sliceSent: boolean[] = [];
  private placed = new Map<string, Plant[]>();
  /** What the plants' places in the lists were worked out for, and the clearings last applied. */
  private layoutKey = '';
  private clearKey = '';
  /** The plants in view, and those a clearing reached last time. */
  private drawn: DrawnPlants = {
    kinds: new Uint8Array(0),
    slots: new Uint32Array(0),
    matrices: new Float32Array(0),
    cells: new Map(),
  };
  private cleared = new Set<number>();
  /** No wind: the system asks for reduced motion (section 5.1). */
  still = false;
  /** Seconds the wind has blown, and when it was last advanced. */
  private windS = 0;
  private lastWindAt: number | undefined;
  /** Plants drawn last frame. */
  count = 0;
  /** Set once the first view is ready; until then nothing is loaded or drawn. */
  active = false;
  /** Places plants make way for now: camps and wildlife; they shrink away by `amount`. */
  clearings: Clearing[] = [];

  constructor(globe: Globe, loader: ChunkSource) {
    this.globe = globe;
    this.loader = loader;
    // One material per kind for its sway (section 5.1); the others' uniforms are shared.
    const shared = {
      lightDir: { value: new THREE.Vector3(0, 0, 1) },
      screenUp: { value: new THREE.Vector3(0, 1, 0) },
      cameraWorld: { value: new THREE.Vector3() },
      windTime: { value: 0 },
      windOn: { value: 1 },
    };
    const materials = KINDS.map(
      (_, kind) =>
        new THREE.ShaderMaterial({
          vertexShader: foliageVertex,
          fragmentShader: foliageFragment,
          // Palm fronds are thin strips, seen from both sides.
          side: THREE.DoubleSide,
          vertexColors: true,
          uniforms: { ...shared, sway: { value: new THREE.Vector2(...SWAY[kind]!) } },
        }),
    );
    this.material = materials[0]!;
    KINDS.forEach((_, kind) => {
      const mesh = new THREE.InstancedMesh(plantGeometry(kind), materials[kind]!, CAPACITY);
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

  update(
    camera: THREE.Camera,
    planet: PlanetState,
    day: number,
    lightDir: THREE.Vector3,
    playing = true,
  ): void {
    const u = this.material.uniforms;
    u.lightDir!.value.copy(lightDir);
    const e = camera.matrixWorld.elements;
    u.screenUp!.value.set(e[4]!, e[5]!, e[6]!);
    u.cameraWorld!.value.copy(camera.position);
    // The wind blows while history plays, at the screen's pace, and stills when it is paused
    // (section 5.1).
    const now = performance.now();
    if (playing && this.lastWindAt !== undefined)
      this.windS = (this.windS + Math.min(0.1, (now - this.lastWindAt) / 1000)) % WIND_LOOP_S;
    this.lastWindAt = now;
    u.windTime!.value = this.windS;
    u.windOn!.value = this.still ? 0 : 1;
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
    // Where each plant stands changes only with the slices, the sea level, the lens and the
    // tiles in view; then every plant gets its place in its kind's list again. In between,
    // only the plants of tiles a clearing reaches, now or last frame, are written again.
    const layoutKey = `${state}|${lens.blend}|${visible.map(tileId).join(',')}|${this.placed.size}`;
    const relaid = layoutKey !== this.layoutKey;
    if (!relaid && clearKey === this.clearKey) return;
    this.clearKey = clearKey;
    if (relaid) {
      this.layoutKey = layoutKey;
      this.layout(visible, state, planet, day, sa, sb, t, ka, kb);
    }
    // The plants each clearing reaches, found through the cells of the drawn globe.
    const d = this.drawn;
    const most = new Map<number, (typeof clear)[number]>();
    for (const c of clear) {
      const { lat, lon } = dirToLatLon(c.at);
      const r = Math.acos(c.cos) / RAD;
      const rLon = r / Math.max(0.05, Math.cos(lat * RAD));
      for (let a = Math.floor(lat - r); a <= Math.floor(lat + r); a++)
        for (let b = Math.floor(lon - rLon); b <= Math.floor(lon + rLon); b++)
          for (const k of d.cells.get(cellKey(a, b)) ?? []) {
            const x = d.matrices[k * 16 + 12]!;
            const y = d.matrices[k * 16 + 13]!;
            const z = d.matrices[k * 16 + 14]!;
            if ((c.at[0] * x + c.at[1] * y + c.at[2] * z) / Math.hypot(x, y, z) <= c.cos) continue;
            const m = most.get(k);
            if (!m || c.amount > m.amount) most.set(k, c);
          }
    }
    const m = new THREE.Matrix4();
    const shrink = new THREE.Matrix4();
    const written = this.meshes.map(() => [] as number[]);
    const write = (k: number) => {
      m.fromArray(d.matrices, k * 16);
      const c = most.get(k);
      // Gone: a matrix of zeros keeps its place in the list without drawing anything.
      if (c && c.amount >= 1) m.makeScale(0, 0, 0);
      // Felled trees tip over about their foot; others shrink away or grow back.
      else if (c && c.amount > 0)
        m.multiply(
          c.felling
            ? shrink.makeRotationX(c.amount * c.amount * 1.5)
            : shrink.makeScale(1 - c.amount, 1 - c.amount, 1 - c.amount),
        );
      this.meshes[d.kinds[k]!]!.setMatrixAt(d.slots[k]!, m);
      written[d.kinds[k]!]!.push(d.slots[k]!);
    };
    if (relaid) for (let k = 0; k < d.kinds.length; k++) write(k);
    else {
      // Those in a clearing now, and those that were and are no longer.
      for (const k of most.keys()) write(k);
      for (const k of this.cleared) if (!most.has(k)) write(k);
    }
    this.cleared = new Set(most.keys());
    this.meshes.forEach((mesh, kind) => {
      const a = mesh.instanceMatrix;
      a.clearUpdateRanges();
      const slots = written[kind]!.sort((x, y) => x - y);
      if (!relaid)
        for (let i = 0; i < slots.length;) {
          let j = i;
          while (j + 1 < slots.length && slots[j + 1]! <= slots[j]! + 1) j++;
          a.addUpdateRange(slots[i]! * 16, (slots[j]! - slots[i]! + 1) * 16);
          i = j + 1;
        }
      a.needsUpdate = slots.length > 0;
    });
  }

  /** Gives every plant of the tiles in view its place in its kind's list (see update). */
  private layout(
    visible: TileKey[],
    state: string,
    planet: PlanetState,
    day: number,
    sa: FoliageSlice,
    sb: FoliageSlice,
    t: number,
    ka: number,
    kb: number,
  ): void {
    const counts = this.meshes.map(() => 0);
    const tint = new THREE.Color();
    const m = new THREE.Matrix4();
    const kinds: number[] = [];
    const slots: number[] = [];
    const matrices: number[] = [];
    const cells = new Map<number, number[]>();
    for (const key of visible) {
      const id = `${tileId(key)}|${state}`;
      let plants = this.placed.get(id);
      if (!plants) {
        plants = this.place(key, planet, day, sa, sb, t, id, ka, kb);
        if (plants) this.placed.set(id, plants);
      }
      // Until the worker answers, the tile keeps its plants of the state before (section 7).
      if (plants) this.latest.set(tileId(key), plants);
      else plants = this.latest.get(tileId(key));
      if (!plants) continue;
      for (const p of plants) {
        const n = counts[p.kind]!;
        if (n >= CAPACITY || !this.matrixOf(p, m)) continue;
        const e = m.elements;
        const k = kinds.length;
        kinds.push(p.kind);
        slots.push(n);
        for (let a = 0; a < 16; a++) matrices.push(e[a]!);
        const r = Math.hypot(e[12]!, e[13]!, e[14]!);
        const { lat, lon } = dirToLatLon([e[12]! / r, e[13]! / r, e[14]! / r]);
        const cell = cellKey(Math.floor(lat), Math.floor(lon));
        const list = cells.get(cell);
        if (list) list.push(k);
        else cells.set(cell, [k]);
        this.meshes[p.kind]!.setColorAt(n, tint.setScalar(p.tint));
        counts[p.kind] = n + 1;
      }
    }
    this.drawn = {
      kinds: Uint8Array.from(kinds),
      slots: Uint32Array.from(slots),
      matrices: Float32Array.from(matrices),
      cells,
    };
    // Keep the cache to the current state.
    if (this.placed.size > this.keys.length * 2)
      for (const k of [...this.placed.keys()]) if (!k.endsWith(state)) this.placed.delete(k);
    if (this.latest.size > visible.length * 2) {
      const seen = new Set(visible.map(tileId));
      for (const k of [...this.latest.keys()]) if (!seen.has(k)) this.latest.delete(k);
    }
    this.count = 0;
    this.cleared = new Set();
    this.meshes.forEach((mesh, k) => {
      mesh.count = counts[k]!;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
      this.worker?.postMessage({
        type: 'slice',
        k,
        slice: this.slices[k],
      } satisfies FoliageMessage);
      this.sliceSent[k] = true;
      this.layoutKey = '';
    });
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

  /**
   * Plants of one slot tile, or undefined while its terrain is not loaded or while the
   * foliage worker works them out (section 7; then the tile has none for a moment).
   */
  private place(
    key: TileKey,
    planet: PlanetState,
    day: number,
    sa: FoliageSlice,
    sb: FoliageSlice,
    t: number,
    id: string,
    ka: number,
    kb: number,
  ): Plant[] | undefined {
    const sid = tileId(key);
    let s = this.samples.get(sid);
    if (!s) {
      const src = this.globe.store.sourceFor(key, 1e5);
      if (!src) return undefined;
      s = sampleTile(key, src);
      this.samples.set(sid, s);
    }
    if (this.worker && this.sliceSent[ka] && this.sliceSent[kb]) {
      if (!this.pending.has(id)) {
        this.pending.set(id, day);
        this.worker.postMessage({
          type: 'place',
          id,
          key,
          samples: s,
          ka,
          kb,
          t,
          seaLevel: planet.seaLevel,
          glacialIndex: planet.glacialIndex,
        } satisfies FoliageMessage);
      }
      return undefined;
    }
    return this.iceFree(placePlants(key, s, planet.seaLevel, planet.glacialIndex, sa, sb, t), day);
  }

  /** The plants clear of the ice sheets of a day, which the main thread holds. */
  private iceFree(plants: Plant[], day: number): Plant[] {
    return plants.filter((p) => this.globe.query.iceKmAt(p.dir, day) <= -ICE_CLEARANCE_KM);
  }

  /** A tile's plants from the foliage worker: kept, and the plants in view laid out again. */
  private placed_(id: string, plants: Plant[] | undefined): void {
    const day = this.pending.get(id);
    this.pending.delete(id);
    if (day === undefined || !plants) return;
    this.placed.set(id, this.iceFree(plants, day));
    this.layoutKey = '';
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

/** The foliage worker, where the browser has workers; undefined in tests under Node. */
function startFoliageWorker(
  answer: (a: { id: string; plants: Plant[] | undefined }) => void,
): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined;
  const worker = new Worker(new URL('./foliageWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<{ id: string; plants: Plant[] | undefined }>) =>
    answer(e.data);
  return worker;
}
