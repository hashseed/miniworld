import { describe, expect, it } from 'vitest';
import {
  OCEAN_MIN_LEVEL,
  OCEAN_SCALE,
  TERRAIN_BORDERED,
  TERRAIN_SAMPLES,
  TERRAIN_TILE_BYTES,
  decodeClimateSlice,
  decodeFoliageSlice,
  decodeTerrainTile,
  encodeClimateSlice,
  encodeFoliageSlice,
  encodeTerrainTile,
  ICE_GRID_W,
  ICE_GRID_H,
  ARID_GRID_W,
  ARID_GRID_H,
  FOLIAGE_GRID_W,
  FOLIAGE_GRID_H,
  type TerrainTile,
} from '../content/formats.ts';
import type { ChunkSource } from '../content/loader.ts';
import type { Manifest } from '../content/types.ts';
import { DATA_MAX_LEVEL, TILE_N, faceUvToDir, type TileKey } from '../geo/cube.ts';
import { CANCEL_AFTER_FRAMES, MAX_DATA_TILES, TerrainStore, sampleTile } from './terrainStore.ts';

const B = TERRAIN_BORDERED;
const S = TERRAIN_SAMPLES;

/** A tile whose heights rise linearly east (i) and north (j), so interpolation is exact. */
function rampTile(key: TileKey): TerrainTile {
  const heights = new Int16Array(B * B);
  for (let j = 0; j < B; j++)
    for (let i = 0; i < B; i++) heights[j * B + i] = (i - 1) * 10 + (j - 1);
  const ocean = new Uint16Array(S * S).fill(5 * OCEAN_SCALE);
  const lakes = new Uint8Array(S * S);
  const rivers = new Uint8Array(S * S).fill(255);
  const flow = new Uint8Array(S * S * 2).fill(128);
  const bed = new Int16Array(S * S).fill(-7);
  const coast = new Uint8Array(S * S);
  for (let k = 0; k < S * S; k++) coast[k] = k % 256;
  return { key, heights, ocean, lakes, rivers, flow, bed, coast };
}

const copy = (u: Uint8Array) => u.slice().buffer;
/** Element-wise equality; much faster than toEqual on large arrays. */
const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, k) => v === b[k]);

describe('binary formats', () => {
  it('round-trips a terrain tile', () => {
    const t = rampTile({ face: 3, level: 6, x: 41, y: 17 });
    const bytes = encodeTerrainTile(t);
    expect(bytes.byteLength).toBe(TERRAIN_TILE_BYTES);
    const back = decodeTerrainTile(copy(bytes));
    expect(back.key).toEqual(t.key);
    for (const f of ['heights', 'ocean', 'lakes', 'rivers', 'flow', 'bed', 'coast'] as const)
      expect(Array.from(back[f]), f).toEqual(Array.from(t[f]));
  });

  it('refuses a terrain tile of the wrong length or kind', () => {
    const bytes = encodeTerrainTile(rampTile({ face: 0, level: 0, x: 0, y: 0 }));
    expect(() => decodeTerrainTile(copy(bytes.subarray(0, 100)))).toThrow('expected');
    const bad = bytes.slice();
    bad[0] = 0;
    expect(() => decodeTerrainTile(bad.buffer)).toThrow('Not a terrain tile');
  });

  it('round-trips climate and foliage slices', () => {
    const ice = new Uint8Array(ICE_GRID_W * ICE_GRID_H).map((_, k) => (k * 7) % 256);
    const aridity = new Uint8Array(ARID_GRID_W * ARID_GRID_H).map((_, k) => (k * 3) % 256);
    const c = decodeClimateSlice(copy(encodeClimateSlice({ day: -1234, ice, aridity })));
    expect(c.day).toBe(-1234);
    expect(same(c.ice, ice)).toBe(true);
    expect(same(c.aridity, aridity)).toBe(true);
    expect(() => decodeClimateSlice(new ArrayBuffer(16))).toThrow();

    const n = FOLIAGE_GRID_W * FOLIAGE_GRID_H;
    const cells = new Uint8Array(n).map((_, k) => k % 9);
    const density = new Uint8Array(n).map((_, k) => k % 256);
    const f = decodeFoliageSlice(copy(encodeFoliageSlice({ day: 5, cells, density })));
    expect(f.day).toBe(5);
    expect(same(f.cells, cells)).toBe(true);
    expect(same(f.density, density)).toBe(true);
    expect(() => decodeFoliageSlice(new ArrayBuffer(12))).toThrow();
  });
});

describe('sampleTile', () => {
  it('fills a deep tile with the deep sea floor', () => {
    const s = sampleTile({ face: 0, level: 3, x: 1, y: 1 }, 'deep');
    expect(s.heights.every((h) => h === -1000)).toBe(true);
    expect(s.oceanLevel.every((h) => h === OCEAN_MIN_LEVEL)).toBe(true);
  });

  it('copies its own data tile and converts the channels', () => {
    const key = { face: 1, level: 2, x: 2, y: 3 };
    const s = sampleTile(key, rampTile(key));
    expect(s.heights[B + 1]).toBe(0);
    expect(s.heights[B + 2]).toBe(10);
    expect(s.oceanLevel[0]).toBe(OCEAN_MIN_LEVEL + 5);
    expect(s.rivers[0]).toBe(1);
    expect(s.flow[0]).toBe(0);
    expect(s.bed[0]).toBe(-7);
  });

  it('interpolates a deeper tile from its ancestor, matching at shared samples', () => {
    const data = rampTile({ face: 1, level: 2, x: 2, y: 3 });
    // The north-east quarter child two levels down: x = 2·4 + 3, y = 3·4 + 0.
    const child = { face: 1, level: 4, x: 11, y: 12 };
    const s = sampleTile(child, data);
    // Its first sample lies three quarters of the way across the data tile.
    const i0 = (3 * TILE_N) / 4;
    expect(s.heights[B + 1]).toBeCloseTo(i0 * 10, 4);
    // One child sample step is a quarter of a data sample step.
    expect(s.heights[B + 2]! - s.heights[B + 1]!).toBeCloseTo(10 / 4, 4);
    expect(s.heights[2 * B + 1]! - s.heights[B + 1]!).toBeCloseTo(1 / 4, 4);
    expect(s.bed[0]).toBeCloseTo(-7, 6);
  });
});

/** A chunk source whose requests the test answers by hand. */
class FakeSource implements ChunkSource {
  manifest = { layers: { terrain: { maxLevel: DATA_MAX_LEVEL } } } as unknown as Manifest;
  requests: {
    file: string;
    priority: number;
    signal?: AbortSignal;
    answer: (b?: ArrayBuffer) => void;
  }[] = [];
  priorities = new Map<string, number>();
  lookup(_layer: string, key: TileKey): string {
    return `t/${key.face}/${key.level}/${key.x}/${key.y}`;
  }
  fetchChunk(
    file: string,
    priority: number,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer | undefined> {
    return new Promise((answer) => {
      this.requests.push({ file, priority, signal, answer });
      signal?.addEventListener('abort', () => answer(undefined));
    });
  }
  setPriority(file: string, priority: number): void {
    this.priorities.set(file, priority);
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('TerrainStore', () => {
  const key = { face: 2, level: 5, x: 5, y: 9 };

  it('samples rendered tiles from data that ends at level 5', () => {
    expect(DATA_MAX_LEVEL).toBe(5);
    const src = new FakeSource();
    const store = new TerrainStore(src);
    expect(store.dataMaxLevel).toBe(5);
    expect(store.dataKeyFor(key)).toEqual(key);
    // A build with fewer levels samples deeper tiles from their deepest ancestor.
    src.manifest = { layers: { terrain: { maxLevel: 4 } } } as unknown as Manifest;
    expect(store.dataKeyFor(key)).toEqual({ face: 2, level: 4, x: 2, y: 4 });
    // A manifest claiming more levels than the app knows is capped.
    src.manifest = { layers: { terrain: { maxLevel: 6 } } } as unknown as Manifest;
    expect(store.dataMaxLevel).toBe(DATA_MAX_LEVEL);
  });

  it('asks once per tile and keeps what arrives', async () => {
    const src = new FakeSource();
    const store = new TerrainStore(src);
    expect(store.terrainTile(key, 3)).toBeUndefined();
    expect(store.terrainTile(key, 3)).toBeUndefined();
    expect(src.requests).toHaveLength(1);
    src.requests[0]!.answer(copy(encodeTerrainTile(rampTile(key))));
    await settle();
    expect(store.terrainTile(key, 3)).toMatchObject({ key });
    expect(store.loading).toBe(0);
  });

  it('counts a change of ground when a tile arrives', async () => {
    const src = new FakeSource();
    const store = new TerrainStore(src);
    const before = store.generation;
    store.terrainTile(key, 3);
    expect(store.generation).toBe(before);
    src.requests[0]!.answer(copy(encodeTerrainTile(rampTile(key))));
    await settle();
    expect(store.generation).toBeGreaterThan(before);
  });

  it('passes the priority of each frame to a waiting request', () => {
    const src = new FakeSource();
    const store = new TerrainStore(src);
    store.terrainTile(key, 9);
    store.endFrame();
    store.terrainTile(key, 2);
    store.endFrame();
    expect(src.priorities.get(src.requests[0]!.file)).toBe(2);
  });

  it('cancels a request whose tile stays out of view, and asks again later', async () => {
    const src = new FakeSource();
    const store = new TerrainStore(src);
    store.terrainTile(key, 1);
    store.endFrame();
    for (let f = 1; f < CANCEL_AFTER_FRAMES; f++) store.endFrame();
    expect(src.requests[0]!.signal!.aborted).toBe(false);
    store.endFrame();
    expect(src.requests[0]!.signal!.aborted).toBe(true);
    await settle();
    expect(store.loading).toBe(0);
    store.terrainTile(key, 1);
    expect(src.requests).toHaveLength(2);
  });

  it('keeps a tile in view however long it takes', () => {
    const src = new FakeSource();
    const store = new TerrainStore(src);
    for (let f = 0; f < CANCEL_AFTER_FRAMES * 3; f++) {
      store.terrainTile(key, 1);
      store.endFrame();
    }
    expect(src.requests[0]!.signal!.aborted).toBe(false);
  });

  it('does not ask again for a file that cannot be read', async () => {
    const src = new FakeSource();
    const store = new TerrainStore(src);
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      store.terrainTile(key, 1);
      src.requests[0]!.answer(new ArrayBuffer(10));
      await settle();
      expect(store.terrainTile(key, 1)).toBeUndefined();
      expect(src.requests).toHaveLength(1);
      expect(errors).toHaveLength(1);
    } finally {
      console.error = original;
    }
  });

  it('drops the least recently used data tiles beyond the cache size, keeping coarse ones', async () => {
    const src = new FakeSource();
    const store = new TerrainStore(src);
    const root = { face: 0, level: 0, x: 0, y: 0 };
    const keys = [root];
    for (let n = 0; n < MAX_DATA_TILES + 10; n++)
      keys.push({ face: 1 + (n >> 10), level: 5, x: n % 32, y: (n >> 5) % 32 });
    for (const k of keys) store.terrainTile(k, 1);
    src.requests.forEach((r, n) => r.answer(copy(encodeTerrainTile(rampTile(keys[n]!)))));
    await settle();
    // Using the first deep tile again makes it the most recent.
    expect(store.terrainTile(keys[1]!, 1)).toMatchObject({ key: keys[1] });
    store.endFrame();
    expect(store.cached).toBe(MAX_DATA_TILES);
    expect(store.terrainTile(root, 1)).toMatchObject({ key: root });
    expect(store.terrainTile(keys[1]!, 1)).toMatchObject({ key: keys[1] });
    // The next ten were least recently used and are asked for again.
    expect(store.terrainTile(keys[2]!, 1)).toBeUndefined();
    expect(store.terrainTile(keys.at(-1)!, 1)).toMatchObject({ key: keys.at(-1) });
  });

  it('gives the finest loaded tile at a direction', async () => {
    const src = new FakeSource();
    const store = new TerrainStore(src);
    expect(store.dataTileAt([1, 0, 0])).toBeUndefined();
    const root = { face: 0, level: 0, x: 0, y: 0 };
    store.terrainTile(root, 1);
    src.requests[0]!.answer(copy(encodeTerrainTile(rampTile(root))));
    await settle();
    expect(store.dataTileAt([1, 0, 0])).toMatchObject({ key: root });
    // Face 0's centre lies in child (1, 1) of level 1.
    const child = { face: 0, level: 1, x: 1, y: 1 };
    store.terrainTile(child, 1);
    src.requests[1]!.answer(copy(encodeTerrainTile(rampTile(child))));
    await settle();
    expect(store.dataTileAt([1, 0, 0])).toMatchObject({ key: child });
    expect(store.dataTileAt(faceUvToDir(0, -0.5, -0.5))).toMatchObject({ key: root });
  });
});
