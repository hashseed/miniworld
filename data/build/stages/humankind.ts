// Tree of humankind stage of the data build: the tree grows from the first
// person over the habitable land of each date (spec humankind.md, sections 4
// and 5), written to data/build/tree/tree.json and, for the app, as one chunk
// per time window (section 8).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OCEAN_MIN_LEVEL, OCEAN_NEVER } from '../../../app/src/content/formats.ts';
import { TIMELINE_START } from '../../../app/src/time/calendar.ts';
import { humankindSettings, validateCultureAreas, type CultureAreas } from '../lib/cultureAreas.ts';
import { climateHabitat } from '../lib/habitat.ts';
import { buildTree, checkTree, distanceKm, treeChunks } from '../lib/humankind.ts';
import { NEVER, type TreeLodging } from '../../../app/src/world/tree.ts';
import { flies, swims, WILD_GROUPS } from '../../../app/src/world/wildlife.ts';
import type { DrawnGround } from '../lib/drawnGround.ts';
import type { Climate } from './climate.ts';
import { ROOT, type WriteContext } from './context.ts';
import type { WorldMap } from './terrain.ts';

/** The tree chunk files, one per time window, null where empty; undefined on the fixture map. */
/** River field at which the drawn bank begins, so camps keep a little clear of the water. */
const RIVER_BANK_FIELD = 96;

export type TreeFiles = (string | null)[] | undefined;

/** A place a camp stands: [lat, lon] in whole microdegrees, first and last day (wildlife.md section 4). */
export type CampPlace = [number, number, number, number];

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
  const habitat = climateHabitat({
    slices: climate.slices,
    // Water in the source grids or as the globe draws it, whichever reaches further,
    // so nobody stands or walks where the drawn shore lies (section 4).
    isSea: (lat, lon, day) => {
      const v = connection.nearest(lat, lon);
      const level = climate.seaLevelAt(day);
      return (v !== OCEAN_NEVER && OCEAN_MIN_LEVEL + v <= level) || drawn.sea(lat, lon, level);
    },
    isLake: (lat, lon) => lakes.nearest(lat, lon) >= 128 || drawn.lake(lat, lon),
    isRiver: (lat, lon) => rivers.nearest(lat, lon) > 0,
    // The globe draws a river where its field passes 128; the bank starts a little before.
    inRiver: (lat, lon) => rivers.bilinear(lat, lon) >= RIVER_BANK_FIELD,
    elevation: (lat, lon) => elevation.bilinear(lat, lon),
  });
  const cultureAreas = ctx.curated<CultureAreas>('culture-areas.json');
  const areaErrors = validateCultureAreas(cultureAreas);
  if (areaErrors.length) fail(areaErrors.join('\n'));
  const treeSettings = humankindSettings(cultureAreas);
  if (!habitat.habitable(treeSettings.founder.lat, treeSettings.founder.lon, TIMELINE_START))
    fail('tree of humankind: the first person stands on uninhabitable land');
  const tree = buildTree(treeSettings, habitat);
  const treeProblems = checkTree(tree, treeSettings, habitat);
  if (treeProblems.length) fail(`tree of humankind:\n${treeProblems.slice(0, 20).join('\n')}`);
  mkdirSync(join(ROOT, 'data/build/tree'), { recursive: true });
  writeFileSync(
    join(ROOT, 'data/build/tree/tree.json'),
    JSON.stringify({ startDay: treeSettings.startDay, endDay: treeSettings.endDay, tree }),
  );
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
  const files = treeChunks(tree, ctx.windows, treeSettings.endDay).map((chunk, w) =>
    chunk ? ctx.output.writeJson(`tree/w${w}`, chunk) : null,
  );
  return { files, camps };
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
