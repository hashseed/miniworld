// The places wild animals keep clear of, on the built data (wildlife.md section 4; issue 228:
// reindeer stood in the painted wall of Lascaux, which no keep-out covered). Skipped when
// nothing has been built.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAGE_CLEARING_M } from './scene/hunt.ts';

const DATA = join(import.meta.dirname, '../../public/data');
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
});
