// The deterministic paths of people and animals never lead onto water
// (humankind.md section 4, wildlife.md section 4): every figure of the tree
// of humankind and every walking animal stands on land, never in the sea or a
// lake, at the date it is shown, checked with the planet query on the built
// data. Like the golden tests it runs on the data in app/public/data
// (`npm run golden`) and is skipped when nothing has been built.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
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
import { LAYOUT_KM_PER_M } from './treeScene.ts';
import { WILD_GROUPS, decodeWildMask, flies, keepOutsOf, swims, wildlifeAt } from './wildlife.ts';
import { VILLAGE_KEEP_OUT_KM } from './scene/camp.ts';
import { NEVER } from './tree.ts';
import { buildAnimal, type AnimalId } from '../../../assets/src/animals.ts';
import { drawnSizeM, KM_PER_M } from '../wildlife/wildlifeLayer.ts';
import { decodeLensGrids, Lens, LENS_STRENGTH, sampleScalar, widthFactors } from '../geo/lens.ts';
import { placedTrue } from '../geo/placement.ts';

/** Fields of each figure sampled by onLandScenes.ts. */
const SAMPLE_FIELDS = 8;

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

/**
 * Registers the checks of one test file: every `shards`-th time window of the tree
 * (shard `shard`), or the animals when `shards` is 0. The checks are split over
 * several test files so that vitest runs them in parallel.
 */
export function pathsOnLand(shard: number, shards: number): void {
  describe.skipIf(!built)(
    shards ? `paths on land, tree part ${shard}` : 'paths on land, animals',
    async () => {
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
      // The ground under a point is a pure function of the point, and most figures stand on
      // the same spot from one moment to the next: kept per point, looked up once.
      const grounds = new Map<string, ReturnType<PlanetQuery['groundAt']>>();
      const ice = new PlanetQuery({ dataTileAt: () => undefined }, { icePairAt });
      async function water(dir: Vec3, day: number): Promise<string | undefined> {
        const key = `${dir[0]},${dir[1]},${dir[2]}`;
        let ground = grounds.get(key);
        if (!ground) {
          const tile = await tileOf(dir);
          ground = new PlanetQuery({ dataTileAt: () => tile }, { icePairAt }).groundAt(dir);
          if (grounds.size > 2_000_000) grounds.clear();
          grounds.set(key, ground);
        }
        const sea = isSea(ground, planetAt(index, day).seaLevel);
        const lake = ground.lake > LAKE_FIELD;
        if ((!sea && !lake) || ice.iceKmAt(dir, day) > 0) return undefined;
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

      // The history lens at its fixed strength (history-lens.md section 1).
      const grids = built
        ? decodeLensGrids(new Uint8Array(await readFile(join(DATA, manifest.lens.file))))
        : undefined;
      const width = grids ? widthFactors(grids.forward) : new Float32Array(0);
      const lens = grids ? new Lens(grids.forward, grids.inverse) : undefined;
      if (lens) lens.blend = LENS_STRENGTH;
      const lensWidth = (lat: number, lon: number) =>
        1 + (sampleScalar(width, latLonToDir(lat, lon)) - 1) * LENS_STRENGTH;

      // The fixture map has no tree of humankind (humankind.md section 5).
      const treeFiles = built ? (manifest.tree?.files ?? []).filter((f) => f !== null) : [];

      it.skipIf(shards === 0 || treeFiles.length === 0)(
        'keeps every figure of the tree of humankind on land',
        async () => {
          const files = manifest.tree?.files ?? [];
          const wet = report();
          let checked = 0;
          const start = manifest.timelineStartDay;
          // The scenes, from a worker thread (onLandScenes.ts).
          const mine = [...files.entries()].filter(
            (e): e is [number, string] => !!e[1] && e[0] % shards === shard,
          );
          const { samples, clips } = await new Promise<{ samples: Float64Array; clips: string[] }>(
            (done, fail) => {
              const worker = new Worker(new URL('./onLandScenes.ts', import.meta.url), {
                workerData: { dir: DATA, files: mine, start },
              });
              worker.once('message', done);
              worker.once('error', fail);
            },
          );
          // A spot's place is a pure function of the camp's place and the spot, kept per spot.
          const places = new Map<string, Vec3>();
          const placed = (lat: number, lon: number, x: number, z: number): Vec3 => {
            const key = `${lat},${lon},${x},${z}`;
            let dir = places.get(key);
            if (!dir) {
              // Where the tree layer draws it: its spot laid out on the drawn globe, taken back
              // through the inverse lens (history-lens.md section 4.2).
              dir = placedTrue(
                lens!,
                latLonToDir(lat, lon),
                x * LAYOUT_KM_PER_M,
                z * LAYOUT_KM_PER_M,
              );
              if (places.size > 2_000_000) places.clear();
              places.set(key, dir);
            }
            return dir;
          };
          for (let k = 0; k * SAMPLE_FIELDS < samples.length; k++) {
            const o = k * SAMPLE_FIELDS;
            const [w, ms, id, paddle] = [
              samples[o]!,
              samples[o + 1]!,
              samples[o + 2]!,
              samples[o + 3]!,
            ];
            const day = dayAtMs(ms, start);
            const dir = placed(samples[o + 4]!, samples[o + 5]!, samples[o + 6]!, samples[o + 7]!);
            // Bands crossing the sea paddle canoes, and a canoe stays on the water
            // (peopling.md section 6; Yang, 2026-10-20: "they must not be on boats on land").
            if (paddle) {
              if (!(await water(dir, day)))
                wet.add(
                  `paddler ${id}`,
                  'land',
                  `window ${w}, ${ms} ms: figure ${id} paddles over land at ${where(dir)}`,
                );
              continue;
            }
            checked++;
            const what = await water(dir, day);
            if (what)
              wet.add(
                `figure ${id}`,
                what,
                `window ${w}, ${ms} ms: figure ${id} (${clips[k]}) in the ${what} at ${where(dir)}`,
              );
          }
          expect(wet.lines()).toEqual([]);
          expect(checked).toBeGreaterThan(0);
        },
        600_000,
      );

      /**
       * One body length at drawn size with the lens off, as the wildlife layer reckons it
       * (wildlife.md section 1): its km a metre, the size clamped to 1.8 to 4 metres.
       */
      const lengths = new Map<string, number>();
      const bodyKm = (model: string) => {
        if (!lengths.has(model)) {
          const m = buildAnimal(model as AnimalId);
          m.object.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(m.object);
          const size = Math.max(box.max.y - box.min.y, (box.max.z - box.min.z) / 2);
          const drawn = drawnSizeM(model, size);
          lengths.set(model, ((box.max.z - box.min.z) * KM_PER_M * drawn) / size);
        }
        return lengths.get(model)!;
      };

      it.skipIf(shards !== 0)(
        'keeps every walking animal on land',
        async () => {
          const masks = index.wildlife.map((hex) => (hex ? decodeWildMask(hex) : undefined));
          const wet = report();
          let checked = 0;
          // As the wildlife layer runs them: each animal's reach and the camps' keep-outs over
          // the lens's width at the group's home, the keep-outs in clock seconds.
          const start = manifest.timelineStartDay;
          const widths = WILD_GROUPS.map((g) => lensWidth(g.lat, g.lon));
          const camps = (index.wildlifeCamps ?? []).map(([lat, lon, from, to]) => ({
            lat,
            lon,
            from: msAtDay(from, start) / 1000,
            to: to === NEVER ? Infinity : msAtDay(to, start) / 1000,
          }));
          const keepOuts = WILD_GROUPS.map((g, i) =>
            keepOutsOf(g, camps, VILLAGE_KEEP_OUT_KM / widths[i]!),
          );
          const reach = (model: string, g: { lat: number; lon: number }) =>
            bodyKm(model) / lensWidth(g.lat, g.lon);
          // Every time window and today, at the clock's own time there (keep-outs and roaming
          // hang on it); a minute of the life clock at each, every 5 seconds.
          const days = [...manifest.windows, manifest.cutoffDay];
          for (const day of days)
            for (let s = Math.floor(msAtDay(day, start) / 1000), end = s + 60; s < end; s += 5)
              for (const a of wildlifeAt(day, s, WILD_GROUPS, masks, reach, keepOuts)) {
                const g = WILD_GROUPS[Number(a.key.split(':')[0])]!;
                if (flies(g) || swims(g) || a.grow <= 0) continue;
                // Where the layer draws it: its group's spot plus its place in the group.
                const r = reach(a.model, g);
                const dir = offsetDir(
                  a.lat,
                  a.lon,
                  a.eastKm + a.offset[0] * r,
                  a.northKm + a.offset[1] * r,
                );
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
        },
        600_000,
      );
    },
  );
}
