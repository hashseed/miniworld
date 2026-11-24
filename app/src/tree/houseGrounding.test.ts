// Verifies that no shelter or Neolithic house hovers above sloped terrain or
// gets swallowed on hillsides, both on synthetic 10-30 deg slopes and across real
// village and camp sites in the built app/public/data dataset.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SHELTERS, buildShelter, type ShelterId } from '../../../assets/src/shelters.ts';
import { aboveGroundBounds } from '../../../assets/src/plinth.ts';
import '../../../assets/src/allCultureModels.ts';
import {
  decodeClimateSlice,
  decodeTerrainTile,
  PART_LEVEL,
  type TerrainTile,
} from '../content/formats.ts';
import type { Manifest, PartFile, StartupIndex } from '../content/types.ts';
import { ancestorAt, dirToFaceUv, latLonToDir, tilePath, type Vec3 } from '../geo/cube.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import { decodeLensGrids, Lens, LENS_STRENGTH } from '../geo/lens.ts';
import { EXAGGERATION } from '../globe/exaggeration.ts';
import { groundUprightPlinth } from '../globe/grounding.ts';
import { PlanetQuery, type IcePair } from '../planet/query.ts';
import { iceSlicePair, lowestSeaLevel, planetAt } from '../planet/state.ts';
import { deg } from '../world/scene/units.ts';
import {
  LODGING_MAX_M,
  LODGING_RING_M,
  MINIMAL_LODGING,
  lodgingSpot,
  ringOf,
  towards,
  villageHouse,
} from '../world/scene/camp.ts';
import { setWorldTables } from '../world/tables.ts';
import { FIGURE_KM_PER_M, LAYOUT_KM_PER_M, type TreeChunk } from '../world/treeScene.ts';
import type { TreeLodging } from '../world/tree.ts';

const DATA = join(import.meta.dirname, '../../public/data');
const built = existsSync(join(DATA, 'manifest.json'));

interface Metrics {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxM: number;
  plinthDepthM: number;
}

function measureShelter(id: ShelterId): Metrics {
  const m = buildShelter(id);
  m.object.updateMatrixWorld(true);
  const above = aboveGroundBounds(m.object);
  const full = new THREE.Box3().setFromObject(m.object);
  const size = above.getSize(new THREE.Vector3());
  return {
    minX: above.min.x,
    maxX: above.max.x,
    minZ: above.min.z,
    maxZ: above.max.z,
    maxM: Math.max(size.x, size.z, 1e-6),
    plinthDepthM: Math.max(0, -full.min.y),
  };
}

describe('house grounding on synthetic slopes (no-hover invariant)', () => {
  const shelterIds = SHELTERS.filter((id): id is ShelterId => id.startsWith('shelter-'));
  const centerDir: Vec3 = [0, 0, 1];
  const n = {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
  const e = {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
  northEast({ x: 0, y: 0, z: 1, set() {} }, n, e);

  const slopeSurface = (tanSlope: number, azRad: number) => {
    const sx = tanSlope * Math.cos(azRad);
    const sz = tanSlope * Math.sin(azRad);
    return (d: Vec3) => {
      const eastKm = (d[0] * e.x + d[1] * e.y + d[2] * e.z) * EARTH_RADIUS_KM;
      const northKm = (d[0] * n.x + d[1] * n.y + d[2] * n.z) * EARTH_RADIUS_KM;
      return sx * eastKm + sz * northKm;
    };
  };

  it.each(shelterIds)('%s never hovers on 10, 20 or 30 deg slopes in any direction', (id) => {
    const metrics = measureShelter(id);
    const scale = 1;
    const km = FIGURE_KM_PER_M * scale;
    const plinthDepthKm = metrics.plinthDepthM * km;
    const maxBuryKm = 0.25 * km;
    for (const degSlope of [10, 20, 30]) {
      const tanSlope = Math.tan((degSlope * Math.PI) / 180);
      for (const az of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) {
        const res = groundUprightPlinth({
          centerDir,
          dirX: Math.cos(az),
          dirZ: Math.sin(az),
          minXKm: metrics.minX * km,
          maxXKm: metrics.maxX * km,
          minZKm: metrics.minZ * km,
          maxZKm: metrics.maxZ * km,
          halfWidthKm: ((metrics.maxX - metrics.minX) * km) / 2,
          halfDepthKm: ((metrics.maxZ - metrics.minZ) * km) / 2,
          plinthDepthKm,
          maxBuryKm,
          surfaceAt: slopeSurface(tanSlope, 0.3),
        });
        expect(res.plinthBottomH).toBeLessThanOrEqual(res.minH + 1e-6);
        expect(res.grounded).toBe(true);
        if (res.reliefKm <= plinthDepthKm + maxBuryKm + 1e-6) {
          expect(res.maxH - res.baseH).toBeLessThanOrEqual(maxBuryKm + 1e-6);
        }
      }
    }
  });
});

function openSurfaceQuery(dir: string, manifest: Manifest) {
  const terrain = manifest.layers.terrain!;
  const maxLevel = terrain.maxLevel;
  const stride = 1 << maxLevel;
  const tiles = new Array<TerrainTile | 'deep' | undefined>(6 * stride * stride);
  const parts = new Map<string, PartFile | null>();
  const deep0 = new Set(terrain.deep ?? []);

  function tileAtDir(d: Vec3): TerrainTile | 'deep' {
    const { face, u, v } = dirToFaceUv(d);
    const tx = Math.min(stride - 1, Math.max(0, Math.floor(((u + 1) / 2) * stride)));
    const ty = Math.min(stride - 1, Math.max(0, Math.floor(((v + 1) / 2) * stride)));
    const idx = (face * stride + ty) * stride + tx;
    const cached = tiles[idx];
    if (cached !== undefined) return cached;
    const key = { face, level: maxLevel, x: tx, y: ty };
    const path = tilePath(key);
    let file: string | undefined;
    if (maxLevel < PART_LEVEL) {
      file = terrain.chunks[`${path}/all/xx`] ?? (deep0.has(path) ? 'deep' : 'none');
    } else {
      const partPath = tilePath(ancestorAt(key, PART_LEVEL));
      let part = parts.get(partPath);
      if (part === undefined) {
        const partFile = terrain.parts[partPath];
        part = partFile
          ? (JSON.parse(readFileSync(join(dir, partFile), 'utf8')) as PartFile)
          : null;
        parts.set(partPath, part);
      }
      file = part
        ? (part.chunks[`${path}/all/xx`] ?? (part.deep?.includes(path) ? 'deep' : 'none'))
        : 'none';
    }
    if (!file || file === 'deep' || file === 'none') {
      tiles[idx] = 'deep';
      return 'deep';
    }
    const bytes = readFileSync(join(dir, file));
    const tile = decodeTerrainTile(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
    tiles[idx] = tile;
    return tile;
  }

  const slices = new Map(
    manifest.climate.files.map((f) => {
      const bytes = readFileSync(join(dir, f));
      const s = decodeClimateSlice(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      );
      return [s.day, s] as const;
    }),
  );
  let lastDay = NaN;
  let lastPair: IcePair | undefined;
  const query = new PlanetQuery(
    { dataTileAt: tileAtDir },
    {
      icePairAt: (day) => {
        if (day !== lastDay) {
          const { a, b, t } = iceSlicePair(manifest.climate.days, day);
          lastPair = { a: slices.get(a)!, b: slices.get(b)!, t };
          lastDay = day;
        }
        return lastPair;
      },
    },
  );
  const grids = decodeLensGrids(new Uint8Array(readFileSync(join(dir, manifest.lens.file))));
  const lens = new Lens(grids.forward, grids.inverse);
  lens.blend = LENS_STRENGTH;
  return { query, lens };
}

describe.skipIf(!built)('built-world village & shelter no-hover check', () => {
  it('grounds every village and camp lodging in app/public/data without hovering', () => {
    const manifest = JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8')) as Manifest;
    const index = JSON.parse(readFileSync(join(DATA, manifest.index.en), 'utf8')) as StartupIndex;
    setWorldTables(index.tables);
    const minSea = lowestSeaLevel(index.seaLevel);
    const { query, lens } = openSurfaceQuery(DATA, manifest);
    const metricsCache = new Map<string, Metrics>();
    const getMetrics = (kind: string): Metrics | undefined => {
      let m = metricsCache.get(kind);
      if (!m) {
        if (!SHELTERS.includes(kind as ShelterId)) return undefined;
        m = measureShelter(kind as ShelterId);
        metricsCache.set(kind, m);
      }
      return m;
    };

    const treeFiles = (manifest.tree?.files ?? []).filter((f): f is string => !!f);
    expect(treeFiles.length).toBeGreaterThan(0);

    const nVec = {
      x: 0,
      y: 0,
      z: 0,
      set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    };
    const eVec = {
      x: 0,
      y: 0,
      z: 0,
      set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    };
    const seen = new Set<string>();
    const hoverFailures: string[] = [];
    let checked = 0;

    const surfaceAt = (day: number, seaLevel: number) => (drawnDir: Vec3) => {
      const trueDir = lens.toTrue(drawnDir);
      return query.surfaceM(trueDir, day, seaLevel) * EXAGGERATION * 0.001 * lens.widthAt(trueDir);
    };

    const checkLodging = (l: TreeLodging) => {
      const metrics = getMetrics(l.kind);
      if (!metrics) return;
      const house = villageHouse(l);
      const spot = lodgingSpot(l);
      const facing = house
        ? { dirX: house.dir.x, dirZ: house.dir.z }
        : towards(spot.x, spot.z, 0, 0);
      const key = `${l.lat},${l.lon},${spot.x.toFixed(2)},${spot.z.toFixed(2)},${l.kind},${l.built}`;
      if (seen.has(key)) return;
      seen.add(key);

      const room =
        house || l.kind === MINIMAL_LODGING ? undefined : ringOf(l.camp) / LODGING_RING_M;
      const scale = room === undefined ? 1 : Math.min(1, (LODGING_MAX_M * room) / metrics.maxM);
      const km = FIGURE_KM_PER_M * scale;

      const drawnUp = lens.toDrawn(latLonToDir(deg(l.lat), deg(l.lon)));
      const ul = Math.hypot(drawnUp[0], drawnUp[1], drawnUp[2]);
      const upVec = { x: drawnUp[0] / ul, y: drawnUp[1] / ul, z: drawnUp[2] / ul, set() {} };
      northEast(upVec, nVec, eVec);
      const cx = upVec.x * EARTH_RADIUS_KM + (eVec.x * spot.x + nVec.x * spot.z) * LAYOUT_KM_PER_M;
      const cy = upVec.y * EARTH_RADIUS_KM + (eVec.y * spot.x + nVec.y * spot.z) * LAYOUT_KM_PER_M;
      const cz = upVec.z * EARTH_RADIUS_KM + (eVec.z * spot.x + nVec.z * spot.z) * LAYOUT_KM_PER_M;
      const cl = Math.hypot(cx, cy, cz);
      const centerDir: Vec3 = [cx / cl, cy / cl, cz / cl];

      const day = Math.max(manifest.timelineStartDay, l.built);
      const seaLevel = planetAt(index, day, minSea).seaLevel;
      const res = groundUprightPlinth({
        centerDir,
        dirX: facing.dirX,
        dirZ: facing.dirZ,
        minXKm: metrics.minX * km,
        maxXKm: metrics.maxX * km,
        minZKm: metrics.minZ * km,
        maxZKm: metrics.maxZ * km,
        halfWidthKm: ((metrics.maxX - metrics.minX) * km) / 2,
        halfDepthKm: ((metrics.maxZ - metrics.minZ) * km) / 2,
        plinthDepthKm: metrics.plinthDepthM * km,
        maxBuryKm: 0.25 * km,
        surfaceAt: surfaceAt(day, seaLevel),
      });
      checked++;
      if (!res.grounded || res.plinthBottomH > res.minH + 1e-6) {
        hoverFailures.push(
          `${l.kind} camp=${l.camp} gap=${(res.plinthBottomH - res.minH).toFixed(2)}`,
        );
      }
    };

    for (const file of treeFiles) {
      const chunk = JSON.parse(readFileSync(join(DATA, file), 'utf8')) as TreeChunk;
      for (const l of chunk.lodgings) checkLodging(l);
    }
    expect(checked).toBeGreaterThan(0);
    expect(hoverFailures).toEqual([]);
  }, 60_000);
});
