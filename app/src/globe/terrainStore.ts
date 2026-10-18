// Loaded terrain data, and sampling of any quadtree tile from it
// (spec milestone 1, sections 4.2 and 5.2). Data ends at level 5
// (DATA_MAX_LEVEL), where rendered tiles stop too; in a build with fewer
// levels (the test fixture), deeper rendered tiles are refined from their
// deepest data ancestor by smooth interpolation.

import {
  DEEP_HEIGHT,
  decodeTerrainTile,
  OCEAN_MIN_LEVEL,
  OCEAN_SCALE,
  TERRAIN_BORDERED,
  TERRAIN_SAMPLES,
  type TerrainTile,
} from '../content/formats.ts';
import type { ChunkSource } from '../content/loader.ts';
import type { TerrainSource } from '../planet/query.ts';
import { bicubicBordered, bilinear } from '../planet/sample.ts';
import {
  DATA_MAX_LEVEL,
  TILE_N,
  ancestorAt,
  dirToFaceUv,
  tileAt,
  tileId,
  type TileKey,
  type Vec3,
} from '../geo/cube.ts';

// 'broken': the file arrived but cannot be read; it is not asked for again.
type Slot<T> = T | 'deep' | 'none' | 'loading' | 'broken';

/** Frames a requested tile may be out of view before its request is cancelled (about 0.5 s, section 10.4). */
export const CANCEL_AFTER_FRAMES = 30;
/** Loaded data tiles deeper than KEEP_LEVEL that are kept; the least recently used go first (section 4.2). */
export const MAX_DATA_TILES = 2048;
/** Data tiles at this level and coarser are always kept: the planet query falls back to them. */
const KEEP_LEVEL = 2;

interface Pending {
  file: string;
  controller: AbortController;
  /** Frames in a row the tile was not asked for. */
  unwanted: number;
}

function decodeOrBroken(buf: ArrayBuffer, file: string): TerrainTile | 'broken' {
  try {
    return decodeTerrainTile(buf);
  } catch (e) {
    console.error(`${file}: ${(e as Error).message}`);
    return 'broken';
  }
}

export class TerrainStore implements TerrainSource {
  private loader: ChunkSource;
  private terrain = new Map<string, Slot<TerrainTile>>();
  private wanted = new Map<string, number>(); // tile id → priority this frame
  private pending = new Map<string, Pending>(); // tile id → its request
  /** Loaded tiles deeper than KEEP_LEVEL, least recently used first. */
  private recent = new Map<string, true>();

  constructor(loader: ChunkSource) {
    this.loader = loader;
  }

  /** Data tile (level ≤ DATA_MAX_LEVEL) for a key, requesting it if needed. */
  terrainTile(key: TileKey, priority: number, id = tileId(key)): TerrainTile | 'deep' | undefined {
    const slot = this.terrain.get(id);
    if (slot === 'loading') {
      this.wanted.set(id, priority);
      return undefined;
    }
    if (slot === 'broken') return undefined;
    if (slot === 'deep') return 'deep';
    if (slot && slot !== 'none') {
      if (key.level > KEEP_LEVEL) {
        this.recent.delete(id);
        this.recent.set(id, true);
      }
      return slot;
    }
    const file = this.loader.lookup('terrain', key, 'all');
    if (file === undefined) return undefined; // part index still loading
    if (file === 'deep' || file === 'none') {
      this.terrain.set(id, 'deep');
      return 'deep';
    }
    this.terrain.set(id, 'loading');
    this.wanted.set(id, priority);
    const controller = new AbortController();
    this.pending.set(id, { file, controller, unwanted: 0 });
    void this.loader.fetchChunk(file, priority, controller.signal).then((buf) => {
      this.pending.delete(id);
      // Failed or cancelled: asked for again when next in view; the loader paces retries.
      if (!buf) return void this.terrain.delete(id);
      const tile = decodeOrBroken(buf, file);
      this.terrain.set(id, tile);
      if (tile !== 'broken' && key.level > KEEP_LEVEL) this.recent.set(id, true);
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

  /** The key of the data tile a render tile is sampled from. */
  dataKeyFor(key: TileKey): TileKey {
    const max = this.dataMaxLevel;
    return key.level > max ? ancestorAt(key, max) : key;
  }

  /** The data tile a render tile is sampled from, if loaded. */
  sourceFor(key: TileKey, priority: number): TerrainTile | 'deep' | undefined {
    return this.terrainTile(this.dataKeyFor(key), priority);
  }

  /** The finest loaded data tile holding a direction, for the planet query. */
  dataTileAt(dir: Vec3): TerrainTile | 'deep' | undefined {
    const { face, u, v } = dirToFaceUv(dir);
    for (let level = this.dataMaxLevel; level >= 0; level--) {
      const slot = this.terrain.get(tileId(tileAt(face, u, v, level)));
      if (slot === 'deep') return 'deep';
      if (slot && typeof slot === 'object') return slot;
    }
    return undefined;
  }

  /**
   * Ends a frame: waiting requests take their tile's priority in this frame,
   * requests for tiles out of view for CANCEL_AFTER_FRAMES are cancelled, and
   * the least recently used data tiles beyond MAX_DATA_TILES are dropped.
   */
  endFrame(): void {
    for (const [id, p] of this.pending) {
      const priority = this.wanted.get(id);
      if (priority !== undefined) {
        p.unwanted = 0;
        this.loader.setPriority(p.file, priority);
      } else if (++p.unwanted >= CANCEL_AFTER_FRAMES) {
        p.controller.abort();
      }
    }
    this.wanted.clear();
    for (const id of this.recent.keys()) {
      if (this.recent.size <= MAX_DATA_TILES) break;
      this.recent.delete(id);
      this.terrain.delete(id);
    }
  }

  /** Loaded data tiles deeper than the always-kept levels, for tests. */
  get cached(): number {
    return this.recent.size;
  }

  /** Tiles whose data is being fetched, for tests and stats. */
  get loading(): number {
    return this.pending.size;
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
