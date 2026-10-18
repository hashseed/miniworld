// Golden tests (spec milestone 1, section 13): sea level, sea or land, ice and
// the drawn ground at seven places and seven dates, computed by the planet
// query from exactly the files they need in the built data. The results are
// stored per dataset beside this file and must match exactly; after an
// intended change, `npm run golden -- -u` stores the new ones for review.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeClimateSlice, decodeTerrainTile, type TerrainTile } from '../content/formats.ts';
import { ContentLoader } from '../content/loader.ts';
import { ancestorAt, dirToFaceUv, latLonToDir, tileAt, type Vec3 } from '../geo/cube.ts';
import { astronomicalYear, dayFromDate } from '../time/calendar.ts';
import { PlanetQuery, type IcePair } from './query.ts';
import { iceSlicePair, planetAt } from './state.ts';

const DATA = join(import.meta.dirname, '../../public/data');
const built = existsSync(join(DATA, 'manifest.json'));

const PLACES: Record<string, [lat: number, lon: number]> = {
  'Bering Strait': [65.75, -168.75],
  'North Sea': [54.5, 3],
  'Java Sea': [-5, 110],
  'Torres Strait': [-10, 142.5],
  'Hudson Bay': [60, -86],
  Baltic: [58.5, 20],
  'Caspian Sea': [42, 50.5],
};
const BCE = [70_000, 50_000, 20_000, 12_000, 8000, 6200, 3000];

/** Reads the built data from disk as the browser would fetch it. */
const fetchFile = async (input: RequestInfo | URL): Promise<Response> => {
  try {
    return new Response(await readFile(String(input)));
  } catch {
    return new Response('missing', { status: 404 });
  }
};

/** Waits for a lookup that is undefined while its part index loads. */
async function lookup(loader: ContentLoader, dir: Vec3, level: number): Promise<string> {
  const { face, u, v } = dirToFaceUv(dir);
  const key = ancestorAt(tileAt(face, u, v, loader.manifest.layers.terrain!.maxLevel), level);
  for (;;) {
    const file = loader.lookup('terrain', key, 'all');
    if (file !== undefined) return file;
    await new Promise((r) => setTimeout(r, 1));
  }
}

const round = (x: number) => Math.round(x * 100) / 100;

describe.skipIf(!built)('golden places', () => {
  it('match the stored results', async () => {
    const loader = new ContentLoader(`${DATA}/`, { fetch: fetchFile });
    const manifest = await loader.init();
    const index = await loader.index('en');
    const dates: [string, number][] = [
      ...BCE.map((y): [string, number] => [
        `${y} BCE`,
        dayFromDate(astronomicalYear(y, 'BCE'), 1, 1),
      ]),
      ['today', manifest.cutoffDay],
    ];
    const maxLevel = manifest.layers.terrain!.maxLevel;

    const tiles = new Map<string, TerrainTile | 'deep'>();
    for (const [name, [lat, lon]] of Object.entries(PLACES)) {
      const file = await lookup(loader, latLonToDir(lat, lon), maxLevel);
      if (file === 'deep' || file === 'none') tiles.set(name, 'deep');
      else tiles.set(name, decodeTerrainTile((await loader.fetchChunk(file, 0))!));
    }
    const slices = await Promise.all(
      manifest.climate.files.map(async (f) => decodeClimateSlice((await loader.fetchChunk(f, 0))!)),
    );
    const sliceAt = new Map(slices.map((s) => [s.day, s]));

    const results: Record<string, unknown> = {};
    for (const [label, day] of dates) {
      const { a, b, t } = iceSlicePair(manifest.climate.days, day);
      const pair: IcePair = { a: sliceAt.get(a)!, b: sliceAt.get(b)!, t };
      const planet = planetAt(index, day);
      const row: Record<string, unknown> = {
        seaLevel: round(planet.seaLevel),
        glacialIndex: round(planet.glacialIndex),
      };
      for (const [name, [lat, lon]] of Object.entries(PLACES)) {
        const tile = tiles.get(name)!;
        const q = new PlanetQuery({ dataTileAt: () => tile }, { icePairAt: () => pair });
        const dir = latLonToDir(lat, lon);
        const iceKm = q.iceKmAt(dir, day);
        row[name] = {
          sea: q.isSea(dir, planet.seaLevel),
          ice: iceKm > 0,
          iceKm: round(iceKm),
          groundM: round(q.surfaceM(dir, day, planet.seaLevel)),
        };
      }
      results[label] = row;
    }
    await expect(`${JSON.stringify(results, null, 2)}\n`).toMatchFileSnapshot(
      `golden/${manifest.fixture ? 'fixture' : 'full'}.json`,
    );

    // The expected answers need the real sea floor, which the fixture lacks.
    if (manifest.fixture) return;
    const at = (date: string, place: string) =>
      (results[date] as Record<string, { sea: boolean; ice: boolean }>)[place]!;
    expect(at('12000 BCE', 'North Sea').sea).toBe(false);
    expect(at('3000 BCE', 'North Sea').sea).toBe(true);
    expect(at('20000 BCE', 'Bering Strait').sea).toBe(false);
    expect(at('today', 'Bering Strait').sea).toBe(true);
    for (const [date] of dates) expect(at(date, 'Caspian Sea').sea).toBe(false);
    expect(at('20000 BCE', 'Hudson Bay').ice).toBe(true);
  });
});
