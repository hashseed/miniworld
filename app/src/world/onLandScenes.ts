// The tree scenes and water checks of the on-land test (onLand.ts), worked out in a worker thread
// that runs the modules as Node loads them, outside the test runner's module transform, which makes
// the scene's hot code and terrain lookups several times faster.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import '../../../data/build/lib/worldTables.ts';
import {
  decodeClimateSlice,
  decodeTerrainTile,
  OCEAN_MIN_LEVEL,
  OCEAN_SCALE,
  PART_LEVEL,
  TERRAIN_SAMPLES,
  type TerrainTile,
} from '../content/formats.ts';
import type { Manifest, PartFile, StartupIndex } from '../content/types.ts';
import {
  ancestorAt,
  dirToFaceUv,
  dirToLatLon,
  latLonToDir,
  TILE_N,
  tilePath,
  type Vec3,
} from '../geo/cube.ts';
import { decodeLensGrids, Lens, LENS_STRENGTH } from '../geo/lens.ts';
import { placedFrame } from '../geo/placement.ts';
import { PlanetQuery, type IcePair } from '../planet/query.ts';
import { bilinear } from '../planet/sample.ts';
import { iceSlicePair, planetAt } from '../planet/state.ts';
import { LAKE_FIELD } from '../planet/surface.ts';
import { dayAtMs, msAtDay } from '../time/rate.ts';
import { LAYOUT_KM_PER_M, treeScene, type TreeChunk } from './treeScene.ts';

/** About 30 moments a minute of watching, an odd step so they do not fall on turns. */
const SAMPLE_STEP_MS = 1999;

export interface WaterLookup {
  oceanAndLake(dir: Vec3): { oceanLevel: number; lake: number };
  waterFrom(
    dir: Vec3,
    oceanLevel: number,
    lake: number,
    day: number,
    seaLevel: number,
  ): string | undefined;
  water(dir: Vec3, day: number, seaLevel: number): string | undefined;
}

/** Synchronous terrain tile + climate ice reader used by both the worker and animal on-land checks. */
export function openWaterLookup(dir: string, manifest: Manifest): WaterLookup {
  const terrain = manifest.layers.terrain!;
  const maxLevel = terrain.maxLevel;
  const stride = 1 << maxLevel;
  const tiles = new Array<TerrainTile | 'deep' | undefined>(6 * stride * stride);
  const parts = new Map<string, PartFile | null>();
  const deep0 = new Set(terrain.deep ?? []);

  function tileOf(face: number, x: number, y: number): TerrainTile | 'deep' {
    const idx = (face * stride + y) * stride + x;
    const cached = tiles[idx];
    if (cached !== undefined) return cached;
    const key = { face, level: maxLevel, x, y };
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

  const sliceAt = new Map(
    manifest.climate.files.map((f) => {
      const bytes = readFileSync(join(dir, f));
      const s = decodeClimateSlice(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      );
      return [s.day, s] as const;
    }),
  );
  let lastIceDay = NaN;
  let lastIcePair: IcePair;
  const ice = new PlanetQuery(
    { dataTileAt: () => undefined },
    {
      icePairAt: (day) => {
        if (day !== lastIceDay) {
          const { a, b, t } = iceSlicePair(manifest.climate.days, day);
          lastIcePair = { a: sliceAt.get(a)!, b: sliceAt.get(b)!, t };
          lastIceDay = day;
        }
        return lastIcePair;
      },
    },
  );

  const oceanAndLake = (d: Vec3) => {
    const { face, u, v } = dirToFaceUv(d);
    const fu = ((u + 1) / 2) * stride;
    const fv = ((v + 1) / 2) * stride;
    const tx = Math.min(stride - 1, Math.max(0, Math.floor(fu)));
    const ty = Math.min(stride - 1, Math.max(0, Math.floor(fv)));
    const tile = tileOf(face, tx, ty);
    if (tile === 'deep') return { oceanLevel: OCEAN_MIN_LEVEL, lake: 0 };
    const fi = (fu - tx) * TILE_N;
    const fj = (fv - ty) * TILE_N;
    return {
      oceanLevel: OCEAN_MIN_LEVEL + bilinear(tile.ocean, TERRAIN_SAMPLES, fi, fj) / OCEAN_SCALE,
      lake: bilinear(tile.lakes, TERRAIN_SAMPLES, fi, fj) / 255,
    };
  };

  const waterFrom = (
    d: Vec3,
    oceanLevel: number,
    lake: number,
    day: number,
    seaLevel: number,
  ): string | undefined => {
    const sea = seaLevel - oceanLevel > 0;
    const isLake = lake > LAKE_FIELD;
    if ((!sea && !isLake) || ice.iceKmAt(d, day) > 0) return undefined;
    return sea ? 'sea' : 'lake';
  };

  return {
    oceanAndLake,
    waterFrom,
    water: (d: Vec3, day: number, seaLevel: number) => {
      const g = oceanAndLake(d);
      return waterFrom(d, g.oceanLevel, g.lake, day, seaLevel);
    },
  };
}

const data = workerData as
  | { onLandWorker?: boolean; dir: string; files: [number, string][]; start: number }
  | null
  | undefined;

if (data?.onLandWorker && parentPort) {
  const { dir, files, start } = data;
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;
  const index = JSON.parse(readFileSync(join(dir, manifest.index.en), 'utf8')) as StartupIndex;
  const lookup = openWaterLookup(dir, manifest);

  const grids = decodeLensGrids(new Uint8Array(readFileSync(join(dir, manifest.lens.file))));
  const lens = new Lens(grids.forward, grids.inverse);
  lens.blend = LENS_STRENGTH;

  type SpotWater = { dir: Vec3; oceanLevel: number; lake: number };
  type CampCache = {
    frame: (eastKm: number, northKm: number, out?: Vec3) => Vec3;
    spots: Map<string, SpotWater>;
  };
  const camps = new Map<string, CampCache>();
  let totalSpots = 0;
  let lastLat = NaN;
  let lastLon = NaN;
  let lastCamp: CampCache | undefined;

  function spotOf(lat: number, lon: number, x: number, z: number): SpotWater {
    let camp = lastCamp;
    if (lat !== lastLat || lon !== lastLon || !camp) {
      const ck = `${lat},${lon}`;
      camp = camps.get(ck);
      if (!camp) {
        if (camps.size >= 50_000) {
          camps.clear();
          totalSpots = 0;
        }
        camp = {
          frame: placedFrame(lens, latLonToDir(lat, lon)),
          spots: new Map(),
        };
        camps.set(ck, camp);
      }
      lastLat = lat;
      lastLon = lon;
      lastCamp = camp;
    }
    const sk = `${x},${z}`;
    let spot = camp.spots.get(sk);
    if (!spot) {
      if (totalSpots >= 250_000) {
        for (const c of camps.values()) c.spots.clear();
        totalSpots = 0;
      }
      const d = camp.frame(x * LAYOUT_KM_PER_M, z * LAYOUT_KM_PER_M, [0, 0, 0]);
      const { oceanLevel, lake } = lookup.oceanAndLake(d);
      spot = { dir: d, oceanLevel, lake };
      camp.spots.set(sk, spot);
      totalSpots++;
    }
    return spot;
  }

  const seen = new Map<string, { line: string; n: number }>();
  function record(who: string, what: string, line: string): void {
    const k = `${who}|${what}`;
    const e = seen.get(k);
    if (e) e.n++;
    else seen.set(k, { line, n: 1 });
  }

  const where = (d: Vec3) => {
    const { lat, lon } = dirToLatLon(d);
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  };

  let checked = 0;
  for (const [w, file] of files) {
    const chunk = JSON.parse(readFileSync(join(dir, file), 'utf8')) as TreeChunk;
    const from = msAtDay(chunk.fromDay, start);
    const to = msAtDay(chunk.toDay, start);
    for (let ms = from; ms < to; ms += SAMPLE_STEP_MS) {
      const day = dayAtMs(ms, start);
      const seaLevel = planetAt(index, day).seaLevel;
      for (const f of treeScene(chunk, ms, start).figures) {
        const spot = spotOf(f.lat, f.lon, f.x, f.z);
        const what = lookup.waterFrom(spot.dir, spot.oceanLevel, spot.lake, day, seaLevel);
        if (f.clip === 'paddle') {
          if (!what)
            record(
              `paddler ${f.id}`,
              'land',
              `window ${w}, ${ms} ms: figure ${f.id} paddles over land at ${where(spot.dir)}`,
            );
          continue;
        }
        checked++;
        if (what)
          record(
            `figure ${f.id}`,
            what,
            `window ${w}, ${ms} ms: figure ${f.id} (${f.clip}) in the ${what} at ${where(spot.dir)}`,
          );
      }
    }
  }

  parentPort.postMessage({
    wetLines: [...seen.values()].map((e) => `${e.line} (${e.n} times)`),
    checked,
  });
}
