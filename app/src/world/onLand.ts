// The deterministic paths of people and animals never lead onto water
// (humankind.md section 4, wildlife.md section 4): every figure of the tree
// of humankind and every walking animal stands on land, never in the sea or a
// lake, at the date it is shown, checked with the planet query on the built
// data. Like the golden tests it runs on the data in app/public/data
// (`npm run golden`) and is skipped when nothing has been built.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Manifest, StartupIndex } from '../content/types.ts';
import { dirToLatLon, latLonToDir, type Vec3 } from '../geo/cube.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import { decodeLensGrids, LENS_STRENGTH, sampleScalar, widthFactors } from '../geo/lens.ts';
import { planetAt } from '../planet/state.ts';
import { astronomicalYear, dayOfYearStart } from '../time/calendar.ts';
import { msAtDay } from '../time/rate.ts';
import { openWaterLookup } from './onLandScenes.ts';
import { LAYOUT_KM_PER_M } from './treeScene.ts';
import { WILD_GROUPS, decodeWildMask, flies, keepOutsOf, swims, wildlifeAt } from './wildlife.ts';
import { VILLAGE_KEEP_OUT_KM } from './scene/camp.ts';
import { NEVER } from './tree.ts';
import { buildAnimal, type AnimalId } from '../../../assets/src/animals.ts';
import { drawnSizeM, KM_PER_M } from '../wildlife/wildlifeLayer.ts';

const DATA = join(import.meta.dirname, '../../public/data');
const built = existsSync(join(DATA, 'manifest.json'));

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
    () => {
      const manifest = built
        ? (JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8')) as Manifest)
        : undefined!;
      const treeFiles = built ? (manifest.tree?.files ?? []).filter((f) => f !== null) : [];

      it.skipIf(shards === 0 || treeFiles.length === 0)(
        'keeps every figure of the tree of humankind on land',
        async () => {
          const files = manifest.tree?.files ?? [];
          const mine = [...files.entries()].filter(
            (e): e is [number, string] => !!e[1] && e[0] % shards === shard,
          );
          const { wetLines, checked } = await new Promise<{
            wetLines: string[];
            checked: number;
          }>((done, fail) => {
            let settled = false;
            const worker = new Worker(new URL('./onLandScenes.ts', import.meta.url), {
              workerData: {
                onLandWorker: true,
                dir: DATA,
                files: mine,
                start: manifest.timelineStartDay,
              },
            });
            worker.once('message', (res) => {
              settled = true;
              done(res);
            });
            worker.once('error', (err) => {
              settled = true;
              fail(err);
            });
            worker.once('exit', (code) => {
              if (!settled && code !== 0) {
                settled = true;
                fail(new Error(`onLandScenes worker exited with ${code}`));
              }
            });
          });
          expect(wetLines).toEqual([]);
          expect(checked).toBeGreaterThan(0);
        },
        600_000,
      );

      it.skipIf(shards !== 0)(
        'keeps every walking animal on land',
        () => {
          const index = JSON.parse(
            readFileSync(join(DATA, manifest.index.en), 'utf8'),
          ) as StartupIndex;
          const lookup = openWaterLookup(DATA, manifest);
          const grids = decodeLensGrids(
            new Uint8Array(readFileSync(join(DATA, manifest.lens.file))),
          );
          const width = widthFactors(grids.forward);
          const lensWidth = (lat: number, lon: number) =>
            1 + (sampleScalar(width, latLonToDir(lat, lon)) - 1) * LENS_STRENGTH;

          /** One body length at drawn size with the lens off, as the wildlife layer reckons it. */
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

          const masks = index.wildlife.map((hex) => (hex ? decodeWildMask(hex) : undefined));
          const seen = new Map<string, { line: string; n: number }>();
          let checked = 0;
          const start = manifest.timelineStartDay;
          const widths = WILD_GROUPS.map((g) => lensWidth(g.lat, g.lon));
          const camps = (index.wildlifeCamps ?? []).map(([lat, lon, from, to, r]) => ({
            lat,
            lon,
            from: msAtDay(from, start) / 1000,
            to: to === NEVER ? Infinity : msAtDay(to, start) / 1000,
            km: r === undefined ? VILLAGE_KEEP_OUT_KM : r * LAYOUT_KM_PER_M,
          }));
          const keepOuts = WILD_GROUPS.map((g, i) =>
            keepOutsOf(
              g,
              camps.map((c) => ({ ...c, rKm: c.km / widths[i]! })),
              VILLAGE_KEEP_OUT_KM / widths[i]!,
            ),
          );
          const reach = (model: string, g: { lat: number; lon: number }) =>
            bodyKm(model) / lensWidth(g.lat, g.lon);
          const where = (d: Vec3) => {
            const { lat, lon } = dirToLatLon(d);
            return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
          };
          const checkAnimal = (
            a: ReturnType<typeof wildlifeAt>[number],
            day: number,
            s: number,
            seaLevel: number,
          ) => {
            const g = WILD_GROUPS[Number(a.key.split(':')[0])]!;
            if (flies(g) || swims(g) || a.grow <= 0) return;
            const r = reach(a.model, g);
            const d = offsetDir(
              a.lat,
              a.lon,
              a.eastKm + a.offset[0] * r,
              a.northKm + a.offset[1] * r,
            );
            checked++;
            const what = lookup.water(d, day, seaLevel);
            if (what) {
              const k = `${a.model} of ${g.home}|${what}`;
              const e = seen.get(k);
              if (e) e.n++;
              else
                seen.set(k, {
                  line: `day ${day}, ${s} s: ${a.model} of ${g.home} (${a.clip}) in the ${what} at ${where(d)}`,
                  n: 1,
                });
            }
          };
          const days = [...manifest.windows, manifest.cutoffDay];
          for (const day of days) {
            const seaLevel = planetAt(index, day).seaLevel;
            for (let s = Math.floor(msAtDay(day, start) / 1000), end = s + 60; s < end; s += 5)
              for (const a of wildlifeAt(day, s, WILD_GROUPS, masks, reach, keepOuts))
                checkAnimal(a, day, s, seaLevel);
          }
          const neolithicTarget = dayOfYearStart(astronomicalYear(5000, 'BCE'));
          const neolithicDay = manifest.windows.reduce((a, b) =>
            Math.abs(b - neolithicTarget) < Math.abs(a - neolithicTarget) ? b : a,
          );
          const sweepDays = [
            ...new Set([
              manifest.windows[0]!,
              manifest.windows[Math.floor(manifest.windows.length / 2)]!,
              neolithicDay,
              manifest.cutoffDay,
            ]),
          ];
          for (const day of sweepDays) {
            const seaLevel = planetAt(index, day).seaLevel;
            for (let s = 0; s < 3600; s += 15)
              for (const a of wildlifeAt(day, s, WILD_GROUPS, masks, reach, keepOuts))
                checkAnimal(a, day, s, seaLevel);
          }
          expect([...seen.values()].map((e) => `${e.line} (${e.n} times)`)).toEqual([]);
          expect(checked).toBeGreaterThan(0);
        },
        600_000,
      );
    },
  );
}
