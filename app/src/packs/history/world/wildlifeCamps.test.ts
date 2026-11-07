// The places wild animals keep clear of, on the built data (wildlife.md section 4; issue 228:
// reindeer stood in the painted wall of Lascaux, which no keep-out covered). Skipped when
// nothing has been built.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAGE_CLEARING_M } from './scene/hunt.ts';
import { VILLAGE_KEEP_OUT_KM } from './scene/camp.ts';
import { LAYOUT_KM_PER_M } from './scene/units.ts';
import { WILD_GROUPS, decodeWildMask, flies, keepOutsOf, swims, wildlifeAt } from './wildlife.ts';
import {
  decodeLensGrids,
  LENS_STRENGTH,
  sampleScalar,
  widthFactors,
} from '../../../engine/geo/lens.ts';
import { latLonToDir } from '../../../engine/geo/cube.ts';
import { msAtDay } from '../../../engine/time/rate.ts';
import { NEVER } from './tree.ts';

const DATA = join(import.meta.dirname, '../../../../public/data');
const built = existsSync(join(DATA, 'manifest.json'));

describe.skipIf(!built)('places wild animals keep clear of', () => {
  const file = built ? readdirSync(DATA).find((f) => /^index-en\..+\.json$/.test(f)) : undefined;
  const places: number[][] = file
    ? (JSON.parse(readFileSync(join(DATA, file), 'utf8')).wildlifeCamps ?? [])
    : [];

  it('give every place its own radius: a band, a village, a scene', () => {
    expect(places.length).toBeGreaterThan(0);
    for (const p of places) expect(p).toHaveLength(5);
    const radii = new Set(places.map((p) => p[4]));
    expect(radii.has(20)).toBe(true);
    expect(radii.has(50)).toBe(true);
  });

  it('keep the painted wall of Lascaux clear on the day of issue 228', () => {
    const day = -6195340;
    const walls = places.filter(
      ([lat, lon, from, to, r]) =>
        r === STAGE_CLEARING_M['cave-painting'] &&
        Math.abs(lat! / 1e6 - 46) < 4 &&
        Math.abs(lon! / 1e6 - 1) < 4 &&
        from! <= day &&
        (to === -1 || to! > day),
    );
    expect(walls).toHaveLength(1);
  });

  it('never fling an animal near Lascaux across a camp on the day of issue 228', () => {
    const manifest = JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8'));
    const index = JSON.parse(readFileSync(join(DATA, file!), 'utf8'));
    const grids = decodeLensGrids(new Uint8Array(readFileSync(join(DATA, manifest.lens.file))));
    const width = widthFactors(grids.forward);
    const lensWidth = (lat: number, lon: number) =>
      1 + (sampleScalar(width, latLonToDir(lat, lon)) - 1) * LENS_STRENGTH;
    const start = manifest.timelineStartDay;
    const masks = index.wildlife.map((hex: string) => (hex ? decodeWildMask(hex) : undefined));
    const camps = places.map(([lat, lon, from, to, r]) => ({
      lat: lat!,
      lon: lon!,
      from: msAtDay(from!, start) / 1000,
      to: to === NEVER ? Infinity : msAtDay(to!, start) / 1000,
      km: r! * LAYOUT_KM_PER_M,
    }));
    const keepOuts = WILD_GROUPS.map((g) => {
      const w = lensWidth(g.lat, g.lon);
      return keepOutsOf(
        g,
        camps.map((c) => ({ ...c, rKm: c.km / w })),
        VILLAGE_KEEP_OUT_KM / w,
      );
    });
    const day = -6195340;
    const s0 = Math.floor(msAtDay(day, start) / 1000) - 300;
    const last = new Map<string, [number, number]>();
    let worst = 0;
    for (let s = s0; s < s0 + 600; s++)
      for (const a of wildlifeAt(day, s, WILD_GROUPS, masks, () => 30, keepOuts)) {
        const g = WILD_GROUPS[Number(a.key.split(':')[0])]!;
        // The herds round Lascaux, where the camps' circles cover most of their ground.
        if (flies(g) || swims(g) || Math.abs(g.lat - 45) > 8 || Math.abs(g.lon - 1) > 10) continue;
        const before = last.get(a.key);
        // Only while it is plainly there: a walk with no way round fades out and in instead.
        if (before && !Number.isNaN(before[0]) && a.grow > 0.5)
          worst = Math.max(worst, Math.hypot(a.eastKm - before[0], a.northKm - before[1]));
        last.set(a.key, a.grow > 0.5 ? [a.eastKm, a.northKm] : [NaN, NaN]);
      }
    // A fast walk covers about 100 km a second at this scale; the jumps were 400 and more.
    expect(worst).toBeLessThan(200);
  }, 120_000);
});
