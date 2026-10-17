// Loaded terrain and ice data, and sampling of any quadtree tile from it
// (spec milestone 1, sections 4.2 and 5.2). Tiles below DATA_MAX_LEVEL are
// refined from their level-6 ancestor by smooth interpolation.

import {
  decodeIceChunk,
  decodeTerrainTile,
  ICE_LEVEL,
  ICE_N,
  ICE_SAMPLES,
  OCEAN_LAKE,
  OCEAN_MIN_LEVEL,
  OCEAN_NEVER,
  OCEAN_RANGE,
  TERRAIN_BORDERED,
  TERRAIN_SAMPLES,
  type IceChunk,
  type TerrainTile,
} from '../content/formats.ts';
import type { ContentLoader } from '../content/loader.ts';
import {
  DATA_MAX_LEVEL,
  TILE_N,
  ancestorAt,
  dirToFaceUv,
  tileAt,
  tileId,
  type TileKey,
  type Vec3,
} from './cube.ts';

export const DEEP_HEIGHT = -1000;
/** Ocean level meaning "never sea". */
export const NEVER_SEA = 1e4;

type Slot<T> = T | 'deep' | 'none' | 'loading';

export class TerrainStore {
  private loader: ContentLoader;
  private terrain = new Map<string, Slot<TerrainTile>>();
  private ice = new Map<string, Slot<IceChunk>>();
  private wanted = new Map<string, number>(); // url → priority this frame
  /** Incremented whenever new data arrives, so meshes know to rebuild. */
  version = 0;

  constructor(loader: ContentLoader) {
    this.loader = loader;
  }

  /** Data tile (level ≤ 6) for a key, requesting it if needed. */
  terrainTile(key: TileKey, priority: number): TerrainTile | 'deep' | undefined {
    const id = tileId(key);
    const slot = this.terrain.get(id);
    if (slot === 'loading') {
      this.wanted.set(id, priority);
      return undefined;
    }
    if (slot === 'deep') return 'deep';
    if (slot && slot !== 'none') return slot;
    const file = this.loader.lookup('terrain', key, 'all');
    if (file === undefined) return undefined; // part index still loading
    if (file === 'deep' || file === 'none') {
      this.terrain.set(id, 'deep');
      return 'deep';
    }
    this.terrain.set(id, 'loading');
    this.wanted.set(id, priority);
    void this.loader.fetchChunk(file, priority).then((buf) => {
      if (!buf) {
        this.terrain.delete(id);
        return;
      }
      this.terrain.set(id, decodeTerrainTile(buf));
      this.version++;
    });
    return undefined;
  }

  /** Deepest level with terrain data in this build (DATA_MAX_LEVEL for a full build). */
  get dataMaxLevel(): number {
    return Math.min(
      DATA_MAX_LEVEL,
      this.loader.manifest.layers.terrain?.maxLevel ?? DATA_MAX_LEVEL,
    );
  }

  /** The data tile a render tile is sampled from, if loaded. */
  sourceFor(key: TileKey, priority: number): TerrainTile | 'deep' | undefined {
    const max = this.dataMaxLevel;
    return this.terrainTile(key.level > max ? ancestorAt(key, max) : key, priority);
  }

  /** Ice chunk for an ice tile and window; 'none' means no ice there. */
  iceChunk(key: TileKey, window: number, priority: number): IceChunk | 'none' | undefined {
    const id = `${tileId(key)}:${window}`;
    const slot = this.ice.get(id);
    if (slot === 'loading') return undefined;
    if (slot === 'none' || slot === 'deep') return 'none';
    if (slot) return slot;
    const file = this.loader.lookup('ice', key, String(window));
    if (file === undefined) return undefined;
    if (file === 'none' || file === 'deep') {
      this.ice.set(id, 'none');
      return 'none';
    }
    this.ice.set(id, 'loading');
    void this.loader.fetchChunk(file, priority).then((buf) => {
      if (!buf) {
        this.ice.delete(id);
        return;
      }
      this.ice.set(id, decodeIceChunk(buf));
      this.version++;
    });
    return undefined;
  }

  /** Terrain height in metres at a direction from the finest loaded data tile. */
  heightAt(dir: Vec3): number {
    const { face, u, v } = dirToFaceUv(dir);
    for (let level = this.dataMaxLevel; level >= 0; level--) {
      const key = tileAt(face, u, v, level);
      const slot = this.terrain.get(tileId(key));
      if (slot === 'deep') return DEEP_HEIGHT;
      if (slot && typeof slot === 'object') {
        const n = 1 << level;
        const fi = (((u + 1) / 2) * n - key.x) * TILE_N;
        const fj = (((v + 1) / 2) * n - key.y) * TILE_N;
        return bilinearBordered(slot.heights, fi, fj);
      }
    }
    return 0;
  }

  /** Drops queued requests for tiles that are no longer wanted. */
  endFrame(): void {
    this.wanted.clear();
  }

  get loadedTiles(): number {
    let n = 0;
    for (const v of this.terrain.values()) if (typeof v === 'object') n++;
    return n;
  }
}

export interface TileSamples {
  /** Heights in metres, (TILE_N + 3)², with a one-sample border. */
  heights: Float32Array;
  /** Sea level at which each sample joins the ocean, or NEVER_SEA, (TILE_N + 1)². */
  oceanLevel: Float32Array;
  lake: Uint8Array;
  rivers: Float32Array;
}

/** Samples a render tile from its data tile. */
export function sampleTile(key: TileKey, source: TerrainTile | 'deep'): TileSamples {
  const B = TERRAIN_BORDERED;
  const S = TERRAIN_SAMPLES;
  const heights = new Float32Array(B * B);
  const oceanLevel = new Float32Array(S * S);
  const lake = new Uint8Array(S * S);
  const rivers = new Float32Array(S * S);
  if (source === 'deep') {
    heights.fill(DEEP_HEIGHT);
    oceanLevel.fill(OCEAN_MIN_LEVEL);
    return { heights, oceanLevel, lake, rivers };
  }
  const data = source.key;
  if (data.level === key.level) {
    for (let k = 0; k < B * B; k++) heights[k] = source.heights[k]!;
    for (let k = 0; k < S * S; k++) {
      const o = source.ocean[k]!;
      lake[k] = o === OCEAN_LAKE ? 1 : 0;
      oceanLevel[k] = decodeOcean(o);
      rivers[k] = source.rivers[k]! / 255;
    }
    return { heights, oceanLevel, lake, rivers };
  }
  // Deeper tile: map each sample into the ancestor's grid.
  const scale = 1 << (key.level - data.level);
  const ox = (key.x - data.x * scale) / scale;
  const oy = (key.y - data.y * scale) / scale;
  for (let j = -1; j <= TILE_N + 1; j++) {
    for (let i = -1; i <= TILE_N + 1; i++) {
      const fi = (ox + i / TILE_N / scale) * TILE_N;
      const fj = (oy + j / TILE_N / scale) * TILE_N;
      heights[(j + 1) * B + (i + 1)] = bicubicBordered(source.heights, fi, fj);
      if (i >= 0 && j >= 0 && i <= TILE_N && j <= TILE_N) {
        const ni = Math.min(TILE_N, Math.max(0, Math.round(fi)));
        const nj = Math.min(TILE_N, Math.max(0, Math.round(fj)));
        const o = source.ocean[nj * S + ni]!;
        const s = j * S + i;
        lake[s] = o === OCEAN_LAKE ? 1 : 0;
        oceanLevel[s] = decodeOcean(o);
        rivers[s] = bilinear(source.rivers, S, fi, fj) / 255;
      }
    }
  }
  return { heights, oceanLevel, lake, rivers };
}

function decodeOcean(o: number): number {
  if (o === OCEAN_NEVER || o === OCEAN_LAKE || o > OCEAN_RANGE) return NEVER_SEA;
  return OCEAN_MIN_LEVEL + o;
}

function bilinear(grid: ArrayLike<number>, size: number, fi: number, fj: number): number {
  const i0 = Math.min(size - 2, Math.max(0, Math.floor(fi)));
  const j0 = Math.min(size - 2, Math.max(0, Math.floor(fj)));
  const ti = Math.min(1, Math.max(0, fi - i0));
  const tj = Math.min(1, Math.max(0, fj - j0));
  const a = grid[j0 * size + i0]!;
  const b = grid[j0 * size + i0 + 1]!;
  const c = grid[(j0 + 1) * size + i0]!;
  const d = grid[(j0 + 1) * size + i0 + 1]!;
  return (a * (1 - ti) + b * ti) * (1 - tj) + (c * (1 - ti) + d * ti) * tj;
}

function bilinearBordered(h: Int16Array, fi: number, fj: number): number {
  return bilinear(h, TERRAIN_BORDERED, fi + 1, fj + 1);
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function bicubicBordered(h: Int16Array, fi: number, fj: number): number {
  const B = TERRAIN_BORDERED;
  const x = fi + 1;
  const y = fj + 1;
  const x1 = Math.floor(x);
  const y1 = Math.floor(y);
  const tx = x - x1;
  const ty = y - y1;
  const at = (c: number, r: number) =>
    h[Math.min(B - 1, Math.max(0, r)) * B + Math.min(B - 1, Math.max(0, c))]!;
  const row = (r: number) => catmullRom(at(x1 - 1, r), at(x1, r), at(x1 + 1, r), at(x1 + 2, r), tx);
  return catmullRom(row(y1 - 1), row(y1), row(y1 + 1), row(y1 + 2), ty);
}

/** Ice thickness at face coordinates from a chunk's slice, bilinear on the ice grid. */
export function sampleIce(chunk: IceChunk, sliceIndex: number, u: number, v: number): number {
  const n = 1 << ICE_LEVEL;
  const fi = (((u + 1) / 2) * n - chunk.key.x) * ICE_N;
  const fj = (((v + 1) / 2) * n - chunk.key.y) * ICE_N;
  return bilinear(chunk.thickness[sliceIndex]!, ICE_SAMPLES, fi, fj);
}
