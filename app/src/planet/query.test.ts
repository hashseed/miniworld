import { describe, expect, it } from 'vitest';
import {
  ICE_GRID_H,
  ICE_GRID_W,
  OCEAN_MIN_LEVEL,
  OCEAN_SCALE,
  TERRAIN_BORDERED,
  TERRAIN_SAMPLES,
  type ClimateSlice,
  type TerrainTile,
} from '../content/formats.ts';
import { faceUvToDir, latLonToDir, type TileKey } from '../geo/cube.ts';
import { PlanetQuery, type IcePair } from './query.ts';
import {
  ICE_DOME_KM,
  ICE_DOME_M,
  ICE_HIDE_KM,
  LAND_LIFT_M,
  groundM,
  surfaceM,
  type Ground,
} from './surface.ts';

const B = TERRAIN_BORDERED;
const S = TERRAIN_SAMPLES;

/** A tile whose heights rise linearly east (i) and north (j), with uniform other channels. */
function rampTile(key: TileKey, oceanLevel: number, coastKm: number): TerrainTile {
  const heights = new Int16Array(B * B);
  for (let j = 0; j < B; j++)
    for (let i = 0; i < B; i++) heights[j * B + i] = (i - 1) * 10 + (j - 1);
  return {
    key,
    heights,
    ocean: new Uint16Array(S * S).fill((oceanLevel - OCEAN_MIN_LEVEL) * OCEAN_SCALE),
    lakes: new Uint8Array(S * S),
    rivers: new Uint8Array(S * S),
    flow: new Uint8Array(S * S * 2).fill(128),
    bed: new Int16Array(S * S).fill(300),
    coast: new Uint8Array(S * S).fill(coastKm),
  };
}

/** A climate slice with the same stored ice distance everywhere. */
function iceSlice(day: number, stored: number): ClimateSlice {
  return {
    day,
    ice: new Uint8Array(ICE_GRID_W * ICE_GRID_H).fill(stored),
    aridity: new Uint8Array(1),
  };
}

const inland: Ground = { height: 1000, oceanLevel: 40, lake: 0, bed: 500, coastKm: 255 };

describe('drawn surface rules', () => {
  it('draws the sea flat at the sea level', () => {
    expect(groundM({ ...inland, oceanLevel: -50 }, -20)).toBe(-20);
  });

  it('lifts land far inland by the land lift alone', () => {
    expect(groundM(inland, 0)).toBeCloseTo(1000 + LAND_LIFT_M, -1);
  });

  it('rounds the land down to the sea at the coast', () => {
    const atCoast = groundM({ ...inland, coastKm: 0 }, 0);
    const near = groundM({ ...inland, coastKm: 10 }, 0);
    expect(atCoast).toBeLessThan(0.01);
    expect(near).toBeGreaterThan(atCoast);
    expect(near).toBeLessThan(groundM(inland, 0));
  });

  it('keeps sea floor left on the land side at the sea level, but not a lake bed', () => {
    const floor = { ...inland, height: -40 };
    expect(groundM(floor, 0)).toBeCloseTo(LAND_LIFT_M, -1);
    expect(groundM({ ...floor, lake: 0.9 }, 0)).toBeCloseTo(-40 + LAND_LIFT_M, -1);
  });

  it('raises ice domes on the bed, hiding the relief over their first kilometres', () => {
    expect(surfaceM(inland, 0, -10)).toBe(groundM(inland, 0));
    const deep = surfaceM(inland, 0, 5000);
    expect(deep).toBeCloseTo(500 + LAND_LIFT_M + ICE_DOME_M, 3);
    // Halfway across the hiding band the surface is halfway between land and dome.
    const km = ICE_HIDE_KM / 2;
    const dome = 500 + LAND_LIFT_M + ICE_DOME_M * (1 - Math.exp(-km / ICE_DOME_KM));
    expect(surfaceM(inland, 0, km)).toBeCloseTo((groundM(inland, 0) + dome) / 2, 6);
  });
});

describe('planet query', () => {
  const root = { face: 0, level: 0, x: 0, y: 0 };

  it('samples the heights like the terrain mesh', () => {
    const tile = rampTile(root, 40, 255);
    const q = new PlanetQuery({ dataTileAt: () => tile }, { icePairAt: () => undefined });
    // Face 0's centre is sample (16, 16): 16·10 + 16; the cubic reproduces the ramp.
    expect(q.groundAt([1, 0, 0]).height).toBeCloseTo(176, 6);
    // u = 0.25 lies at sample 0.625 · TILE_N = 20.
    expect(q.groundAt(faceUvToDir(0, 0.25, 0)).height).toBeCloseTo(216, 6);
    const g = q.groundAt([1, 0, 0]);
    expect(g.oceanLevel).toBeCloseTo(40, 6);
    expect(g.bed).toBe(300);
    expect(g.coastKm).toBe(255);
    expect(q.isSea([1, 0, 0], 0)).toBe(false);
    expect(q.isSea([1, 0, 0], 50)).toBe(true);
    expect(q.surfaceM([1, 0, 0], 0, 0)).toBeCloseTo(groundM(g, 0), 9);
  });

  it('treats open ocean and unloaded places as sea', () => {
    const noIce = { icePairAt: () => undefined };
    expect(new PlanetQuery({ dataTileAt: () => 'deep' }, noIce).isSea([1, 0, 0], -130)).toBe(false);
    expect(new PlanetQuery({ dataTileAt: () => 'deep' }, noIce).surfaceM([1, 0, 0], 0, -60)).toBe(
      -60,
    );
    expect(new PlanetQuery({ dataTileAt: () => undefined }, noIce).surfaceM([0, 1, 0], 0, 0)).toBe(
      0,
    );
  });

  it('blends the ice between two slices, and has none before any slice arrives', () => {
    const tile = rampTile(root, 40, 255);
    let pair: IcePair | undefined;
    const q = new PlanetQuery({ dataTileAt: () => tile }, { icePairAt: () => pair });
    const dir = latLonToDir(0, 90);
    expect(q.iceKmAt(dir, 0)).toBe(-128);
    pair = { a: iceSlice(0, 32), b: iceSlice(100, 82), t: 0.4 };
    // Stored 32 is the border; 20 steps of 4 km inside at t = 0.4.
    expect(q.iceKmAt(dir, 40)).toBeCloseTo(80, 6);
    const one = iceSlice(0, 100);
    pair = { a: one, b: one, t: 0.7 };
    expect(q.iceKmAt(dir, 40)).toBeCloseTo(272, 6);
  });
});
