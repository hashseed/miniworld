import { describe, expect, it } from 'vitest';
import {
  DEEP_HEIGHT,
  TERRAIN_BORDERED,
  TERRAIN_SAMPLES,
} from '../../../app/src/content/formats.ts';
import { Grid, GridPyramid } from './grid.ts';
import { allTileKeys, buildTerrainTile, isDeepTile, type TerrainInputs } from './terrain.ts';
import { NO_LAKE } from './water.ts';

// Flat 45° grids, so a tile is cheap to build.
const W = 8;
const H = 4;
const u8 = (v: number) => new Grid(W, H, new Uint8Array(W * H).fill(v));
function inputs(height: number, over: Partial<TerrainInputs> = {}): TerrainInputs {
  return {
    heights: new GridPyramid(new Grid(W, H, new Int16Array(W * H).fill(height)), W),
    ocean: new Grid(W, H, new Uint16Array(W * H)),
    lakeLevel: new Grid(W, H, new Int16Array(W * H).fill(NO_LAKE)),
    lakes: u8(0),
    rivers: u8(0),
    flowCos: u8(128),
    flowSin: u8(128),
    bed: () => 7,
    coast: u8(3),
    ...over,
  };
}
const key = { face: 2, level: 1, x: 1, y: 0 };

describe('terrain tiles', () => {
  it('lists every tile up to a level once', () => {
    for (const L of [0, 1, 2]) {
      const keys = [...allTileKeys(L)].map((k) => `${k.face}/${k.level}/${k.x}/${k.y}`);
      expect(keys).toHaveLength((6 * (4 ** (L + 1) - 1)) / 3);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('builds a tile with the key and channel sizes', () => {
    const t = buildTerrainTile(key, inputs(200));
    expect(t.key).toEqual(key);
    expect(t.heights).toHaveLength(TERRAIN_BORDERED ** 2);
    for (const a of [t.ocean, t.lakes, t.rivers, t.bed, t.coast])
      expect(a).toHaveLength(TERRAIN_SAMPLES ** 2);
    expect(t.flow).toHaveLength(TERRAIN_SAMPLES ** 2 * 2);
    expect(t.heights.every((h) => h === 200)).toBe(true);
    expect(t.bed.every((b) => b === 7)).toBe(true);
    expect(t.coast.every((c) => c === 3)).toBe(true);
    expect(t.flow.every((f) => f === 128)).toBe(true);
    expect(isDeepTile(t)).toBe(false);
  });

  it('lays lake surfaces over the ground', () => {
    const t = buildTerrainTile(
      key,
      inputs(200, { lakeLevel: new Grid(W, H, new Int16Array(W * H).fill(50)), lakes: u8(200) }),
    );
    expect(t.heights.every((h) => h === 50)).toBe(true);
    expect(t.lakes.every((v) => v === 200)).toBe(true);
  });

  it('clamps deep ocean and marks tiles that are all deep', () => {
    const deep = buildTerrainTile(key, inputs(-5000));
    expect(deep.heights.every((h) => h === DEEP_HEIGHT)).toBe(true);
    expect(isDeepTile(deep)).toBe(true);
    // Any ocean, lake or river sample keeps the tile.
    const ocean = buildTerrainTile(
      key,
      inputs(-5000, { ocean: new Grid(W, H, new Uint16Array(W * H).fill(1)) }),
    );
    expect(isDeepTile(ocean)).toBe(false);
    expect(isDeepTile(buildTerrainTile(key, inputs(-5000, { rivers: u8(9) })))).toBe(false);
  });
});
