// The ground as the globe draws it (spec milestone 1, section 5): sea and
// lakes read from the finest terrain tiles the build writes, decoded as the
// app decodes them, through the app's own planet query. The tree of humankind
// and the wildlife masks judge water by it, so no figure or animal is placed
// where the drawn shore differs from the source grids by a sample (humankind.md
// section 4, wildlife.md section 4).

import {
  OCEAN_MIN_LEVEL,
  OCEAN_SCALE,
  TERRAIN_SAMPLES,
  type TerrainTile,
} from '../../../app/src/content/formats.ts';
import { dirToFaceUv, latLonToDir, TILE_N, type Vec3 } from '../../../app/src/geo/cube.ts';
import { PlanetQuery } from '../../../app/src/planet/query.ts';
import { bilinear } from '../../../app/src/planet/sample.ts';
import { LAKE_FIELD, type Ground } from '../../../app/src/planet/surface.ts';

export interface DrawnGround {
  /** The interpolated terrain data at a point, as the globe draws it. */
  groundAt(lat: number, lon: number): Ground;
  /** The interpolated `[oceanLevel, lake]` at a point, skipping height, bed and coast. */
  oceanAndLake(lat: number, lon: number, out?: [number, number]): [number, number];
  /** Whether the drawn sea covers a point at a sea level in metres. */
  sea(lat: number, lon: number, seaLevel: number): boolean;
  /** Whether a drawn lake covers a point. */
  lake(lat: number, lon: number): boolean;
}

/** Collects the finest tiles while they are written; deep tiles are left out and read as open ocean. */
export class DrawnTiles {
  private tiles: (TerrainTile | undefined)[];
  readonly level: number;
  private readonly stride: number;
  constructor(level: number) {
    this.level = level;
    this.stride = 1 << level;
    this.tiles = new Array<TerrainTile | undefined>(6 * this.stride * this.stride);
  }

  add(tile: TerrainTile, deep: boolean): void {
    if (tile.key.level !== this.level || deep) return;
    const { face, x, y } = tile.key;
    this.tiles[(face * this.stride + y) * this.stride + x] = tile;
  }

  ground(): DrawnGround {
    const n = this.stride;
    const dir: Vec3 = [0, 0, 0];
    const tmp: [number, number] = [0, 0];
    const query = new PlanetQuery(
      {
        dataTileAt: (d) => {
          const { face, u, v } = dirToFaceUv(d);
          const x = Math.min(n - 1, Math.max(0, Math.floor(((u + 1) / 2) * n)));
          const y = Math.min(n - 1, Math.max(0, Math.floor(((v + 1) / 2) * n)));
          return this.tiles[(face * n + y) * n + x] ?? 'deep';
        },
      },
      { icePairAt: () => undefined },
    );
    const groundAt = (lat: number, lon: number) => query.groundAt(latLonToDir(lat, lon, dir));
    const oceanAndLake = (lat: number, lon: number, out: [number, number] = [0, 0]) => {
      latLonToDir(lat, lon, dir);
      const { face, u, v } = dirToFaceUv(dir);
      const fu = ((u + 1) / 2) * n;
      const fv = ((v + 1) / 2) * n;
      const x = Math.min(n - 1, Math.max(0, Math.floor(fu)));
      const y = Math.min(n - 1, Math.max(0, Math.floor(fv)));
      const tile = this.tiles[(face * n + y) * n + x];
      if (!tile) {
        out[0] = OCEAN_MIN_LEVEL;
        out[1] = 0;
        return out;
      }
      const fi = (fu - x) * TILE_N;
      const fj = (fv - y) * TILE_N;
      out[0] = OCEAN_MIN_LEVEL + bilinear(tile.ocean, TERRAIN_SAMPLES, fi, fj) / OCEAN_SCALE;
      out[1] = bilinear(tile.lakes, TERRAIN_SAMPLES, fi, fj) / 255;
      return out;
    };
    return {
      groundAt,
      oceanAndLake,
      sea: (lat, lon, seaLevel) => seaLevel - oceanAndLake(lat, lon, tmp)[0] > 0,
      lake: (lat, lon) => oceanAndLake(lat, lon, tmp)[1] > LAKE_FIELD,
    };
  }
}
