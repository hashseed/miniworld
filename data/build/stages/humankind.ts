// Tree of humankind stage of the data build: the tree grows from the first
// person over the habitable land of each date (spec humankind.md, sections 4
// and 5), written to data/build/tree/tree.json and, for the app, as one chunk
// per time window (section 8).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { OCEAN_MIN_LEVEL, OCEAN_NEVER } from '../../../app/src/content/formats.ts';
import { TIMELINE_START } from '../../../app/src/time/calendar.ts';
import { detCos, detSin } from '../../../app/src/core/detmath.ts';
import { onGlobe } from '../lib/geo.ts';
import { dayAtMs, dayAtWatch, msAtDay } from '../../../app/src/time/rate.ts';
import {
  areasAt,
  FOUNDER,
  FOUNDER_CULTURE,
  FOUNDER_LODGING,
  FRONT_KM_PER_YEAR,
  humankindSettings,
  siteStepAt,
  TREE_END,
  validateCultureAreas,
  type CultureAreas,
} from '../lib/cultureAreas.ts';
import { buildSites, type Site, type SiteMap } from '../lib/sites.ts';
import {
  COMPACT_SITE,
  gapDirection,
  isCompact,
  LAYOUT_KM_PER_M,
  layoutOf,
  LODGING_SLOTS,
  MAX_OUTING_M,
  MINIMAL_SITE,
  RACK_R,
  SCRAPE_BACK_M,
  SCRAPE_SIDE_M,
  BUILD_MS,
  shownAtMs,
  departureOf,
  stageHunts,
  slotPoint,
  burialTimes,
  stageSessions,
  MONUMENT_BUILD_SESSIONS,
  MONUMENT_DANCE_SESSIONS,
  MONUMENT_MIN,
  VISIT_M,
  treeScene,
} from '../../../app/src/world/treeScene.ts';
import {
  arrivalMap,
  dayOfBce,
  type ArrivalMap,
  type Arrivals,
  type Crossing,
} from '../lib/arrivals.ts';
import { CAMP_SHELTER } from '../../../assets/src/shelters.ts';
import type { Profile } from '../../../app/src/world/cultures.ts';
import type { Tree, TreeStage } from '../../../app/src/world/tree.ts';
import { climateHabitat } from '../lib/habitat.ts';
import {
  buildTree,
  checkTree,
  datedPlaces,
  distanceKm,
  treeChunks,
  treeStats,
} from '../lib/humankind.ts';
import { NEVER, type TreeLodging } from '../../../app/src/world/tree.ts';
import { flies, swims, WILD_GROUPS } from '../../../app/src/world/wildlife.ts';
import type { DrawnGround } from '../lib/drawnGround.ts';
import type { Climate } from './climate.ts';
import { ROOT, sha256, type WriteContext } from './context.ts';
import type { WorldMap } from './terrain.ts';

/** River field at which the drawn bank begins, so camps keep a little clear of the water. */
const RIVER_BANK_FIELD = 96;

/** The tree chunk files, null where empty, and the day each starts; undefined on the fixture map. */
export type TreeFiles = { files: (string | null)[]; days: number[]; sites: string } | undefined;

/** Each tree chunk holds this much watching time (humankind.md section 8, Proposed). */
const CHUNK_MS = 60_000;

/** A place a camp stands: [lat, lon] in whole microdegrees, first and last day (wildlife.md section 4). */
export type CampPlace = [number, number, number, number];

/** Köppen's desert: annual rain under 10 mm per °C of the annual mean plus 140 mm (peopling.md section 5.2). */
const KOPPEN_DRY_MM_PER_C = 10;
const KOPPEN_DRY_MM = 140;

/** An anchor asks for a camp site within this far of its place, in km (sites.md section 4.1). */
const ANCHOR_SITE_KM = 75;

/** The highest ground of any culture area (peopling.md section 5.2: the Tibetan Plateau and the Andes). */
const HIGHEST_CAMP_M = 4800;

/**
 * What the build tells about the peopling (peopling.md section 4): per arrival point, how long
 * after its date a band first stood at its site; per threshold, when its camps settled.
 */
function peoplingReport(
  tree: Tree,
  arrivals: Arrivals,
  thresholds: { id: string; bce: number }[],
  map: ArrivalMap,
): string[] {
  const lines: string[] = [];
  const years = (d: number) => Math.round(d / 365.2425);
  for (const p of arrivals.points) {
    // A passage is walked across, not camped at.
    if (p.passage) continue;
    const day = map.pointDays.get(p.id)!;
    // When a band first stood at the point's own site (sites.md section 2.1).
    const reached = treeStats.reached.find((r) => r.leg === p.id);
    if (!reached) lines.push(`${p.id}: never reached`);
    else if (reached.day - day > 500 * 365.2425)
      lines.push(`${p.id}: reached ${years(reached.day - day)} years after its date`);
  }
  for (const t of thresholds) {
    const settled = treeStats.thresholds.find((x) => x.id === t.id);
    lines.push(
      settled
        ? `${t.id}: settled ${years(settled.day - dayOfBce(t.bce))} years after its date`
        : `${t.id}: no camp near it`,
    );
  }
  return lines;
}

/** Camps farther than this from every walking wildlife group's home are left out of the index. */
const CAMP_NEAR_WILDLIFE_KM = 3000;

/**
 * The build code the camp sites depend on, besides treeScene's layouts (hashed by value):
 * every library file but the tree's own, and the stages that make the land and the lens.
 */
const SITES_CODE = [
  ...readdirSync(join(ROOT, 'data/build/lib'))
    .filter(
      (f) =>
        f.endsWith('.ts') &&
        !f.endsWith('.test.ts') &&
        !['humankind.ts', 'cultureAreas.ts', 'arrivals.ts', 'treeReport.ts'].includes(f),
    )
    .sort()
    .map((f) => `data/build/lib/${f}`),
  'data/build/stages/terrain.ts',
  'data/build/stages/climate.ts',
  'data/build/stages/lens.ts',
  'app/src/core/detmath.ts',
];

/** An event of the events dialog, named in every language (milestone-1 section 8.3). */
export interface TreeEvent {
  id: string;
  kind: 'migration' | 'crossing' | 'scene';
  title: Record<'en' | 'de', string>;
  day: number;
  lat: number;
  lon: number;
  /** The id of its card among the startup index's `siteCards` (milestone-1 section 8.3). */
  card: string;
}

/** A camp site is steep where its ground rises this much (m) out to the ring of catch (layout m). */
const STEEP_M = 600;
const CATCH_RING_M = 8.5;

export function buildHumankind(
  ctx: WriteContext,
  map: WorldMap,
  climate: Climate,
  drawn: DrawnGround,
  /** Drawn km per true km at a place, from the history lens (sites.md section 2). */
  widthAt: (lat: number, lon: number) => number = () => 1,
): { files: TreeFiles; camps: CampPlace[]; events: TreeEvent[] } {
  const { log, fail } = ctx;
  // The fixture map has no Africa.
  if (ctx.fixture) {
    log('tree of humankind skipped on the fixture map');
    return { files: undefined, camps: [], events: [] };
  }
  const { connection, lakes, rivers, elevation } = map;
  // Water in the source grids or as the globe draws it, whichever reaches further,
  // so nobody stands or walks where the drawn shore lies (section 4).
  const seaAt = (lat: number, lon: number, day: number) => {
    const v = connection.nearest(lat, lon);
    const level = climate.seaLevelAt(day);
    return (v !== OCEAN_NEVER && OCEAN_MIN_LEVEL + v <= level) || drawn.sea(lat, lon, level);
  };
  const lakeAt = (lat: number, lon: number) =>
    lakes.nearest(lat, lon) >= 128 || drawn.lake(lat, lon);
  const habitat = climateHabitat({
    slices: climate.slices,
    isSea: seaAt,
    isLake: lakeAt,
    isRiver: (lat, lon) => rivers.nearest(lat, lon) > 0,
    // The globe draws a river where its field passes 128; the bank starts a little before.
    inRiver: (lat, lon) => rivers.bilinear(lat, lon) >= RIVER_BANK_FIELD,
    elevation: (lat, lon) => elevation.bilinear(lat, lon),
    wood: climate.woodAt,
    // Each culture area keeps to its own limit below this (peopling.md section 5.2).
    highestM: HIGHEST_CAMP_M,
    wetForItsWarmth: (lat, lon, day) => {
      const t = climate.temperatureAt(lat, lon, day);
      const mm = climate.precipitationAt(lat, lon, day);
      return t !== undefined && mm !== undefined && mm >= KOPPEN_DRY_MM_PER_C * t + KOPPEN_DRY_MM;
    },
  });
  const cultureAreas = ctx.curated<CultureAreas>('culture-areas.json');
  const areaErrors = validateCultureAreas(cultureAreas);
  if (areaErrors.length) fail(areaErrors.join('\n'));
  // The arrival map (peopling.md section 4), over land at each date; ice and desert are crossed.
  const arrivals = ctx.curated<Arrivals>('arrivals.json');
  const { crossings } = ctx.curated<{ crossings: Crossing[] }>('crossings.json');
  const { thresholds } = ctx.curated<{
    thresholds: { id: string; bce: number; lat: number; lon: number }[];
  }>('neolithic.json');
  const lowDay =
    climate.seaLevel.startDay +
    climate.seaLevel.stepDays *
      climate.seaLevel.metres.indexOf(Math.min(...climate.seaLevel.metres));
  const africa = cultureAreas.areas.findIndex((a) => a.culture === FOUNDER_CULTURE);
  let arrived: ArrivalMap;
  try {
    arrived = arrivalMap({
      arrivals,
      crossings,
      land: (lat, lon, day) => !seaAt(lat, lon, day) && !lakeAt(lat, lon),
      lowDay,
      areasAt: (lat, lon) => areasAt(cultureAreas, lat, lon),
      africa: {
        area: africa,
        ...FOUNDER,
        startDay: TIMELINE_START,
        kmPerYear: FRONT_KM_PER_YEAR,
      },
    });
  } catch (e) {
    return fail((e as Error).message);
  }
  // The camp sites and their links (sites.md): flood levels from the source grids and the
  // drawn tiles, whichever floods first; lakes and drawn rivers are never dry for a camp.
  const oceanFlood = (lat: number, lon: number) => {
    const v = connection.nearest(lat, lon);
    const grid = v === OCEAN_NEVER ? Infinity : OCEAN_MIN_LEVEL + v;
    return Math.min(grid, drawn.groundAt(lat, lon).oceanLevel);
  };
  // Water for a canoe: only where the grids and the drawn tiles both flood.
  const waterFlood = (lat: number, lon: number) => {
    if (drawn.lake(lat, lon)) return -Infinity;
    const v = connection.nearest(lat, lon);
    const grid = v === OCEAN_NEVER ? Infinity : OCEAN_MIN_LEVEL + v;
    return Math.max(grid, drawn.groundAt(lat, lon).oceanLevel);
  };
  const walkFlood = (lat: number, lon: number) =>
    lakeAt(lat, lon) ? -Infinity : oceanFlood(lat, lon);
  const campFlood = (lat: number, lon: number) =>
    rivers.bilinear(lat, lon) >= RIVER_BANK_FIELD ? -Infinity : walkFlood(lat, lon);
  const lowestSea = Math.min(...climate.seaLevel.metres);
  const highestSea = Math.max(...climate.seaLevel.metres);
  const { places: keyPlaces } = ctx.curated<{
    places: { id: string; lat: number; lon: number }[];
  }>('key-places.json');
  // Anchors: places that must have a band from a year (sites.md section 4.1).
  const { anchors } = ctx.curated<{
    anchors: {
      id: string;
      bce: number;
      until?: number;
      lat: number;
      lon: number;
      scene?: { kind: string; prop: string };
      camp?: { lat: number; lon: number };
      en: string;
      de: string;
      source: string;
    }[];
  }>('anchors.json');
  for (const a of anchors)
    if (!a.id || !a.en || !a.de || !a.source || Math.abs(a.lat) > 90 || Math.abs(a.lon) > 180)
      fail(`anchors.json: ${a.id || '(no id)'} needs an id, a place, en, de and a source`);
  // Scenes at anchors (humankind.md section 8.2).
  const SCENE_PROPS: Record<string, string[]> = {
    'cave-painting': [
      'prop-cave-wall-sulawesi',
      'prop-cave-wall-chauvet',
      'prop-cave-wall-lascaux',
    ],
    burial: ['prop-burial'],
    monument: ['prop-gobekli-ring'],
    'bone-hut': ['prop-bone-hut'],
  };
  for (const a of anchors)
    if (a.scene && !SCENE_PROPS[a.scene.kind]?.includes(a.scene.prop))
      fail(
        `anchors.json: ${a.id}: a scene is a cave-painting (${SCENE_PROPS['cave-painting']!.join(', ')}), a burial (prop-burial), a monument (prop-gobekli-ring) or a bone hut (prop-bone-hut)`,
      );
  // The records that need a band at a place and time, each laid a site of its own that stays
  // dry for its span (sites.md section 2.1); an anchor's close by (section 4.1).
  const anchorRecords = anchors.map((a) => ({
    id: a.id,
    day: dayOfBce(a.bce),
    until: a.until === undefined ? TREE_END : dayOfBce(a.until),
    lat: a.lat,
    lon: a.lon,
    ...(a.scene ? { scene: { kind: a.scene.kind as TreeStage['kind'], prop: a.scene.prop } } : {}),
    ...(a.camp ? { camp: { lat: a.camp.lat, lon: a.camp.lon } } : {}),
  }));
  const thresholdRecords = thresholds.map((t) => ({
    id: t.id,
    day: dayOfBce(t.bce),
    lat: t.lat,
    lon: t.lon,
  }));
  // Encounters: parties of several bands meeting at a place (sites.md section 4.3).
  const { encounters } = ctx.curated<{
    encounters: {
      id: string;
      kind: string;
      bce: number;
      every?: number;
      until?: number;
      stay?: number;
      lat: number;
      lon: number;
      host?: string;
      roles: { id: string; lat: number; lon: number; km: number; people: number }[];
      en: string;
      de: string;
      source: string;
    }[];
  }>('encounters.json');
  const KINDS = ['visit', 'gathering', 'trade', 'battle'];
  for (const e of encounters) {
    const name = `encounters.json: ${e.id || '(no id)'}`;
    if (!e.id || !e.en || !e.de || !e.source || Math.abs(e.lat) > 90 || Math.abs(e.lon) > 180)
      fail(`${name} needs an id, a place, en, de and a source`);
    if (!KINDS.includes(e.kind)) fail(`${name}: kind must be one of ${KINDS.join(', ')}`);
    if ((e.every === undefined) !== (e.until === undefined) || (e.every ?? 1) <= 0)
      fail(`${name}: every and until come together, every more than 0 years`);
    if (e.host && !anchors.some((a) => a.id === e.host)) fail(`${name}: no anchor ${e.host}`);
    if (!e.roles?.length) fail(`${name} needs at least one role`);
    for (const r of e.roles)
      if (!r.id || !(r.people >= 2 && r.people <= 8) || !(r.km > 0))
        fail(
          `${name}: role ${r.id || '(no id)'} needs an id, a place, a km above 0 and 2 to 8 people`,
        );
  }
  const encounterRecords = encounters.map((e) => {
    const days: number[] = [];
    for (let bce = e.bce; bce >= (e.until ?? e.bce); bce -= e.every ?? 1) days.push(dayOfBce(bce));
    return {
      id: e.id,
      kind: e.kind,
      days,
      // Seconds of watching, a minute unless it says (sites.md section 4.3).
      stayMs: (e.stay ?? 60) * 1000,
      lat: e.lat,
      lon: e.lon,
      ...(e.host ? { host: e.host } : {}),
      roles: e.roles.map(({ id, lat, lon, km, people }) => ({ id, lat, lon, km, people })),
    };
  });
  const dated = datedPlaces({
    voyages: arrived.legs,
    anchors: anchorRecords,
    thresholds: thresholdRecords,
    encounters: encounterRecords,
    endDay: TREE_END,
  });
  const seaOver = (from: number, to: number) => {
    const n = Math.max(8, Math.ceil((to - from) / (100 * 365.2425)));
    let m = -Infinity;
    for (let k = 0; k <= n; k++)
      m = Math.max(m, climate.seaLevelAt(from + Math.floor(((to - from) * k) / n)));
    return m;
  };
  const siteInputs = {
    keyPlaces: [
      ...keyPlaces,
      ...dated.map((p) => ({
        id: `${p.kind}:${p.id}`,
        lat: p.lat,
        lon: p.lon,
        sea: seaOver(p.day, p.until),
        ...(p.kind === 'anchor' ? { km: ANCHOR_SITE_KM } : {}),
      })),
    ],
    stepAt: (lat: number, lon: number) => siteStepAt(cultureAreas, lat, lon),
    widthAt,
    campFlood,
    elevation: (lat: number, lon: number) => elevation.bilinear(lat, lon),
    walkFlood,
    lowestSea,
    highestSea,
    crossings: crossings.map((c) => ({
      id: c.id,
      day: dayOfBce(c.bce),
      way: c.way.map(([lat, lon]) => ({ lat, lon })),
    })),
  };
  // The sites take a minute to lay out and change only with the land, the lens, the key
  // places, the crossings, the coarser lattices of the culture areas and the build code, so
  // they are kept in data/out/sites/ by a hash of those (sites.md section 7), and tuning the
  // tree (densities, routes, morphs) rebuilds only the tree.
  const sitesKey = createHash('sha256')
    .update(
      JSON.stringify({
        // The cache's own format: 2 writes the flood levels' infinities as strings.
        format: 3,
        land: [ctx.fixture, sha256(join(ROOT, 'data/sources.json'))],
        lens: Array.from({ length: 36 * 17 }, (_, i) =>
          widthAt(-80 + 10 * Math.floor(i / 36), -180 + 10 * (i % 36)).toFixed(4),
        ),
        flood: [oceanFlood, walkFlood, campFlood].map(String).concat(String(RIVER_BANK_FIELD)),
        lattices: cultureAreas.areas.map((a) => [a.siteStepKm, a.snapshots.map((s) => s.ring)]),
        keyPlaces: siteInputs.keyPlaces,
        crossings,
        layout: [
          LAYOUT_KM_PER_M,
          LODGING_SLOTS,
          MAX_OUTING_M,
          RACK_R,
          SCRAPE_BACK_M,
          SCRAPE_SIDE_M,
          COMPACT_SITE,
          MINIMAL_SITE,
          layoutOf(0),
          layoutOf(COMPACT_SITE),
          layoutOf(MINIMAL_SITE),
          [gapDirection, isCompact, slotPoint].map(String),
        ],
        code: SITES_CODE.map((f) => sha256(join(ROOT, f))),
      }),
    )
    .digest('hex')
    .slice(0, 16);
  const sitesCache = join(ROOT, 'data/out/sites', `${sitesKey}.json`);
  let sites: SiteMap;
  if (ctx.landCache.on && existsSync(sitesCache)) {
    sites = JSON.parse(readFileSync(sitesCache, 'utf8'), (_k, v: unknown) =>
      v === '-Infinity' ? -Infinity : v === 'Infinity' ? Infinity : v,
    ) as SiteMap;
    log(`camp sites from ${relative(ROOT, sitesCache)}`);
  } else {
    sites = buildSites(siteInputs);
    if (ctx.landCache.on) {
      mkdirSync(join(ROOT, 'data/out/sites'), { recursive: true });
      // Only the newest is kept: one build's sites are about 10 MB.
      for (const old of readdirSync(join(ROOT, 'data/out/sites')))
        rmSync(join(ROOT, 'data/out/sites', old));
      // JSON has no infinities, which the flood levels use (lakes, never flooded).
      writeFileSync(
        sitesCache,
        JSON.stringify(sites, (_k, v: unknown) =>
          v === -Infinity ? '-Infinity' : v === Infinity ? 'Infinity' : v,
        ),
      );
    }
  }
  mkdirSync(join(ROOT, 'data/build/tree'), { recursive: true });
  writeFileSync(join(ROOT, 'data/build/tree/sites.json'), JSON.stringify(sites));
  log(
    `camp sites: ${sites.sites.length} sites, ${sites.links.length} links ` +
      `(${sites.links.filter((l) => l.crossing).length} by canoe)`,
  );
  if (sites.unplaced.length)
    log(`camp sites: no camp fits near the key places ${sites.unplaced.join(', ')}`);
  // Sites on a steep mountainside: the ground out to the ring of children's catch rises or
  // falls more than STEEP_M from the hearth (Yang, 2026-10-20: "I have kids running up the
  // himalayas for playing catch").
  for (const x of sites.sites) {
    if (x.pass) continue;
    const here = elevation.bilinear(x.lat, x.lon);
    const km = (CATCH_RING_M * LAYOUT_KM_PER_M) / x.width;
    let rise = 0;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 2 * Math.PI;
      const p = onGlobe(x.lat, x.lon, km * detCos(a), km * detSin(a));
      rise = Math.max(rise, Math.abs(elevation.bilinear(p.lat, p.lon) - here));
    }
    if (rise > STEEP_M) x.steep = true;
  }
  const treeSettings = humankindSettings(cultureAreas, {
    sites,
    seaLevel: climate.seaLevelAt,
    walkFlood,
    waterFlood,
    elevation: (lat, lon) => elevation.bilinear(lat, lon),
    temperature: climate.temperatureAt,
    arrival: arrived.dayAt,
    lodgingOf: (culture) => CAMP_SHELTER[culture as Profile] ?? FOUNDER_LODGING,
    voyages: arrived.legs,
    thresholds: thresholdRecords,
  });
  treeSettings.anchors = anchorRecords;
  treeSettings.encounters = encounterRecords;
  treeSettings.campFlood = campFlood;
  treeSettings.elevation = (lat, lon) => elevation.bilinear(lat, lon);
  if (!habitat.habitable(treeSettings.founder.lat, treeSettings.founder.lon, TIMELINE_START))
    fail('tree of humankind: the first person stands on uninhabitable land');
  let tree: Tree;
  try {
    tree = buildTree(treeSettings, habitat);
  } finally {
    // The place table (sites.md section 2.1), also when the tree fails, to look into it.
    writeFileSync(
      join(ROOT, 'data/build/tree/places.json'),
      JSON.stringify(treeStats.places, null, 1),
    );
  }
  const farthest = treeStats.places.reduce((a, b) => (b.km > a.km ? b : a), treeStats.places[0]!);
  log(
    `place table: ${treeStats.places.length} dated places` +
      (farthest
        ? `, the farthest site ${farthest.km} km from ${farthest.kind} ${farthest.id}`
        : ''),
  );
  const met = treeStats.encounters;
  log(
    `encounters: ${met.length} occurrences met, ${met.reduce((n, e) => n + e.people, 0)} people on trips`,
  );
  // How the planning pass met its plans (sites.md section 4.2).
  const means = new Map<string, number>();
  for (const r of treeStats.places) if (r.how) means.set(r.how, (means.get(r.how) ?? 0) + 1);
  log(
    `planning pass: ${[...means.values()].reduce((a, b) => a + b, 0)} plans met` +
      ([...means].length ? ` (${[...means].map(([k, n]) => `${n} ${k}`).join(', ')})` : ''),
  );
  log(
    `tree of humankind: ${treeStats.crowded} bands crowded a neighbour, ${treeStats.stuck} steps a band found nowhere to go`,
  );
  // Written before the checks, so a failing tree can be looked into.
  mkdirSync(join(ROOT, 'data/build/tree'), { recursive: true });
  writeFileSync(
    join(ROOT, 'data/build/tree/tree.json'),
    JSON.stringify({ startDay: treeSettings.startDay, endDay: treeSettings.endDay, tree }),
  );
  const treeProblems = checkTree(tree, treeSettings, habitat);
  if (treeProblems.length) fail(`tree of humankind:\n${treeProblems.slice(0, 20).join('\n')}`);
  for (const line of [...arrived.notes, ...peoplingReport(tree, arrivals, thresholds, arrived)])
    log(`peopling: ${line}`);
  // The constraints of the routes (peopling.md section 4): every arrival point reached within
  // 500 years of its date, and lands that history keeps apart never joined on foot.
  const late = peoplingReport(tree, arrivals, [], arrived).filter((l) =>
    / reached | never /.test(l),
  );
  if (late.length) fail(`peopling: ${late.join('; ')}`);
  const siteOf = new Map(treeStats.places.map((r) => [`${r.kind}:${r.id}`, r.site]));
  const foot = new Map<number, number[]>();
  for (const l of sites.links)
    if (!l.crossing) {
      foot.set(l.a, [...(foot.get(l.a) ?? []), l.b]);
      foot.set(l.b, [...(foot.get(l.b) ?? []), l.a]);
    }
  for (const p of arrivals.points)
    for (const other of p.apart ?? []) {
      const [from, to] = [siteOf.get(`arrival:${p.id}`), siteOf.get(`arrival:${other}`)];
      if (from === undefined || to === undefined) continue;
      const seen = new Set([from]);
      for (let ring = [from]; ring.length;) {
        const next: number[] = [];
        for (const i of ring)
          for (const j of foot.get(i) ?? [])
            if (!seen.has(j)) {
              seen.add(j);
              next.push(j);
            }
        ring = next;
      }
      if (seen.has(to))
        fail(`peopling: ${p.id} is joined on foot to ${other}, which history keeps apart`);
    }
  log(
    `tree of humankind: ${tree.figures.length} figures, ${tree.lodgings.length} lodgings, ` +
      `${tree.moments.filter((m) => m.kind === 'camp-founded').length + 1} camps founded`,
  );
  const camps = campPlaces(tree.lodgings).filter(([lat, lon]) =>
    WILD_GROUPS.some(
      (g) =>
        !flies(g) &&
        !swims(g) &&
        distanceKm(g.lat, g.lon, lat / 1e6, lon / 1e6) < CAMP_NEAR_WILDLIFE_KM,
    ),
  );
  log(`tree of humankind: ${camps.length} camp places near wildlife`);
  // One chunk per minute of watching, from the start of the timeline to the tree's end.
  const days: number[] = [];
  for (let ms = 0; ; ms += CHUNK_MS) {
    const day = ms === 0 ? TIMELINE_START : dayAtWatch(ms);
    if (day >= treeSettings.endDay) break;
    days.push(day);
  }
  const chunks = treeChunks(tree, days, treeSettings.endDay);
  const files = chunks.map((chunk, w) =>
    chunk ? ctx.output.writeJson(`tree/m${w}`, chunk) : null,
  );
  // The sites and links for the development view (sites.md section 7).
  const kind = (x: Site) => (x.pass ? 3 : x.key >= MINIMAL_SITE ? 2 : x.compact ? 1 : 0);
  const level = (v: number) => (Number.isFinite(v) ? Math.round(v) : v > 0 ? 9999 : -9999);
  const sitesFile = ctx.output.writeJson('tree/sites', {
    sites: sites.sites.map((x) => [
      Math.round(x.lat * 1e4),
      Math.round(x.lon * 1e4),
      kind(x),
      level(x.core),
      level([...x.places].sort((a, b) => b - a)[x.compact ? 0 : 1]!),
    ]),
    links: sites.links.map((l) => [l.a, l.b, l.crossing ? 9999 : level(l.level)]),
  });
  // The tree's migrations for the events dialog (milestone-1 section 8.3): each first arrival
  // in a new continent, on the day a band first stood at its site (sites.md section 2.1), there.
  const points = new Map(arrivals.points.map((p) => [p.id, p]));
  const events: TreeEvent[] = [];
  // The moment of an event is 3 seconds of watching before its work begins (milestone-1
  // section 8.3; Yang, issue 148).
  const LEAD_MS = 3_000;
  const dayOf = (ms: number) => Math.ceil(dayAtMs(ms - LEAD_MS, TIMELINE_START));
  const chunkOf = (day: number) => {
    let w = 0;
    while (w + 1 < days.length && days[w + 1]! <= day) w++;
    return chunks[w];
  };
  // An arrival: when and where the band that founded the camp there starts its crossing, or
  // where its camp is built when it made no walk.
  const startOf = (day: number, lat: number, lon: number) => {
    const l = tree.lodgings.find(
      (x) => x.built === day && x.lat === Math.round(lat * 1e6) && x.lon === Math.round(lon * 1e6),
    );
    const chunk = chunkOf(day);
    const out = l && chunk ? departureOf(chunk, TIMELINE_START, l.id) : undefined;
    if (out) return { day: dayOf(out.ms), lat: out.lat, lon: out.lon };
    const ms = l && chunk ? shownAtMs(chunk, TIMELINE_START, l.id) : undefined;
    return { day: ms === undefined ? day : dayOf(ms), lat, lon };
  };
  for (const r of treeStats.reached) {
    const p = points.get(r.leg);
    // Only the first arrival in a new continent is an event (Yang, 2026-10-20: "crossing
    // into a new continent is ok. otherwise too many uninteresting events").
    if (!p || !p.continent || events.some((e) => e.id === `arrival-${p.id}`)) continue;
    events.push({
      id: `arrival-${p.id}`,
      kind: 'migration',
      title: { en: p.en, de: p.de },
      ...startOf(r.day, r.lat, r.lon),
      card: p.id,
    });
  }
  log(`events: ${events.length} arrivals in a new continent`);
  // Scenes at anchors (humankind.md section 8.2): every session has its people, so nothing
  // is painted or buried by itself; each scene is an event on the day of its first session.
  const chunkAt = (ms: number) => {
    let w = 0;
    while (w + 1 < days.length && msAtDay(days[w + 1]!, TIMELINE_START) <= ms) w++;
    return chunks[w];
  };
  for (const stage of tree.stages ?? []) {
    const a = anchors.find((x) => x.id === stage.id)!;
    const sessions = stageSessions(stage, TIMELINE_START);
    const monument = stage.kind === 'monument';
    const need = stage.kind === 'cave-painting' ? 1 : monument ? MONUMENT_MIN : 2;
    for (const [k, q] of sessions.entries()) {
      const clips =
        stage.kind === 'cave-painting'
          ? ['paint']
          : monument &&
              k >= MONUMENT_BUILD_SESSIONS &&
              k < MONUMENT_BUILD_SESSIONS + MONUMENT_DANCE_SESSIONS
            ? ['dance']
            : stage.kind === 'bone-hut'
              ? ['work', 'carry']
              : ['work'];
      // A burial's diggers are at work while the grave is dug, before they carry the dead.
      const g = stage.kind === 'burial' ? burialTimes(stage, TIMELINE_START) : undefined;
      const ms = g ? Math.round((g.dig + g.digEnd) / 2) : Math.round((q.begin + q.stop) / 2);
      const chunk = chunkAt(ms);
      const busy = chunk
        ? treeScene(chunk, ms, TIMELINE_START).figures.filter(
            (f) =>
              (monument
                ? distanceKm(f.lat, f.lon, stage.lat / 1e6, stage.lon / 1e6) <=
                  VISIT_M * LAYOUT_KM_PER_M
                : Math.round(f.lat * 1e6) === stage.lat && Math.round(f.lon * 1e6) === stage.lon) &&
              clips.includes(f.clip),
          ).length
        : 0;
      if (busy < need)
        fail(
          `tree of humankind: session ${k + 1} of the scene of ${stage.id} has too few people to ${stage.kind === 'cave-painting' ? 'paint' : monument ? (k < MONUMENT_BUILD_SESSIONS ? 'raise the ring' : 'dance') : stage.kind === 'bone-hut' ? (k % 2 ? 'build the hut' : 'take out the bones') : 'dig the grave'}`,
        );
    }
    const first = sessions[0];
    if (first) {
      // Before the first paint stroke, the heap of a burial, the first stone of a ring or the
      // first mammoth hunt (humankind.md section 8.2).
      const work =
        stage.kind === 'bone-hut'
          ? (stageHunts(stage, TIMELINE_START)[0]?.start ?? first.begin)
          : first.begin;
      events.push({
        id: `scene-${stage.id}`,
        kind: 'scene',
        title: { en: a.en, de: a.de },
        day: dayOf(work),
        lat: stage.lat / 1e6,
        lon: stage.lon / 1e6,
        card: stage.id,
      });
    }
  }
  log(
    `scenes: ${(tree.stages ?? []).map((x) => `${x.id} (${x.kind}, ${stageSessions(x, TIMELINE_START).length} sessions)`).join(', ') || 'none'}`,
  );
  return { files: { files, days, sites: sitesFile }, camps, events };
}

/** Each place a camp stands, from its first lodging built to its last taken down, as the app shows it. */
export function campPlaces(lodgings: readonly TreeLodging[]): CampPlace[] {
  const places = new Map<string, CampPlace>();
  for (const l of lodgings) {
    const key = `${l.camp}:${l.lat}:${l.lon}`;
    const p = places.get(key);
    if (!p) places.set(key, [l.lat, l.lon, l.built, l.gone]);
    else {
      p[2] = Math.min(p[2], l.built);
      p[3] = p[3] === NEVER || l.gone === NEVER ? NEVER : Math.max(p[3], l.gone);
    }
  }
  return [...places.values()];
}
