import { createHash } from 'node:crypto';
import { msAtDay } from '../../../app/src/time/rate.ts';
import { LAYOUT_KM_PER_M, treeScene } from '../../../app/src/world/treeScene.ts';
import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, TIMELINE_START } from '../../../app/src/time/calendar.ts';
import { NEVER, aliveOn, homeOn, lineage } from '../../../app/src/world/tree.ts';
import {
  DENSITIES,
  LODGING_CAPACITY,
  MAX_LODGINGS,
  buildTree,
  checkTree,
  treeChunks,
  distanceKm,
  type Habitat,
  type TreeSettings,
} from './humankind.ts';

const years = (y: number) => Math.round(y * DAYS_PER_YEAR);

// A round continent 2500 km across the equator, with the founder at its centre.
const RADIUS_KM = 2500;
const onLand = (lat: number, lon: number) => distanceKm(0, 0, lat, lon) <= RADIUS_KM;
const habitat: Habitat = {
  habitable: onLand,
  score: (lat, lon) => 1 - distanceKm(0, 0, lat, lon) / RADIUS_KM,
};
const settings: TreeSettings = {
  founder: { lat: 0, lon: 0 },
  lodgingKind: 'lodging-test',
  startDay: TIMELINE_START,
  endDay: TIMELINE_START + years(10_000),
  prologueEndDay: TIMELINE_START + years(6_000),
  frontKmPerYear: 0.4,
  density: (lat, lon) => (onLand(lat, lon) ? 'low' : undefined),
};

const tree = buildTree(settings, habitat);
const standing = (day: number) =>
  tree.lodgings.filter((l) => l.built <= day && (l.gone === NEVER || day < l.gone));

describe('the tree of humankind', () => {
  it('starts with the first person alone in her lodging', () => {
    const first = tree.figures[0]!;
    expect(first.parent).toBe(NEVER);
    expect(first.born).toBe(settings.startDay);
    expect(tree.lodgings[0]!.builder).toBe(0);
    expect(tree.figures.filter((f) => f.born === settings.startDay)).toHaveLength(1);
    expect(tree.moments[0]!.kind).toBe('root');
  });

  it('passes its own checks', () => {
    expect(checkTree(tree, settings, habitat)).toEqual([]);
  });

  it('is the same tree every time', () => {
    expect(buildTree(settings, habitat)).toEqual(tree);
  }, 30_000);

  it('grows and spreads over the continent', () => {
    const camps = new Set(standing(settings.endDay - 1).map((l) => l.camp));
    // Low density packs camps at 600 km on a 2500 km disk: well over ten fit.
    expect(camps.size).toBeGreaterThan(10);
    // Budding every three minutes of watching (section 4.3).
    expect(tree.figures.length).toBeGreaterThan(40);
    expect(tree.moments.some((m) => m.kind === 'first-born')).toBe(true);
  });

  it('keeps camps apart and lodgings within their limits', () => {
    for (const day of [years(2_000), years(5_000), years(9_999)].map(
      (d) => settings.startDay + d,
    )) {
      const byCamp = new Map<number, { lat: number; lon: number; n: number }>();
      for (const l of standing(day)) {
        const c = byCamp.get(l.camp) ?? { lat: l.lat / 1e6, lon: l.lon / 1e6, n: 0 };
        c.n++;
        byCamp.set(l.camp, c);
      }
      const list = [...byCamp.values()];
      for (const c of list) expect(c.n).toBeLessThanOrEqual(MAX_LODGINGS);
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++)
          expect(
            distanceKm(list[i]!.lat, list[i]!.lon, list[j]!.lat, list[j]!.lon),
          ).toBeGreaterThanOrEqual(DENSITIES.low.spacingKm * 0.999);
      const people = new Map<number, number>();
      for (const f of tree.figures) {
        if (!aliveOn(f, day)) continue;
        const h = homeOn(f, day);
        people.set(h, (people.get(h) ?? 0) + 1);
      }
      for (const n of people.values()) expect(n).toBeLessThanOrEqual(LODGING_CAPACITY);
    }
  });

  it('only lets figures live in standing lodgings', () => {
    for (const f of tree.figures)
      for (const [day, l] of f.homes) {
        const lodging = tree.lodgings[l]!;
        expect(lodging.built).toBeLessThanOrEqual(day);
        expect(lodging.gone === NEVER || day < lodging.gone).toBe(true);
      }
  });

  it('holds camps behind the front during the prologue', () => {
    for (const l of tree.lodgings) {
      if (l.built >= settings.prologueEndDay) continue;
      const km = distanceKm(0, 0, l.lat / 1e6, l.lon / 1e6);
      expect(km).toBeLessThanOrEqual(
        (settings.frontKmPerYear * (l.built - settings.startDay)) / DAYS_PER_YEAR + 1,
      );
    }
  });

  it('traces every figure back to the first person', () => {
    const last = tree.figures.at(-1)!;
    const line = lineage(tree, last.id);
    expect(line[0]).toBe(last.id);
    expect(line.at(-1)).toBe(0);
    expect(line).toHaveLength(last.depth + 1);
  });

  it('moves camps away from land that is lost', () => {
    // The continent shrinks to 800 km after 5000 years, as if the sea rose.
    const shrinking: Habitat = {
      habitable: (lat, lon, day) =>
        distanceKm(0, 0, lat, lon) <= (day < settings.startDay + years(5_000) ? RADIUS_KM : 800),
      score: habitat.score,
    };
    const t = buildTree(settings, shrinking);
    expect(checkTree(t, settings, shrinking)).toEqual([]);
    const after = settings.startDay + years(5_000);
    for (const l of t.lodgings)
      if (l.gone === NEVER || l.gone > after)
        expect(distanceKm(0, 0, l.lat / 1e6, l.lon / 1e6)).toBeLessThanOrEqual(
          l.built >= after ? 800 : Infinity,
        );
    expect(t.moments.some((m) => m.kind === 'camp-moved-away')).toBe(true);
  });
});

describe('the camp scene', () => {
  it('never puts two standing figures or two lodgings on top of each other', () => {
    const whole = {
      fromDay: settings.startDay,
      toDay: settings.endDay,
      figures: tree.figures,
      lodgings: tree.lodgings,
    };
    // Figures stand at least 2 layout metres apart, lodgings (about 10 across) 12.
    const apart = <T extends { lat: number; lon: number; x: number; z: number }>(
      list: T[],
      min: number,
    ) => {
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const [a, b] = [list[i]!, list[j]!];
          // Inside a hut, out of sight, people may share it.
          if ('hidden' in a && 'hidden' in b && a.hidden && b.hidden) continue;
          if (a.lat !== b.lat || a.lon !== b.lon) continue;
          expect(
            (a.x - b.x) ** 2 + (a.z - b.z) ** 2,
            `${JSON.stringify(a)} ${JSON.stringify(b)}`,
          ).toBeGreaterThanOrEqual(min * min);
        }
    };
    const end = msAtDay(settings.endDay, settings.startDay);
    // Every so often, and through the building of the first lodgings.
    const times: number[] = [];
    for (let ms = 0; ms < end; ms += 99_991) times.push(ms);
    for (const l of tree.lodgings.slice(0, 80))
      for (let k = 0; k < 12; k++) times.push(msAtDay(l.built, settings.startDay) + k * 1_500);
    for (const ms of times) {
      const s = treeScene(whole, ms, settings.startDay);
      apart(
        s.figures.filter((f) => f.clip === 'idle' || f.clip === 'work' || f.clip === 'knap'),
        2,
      );
      apart(s.lodgings, 12);
    }
  }, 30_000);
});

/** Every lodging and figure of a tree's scene that stands where `ok` says it may not. */
function strays(t: typeof tree, ok: (lat: number, lon: number) => boolean) {
  const whole = {
    fromDay: settings.startDay,
    toDay: settings.endDay,
    figures: t.figures,
    lodgings: t.lodgings,
  };
  const end = msAtDay(settings.endDay, settings.startDay);
  const km = LAYOUT_KM_PER_M;
  const okAt = (p: { lat: number; lon: number; x: number; z: number }) =>
    ok(
      p.lat + (p.z * km) / 111.195,
      p.lon + (p.x * km) / (111.195 * Math.cos((p.lat * Math.PI) / 180)),
    );
  const where: string[] = [];
  let seen = 0;
  // About 600 moments over the tree's span, an odd step so they do not fall on turns.
  for (let ms = 0; ms < end; ms += Math.floor(end / 600) | 1) {
    const s = treeScene(whole, ms, settings.startDay);
    for (const l of s.lodgings) {
      seen++;
      if (!okAt(l)) where.push(`lodging ${l.id} ${ms}`);
    }
    for (const p of s.prey) {
      seen++;
      if (!okAt(p)) where.push(`prey ${p.id} ${p.clip} ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
    for (const f of s.figures) {
      seen++;
      // Bands on the move ford rivers; at camp everyone keeps dry.
      if (f.clip !== 'walk' && !okAt(f))
        where.push(
          `figure ${f.id} ${f.clip} ${f.x.toFixed(1)},${f.z.toFixed(1)} at ${f.lat.toFixed(2)},${f.lon.toFixed(2)}`,
        );
    }
  }
  return { where, seen };
}

describe('camp life (section 8.1)', () => {
  it('shows every activity: fire-lighting, huts, hides, nuts, spears, cooking, catch and dancing', () => {
    const whole = {
      fromDay: settings.startDay,
      toDay: settings.endDay,
      figures: tree.figures,
      lodgings: tree.lodgings,
    };
    const end = msAtDay(settings.endDay, settings.startDay);
    const clips = new Set<string>();
    const props = new Set<string>();
    let hidden = 0;
    let sparks = 0;
    let catching = 0;
    for (let ms = 0; ms < end; ms += 211) {
      const s = treeScene(whole, ms, settings.startDay);
      for (const f of s.figures) {
        clips.add(f.clip);
        if (f.hidden) hidden++;
      }
      for (const q of s.props) props.add(q.kind);
      sparks += s.sparks.length;
      if (s.hearths.some((h) => h.lit > 0 && h.lit < 1)) catching++;
    }
    for (const clip of ['strike', 'crouch', 'scrape', 'crack', 'knap', 'dance', 'run', 'carry'])
      expect(clips, clip).toContain(clip);
    expect(props).toEqual(new Set(['prop-drying-rack', 'prop-spit']));
    expect(hidden).toBeGreaterThan(0);
    expect(sparks).toBeGreaterThan(0);
    expect(catching).toBeGreaterThan(0);
  }, 120_000);
});

describe('camps by the sea', () => {
  it('keep their lodgings and outings on land', () => {
    const { where, seen } = strays(tree, onLand);
    expect(seen).toBeGreaterThan(1000);
    expect(where).toEqual([]);
  }, 30_000);
});

describe('camps by a river', () => {
  it('keep their lodgings and outings out of it', () => {
    // A river about 60 km wide runs north to south across the continent, east of the founder.
    const inRiver = (_lat: number, lon: number) => lon > 4 && lon < 4.55;
    const t = buildTree(settings, { ...habitat, dry: (lat, lon) => !inRiver(lat, lon) });
    expect(checkTree(t, settings, habitat)).toEqual([]);
    // People still settle on both banks.
    expect(t.lodgings.some((l) => l.lon / 1e6 > 6)).toBe(true);
    const { where, seen } = strays(t, (lat, lon) => onLand(lat, lon) && !inRiver(lat, lon));
    expect(seen).toBeGreaterThan(1000);
    expect(where).toEqual([]);
  }, 60_000);
});

describe('the canonical tree', () => {
  it('keeps its hash, so any change to the rules is seen', () => {
    const hash = createHash('sha256').update(JSON.stringify(tree)).digest('hex').slice(0, 16);
    expect(hash).toBe('a0db46d733546301');
  });
});

describe('tree chunks', () => {
  it('show the same scene as the whole tree, window by window', () => {
    const windows = [0, 1_000, 3_000, 7_000, 12_000].map((y) => settings.startDay + years(y));
    const chunks = treeChunks(tree, windows, settings.endDay);
    expect(chunks.at(-1)).toBeUndefined();
    const whole = {
      fromDay: settings.startDay,
      toDay: settings.endDay,
      figures: tree.figures,
      lodgings: tree.lodgings,
    };
    for (let w = 0; w < 4; w++) {
      const chunk = chunks[w]!;
      for (let k = 0; k < 5; k++) {
        const day = chunk.fromDay + Math.floor(((chunk.toDay - chunk.fromDay) * k) / 5);
        const ms = msAtDay(day, settings.startDay) + 1000;
        expect(treeScene(chunk, ms, settings.startDay)).toEqual(
          treeScene(whole, ms, settings.startDay),
        );
      }
    }
  });
});
