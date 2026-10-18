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
import { buildTree, checkTree, treeChunks } from '../lib/humankind.ts';
import type { Climate } from './climate.ts';
import { ROOT, type WriteContext } from './context.ts';
import type { WorldMap } from './terrain.ts';

/** The tree chunk files, one per time window, null where empty; undefined on the fixture map. */
export type TreeFiles = (string | null)[] | undefined;

export function buildHumankind(ctx: WriteContext, map: WorldMap, climate: Climate): TreeFiles {
  const { log, fail } = ctx;
  // The fixture map has no Africa.
  if (ctx.fixture) {
    log('tree of humankind skipped on the fixture map');
    return undefined;
  }
  const { connection, lakes, rivers, elevation } = map;
  const habitat = climateHabitat({
    slices: climate.slices,
    isSea: (lat, lon, day) => {
      const v = connection.nearest(lat, lon);
      return v !== OCEAN_NEVER && OCEAN_MIN_LEVEL + v <= climate.seaLevelAt(day);
    },
    isLake: (lat, lon) => lakes.nearest(lat, lon) >= 128,
    isRiver: (lat, lon) => rivers.nearest(lat, lon) > 0,
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
  return treeChunks(tree, ctx.windows, treeSettings.endDay).map((chunk, w) =>
    chunk ? ctx.output.writeJson(`tree/w${w}`, chunk) : null,
  );
}
