// Peopling the world (spec peopling.md): the arrival map, a band following a route over
// the sea by canoe, the limits of a way of life, the change of clothes in the hut, and
// the Neolithic thresholds, on a world of two round continents.

import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, TIMELINE_START } from '../../../app/src/time/calendar.ts';
import { msAtDay } from '../../../app/src/time/rate.ts';
import { NEVER } from '../../../app/src/world/tree.ts';
import { treeScene } from '../../../app/src/world/treeScene.ts';
import { arrivalMap, CLOSED, dayOfBce, type ArrivalInputs, type Arrivals } from './arrivals.ts';
import { buildTree, checkTree, distanceKm, type Habitat, type TreeSettings } from './humankind.ts';
import { buildSites } from './sites.ts';

const years = (y: number) => Math.round(y * DAYS_PER_YEAR);
const bce = dayOfBce;

// West: 2500 km round the founder at 0, 0. East: 2000 km round 0, 45, 500 km of sea away.
const west = (lat: number, lon: number) => distanceKm(0, 0, lat, lon) <= 2500;
const east = (lat: number, lon: number) => distanceKm(0, 45, lat, lon) <= 2000;
const land = (lat: number, lon: number) => west(lat, lon) || east(lat, lon);

const arrivals: Arrivals = {
  points: [
    { id: 'shore', bce: 66_000, lat: 0, lon: 28, en: 'Shore', de: 'Küste', source: 'test' },
    { id: 'inland', bce: 64_000, lat: 0, lon: 45, en: 'Inland', de: 'Inland', source: 'test' },
  ],
  routes: [{ id: 'east', en: 'East', de: 'Osten', from: 'africa', points: ['shore', 'inland'] }],
};
const crossing = {
  id: 'strait',
  en: 'Strait',
  de: 'Meerenge',
  bce: 66_000,
  widthKm: 500,
  way: [
    [0, 21.5],
    [0, 28],
  ] as [number, number][],
  source: 'test',
};
const inputs: ArrivalInputs = {
  arrivals,
  crossings: [crossing],
  land: (lat, lon) => land(lat, lon),
  lowDay: TIMELINE_START,
  areasAt: (lat, lon) => (west(lat, lon) ? [0] : east(lat, lon) ? [1] : []),
  africa: { area: 0, lat: 0, lon: 0, startDay: TIMELINE_START, kmPerYear: 0.8 },
};
const map = arrivalMap(inputs);

// The east is colder in its north: no camps north of 10° there (peopling.md section 5.2).
const culture = (lat: number, lon: number) =>
  west(lat, lon) ? 'african-stone-age' : east(lat, lon) ? 'coastal-asia-hunter' : undefined;
const settings: TreeSettings = {
  founder: { lat: 0, lon: 0 },
  lodgingKind: 'shelter-grass-hut',
  sites: buildSites({
    campFlood: (lat, lon) => (land(lat, lon) ? Infinity : -Infinity),
    walkFlood: (lat, lon) => (land(lat, lon) ? Infinity : -Infinity),
    lowestSea: 0,
    highestSea: 0,
    crossings: [
      {
        id: crossing.id,
        day: dayOfBce(crossing.bce),
        way: crossing.way.map(([lat, lon]) => ({ lat, lon })),
      },
    ],
    fromLat: -30,
    toLat: 30,
  }),
  seaLevel: () => 0,
  walkFlood: (lat, lon) => (land(lat, lon) ? Infinity : -Infinity),
  startDay: TIMELINE_START,
  endDay: bce(60_000),
  prologueEndDay: bce(68_000),
  frontKmPerYear: 0.8,
  density: (lat, lon) => (culture(lat, lon) ? 'low' : undefined),
  culture,
  livable: (lat, lon) => !east(lat, lon) || lat < 10,
  arrival: map.dayAt,
  lodgingOf: (c) => (c === 'coastal-asia-hunter' ? 'shelter-lean-to' : 'shelter-grass-hut'),
  voyages: map.legs,
  thresholds: [{ id: 'farming', day: bce(61_000), lat: 0, lon: 45 }],
};
const habitat: Habitat = {
  habitable: land,
  score: () => 0.5,
};
const tree = buildTree(settings, habitat);
const eastern = tree.lodgings.filter((l) => east(l.lat / 1e6, l.lon / 1e6));

describe('the arrival map (peopling.md section 4)', () => {
  it('opens each point of a route on its day, across a listed crossing', () => {
    // Each point opens on its day, the cells beside it within a century of the slow pace.
    expect(map.dayAt(0, 28)).toBeLessThanOrEqual(bce(66_000) + years(100));
    expect(map.dayAt(0, 45)).toBeLessThanOrEqual(bce(64_000) + years(100));
    // Land beyond the route opens later, from the route, at the slow pace.
    expect(map.dayAt(0, 60)).toBeGreaterThan(bce(64_000));
    expect(map.dayAt(0, 60)).toBeLessThan(CLOSED);
  });

  it('fails without a listed crossing over the sea', () => {
    expect(() => arrivalMap({ ...inputs, crossings: [] })).toThrow(/no way over land/);
  });
});

describe('a band following a route (peopling.md sections 4 and 6)', () => {
  it('crosses the sea by canoe and founds a camp near the point', () => {
    expect(checkTree(tree, settings, habitat)).toEqual([]);
    const first = eastern.find((l) => l.voyage)!;
    expect(first).toBeDefined();
    expect(first.voyage!.water.some((w) => w)).toBe(true);
    expect(first.built).toBeLessThan(bce(63_000));
    // Nobody camps in the east before its land has opened.
    for (const l of eastern)
      expect(l.built).toBeGreaterThanOrEqual(map.dayAt(l.lat / 1e6, l.lon / 1e6));
  });

  it('paddles canoes over the water, and walks on land', () => {
    const l = eastern.find((x) => x.voyage)!;
    const crew = tree.figures.filter((f) =>
      f.homes.some(([d, id]) => id === l.id && d === l.built),
    );
    const whole = {
      fromDay: settings.startDay,
      toDay: settings.endDay,
      figures: tree.figures,
      lodgings: tree.lodgings,
    };
    const from = msAtDay(l.built, settings.startDay);
    let paddled = 0;
    for (let ms = from; ms < from + 20_000; ms += 50) {
      const s = treeScene(whole, ms, settings.startDay);
      for (const f of s.figures) {
        if (!crew.some((c) => c.id === f.id)) continue;
        const wet = !land(f.lat, f.lon);
        if (f.clip === 'paddle') {
          paddled++;
          expect(s.props.some((p) => p.id === `canoe:${f.id}` && p.kind === 'prop-canoe')).toBe(
            true,
          );
        } else if (f.clip === 'walk') expect(wet).toBe(false);
      }
    }
    expect(paddled).toBeGreaterThan(0);
  });
});

describe('ways of life (peopling.md section 5)', () => {
  it('keeps camps out of land too cold for their people', () => {
    for (const l of eastern) expect(l.lat / 1e6).toBeLessThan(10);
  });

  it('builds the lodgings of each culture and dresses its people', () => {
    expect(
      eastern.every((l) => l.culture === 'coastal-asia-hunter' && l.kind === 'shelter-lean-to'),
    ).toBe(true);
  });

  it('changes clothes once, inside the new lodging, the same way every time', () => {
    const l = eastern.find((x) => x.voyage)!;
    const f = tree.figures.find((x) => x.homes.some(([d, id]) => id === l.id && d === l.built))!;
    const whole = {
      fromDay: settings.startDay,
      toDay: settings.endDay,
      figures: tree.figures,
      lodgings: tree.lodgings,
    };
    const from = msAtDay(l.built, settings.startDay);
    const seen: { profile?: string; hidden?: boolean }[] = [];
    for (let ms = from; ms < from + 40_000; ms += 25) {
      const p = treeScene(whole, ms, settings.startDay).figures.find((x) => x.id === f.id);
      if (p) seen.push({ profile: p.profile, hidden: p.hidden });
    }
    const changes = seen.filter((s, k) => k > 0 && s.profile !== seen[k - 1]!.profile);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.profile).toBe('coastal-asia-hunter');
    expect(changes[0]!.hidden).toBe(true);
  }, 30_000);
});

describe('Neolithic thresholds (peopling.md section 3.6)', () => {
  it('settles the camps near a threshold, the nearest at its key moment', () => {
    const moment = tree.moments.find((m) => m.kind === 'neolithic-threshold');
    expect(moment).toBeDefined();
    expect(moment!.day).toBeGreaterThanOrEqual(bce(61_000));
    // A camp stands at its place from then on.
    const here = tree.lodgings.filter((l) => l.lat === moment!.lat && l.lon === moment!.lon);
    expect(here.some((l) => l.gone === NEVER || l.gone > moment!.day)).toBe(true);
    const staying = here.filter((l) => l.built > moment!.day).map((l) => l.camp);
    for (const l of tree.lodgings.filter((q) => staying.includes(q.camp) && q.built > moment!.day))
      expect([l.lat, l.lon]).toEqual([moment!.lat, moment!.lon]);
  });
});
