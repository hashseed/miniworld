// The global climate slices: ice cover and deserts for the whole planet, one
// small file per time step (spec milestone 1, sections 5.2 and 7.3). The two
// slices around the date load first and the rest follow in the background,
// so scrubbing only changes which loaded slices the shader blends.

import * as THREE from 'three';
import {
  decodeClimateSlice,
  ICE_GRID_H,
  ICE_GRID_W,
  type ClimateSlice,
} from '../content/formats.ts';
import type { ChunkSource } from '../content/loader.ts';
import type { TerrainWorkers } from './terrainWorkers.ts';
import type { IcePair, IceSource } from '../planet/query.ts';
import { iceSlicePair } from '../planet/state.ts';

/** Priority of the slices that are not around the date, after the terrain in view. */
const BACKGROUND_PRIORITY = 1e6;

export interface ClimateBlend {
  a: THREE.Texture;
  b: THREE.Texture;
  t: number;
}

export class ClimateStore implements IceSource {
  private loader: ChunkSource;
  private days: number[] = [];
  private files: string[] = [];
  private slices: (ClimateSlice | undefined)[] = [];
  private textures: (THREE.DataTexture | undefined)[] = [];
  private requested: boolean[] = [];
  private background = false;
  /** Texture with no ice and no desert, until the first slice arrives. */
  private readonly empty: THREE.DataTexture;
  /** Called with each new texture, so it can be uploaded before it is needed. */
  onTexture?: (texture: THREE.Texture) => void;

  private workers: TerrainWorkers;

  constructor(loader: ChunkSource, workers: TerrainWorkers) {
    this.loader = loader;
    this.workers = workers;
    this.empty = new THREE.DataTexture(new Uint8Array([0, 0]), 1, 1, THREE.RGFormat);
    this.empty.needsUpdate = true;
  }

  /** The two slices to blend at a date; the nearest loaded ones stand in for missing ones. */
  blend(day: number): ClimateBlend {
    const { ka, kb, t } = this.pair(day);
    this.request(ka, 0);
    this.request(kb, 0);
    if (!this.background && this.slices[ka] && this.slices[kb]) this.loadRest(day);
    if (this.textures[ka] && this.textures[kb])
      return { a: this.textures[ka], b: this.textures[kb], t };
    const near = nearest(this.days, this.textures, day);
    const tex = near === undefined ? this.empty : this.textures[near]!;
    return { a: tex, b: tex, t: 0 };
  }

  /** The two loaded slices to blend at a date for the planet query; the nearest loaded one stands in. */
  icePairAt(day: number): IcePair | undefined {
    const { ka, kb, t } = this.pair(day);
    const a = this.slices[ka];
    const b = this.slices[kb];
    if (a && b) return { a, b, t };
    const near = nearest(this.days, this.slices, day);
    if (near === undefined) return undefined;
    const s = this.slices[near]!;
    return { a: s, b: s, t: 0 };
  }

  private pair(day: number): { ka: number; kb: number; t: number } {
    // The manifest arrives after construction; take the slice list on first use.
    if (this.days.length === 0 && this.loader.manifest) {
      this.days = this.loader.manifest.climate.days;
      this.files = this.loader.manifest.climate.files;
      this.slices = this.days.map(() => undefined);
      this.textures = this.days.map(() => undefined);
      this.requested = this.days.map(() => false);
    }
    const { a, b, t } = iceSlicePair(this.days, day);
    return { ka: Math.max(0, this.days.indexOf(a)), kb: Math.max(0, this.days.indexOf(b)), t };
  }

  /** Requests every other slice, nearest in time first, behind the terrain in view. */
  private loadRest(day: number): void {
    this.background = true;
    const order = this.days
      .map((d, k) => ({ k, gap: Math.abs(d - day) }))
      .sort((x, y) => x.gap - y.gap);
    order.forEach(({ k }, rank) => this.request(k, BACKGROUND_PRIORITY + rank));
  }

  private request(k: number, priority: number): void {
    if (this.requested[k] || this.days.length === 0) return;
    this.requested[k] = true;
    void this.loader.fetchChunk(this.files[k]!, priority).then((buf) => {
      if (!buf) {
        this.requested[k] = false;
        return;
      }
      let slice: ClimateSlice;
      try {
        slice = decodeClimateSlice(buf);
      } catch (e) {
        console.error(`${this.files[k]}: ${(e as Error).message}`); // stays requested: not asked for again
        return;
      }
      this.slices[k] = slice;
      // Resampled in a terrain worker, as urgent as the request (section 11.5).
      void this.workers.climate(String(k), slice, priority).then((data) => {
        const tex = climateTexture(data);
        this.textures[k] = tex;
        this.onTexture?.(tex);
      });
    });
  }
}

/** The nearest loaded entry to a date, by slice day. */
function nearest<T>(days: number[], loaded: (T | undefined)[], day: number): number | undefined {
  let best: number | undefined;
  for (let k = 0; k < days.length; k++)
    if (loaded[k] && (best === undefined || Math.abs(days[k]! - day) < Math.abs(days[best]! - day)))
      best = k;
  return best;
}

/** The RG texture of a slice on the ice grid (terrainJobs.ts). */
function climateTexture(data: Uint8Array): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, ICE_GRID_W, ICE_GRID_H, THREE.RGFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
