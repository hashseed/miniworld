// The planet query (spec milestone 1, section 5): whether a place is sea, its
// ice cover and the height of the drawn ground at a date, from whatever
// terrain tiles and climate slices the sources hold. The renderers pass their
// loaded data; the golden tests pass exactly the files they need.

import {
  DEEP_HEIGHT,
  ICE_DISTANCE_STEP_KM,
  ICE_DISTANCE_ZERO,
  ICE_GRID_H,
  ICE_GRID_W,
  OCEAN_MIN_LEVEL,
  OCEAN_SCALE,
  TERRAIN_SAMPLES,
  type ClimateSlice,
  type TerrainTile,
} from '../content/formats.ts';
import { TILE_N, dirToFaceUv, dirToLatLon, type Vec3 } from '../geo/cube.ts';
import { bicubicBordered, bilinear, sampleGrid } from './sample.ts';
import { isSea, surfaceM, type Ground } from './surface.ts';

/** Terrain data tiles: the finest loaded one holding a direction, 'deep' for open ocean. */
export interface TerrainSource {
  dataTileAt(dir: Vec3): TerrainTile | 'deep' | undefined;
}

/** Two climate slices to blend at a date, b weighted by t. */
export interface IcePair {
  a: ClimateSlice;
  b: ClimateSlice;
  t: number;
}

export interface IceSource {
  icePairAt(day: number): IcePair | undefined;
}

/** Open ocean: sea at every date, far from any coast. */
const DEEP: Ground = {
  height: DEEP_HEIGHT,
  oceanLevel: OCEAN_MIN_LEVEL,
  lake: 0,
  bed: DEEP_HEIGHT,
  coastKm: 255,
};
/** Before any terrain has arrived, everything is drawn as sea. */
const UNKNOWN: Ground = { ...DEEP, height: 0, bed: 0, coastKm: 0 };

export class PlanetQuery {
  private terrain: TerrainSource;
  private ice: IceSource;

  constructor(terrain: TerrainSource, ice: IceSource) {
    this.terrain = terrain;
    this.ice = ice;
  }

  /** The terrain data at a direction, interpolated like the terrain mesh. */
  groundAt(dir: Vec3): Ground {
    const tile = this.terrain.dataTileAt(dir);
    if (tile === 'deep') return DEEP;
    if (!tile) return UNKNOWN;
    const { u, v } = dirToFaceUv(dir);
    const n = 1 << tile.key.level;
    const fi = (((u + 1) / 2) * n - tile.key.x) * TILE_N;
    const fj = (((v + 1) / 2) * n - tile.key.y) * TILE_N;
    const S = TERRAIN_SAMPLES;
    return {
      height: bicubicBordered(tile.heights, fi, fj),
      oceanLevel: OCEAN_MIN_LEVEL + bilinear(tile.ocean, S, fi, fj) / OCEAN_SCALE,
      lake: bilinear(tile.lakes, S, fi, fj) / 255,
      bed: bilinear(tile.bed, S, fi, fj),
      coastKm: bilinear(tile.coast, S, fi, fj),
    };
  }

  /** Signed distance from the ice border in km at a direction and date, positive inside. */
  iceKmAt(dir: Vec3, day: number): number {
    const pair = this.ice.icePairAt(day);
    if (!pair) return -ICE_DISTANCE_ZERO * ICE_DISTANCE_STEP_KM;
    const { lat, lon } = dirToLatLon(dir);
    const at = (s: ClimateSlice) => sampleGrid(s.ice, ICE_GRID_W, ICE_GRID_H, lat, lon);
    const a = at(pair.a);
    const v = pair.a === pair.b ? a : a + (at(pair.b) - a) * pair.t;
    return (v - ICE_DISTANCE_ZERO) * ICE_DISTANCE_STEP_KM;
  }

  /** Whether the ocean covers a direction at a sea level. */
  isSea(dir: Vec3, seaLevel: number): boolean {
    return isSea(this.groundAt(dir), seaLevel);
  }

  /** Height of the drawn surface in metres (before exaggeration and the lens) at a direction and date. */
  surfaceM(dir: Vec3, day: number, seaLevel: number): number {
    return surfaceM(this.groundAt(dir), seaLevel, this.iceKmAt(dir, day));
  }
}
