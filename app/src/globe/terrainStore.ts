// Loaded terrain data, and sampling of any quadtree tile from it
// (spec milestone 1, sections 4.2 and 5.2). Tiles below DATA_MAX_LEVEL are
// refined from their level-6 ancestor by smooth interpolation.

import {
  decodeTerrainTile,
  OCEAN_MIN_LEVEL,
  OCEAN_SCALE,
  TERRAIN_BORDERED,
  TERRAIN_SAMPLES,
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

export const DEEP_HEIGHT = -150;

type Slot<T> = T | 'deep' | 'none' | 'loading';

export class TerrainStore {
  private loader: ContentLoader;
  private terrain = new Map<string, Slot<TerrainTile>>();
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
  /** Smoothed sea level at which each sample is sea, (TILE_N + 1)². */
  oceanLevel: Float32Array;
  /** Smooth lake field 0..1; a lake where it passes one half. */
  lake: Float32Array;
  /** Smooth river field 0..1; a river where it passes one half. */
  rivers: Float32Array;
  /** River flow phase as cosine and sine, −1..1, interleaved. */
  flow: Float32Array;
  /** Smoothed bed under the ice sheets in metres, (TILE_N + 1)². */
  bed: Float32Array;
  /** Distance from today's coast in km, 255 meaning far inland, (TILE_N + 1)². */
  coast: Float32Array;
}

/**
 * Samples a render tile from its data tile. Every channel is interpolated, so
 * coasts, lakes and rivers are smooth curves rather than the steps of the
 * data grid (sections 4.2 and 5.1).
 */
export function sampleTile(key: TileKey, source: TerrainTile | 'deep'): TileSamples {
  const B = TERRAIN_BORDERED;
  const S = TERRAIN_SAMPLES;
  const heights = new Float32Array(B * B);
  const oceanLevel = new Float32Array(S * S);
  const lake = new Float32Array(S * S);
  const rivers = new Float32Array(S * S);
  const flow = new Float32Array(S * S * 2);
  const bed = new Float32Array(S * S);
  const coast = new Float32Array(S * S);
  if (source === 'deep') {
    heights.fill(DEEP_HEIGHT);
    oceanLevel.fill(OCEAN_MIN_LEVEL);
    bed.fill(DEEP_HEIGHT);
    return { heights, oceanLevel, lake, rivers, flow, bed, coast };
  }
  const data = source.key;
  if (data.level === key.level) {
    for (let k = 0; k < B * B; k++) heights[k] = source.heights[k]!;
    for (let k = 0; k < S * S; k++) {
      oceanLevel[k] = OCEAN_MIN_LEVEL + source.ocean[k]! / OCEAN_SCALE;
      lake[k] = source.lakes[k]! / 255;
      rivers[k] = source.rivers[k]! / 255;
      flow[k * 2] = (source.flow[k * 2]! - 128) / 127;
      flow[k * 2 + 1] = (source.flow[k * 2 + 1]! - 128) / 127;
      bed[k] = source.bed[k]!;
      coast[k] = source.coast[k]!;
    }
    return { heights, oceanLevel, lake, rivers, flow, bed, coast };
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
        const s = j * S + i;
        oceanLevel[s] = OCEAN_MIN_LEVEL + bilinear(source.ocean, S, fi, fj) / OCEAN_SCALE;
        lake[s] = bilinear(source.lakes, S, fi, fj) / 255;
        rivers[s] = bilinear(source.rivers, S, fi, fj) / 255;
        flow[s * 2] = (bilinear(source.flow, S, fi, fj, 2, 0) - 128) / 127;
        flow[s * 2 + 1] = (bilinear(source.flow, S, fi, fj, 2, 1) - 128) / 127;
        bed[s] = bilinear(source.bed, S, fi, fj);
        coast[s] = bilinear(source.coast, S, fi, fj);
      }
    }
  }
  return { heights, oceanLevel, lake, rivers, flow, bed, coast };
}

function bilinear(
  grid: ArrayLike<number>,
  size: number,
  fi: number,
  fj: number,
  stride = 1,
  offset = 0,
): number {
  const i0 = Math.min(size - 2, Math.max(0, Math.floor(fi)));
  const j0 = Math.min(size - 2, Math.max(0, Math.floor(fj)));
  const ti = Math.min(1, Math.max(0, fi - i0));
  const tj = Math.min(1, Math.max(0, fj - j0));
  const at = (k: number) => grid[k * stride + offset]!;
  const a = at(j0 * size + i0);
  const b = at(j0 * size + i0 + 1);
  const c = at((j0 + 1) * size + i0);
  const d = at((j0 + 1) * size + i0 + 1);
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
