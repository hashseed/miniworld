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
  treeStats,
  distanceKm,
  onGlobe,
  type Habitat,
  type TreeSettings,
} from './humankind.ts';
import { buildSites } from './sites.ts';

const years = (y: number) => Math.round(y * DAYS_PER_YEAR);

// A round continent 2500 km across the equator, with the founder at its centre.
const RADIUS_KM = 2500;
const onLand = (lat: number, lon: number) => distanceKm(0, 0, lat, lon) <= RADIUS_KM;
const habitat: Habitat = {
  habitable: onLand,
  score: (lat, lon) => 1 - distanceKm(0, 0, lat, lon) / RADIUS_KM,
};
/** The camp sites of a world: land never floods, water always does; rivers are dry only for walkers. */
const sitesOf = (
  land: (lat: number, lon: number) => boolean,
  river = (_lat: number, _lon: number) => false,
) =>
  buildSites({
    campFlood: (lat, lon) => (land(lat, lon) && !river(lat, lon) ? Infinity : -Infinity),
    walkFlood: (lat, lon) => (land(lat, lon) ? Infinity : -Infinity),
    lowestSea: 0,
    highestSea: 0,
    crossings: [],
    fromLat: -30,
    toLat: 30,
  });
const settings: TreeSettings = {
  founder: { lat: 0, lon: 0 },
  lodgingKind: 'lodging-test',
  sites: sitesOf(onLand),
  seaLevel: () => 0,
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
    // The first person camps at the site nearest her place (sites.md section 4).
    const first = tree.lodgings[0]!;
    for (const l of tree.lodgings) {
      if (l.built >= settings.prologueEndDay || l.camp === first.camp) continue;
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
    // Figures stand at least 2 layout metres apart, lodgings (at most 2.7 life-size metres,
    // 8.1 layout metres, across) 10: a compact camp's neighbouring huts stand 10.6 apart.
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
      // A cook at the spit (3.1 metres from the fire) may come within 1.9 of a spot.
      apart(
        s.figures.filter((f) => f.clip === 'idle' || f.clip === 'work' || f.clip === 'knap'),
        1.85,
      );
      apart(s.lodgings, 10);
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
  const okAt = (p: { lat: number; lon: number; x: number; z: number }) => {
    const q = onGlobe(p.lat, p.lon, p.x * km, p.z * km);
    return ok(q.lat, q.lon);
  };
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
    // Cooking needs a kill and a free cook before the band moves on: the scene test shows it.
    expect(props.has('prop-drying-rack')).toBe(true);
    expect(hidden).toBeGreaterThan(0);
    expect(sparks).toBeGreaterThan(0);
    expect(catching).toBeGreaterThan(0);
  }, 120_000);
});

describe('nothing passes through anything (section 8.1)', () => {
  it('keeps walkers, carried kills and poles clear of lodgings, racks and the fire', () => {
    const whole = {
      fromDay: settings.startDay,
      toDay: settings.endDay,
      figures: tree.figures,
      lodgings: tree.lodgings,
    };
    const end = msAtDay(settings.endDay, settings.startDay);
    // Sizes in layout metres: figures are drawn three times the layout, so a lodging
    // about 2.4 m across is 7 across, a figure 1.5, a drying rack 7.5 long.
    const LODGING_R = 3.6;
    const FIGURE_R = 0.75;
    const RACK_HALF = 3.9;
    const RACK_DEPTH = 0.6;
    const HEARTH_R = 1.8;
    const where: string[] = [];
    const near = (ax: number, az: number, bx: number, bz: number) =>
      Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);
    /** Distance from a point to a rack: a segment across the ring at its spot. */
    const toRack = (
      x: number,
      z: number,
      r: { x: number; z: number; dirX: number; dirZ: number },
    ) => {
      // The rack's length runs across its facing direction.
      const [tx, tz] = [-r.dirZ, r.dirX];
      const u = Math.max(-RACK_HALF, Math.min(RACK_HALF, (x - r.x) * tx + (z - r.z) * tz));
      return near(x, z, r.x + tx * u, r.z + tz * u);
    };
    for (let ms = 0; ms < end && where.length < 12; ms += 337) {
      const s = treeScene(whole, ms, settings.startDay);
      const at = (o: { lat: number; lon: number }) => `${o.lat.toFixed(2)},${o.lon.toFixed(2)}`;
      const lodges = s.lodgings.filter((l) => l.built > 0.5);
      const racks = s.props.filter((q) => q.kind === 'prop-drying-rack');
      const movers: { what: string; lat: number; lon: number; x: number; z: number; r: number }[] =
        [];
      for (const f of s.figures)
        if (!f.hidden && ['walk', 'run', 'carry', 'pole'].includes(f.clip))
          movers.push({ what: `figure ${f.id} ${f.clip}`, ...f, r: FIGURE_R });
      for (const p of s.prey)
        if (p.clip === 'hung') movers.push({ what: `kill ${p.id}`, ...p, r: 1.2 });
      for (const pole of s.poles)
        for (const k of [-4.5, 0, 4.5])
          movers.push({
            what: `pole ${pole.id}`,
            lat: pole.lat,
            lon: pole.lon,
            x: pole.x + pole.dirX * k,
            z: pole.z + pole.dirZ * k,
            r: 0.2,
          });
      for (const m of movers) {
        const here = at(m);
        for (const l of lodges)
          if (at(l) === here && near(m.x, m.z, l.x, l.z) < LODGING_R + m.r)
            where.push(`${ms}: ${m.what} through lodging ${l.id}`);
        for (const r of racks)
          if (at(r) === here && toRack(m.x, m.z, r) < RACK_DEPTH + m.r)
            where.push(`${ms}: ${m.what} through ${r.id}`);
        const fire = s.hearths.some((h) => at(h) === here);
        if (
          fire &&
          m.r > 0.5 &&
          near(m.x, m.z, 0, 0) < HEARTH_R + m.r &&
          !m.what.startsWith('kill')
        )
          where.push(`${ms}: ${m.what} through the fire at ${m.x.toFixed(1)},${m.z.toFixed(1)}`);
      }
    }
    expect(where).toEqual([]);
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
    const riverSettings = { ...settings, sites: sitesOf(onLand, inRiver) };
    const t = buildTree(riverSettings, habitat);
    expect(checkTree(t, riverSettings, habitat)).toEqual([]);
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
    expect(hash).toBe('aa88c85d3aac404f');
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

  it('agree where they meet: the last moments of a window, in its file and in the next', () => {
    // The app moves on to the next file at the window's end; nobody may jump then.
    const windows = Array.from({ length: 40 }, (_, w) => settings.startDay + years(250 * w));
    const chunks = treeChunks(tree, windows, settings.endDay);
    for (let w = 0; w + 1 < chunks.length && chunks[w + 1]; w++) {
      const end = msAtDay(chunks[w]!.toDay, settings.startDay);
      for (const back of [50, 400, 1500, 4000]) {
        const ms = end - back;
        expect(treeScene(chunks[w + 1]!, ms, settings.startDay).figures).toEqual(
          treeScene(chunks[w]!, ms, settings.startDay).figures,
        );
      }
    }
  }, 60_000);
});

describe('anchors and caps (sites.md section 4)', () => {
  // A place near the continent's eastern edge, far from the founder at its centre.
  const place = { lat: 0, lon: 19 };
  const anchorDay = TIMELINE_START + years(7_000);
  const untilDay = TIMELINE_START + years(9_000);

  it('brings a band to an anchor by its day and holds it there until its end', () => {
    const anchored = buildTree(
      { ...settings, anchors: [{ id: 'east', day: anchorDay, until: untilDay, ...place }] },
      habitat,
    );
    const near = (day: number) =>
      anchored.lodgings.filter(
        (l) =>
          l.built <= day &&
          (l.gone === NEVER || day < l.gone) &&
          distanceKm(l.lat / 1e6, l.lon / 1e6, place.lat, place.lon) <= 300,
      );
    for (const day of [anchorDay, anchorDay + years(1_000), untilDay - 1]) {
      const here = near(day);
      expect(here.length).toBeGreaterThan(0);
      // The same camp all along: held, it does not roam.
      expect(new Set(here.map((l) => l.camp)).size).toBe(1);
      expect(here[0]!.camp).toBe(near(anchorDay)[0]!.camp);
    }
  }, 30_000);

  it('fails the build when an anchor has no usable site', () => {
    expect(() =>
      buildTree(
        { ...settings, anchors: [{ id: 'sea', day: anchorDay, until: untilDay, lat: 0, lon: 40 }] },
        habitat,
      ),
    ).toThrow(/anchor sea/);
  }, 30_000);

  it('keeps a culture area to its cap of bands', () => {
    const capped = buildTree(
      { ...settings, areaOf: (lat, lon) => (onLand(lat, lon) ? 0 : undefined), maxBands: () => 3 },
      habitat,
    );
    for (let day = settings.startDay; day < settings.endDay; day += years(500)) {
      const camps = new Set(
        capped.lodgings
          .filter((l) => l.built <= day && (l.gone === NEVER || day < l.gone))
          .map((l) => l.camp),
      );
      expect(camps.size).toBeLessThanOrEqual(3);
    }
  }, 30_000);
});

describe('the planning pass (sites.md section 4.2)', () => {
  const place = { lat: 0, lon: 19 };
  const day = TIMELINE_START + years(7_000);
  const until = TIMELINE_START + years(9_000);
  const row = (id: string) => treeStats.places.find((r) => r.id === id)!;

  it('meets an anchor even when its area may hold only one band', () => {
    buildTree(
      {
        ...settings,
        anchors: [{ id: 'east', day, until, ...place }],
        areaOf: (lat, lon) => (onLand(lat, lon) ? 0 : undefined),
        maxBands: () => 1,
      },
      habitat,
    );
    const r = row('east');
    expect(r.how).toBeDefined();
    expect(r.met!).toBeLessThanOrEqual(day);
    expect(r.met!).toBeGreaterThanOrEqual(r.claim!);
  }, 30_000);

  it('clears its footprint: a camp in the way moves onto the site or makes way', () => {
    // Near the founder, early: her band's camp overlaps the anchor's site.
    const early = TIMELINE_START + years(600);
    const near = { lat: 0, lon: 3 };
    const t = buildTree(
      { ...settings, anchors: [{ id: 'near', day: early, until: early + years(500), ...near }] },
      habitat,
    );
    const r = row('near');
    expect(['there', 'moved', 'group', 'band']).toContain(r.how);
    // Only its band stands within its site's footprint while it is held (the build checks it too).
    const at = (d: number) =>
      new Set(
        t.lodgings
          .filter(
            (l) =>
              l.built <= d &&
              (l.gone === NEVER || d < l.gone) &&
              distanceKm(l.lat / 1e6, l.lon / 1e6, r.siteLat, r.siteLon) < 300,
          )
          .map((l) => l.camp),
      );
    expect(at(early).size).toBe(1);
  }, 30_000);

  it('fails before the tree grows when the site turns to desert within the stay', () => {
    const dries = TIMELINE_START + years(8_900);
    const drying: Habitat = {
      ...habitat,
      habitable: (lat, lon, d) =>
        onLand(lat, lon) && !(d >= dries && distanceKm(lat, lon, place.lat, place.lon) < 600),
    };
    expect(() =>
      buildTree({ ...settings, anchors: [{ id: 'dry', day, until, ...place }] }, drying),
    ).toThrow(/anchor dry: its site is not livable about \d+ BCE, within its stay/);
  }, 30_000);

  it('fails before the tree grows when people reach the site only after its day', () => {
    expect(() =>
      buildTree(
        {
          ...settings,
          anchors: [{ id: 'late', day, until, ...place }],
          arrival: (lat, lon) =>
            distanceKm(lat, lon, place.lat, place.lon) < 600 ? until : TIMELINE_START,
        },
        habitat,
      ),
    ).toThrow(/anchor late: the arrival map reaches its site only about/);
  }, 30_000);

  it('fails when two anchors claimed at once have different sites whose camps overlap', () => {
    expect(() =>
      buildTree(
        {
          ...settings,
          anchors: [
            { id: 'one', day, until, ...place },
            { id: 'two', day, until, lat: 0, lon: 15 },
          ],
        },
        habitat,
      ),
    ).toThrow(/anchor one and anchor two: their sites' camps overlap while both are claimed/);
  }, 30_000);

  it('lets two anchors on one site share its band, held to the later end', () => {
    const t = buildTree(
      {
        ...settings,
        anchors: [
          { id: 'first', day, until: day + years(500), ...place },
          { id: 'second', day: day + years(300), until, ...place },
        ],
      },
      habitat,
    );
    expect(row('first').site).toBe(row('second').site);
    const r = row('second');
    const camps = (d: number) =>
      new Set(
        t.lodgings
          .filter(
            (l) =>
              l.built <= d &&
              (l.gone === NEVER || d < l.gone) &&
              l.lat === Math.round(r.siteLat * 1e6) &&
              l.lon === Math.round(r.siteLon * 1e6),
          )
          .map((l) => l.camp),
      );
    for (const d of [day, day + years(400), until - 1]) expect(camps(d).size).toBe(1);
  }, 30_000);
});

describe('encounters (sites.md section 4.3)', () => {
  const day = TIMELINE_START + years(7_000);
  const meet = { lat: 0, lon: 4 };
  const west = { id: 'west', lat: 0, lon: -12, km: 900, people: 2 };
  const east = { id: 'east', lat: 0, lon: 14, km: 900, people: 3 };
  const at = (l: { lat: number; lon: number }, p: { lat: number; lon: number }) =>
    l.lat === Math.round(p.lat * 1e6) && l.lon === Math.round(p.lon * 1e6);
  /** The figures that live at a place on a day, by the lodgings they live in. */
  const livingAt = (t: ReturnType<typeof buildTree>, p: { lat: number; lon: number }, d: number) =>
    t.figures.filter((f) => {
      const l = homeOn(f, d);
      return l !== NEVER && at(t.lodgings[l]!, p);
    });

  it('brings parties of two bands together on open ground and sends them home', () => {
    const t = buildTree(
      {
        ...settings,
        encounters: [
          {
            id: 'feast',
            kind: 'gathering',
            days: [day],
            stayMs: 60_000,
            ...meet,
            roles: [west, east],
          },
        ],
      },
      habitat,
    );
    const row = treeStats.encounters.find((e) => e.id === 'feast')!;
    expect(row.parties).toBe(2);
    const site = treeStats.places.find((r) => r.kind === 'encounter' && r.id === 'feast')!;
    const here = { lat: site.siteLat, lon: site.siteLon };
    const guests = livingAt(t, here, row.day);
    expect(guests.length).toBe(5);
    // Two parties, each in its own lodgings, from two bands.
    const from = new Set(
      guests.map((f) => {
        const i = f.homes.findIndex((h) => h[0] === row.day && at(t.lodgings[h[1]]!, here));
        return t.lodgings[f.homes[i - 1]![1]]!.camp;
      }),
    );
    expect(from.size).toBe(2);
    // Gone home afterwards, nobody left at the meeting site.
    const after = Math.max(
      ...guests.map((f) => f.homes.find((h) => h[0] > row.day)?.[0] ?? row.day),
    );
    expect(after).toBeGreaterThan(row.day);
    expect(livingAt(t, here, after)).toEqual([]);
    for (const f of guests) {
      const back = f.homes.find((h) => h[0] > row.day)!;
      expect(at(t.lodgings[back[1]]!, here)).toBe(false);
    }
  }, 30_000);

  it('lets parties visit a host and leaves its camp as it was', () => {
    const place = { lat: 0, lon: 19 };
    const t = buildTree(
      {
        ...settings,
        anchors: [{ id: 'host', day, until: day + years(2_000), ...place }],
        encounters: [
          {
            id: 'visit',
            kind: 'visit',
            days: [day + years(200)],
            stayMs: 60_000,
            ...place,
            host: 'host',
            roles: [{ id: 'visitors', lat: 0, lon: 0, km: 2_500, people: 2 }],
          },
        ],
      },
      habitat,
    );
    const row = treeStats.encounters.find((e) => e.id === 'visit')!;
    const hostRow = treeStats.places.find((r) => r.kind === 'anchor' && r.id === 'host')!;
    expect(row.site).toBe(hostRow.site);
    const here = { lat: hostRow.siteLat, lon: hostRow.siteLon };
    const before = livingAt(t, here, row.day - 1).length;
    expect(livingAt(t, here, row.day).length).toBe(before + 2);
    const leave = Math.min(
      ...livingAt(t, here, row.day)
        .filter((f) => f.homes.some((h) => h[0] === row.day))
        .map((f) => f.homes.find((h) => h[0] > row.day)![0]),
    );
    // The visitors have left; the host's own people are still there.
    const guests = livingAt(t, here, row.day).filter((f) => f.homes.some((h) => h[0] === row.day));
    for (const f of guests) expect(at(t.lodgings[homeOn(f, leave)]!, here)).toBe(false);
  }, 30_000);

  it('fails before the tree grows when a role has no people near it', () => {
    expect(() =>
      buildTree(
        {
          ...settings,
          encounters: [
            {
              id: 'lonely',
              kind: 'trade',
              days: [day],
              stayMs: 60_000,
              ...meet,
              roles: [west, { id: 'sea', lat: 0, lon: 40, km: 100, people: 2 }],
            },
          ],
        },
        habitat,
      ),
    ).toThrow(/encounter lonely \(\d+ BCE\), role sea: no land people have reached/);
  }, 30_000);

  it('walks every trip on land', () => {
    const t = buildTree(
      {
        ...settings,
        encounters: [
          {
            id: 'feast',
            kind: 'gathering',
            days: [day],
            stayMs: 60_000,
            ...meet,
            roles: [west, east],
          },
        ],
      },
      habitat,
    );
    const ways = [
      ...t.lodgings.flatMap((l) => (l.voyage ? [l.voyage] : [])),
      ...t.figures.flatMap((f) => (f.walks ?? []).map((w) => w[2])),
    ];
    for (const w of ways) {
      for (const [lat, lon] of w.way) expect(onLand(lat / 1e6, lon / 1e6)).toBe(true);
      expect(w.water.every((x) => !x)).toBe(true);
    }
    // The scene walks them there and back on land too, whole tree and chunks alike.
    const row = treeStats.encounters.find((e) => e.id === 'feast')!;
    const whole = { fromDay: settings.startDay, toDay: settings.endDay, ...t };
    const from = msAtDay(row.day, settings.startDay);
    const windows = [settings.startDay, row.day, settings.endDay];
    const chunk = treeChunks(t, windows, settings.endDay)[1]!;
    for (let ms = from - 2_000; ms < from + 150_000; ms += 1_250) {
      const scene = treeScene(whole, ms, settings.startDay);
      for (const f of scene.figures) expect(onLand(f.lat, f.lon)).toBe(true);
      if (ms >= from + 1_000) expect(treeScene(chunk, ms, settings.startDay)).toEqual(scene);
    }
  }, 60_000);
});

describe('the place table (sites.md section 2.1)', () => {
  const place = { lat: 0, lon: 19 };
  const day = TIMELINE_START + years(7_000);

  it('gives each dated place its own site, and a route leg is reached there', () => {
    buildTree(
      {
        ...settings,
        voyages: [
          { id: 'east', day, way: [place] },
          { id: 'through', day, way: [{ lat: 5, lon: 10 }], passage: true },
        ],
      },
      habitat,
    );
    // A passage needs no band, so it has no row.
    expect(treeStats.places.map((p) => `${p.kind}:${p.id}`)).toEqual(['arrival:east']);
    const row = treeStats.places[0]!;
    expect(row.km).toBeLessThanOrEqual(450);
    const reached = treeStats.reached.find((r) => r.leg === 'east')!;
    expect(reached.day).toBeGreaterThanOrEqual(day);
    expect([reached.lat, reached.lon]).toEqual([row.siteLat, row.siteLon]);
  }, 30_000);

  it('never gives a place a site across the water', () => {
    // A small island off the east coast, too small for any camp, 200 km from the shore.
    const island = { lat: 0, lon: 24.3 };
    const land = (lat: number, lon: number) =>
      onLand(lat, lon) || distanceKm(island.lat, island.lon, lat, lon) <= 60;
    expect(() =>
      buildTree(
        {
          ...settings,
          sites: sitesOf(land),
          walkFlood: (lat, lon) => (land(lat, lon) ? Infinity : -Infinity),
          voyages: [{ id: 'island', day, way: [island] }],
        },
        habitat,
      ),
    ).toThrow(
      /arrival island has no camp site within 450 km; the nearest, \d+ km away, is across water/,
    );
  }, 30_000);
});
