// The deterministic paths of people and animals never lead onto water
// (humankind.md section 4, wildlife.md section 4): every figure of the tree
// of humankind and every walking animal stands on land, never in the sea or a
// lake, at the date it is shown, checked with the planet query on the built
// data. Like the golden tests it runs on the data in app/public/data
// (`npm run golden`) and is skipped when nothing has been built.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { decodeClimateSlice, decodeTerrainTile, type TerrainTile } from '../content/formats.ts';
import { ContentLoader } from '../content/loader.ts';
import type { StartupIndex } from '../content/types.ts';
import {
  ancestorAt,
  dirToFaceUv,
  dirToLatLon,
  latLonToDir,
  tileAt,
  type Vec3,
} from '../geo/cube.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import { PlanetQuery, type IcePair } from '../planet/query.ts';
import { iceSlicePair, planetAt } from '../planet/state.ts';
import { isSea, LAKE_FIELD } from '../planet/surface.ts';
import { dayAtMs, msAtDay } from '../time/rate.ts';
import { LAYOUT_KM_PER_M, treeScene, type TreeChunk } from './treeScene.ts';
import { WILD_GROUPS, decodeWildMask, flies, swims, wildlifeAt } from './wildlife.ts';

const DATA = join(import.meta.dirname, '../../public/data');
const built = existsSync(join(DATA, 'manifest.json'));

const fetchFile = async (input: RequestInfo | URL): Promise<Response> => {
  try {
    return new Response(await readFile(String(input)));
  } catch {
    return new Response('missing', { status: 404 });
  }
};

/** The true direction km east and north of a place, on the plane touching the globe there. */
function offsetDir(lat: number, lon: number, eastKm: number, northKm: number): Vec3 {
  const up = new THREE.Vector3(...latLonToDir(lat, lon));
  const north = new THREE.Vector3();
  const east = new THREE.Vector3();
  northEast(up, north, east);
  up.multiplyScalar(EARTH_RADIUS_KM)
    .addScaledVector(east, eastKm)
    .addScaledVector(north, northKm)
    .normalize();
  return [up.x, up.y, up.z];
}

describe.skipIf(!built)('paths on land', async () => {
  const loader = new ContentLoader(`${DATA}/`, { fetch: fetchFile });
  const manifest = built ? await loader.init() : undefined!;
  const index: StartupIndex = built ? await loader.index('en') : undefined!;
  const maxLevel = built ? manifest.layers.terrain!.maxLevel : 0;

  // The finest terrain data tile under each place, loaded once.
  const tiles = new Map<string, TerrainTile | 'deep'>();
  async function tileOf(dir: Vec3): Promise<TerrainTile | 'deep'> {
    const { face, u, v } = dirToFaceUv(dir);
    const key = ancestorAt(tileAt(face, u, v, maxLevel), maxLevel);
    let file: string | undefined;
    // Undefined while the part index of the key loads.
    while ((file = loader.lookup('terrain', key, 'all')) === undefined)
      await new Promise((r) => setTimeout(r, 1));
    if (file === 'deep' || file === 'none') return 'deep';
    let tile = tiles.get(file);
    if (!tile) {
      tile = decodeTerrainTile((await loader.fetchChunk(file, 0))!);
      tiles.set(file, tile);
    }
    return tile;
  }

  const slices = built
    ? await Promise.all(
        manifest.climate.files.map(async (f) =>
          decodeClimateSlice((await loader.fetchChunk(f, 0))!),
        ),
      )
    : [];
  const sliceAt = new Map(slices.map((s) => [s.day, s]));
  const icePairAt = (day: number): IcePair => {
    const { a, b, t } = iceSlicePair(manifest.climate.days, day);
    return { a: sliceAt.get(a)!, b: sliceAt.get(b)!, t };
  };

  /** Why a place is water on a day: 'sea', 'lake' or undefined for land or ice, which penguins stand on. */
  async function water(dir: Vec3, day: number): Promise<string | undefined> {
    const tile = await tileOf(dir);
    const q = new PlanetQuery({ dataTileAt: () => tile }, { icePairAt });
    const ground = q.groundAt(dir);
    const sea = isSea(ground, planetAt(index, day).seaLevel);
    const lake = ground.lake > LAKE_FIELD;
    if ((!sea && !lake) || q.iceKmAt(dir, day) > 0) return undefined;
    return sea ? 'sea' : 'lake';
  }

  /** The wet places found, one line per figure or group and water, with how often. */
  function report(): { add(who: string, what: string, line: string): void; lines(): string[] } {
    const seen = new Map<string, { line: string; n: number }>();
    return {
      add(who, what, line) {
        const k = `${who}|${what}`;
        const e = seen.get(k);
        if (e) e.n++;
        else seen.set(k, { line, n: 1 });
      },
      lines: () => [...seen.values()].map((e) => `${e.line} (${e.n} times)`),
    };
  }

  const where = (dir: Vec3) => {
    const { lat, lon } = dirToLatLon(dir);
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  };

  it('keeps every figure of the tree of humankind on land', async () => {
    const files = manifest.tree?.files ?? [];
    const wet = report();
    let checked = 0;
    for (const [w, file] of files.entries()) {
      if (!file) continue;
      const chunk = JSON.parse(await readFile(join(DATA, file), 'utf8')) as TreeChunk;
      const start = manifest.timelineStartDay;
      const from = msAtDay(chunk.fromDay, start);
      const to = msAtDay(chunk.toDay, start);
      // Every 250 ms of watching, about 75 km of a walk on the globe.
      for (let ms = from; ms < to; ms += 250) {
        const day = dayAtMs(ms, start);
        for (const f of treeScene(chunk, ms, start).figures) {
          const dir = offsetDir(f.lat, f.lon, f.x * LAYOUT_KM_PER_M, f.z * LAYOUT_KM_PER_M);
          checked++;
          const what = await water(dir, day);
          if (what)
            wet.add(
              `figure ${f.id}`,
              what,
              `window ${w}, ${ms} ms: figure ${f.id} (${f.clip}) in the ${what} at ${where(dir)}`,
            );
        }
      }
    }
    expect(wet.lines()).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  }, 600_000);

  it('keeps every walking animal on land', async () => {
    const masks = index.wildlife.map((hex) => (hex ? decodeWildMask(hex) : undefined));
    const wet = report();
    let checked = 0;
    // Every fourth time window and today; an hour of the life clock at each,
    // every 5 seconds, as a walk lasts about 20.
    const days = [...manifest.windows.filter((_, i) => i % 4 === 0), manifest.cutoffDay];
    for (const day of days)
      for (let s = 0; s < 3600; s += 5)
        for (const a of wildlifeAt(day, s, WILD_GROUPS, masks)) {
          const g = WILD_GROUPS[Number(a.key.split(':')[0])]!;
          if (flies(g) || swims(g) || a.grow <= 0) continue;
          const dir = offsetDir(a.lat, a.lon, a.eastKm, a.northKm);
          checked++;
          const what = await water(dir, day);
          if (what)
            wet.add(
              `${a.model} of ${g.home}`,
              what,
              `day ${day}, ${s} s: ${a.model} of ${g.home} (${a.clip}) in the ${what} at ${where(dir)}`,
            );
        }
    expect(wet.lines()).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  }, 600_000);
});
