// Tree of humankind stage of the data build: the tree grows from the first
// person over the habitable land of each date (spec humankind.md, sections 4
// and 5), written to data/build/tree/tree.json and, for the app, as one chunk
// per time window (section 8).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OCEAN_MIN_LEVEL, OCEAN_NEVER } from '../../../app/src/content/formats.ts';
import { TIMELINE_START } from '../../../app/src/time/calendar.ts';
import { dayAtWatch } from '../../../app/src/time/rate.ts';
import {
  areasAt,
  FOUNDER,
  FOUNDER_CULTURE,
  FOUNDER_LODGING,
  FRONT_KM_PER_YEAR,
  humankindSettings,
  validateCultureAreas,
  type CultureAreas,
} from '../lib/cultureAreas.ts';
import {
  arrivalMap,
  dayOfBce,
  type ArrivalMap,
  type Arrivals,
  type Crossing,
} from '../lib/arrivals.ts';
import { CAMP_SHELTER } from '../../../assets/src/shelters.ts';
import type { Profile } from '../../../app/src/world/cultures.ts';
import type { Tree } from '../../../app/src/world/tree.ts';
import { climateHabitat } from '../lib/habitat.ts';
import { buildTree, checkTree, distanceKm, treeChunks } from '../lib/humankind.ts';
import { NEVER, type TreeLodging } from '../../../app/src/world/tree.ts';
import { flies, swims, WILD_GROUPS } from '../../../app/src/world/wildlife.ts';
import type { DrawnGround } from '../lib/drawnGround.ts';
import type { Climate } from './climate.ts';
import { ROOT, type WriteContext } from './context.ts';
import type { WorldMap } from './terrain.ts';

/** River field at which the drawn bank begins, so camps keep a little clear of the water. */
const RIVER_BANK_FIELD = 96;

/** The tree chunk files, null where empty, and the day each starts; undefined on the fixture map. */
export type TreeFiles = { files: (string | null)[]; days: number[] } | undefined;

/** Each tree chunk holds this much watching time (humankind.md section 8, Proposed). */
const CHUNK_MS = 60_000;

/** A place a camp stands: [lat, lon] in whole microdegrees, first and last day (wildlife.md section 4). */
export type CampPlace = [number, number, number, number];

/** Köppen's desert: annual rain under 10 mm per °C of the annual mean plus 140 mm (peopling.md section 5.2). */
const KOPPEN_DRY_MM_PER_C = 10;
const KOPPEN_DRY_MM = 140;

/** The highest ground of any culture area (peopling.md section 5.2: the Tibetan Plateau and the Andes). */
const HIGHEST_CAMP_M = 4800;

/**
 * What the build tells about the peopling (peopling.md section 4): per arrival point, how long
 * after its date the first camp near it stood; per threshold, when its flag went up.
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
    const day = map.pointDays.get(p.id)!;
    const first = tree.lodgings.find(
      (l) => distanceKm(l.lat / 1e6, l.lon / 1e6, p.lat, p.lon) < 1000,
    );
    if (!first) lines.push(`${p.id}: no camp within 1,000 km`);
    else if (first.built - day > 500 * 365.2425)
      lines.push(`${p.id}: first camp ${years(first.built - day)} years after its date`);
  }
  for (const t of thresholds) {
    const flag = tree.flags?.find((f) => f.id === t.id);
    lines.push(
      flag
        ? `${t.id}: flag raised ${years(flag.day - dayOfBce(t.bce))} years after its date`
        : `${t.id}: no camp near it, no flag`,
    );
  }
  return lines;
}

/** Camps farther than this from every walking wildlife group's home are left out of the index. */
const CAMP_NEAR_WILDLIFE_KM = 3000;

export function buildHumankind(
  ctx: WriteContext,
  map: WorldMap,
  climate: Climate,
  drawn: DrawnGround,
): { files: TreeFiles; camps: CampPlace[] } {
  const { log, fail } = ctx;
  // The fixture map has no Africa.
  if (ctx.fixture) {
    log('tree of humankind skipped on the fixture map');
    return { files: undefined, camps: [] };
  }
  const { connection, lakes, rivers, elevation } = map;
  // Water in the source grids or as the globe draws it, whichever reaches further,
  // so nobody stands or walks where the drawn shore lies (section 4).
  const seaAt = (lat: number, lon: number, day: number) => {
    const v = connection.nearest(lat, lon);
    const level = climate.seaLevelAt(day);
    return (v !== OCEAN_NEVER && OCEAN_MIN_LEVEL + v <= level) || drawn.sea(lat, lon, level);
  };
  const lakeAt = (lat: number, lon: number) => lakes.nearest(lat, lon) >= 128 || drawn.lake(lat, lon);
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
  const lowDay = climate.seaLevel.startDay +
    climate.seaLevel.stepDays * climate.seaLevel.metres.indexOf(Math.min(...climate.seaLevel.metres));
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
  const treeSettings = humankindSettings(cultureAreas, {
    elevation: (lat, lon) => elevation.bilinear(lat, lon),
    temperature: climate.temperatureAt,
    arrival: arrived.dayAt,
    lodgingOf: (culture) => CAMP_SHELTER[culture as Profile] ?? FOUNDER_LODGING,
    voyages: arrived.legs,
    thresholds: thresholds.map((t) => ({ id: t.id, day: dayOfBce(t.bce), lat: t.lat, lon: t.lon })),
  });
  if (!habitat.habitable(treeSettings.founder.lat, treeSettings.founder.lon, TIMELINE_START))
    fail('tree of humankind: the first person stands on uninhabitable land');
  const tree = buildTree(treeSettings, habitat);
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
  const files = treeChunks(tree, days, treeSettings.endDay).map((chunk, w) =>
    chunk ? ctx.output.writeJson(`tree/m${w}`, chunk) : null,
  );
  return { files: { files, days }, camps };
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
