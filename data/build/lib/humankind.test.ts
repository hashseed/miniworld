import { createHash } from 'node:crypto';
import { msAtDay } from '../../../app/src/time/rate.ts';
import { treeScene } from '../../../app/src/world/treeScene.ts';
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
  });

  it('grows and spreads over the continent', () => {
    const camps = new Set(standing(settings.endDay - 1).map((l) => l.camp));
    // Low density packs camps at 600 km on a 2500 km disk: well over ten fit.
    expect(camps.size).toBeGreaterThan(10);
    expect(tree.figures.length).toBeGreaterThan(100);
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
    // The continent shrinks to 1500 km after 5000 years, as if the sea rose.
    const shrinking: Habitat = {
      habitable: (lat, lon, day) =>
        distanceKm(0, 0, lat, lon) <= (day < settings.startDay + years(5_000) ? RADIUS_KM : 1_500),
      score: habitat.score,
    };
    const t = buildTree(settings, shrinking);
    expect(checkTree(t, settings, shrinking)).toEqual([]);
    const after = settings.startDay + years(5_000);
    for (const l of t.lodgings)
      if (l.gone === NEVER || l.gone > after)
        expect(distanceKm(0, 0, l.lat / 1e6, l.lon / 1e6)).toBeLessThanOrEqual(
          l.built >= after ? 1_500 : Infinity,
        );
    expect(t.moments.some((m) => m.kind === 'camp-moved-away')).toBe(true);
  });
});

describe('the canonical tree', () => {
  it('keeps its hash, so any change to the rules is seen', () => {
    const hash = createHash('sha256').update(JSON.stringify(tree)).digest('hex').slice(0, 16);
    expect(hash).toBe('7ee1b529804fcdcc');
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
