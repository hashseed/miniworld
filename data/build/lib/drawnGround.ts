// The ground as the globe draws it (spec milestone 1, section 5): sea and
// lakes read from the finest terrain tiles the build writes, decoded as the
// app decodes them, through the app's own planet query. The tree of humankind
// and the wildlife masks judge water by it, so no figure or animal is placed
// where the drawn shore differs from the source grids by a sample (humankind.md
// section 4, wildlife.md section 4).

import {
  decodeTerrainTile,
  encodeTerrainTile,
  type TerrainTile,
} from '../../../app/src/content/formats.ts';
import { dirToFaceUv, latLonToDir, tileAt, type TileKey } from '../../../app/src/geo/cube.ts';
import { PlanetQuery } from '../../../app/src/planet/query.ts';
import { isSea, LAKE_FIELD, type Ground } from '../../../app/src/planet/surface.ts';

export interface DrawnGround {
  /** The interpolated terrain data at a point, as the globe draws it. */
  groundAt(lat: number, lon: number): Ground;
  /** Whether the drawn sea covers a point at a sea level in metres. */
  sea(lat: number, lon: number, seaLevel: number): boolean;
  /** Whether a drawn lake covers a point. */
  lake(lat: number, lon: number): boolean;
}

const id = (k: TileKey) => `${k.face}/${k.x}/${k.y}`;

/** Collects the finest tiles while they are written; deep tiles are left out and read as open ocean. */
export class DrawnTiles {
  private tiles = new Map<string, TerrainTile>();
  readonly level: number;
  constructor(level: number) {
    this.level = level;
  }

  add(tile: TerrainTile, deep: boolean): void {
    if (tile.key.level !== this.level || deep) return;
    const bytes = encodeTerrainTile(tile);
    this.tiles.set(
      id(tile.key),
      decodeTerrainTile(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      ),
    );
  }

  ground(): DrawnGround {
    const query = new PlanetQuery(
      {
        dataTileAt: (dir) => {
          const { face, u, v } = dirToFaceUv(dir);
          return this.tiles.get(id(tileAt(face, u, v, this.level))) ?? 'deep';
        },
      },
      { icePairAt: () => undefined },
    );
    const groundAt = (lat: number, lon: number) => query.groundAt(latLonToDir(lat, lon));
    return {
      groundAt,
      sea: (lat, lon, seaLevel) => isSea(groundAt(lat, lon), seaLevel),
      lake: (lat, lon) => groundAt(lat, lon).lake > LAKE_FIELD,
    };
  }
}
