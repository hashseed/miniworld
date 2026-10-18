// Offline data build (spec milestone 1, section 10): reads only from
// data/sources and data/curated, validates everything, and writes the
// manifest, the startup index per language and content-hashed chunks to
// app/public/data.
//
// Usage: node data/build/build-data.ts [--fixture] [--max-level N]

import { KM_PER_DEG } from '../../app/src/geo/earth.ts';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  ARID_GRID_H,
  ARID_GRID_W,
  encodeClimateSlice,
  type ClimateSlice,
  encodeFoliageSlice,
  encodeTerrainTile,
  OCEAN_MIN_LEVEL,
  OCEAN_NEVER,
  OCEAN_SCALE,
  PART_LEVEL,
} from '../../app/src/content/formats.ts';
import {
  chunkKey,
  type Manifest,
  type StartupIndex,
  type SourceInfo,
} from '../../app/src/content/types.ts';
import {
  ancestorAt,
  DATA_MAX_LEVEL,
  tilePath,
  TILE_N,
  type TileKey,
} from '../../app/src/geo/cube.ts';
import { LANGUAGES, type Language } from '../../app/src/i18n/messages.ts';
import { TIMELINE_START, dayFromDate } from '../../app/src/time/calendar.ts';
import { AXIS_K_YEARS, dayAtPosition, logAxis } from '../../app/src/time/axis.ts';
import { erasForLanguage, validateEras, type CuratedEras } from './lib/eras.ts';
import { buildLandmarks, placeOffWater } from './lib/landmarks.ts';
import { buildVignettes } from './lib/vignettes.ts';
import { fixtureElevation } from './lib/fixture.ts';
import { Grid, GridPyramid } from './lib/grid.ts';
import { climateStepYears, iceGrid, seaLevelCurve, sliceDay } from './lib/ice.ts';
import {
  aridityGrid,
  iceThickness,
  meanSeaLevel,
  TimeStack,
  validateHumidPeriods,
  type HumidPeriod,
} from './lib/climate.ts';
import { readExtract } from './lib/extract.ts';
import { foliageGrid } from './lib/foliage.ts';
import { climateHabitat } from './lib/habitat.ts';
import { buildTree, checkTree } from './lib/humankind.ts';
import { humankindSettings, validateCultureAreas, type CultureAreas } from './lib/cultureAreas.ts';
import { checkLicences, type SourceEntry } from './lib/licence.ts';
import { floodInlandSeas, INLAND_SEAS, oceanConnection } from './lib/ocean.ts';
import { atStrength, buildLens, checkLens, LENS_PARAMS, parseCoordinates } from './lib/lens.ts';
import { lensPreviewSvg } from './lib/lensPreview.ts';
import { decodeLensGrids, encodeLensGrids, MAX_STRENGTH } from '../../app/src/globe/lens.ts';
import { Output } from './lib/output.ts';
import { readElevation } from './lib/readers.ts';
import {
  enlargeIslands,
  removeAreas,
  smoothElevation,
  validateRemovedAreas,
  type RemovedArea,
} from './lib/simplify.ts';
import {
  blendPolar,
  polarWeight,
  carveStraits,
  smoothLakes,
  smoothOcean,
  coarseOcean,
  coastDistance,
  joinInlandSeas,
  COARSE_MIN_SPACING_KM,
  validateIslands,
  validateStraits,
  type KeptIsland,
  type Strait,
} from './lib/coast.ts';
import { regionGrid } from './lib/regions.ts';
import { allowPeaksAtCoast, famousRelief, validateMountains, type Mountain } from './lib/relief.ts';
import { allTileKeys, buildTerrainTile, isDeepTile } from './lib/terrain.ts';
import {
  NO_LAKE,
  rasterizeLakes,
  rasterizeRivers,
  riverFlow,
  type RiverPick,
} from './lib/water.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const SOURCES = join(ROOT, 'data/sources');
const OUT = join(ROOT, 'app/public/data');

/** Content time windows, of equal width on the log timeline axis (spec milestone 1, section 10.3). */
export const TIME_WINDOWS = 35;
/** Simplified map (spec milestone 1, section 4.2). */
const SMOOTHING_KM = 80;
const POLAR_SMOOTHING_KM = 150;
/** Smoothing of the listed mountain ranges, which keep more of their shape. */
const RANGE_SMOOTHING_KM = 25;
// Only a short list of the rivers history needs most (decided by Yang on
// 2026-10-17), by their Natural Earth names, including local spellings.
const AMAZON_BASIN: [number, number, number, number] = [-80, -20, -45, 6];
const RIVERS: RiverPick[] = [
  ...['Nile', 'Rosetta Branch', 'Damietta Branch'],
  ...['El Bahr el Abyad', 'El Bahr el Azraq'],
  ...['Euphrates', 'Firat', 'Al Furat', 'Tigris', 'Dicle', 'Shatt al Arab'],
  ...['Indus', 'Ganges', 'Huang', 'Yangtze', 'Chang Jiang', 'Mekong'],
  ...['Danube', 'Donau', 'Bratul Chillia', 'Bratul Sulina', 'Bratul Sfintu Gheorghe'],
  ...['Rhine', 'Rhein', 'Rhin', 'Waal', 'Volga', 'Mississippi', 'Congo', 'Niger'],
  ...['Amazonas', 'Madeira', 'Xingu', 'Tapajós'],
].map((name) => ({ name }));
RIVERS.push({ name: 'Negro', box: AMAZON_BASIN });
// The Blue Nile up to Lake Tana.
RIVERS.push({ name: 'Abay', box: [33, 9, 39, 12.5] });
const MAX_LAKE_RANK = 4;
/** Grid spacing (degrees) of the smoothed bed under the ice sheets. */
const ICE_BED_SPACING_DEG = 0.5;
const MIN_LAKE_KM2 = 3000;

const args = process.argv.slice(2);
const useFixture = args.includes('--fixture');
const maxLevelArg = args.indexOf('--max-level');
const maxLevel = maxLevelArg >= 0 ? Number(args[maxLevelArg + 1]) : DATA_MAX_LEVEL;

function fail(message: string): never {
  console.error(`build-data: ${message}`);
  process.exit(1);
}

const started = performance.now();
/** Logs a step with the seconds since the build started, so slow stages show. */
function log(message: string): void {
  const s = ((performance.now() - started) / 1000).toFixed(1).padStart(5);
  console.log(`build-data ${s}s: ${message}`);
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// --- Sources and licences -------------------------------------------------

const registry = JSON.parse(readFileSync(join(ROOT, 'data/sources.json'), 'utf8')) as {
  sources: SourceEntry[];
};
const licenceErrors = checkLicences(registry.sources);
if (licenceErrors.length) fail(licenceErrors.join('\n'));

const byId = new Map(registry.sources.map((s) => [s.id, s]));
function sourceFiles(id: string): string[] {
  const s = byId.get(id);
  if (!s) fail(`unknown source ${id}`);
  return s.files.map((f) => {
    const path = join(SOURCES, id, f.path);
    if (!existsSync(path)) fail(`${id}: missing ${f.path}; run npm run fetch-data`);
    if (sha256(path) !== f.sha256) fail(`${id}: checksum mismatch for ${f.path}`);
    return path;
  });
}
const hasSource = (id: string) => (byId.get(id)?.files.length ?? 0) > 0;

const natural = sourceFiles('natural-earth');
const neFile = (name: string) =>
  natural.find((p) => p.endsWith(name)) ?? fail(`natural-earth: missing ${name}`);

const realData = hasSource('etopo-2022');
if (!realData && !useFixture)
  fail(
    'ETOPO 2022 is not in data/sources yet. Run npm run fetch-data, or build the test fixture with --fixture.',
  );
const fixture = useFixture || !realData;
log(
  fixture
    ? 'building from the synthetic test fixture (not for release)'
    : 'building from real source data',
);

// --- Time -----------------------------------------------------------------

const release = JSON.parse(readFileSync(join(ROOT, 'data/curated/release.json'), 'utf8')) as {
  version: string;
  cutoffDate: string;
};
const [cy, cm, cd] = release.cutoffDate.split('-').map(Number) as [number, number, number];
const cutoffDay = dayFromDate(cy, cm, cd);
const axis = logAxis(TIMELINE_START, cutoffDay);
const windows: number[] = [];
for (let i = 0; i < TIME_WINDOWS; i++)
  windows.push(i === 0 ? TIMELINE_START : Math.floor(dayAtPosition(axis, i / TIME_WINDOWS)));
log(`${windows.length} time windows on the log timeline axis`);

// --- Eras -----------------------------------------------------------------

const eras = JSON.parse(readFileSync(join(ROOT, 'data/curated/eras.json'), 'utf8')) as CuratedEras;
const eraErrors = validateEras(eras, TIMELINE_START, cutoffDay);
if (eraErrors.length) fail(eraErrors.join('\n'));

// --- Vignettes (spec milestone 2, section 18) ------------------------------

const animals = new Set(
  Object.keys(
    (parseYaml(readFileSync(join(ROOT, 'data/curated/vocab/animals.yaml'), 'utf8'), {
      schema: 'failsafe',
    }) ?? {}) as Record<string, unknown>,
  ),
);
const landmarkBuild = buildLandmarks({
  curated: join(ROOT, 'data/curated'),
  lanes: new Set(eras.lanes.map((l) => l.id)),
  startDay: TIMELINE_START,
  cutoffDay,
});
if (landmarkBuild.errors.length) fail(landmarkBuild.errors.join('\n'));
const vignetteBuild = buildVignettes({
  curated: join(ROOT, 'data/curated'),
  lanes: new Set(eras.lanes.map((l) => l.id)),
  animals,
  startDay: TIMELINE_START,
  cutoffDay,
  landmarkParts: new Map(landmarkBuild.landmarks.map((l) => [l.structure.id, l.parts])),
});
if (vignetteBuild.errors.length) fail(vignetteBuild.errors.join('\n'));
for (const l of landmarkBuild.landmarks)
  for (const p of l.structure.parts)
    if (p.build && !vignetteBuild.vignettes.some((v) => v.structure.id === p.build!.vignette))
      fail(
        `landmarks/${l.structure.id}.md: build of ${p.name} names unknown vignette "${p.build.vignette}"`,
      );

// --- Elevation, ocean mask, lakes and rivers -------------------------------

const output = new Output(OUT);
let source: Grid = fixture
  ? fixtureElevation(neFile('ne_10m_land.geojson'))
  : readElevation(
      sourceFiles('etopo-2022')
        .find((p) => p.endsWith('elevation.json'))!
        .replace(/\.json$/, ''),
    );
// The map is simplified (spec milestone 1, section 4.2): the elevation extract
// is 4 arc-minutes; finer grids (the fixture) are averaged down to at most 2.
while (source.width > 10800) {
  const m = source.downsampleMean();
  source = new Grid(m.width, m.height, Int16Array.from(m.data, Math.round));
}
const straits = JSON.parse(readFileSync(join(ROOT, 'data/curated/straits.json'), 'utf8')) as {
  straits: Strait[];
};
const keptIslands = JSON.parse(readFileSync(join(ROOT, 'data/curated/islands.json'), 'utf8')) as {
  islands: KeptIsland[];
};
const removedAreas = JSON.parse(
  readFileSync(join(ROOT, 'data/curated/removed-areas.json'), 'utf8'),
) as { areas: RemovedArea[] };
const mountains = JSON.parse(readFileSync(join(ROOT, 'data/curated/mountains.json'), 'utf8')) as {
  mountains: Mountain[];
};
const humid = JSON.parse(readFileSync(join(ROOT, 'data/curated/humid-periods.json'), 'utf8')) as {
  periods: HumidPeriod[];
};
const mapErrors = [
  ...validateHumidPeriods(humid.periods),
  ...validateStraits(straits.straits),
  ...validateIslands(keptIslands.islands),
  ...validateRemovedAreas(removedAreas.areas),
  ...validateMountains(mountains.mountains),
];
if (mapErrors.length) fail(mapErrors.join('\n'));

// Islands are edited on today's coastline before anything else (section 4.2).
removeAreas(source, removedAreas.areas, keptIslands.islands);
const islands = enlargeIslands(source, keptIslands.islands);
// The ocean mask floods the unsmoothed elevation with the straits carved to
// their sills, then smooths the result into the coast (section 5.1).
const conn = new Grid(source.width, source.height, Int16Array.from(source.data));
carveStraits(conn, straits.straits);
const parents = new Int32Array(conn.width * conn.height);
const connection = new Grid(conn.width, conn.height, oceanConnection(conn, parents));
const ocean = new Grid(
  conn.width,
  conn.height,
  smoothOcean(connection, straits.straits, keptIslands.islands),
);
log(`ocean mask grid ${conn.width} × ${conn.height}, ${straits.straits.length} straits`);

// Ground below sea level that is never drawn as sea is raised to sea level
// before smoothing, so it never shows as a steep, jagged pit: dry land that
// never joins the ocean (such as the Jordan rift with the Dead Sea, or the
// Qattara Depression), and the ends of narrow gulfs that the smoothed coast
// closes even today (such as the head of the Gulf of Suez) (section 4.2).
const landSource = new Grid(source.width, source.height, Int16Array.from(source.data));
for (let i = 0; i < landSource.data.length; i++) {
  const neverSea =
    connection.data[i] === OCEAN_NEVER || OCEAN_MIN_LEVEL + ocean.data[i]! / OCEAN_SCALE > 0;
  if (neverSea && landSource.data[i]! < 0) landSource.data[i] = 0;
}
const elevation = blendPolar(
  smoothElevation(landSource, SMOOTHING_KM),
  smoothElevation(landSource, POLAR_SMOOTHING_KM),
);
// The listed mountain ranges and peaks keep their shape (section 4.2).
const relief = famousRelief(
  elevation,
  smoothElevation(landSource, RANGE_SMOOTHING_KM),
  mountains.mountains,
);
log(
  `elevation grid ${elevation.width} × ${elevation.height}, smoothed ${SMOOTHING_KM} km, ` +
    `${mountains.mountains.length} famous mountains, ` +
    `${islands.removed} small islands removed, ${islands.grown} enlarged`,
);
const pyramid = new GridPyramid(relief);
// The ice sheets stand on a heavily smoothed bed, the same in the terrain
// tiles and in the ice thickness, so their surface is smooth (section 5.2).
// It leaves out the listed mountains, so their snow caps (section 5.2) stand
// out from it.
const bedGrid = new GridPyramid(elevation).forSpacing(ICE_BED_SPACING_DEG);
const iceBed = (lat: number, lon: number) => Math.max(0, bedGrid.bilinear(lat, lon));

const lakeLevel = new Grid(
  conn.width,
  conn.height,
  new Int16Array(conn.width * conn.height).fill(NO_LAKE),
);
const lakeCount = rasterizeLakes(
  conn,
  neFile('ne_10m_lakes.geojson'),
  lakeLevel.data,
  MAX_LAKE_RANK,
  MIN_LAKE_KM2,
);
floodInlandSeas(conn, INLAND_SEAS, (i, level) => (lakeLevel.data[i] = level));
const lakes = new Grid(conn.width, conn.height, smoothLakes(lakeLevel, NO_LAKE));
joinInlandSeas(ocean.data, connection, lakes.data);
const coast = new Grid(conn.width, conn.height, coastDistance(ocean));
allowPeaksAtCoast(coast, mountains.mountains);
const rivers = new Grid(conn.width, conn.height, new Uint8Array(conn.width * conn.height));
const riverContext = {
  ocean: connection.data,
  parents,
  heights: elevation.data,
  lakes: lakes.data,
};
const riverCount = rasterizeRivers(
  conn,
  neFile('ne_10m_rivers_lake_centerlines.geojson'),
  rivers.data,
  RIVERS,
  riverContext,
);
const flow = riverFlow(conn, rivers.data, riverContext);
const flowCos = new Grid(conn.width, conn.height, flow.cos);
const flowSin = new Grid(conn.width, conn.height, flow.sin);
log(`${lakeCount} lakes, ${riverCount} river lines`);

// Landmarks stand on dry land beside the drawn rivers (giza.md section 2). The
// sea is where the ocean reaches at today's level, so dry depressions such as
// Qattara count as land.
const wet = (lat: number, lon: number) =>
  rivers.bilinear(lat, lon) > 127 ||
  lakes.bilinear(lat, lon) > 127 ||
  connection.nearest(lat, lon) <= -OCEAN_MIN_LEVEL;
for (const l of landmarkBuild.landmarks)
  log(`landmark ${l.structure.id} moved ${placeOffWater(l, wet)} km west off the water`);

// --- Terrain tiles ----------------------------------------------------------

interface LayerOut {
  chunks: Record<string, string>;
  parts: Map<string, { chunks: Record<string, string>; deep: string[] }>;
  deep: string[];
}
const newLayer = (): LayerOut => ({ chunks: {}, parts: new Map(), deep: [] });

function place(layer: LayerOut, key: TileKey): { chunks: Record<string, string>; deep: string[] } {
  if (key.level < PART_LEVEL) return layer;
  const part = tilePath(ancestorAt(key, PART_LEVEL));
  let p = layer.parts.get(part);
  if (!p) layer.parts.set(part, (p = { chunks: {}, deep: [] }));
  return p;
}

// Coarse levels sample a coast prefiltered for their spacing (section 4.2).
const coarse = new Map<number, Grid<Uint16Array>>();
for (let level = 0; level <= maxLevel; level++) {
  const spacingKm = ((90 / (1 << level)) * KM_PER_DEG) / TILE_N;
  if (spacingKm < COARSE_MIN_SPACING_KM) break;
  coarse.set(
    level,
    new Grid(ocean.width, ocean.height, coarseOcean(ocean, spacingKm, straits.straits)),
  );
}
log(`coarse coasts for levels 0..${coarse.size - 1}`);

const terrain = newLayer();
let tileCount = 0;
for (const key of allTileKeys(maxLevel)) {
  const tile = buildTerrainTile(key, {
    heights: pyramid,
    ocean,
    coarseOcean: coarse,
    lakeLevel,
    lakes,
    rivers,
    flowCos,
    flowSin,
    bed: iceBed,
    coast,
  });
  const target = place(terrain, key);
  const path = tilePath(key);
  if (isDeepTile(tile)) target.deep.push(path);
  else
    target.chunks[chunkKey(path, 'all', 'xx')] = output.write(
      `terrain/${path}`,
      'bin',
      encodeTerrainTile(tile),
    );
  if (++tileCount % 4000 === 0) log(`${tileCount} terrain tiles`);
}
log(`${tileCount} terrain tiles`);

// --- Ice and sea level -------------------------------------------------------

const stack = (id: string, name: string) => {
  const json =
    sourceFiles(id).find((p) => p.endsWith(`/${name}.json`)) ?? fail(`${id}: no ${name}`);
  const { header, data } = readExtract(json.replace(/\.json$/, ''));
  return new TimeStack(header, data);
};
const iceStack = stack('paleomist-1.0', 'ice_thickness');
const precipitation = stack('beyer-2020', 'BIO12');
const seaPoints = meanSeaLevel(stack('paleomist-1.0', 'sea_level'), (lat, lon) => {
  const v = connection.nearest(lat, lon);
  return v !== OCEAN_NEVER && OCEAN_MIN_LEVEL + v <= 0;
});
const seaLevel = seaLevelCurve(seaPoints, TIMELINE_START, cutoffDay);
const seaLevelAt = (day: number) =>
  seaLevel.metres[
    Math.max(
      0,
      Math.min(
        seaLevel.metres.length - 1,
        Math.round((day - seaLevel.startDay) / seaLevel.stepDays),
      ),
    )
  ]!;
// One global climate slice per step of the climate data (section 5.2): the
// ice cover as a smoothed border distance, and the aridity with the humid
// periods the data misses (section 4.3).
const climateYears = climateStepYears(precipitation.yearsBP, TIMELINE_START);
const iceDays = climateYears.map(sliceDay); // ascending, as the years descend
const climateFiles: string[] = [];
const climateSlices: ClimateSlice[] = [];
for (const bp of climateYears) {
  const slice = {
    day: sliceDay(bp),
    ice: iceGrid(
      (lats, lons) => iceThickness(iceStack, lats, lons, bp, { bed: iceBed, weight: polarWeight }),
      (lat, lon) => {
        const v = connection.nearest(lat, lon);
        return v !== OCEAN_NEVER && OCEAN_MIN_LEVEL + v <= seaLevelAt(sliceDay(bp));
      },
    ),
    aridity: aridityGrid(precipitation, humid.periods, ARID_GRID_W, ARID_GRID_H, bp),
  };
  climateSlices.push(slice);
  climateFiles.push(output.write(`climate/${bp}`, 'bin', encodeClimateSlice(slice)));
}
// One foliage slice per climate step (spec foliage.md, section 2): the biome
// class per 0.5° cell, with the humid periods turning dry land to savanna, and
// the tree density near the ice sheets and in cold or dry climates.
const biomeJson =
  sourceFiles('beyer-2020').find((p) => p.endsWith('/biome.json')) ?? fail('beyer-2020: no biome');
const biome = readExtract(biomeJson.replace(/\.json$/, ''));
const foliageInputs = {
  biome,
  precipitation,
  temperature: stack('beyer-2020', 'BIO1'),
  ice: iceStack,
  periods: humid.periods,
};
const foliageFiles = climateYears.map((bp) => {
  const grid = foliageGrid(foliageInputs, bp);
  return output.write(
    `foliage/${bp}`,
    'bin',
    encodeFoliageSlice({ day: sliceDay(bp), cells: grid.classes, density: grid.density }),
  );
});
log(
  `${climateFiles.length} climate and foliage slices; lowest sea level ${Math.min(...seaLevel.metres)} m`,
);

// --- Tree of humankind ---------------------------------------------------------

// The tree grows from the first person over the habitable land of each date
// (spec humankind.md, sections 4 and 5). The fixture map has no Africa.
if (fixture) log('tree of humankind skipped on the fixture map');
else {
  const habitat = climateHabitat({
    slices: climateSlices,
    isSea: (lat, lon, day) => {
      const v = connection.nearest(lat, lon);
      return v !== OCEAN_NEVER && OCEAN_MIN_LEVEL + v <= seaLevelAt(day);
    },
    isLake: (lat, lon) => lakes.nearest(lat, lon) >= 128,
    isRiver: (lat, lon) => rivers.nearest(lat, lon) > 0,
    elevation: (lat, lon) => elevation.bilinear(lat, lon),
  });
  const cultureAreas = JSON.parse(
    readFileSync(join(ROOT, 'data/curated/culture-areas.json'), 'utf8'),
  ) as CultureAreas;
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
}

// --- History lens -------------------------------------------------------------

// The warp comes from the coordinates in the spec's event lists (spec
// history-lens.md, section 2). It takes a while to compute. The approved warp
// is kept in data/curated/lens/ so that builds and CI read it instead of
// computing it; any other warp is kept in data/out/lens/ by a hash of its
// inputs and of the lens code, and rebuilt only when they change.
const SPEC = join(ROOT, 'docs/spec');
const eventFiles = [
  join(SPEC, 'events.md'),
  join(SPEC, 'wars.md'),
  ...readdirSync(join(SPEC, 'events'))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => join(SPEC, 'events', f)),
];
const eventPoints = eventFiles.flatMap((f) => parseCoordinates(readFileSync(f, 'utf8')));
const lensVersion = createHash('sha256')
  .update(JSON.stringify({ points: eventPoints, params: LENS_PARAMS }))
  .digest('hex')
  .slice(0, 12);
const lensCode = sha256(join(ROOT, 'data/build/lib/lens.ts')).slice(0, 12);
const approvedLens = join(ROOT, 'data/curated/lens', `${lensVersion}.bin`);
const lensCache = join(ROOT, 'data/out/lens', `${lensVersion}-${lensCode}.bin`);
let lensBytes: Uint8Array;
let lensExponent: number;
const lensStored = [approvedLens, lensCache].find((f) => existsSync(f));
if (lensStored) {
  lensBytes = new Uint8Array(readFileSync(lensStored));
  lensExponent = Number(readFileSync(`${lensStored}.exponent`, 'utf8'));
  log(`history lens ${lensVersion} from ${relative(ROOT, lensStored)}, exponent ${lensExponent}`);
} else {
  const lens = buildLens(eventPoints, LENS_PARAMS, log);
  lensBytes = encodeLensGrids(lens.forward, lens.inverse);
  lensExponent = lens.exponent;
  mkdirSync(dirname(lensCache), { recursive: true });
  writeFileSync(lensCache, lensBytes);
  writeFileSync(`${lensCache}.exponent`, String(lensExponent));
  log(`history lens ${lensVersion} from ${eventPoints.length} event coordinates`);
}
// The slider goes up to 200%, where the limits no longer hold but the warp
// must still not fold (history-lens.md, section 3).
{
  const strongest = checkLens(
    atStrength(decodeLensGrids(lensBytes).forward, MAX_STRENGTH),
    LENS_PARAMS,
  );
  if (strongest.folds > 0)
    throw new Error(`history lens ${lensVersion} folds at ${MAX_STRENGTH * 100}% strength`);
  log(
    `history lens at ${MAX_STRENGTH * 100}%: no folds, smallest area factor ` +
      `${strongest.minArea.toFixed(2)}, stretch up to ${strongest.maxAnisotropy.toFixed(2)}:1`,
  );
}
// The before-and-after preview Yang approves before a new warp ships (section 3).
const curatedLens = JSON.parse(readFileSync(join(ROOT, 'data/curated/lens.json'), 'utf8')) as {
  approvedVersion: string;
};
if (curatedLens.approvedVersion !== lensVersion) {
  const lensPreview = join(ROOT, 'data/out/lens', `preview-${lensVersion}.svg`);
  if (!existsSync(lensPreview))
    writeFileSync(
      lensPreview,
      lensPreviewSvg(neFile('ne_10m_land.geojson'), decodeLensGrids(lensBytes).forward),
    );
  log(
    `history lens ${lensVersion} is not approved yet (approved: ${curatedLens.approvedVersion}); ` +
      `preview in ${lensPreview}`,
  );
}
const lensFile = output.write('lens', 'bin', lensBytes);

// --- Index and manifest ---------------------------------------------------------

const sources: SourceInfo[] = registry.sources
  .filter((s) => !(fixture && s.id === 'etopo-2022'))
  .map((s) => ({ id: s.id, title: s.title, licence: s.licence, citation: s.citation, url: s.url }));

const vignetteFiles = vignetteBuild.vignettes.map((v) => ({
  v,
  structure: output.writeJson(`vignettes/${v.structure.id}`, v.structure),
  text: Object.fromEntries(
    LANGUAGES.map((l) => [l, output.writeJson(`vignettes/${v.structure.id}-${l}`, v.text[l])]),
  ) as Record<Language, string>,
}));
log(`${vignetteFiles.length} vignettes`);
const landmarkFiles = landmarkBuild.landmarks.map((l) => ({
  l,
  structure: output.writeJson(`landmarks/${l.structure.id}`, l.structure),
  text: Object.fromEntries(
    LANGUAGES.map((lang) => [
      lang,
      output.writeJson(`landmarks/${l.structure.id}-${lang}`, l.text[lang]),
    ]),
  ) as Record<Language, string>,
}));
log(`${landmarkFiles.length} landmarks`);

const index = {} as Record<Language, string>;
for (const language of LANGUAGES) {
  const idx: StartupIndex = {
    language,
    ...erasForLanguage(eras, language, TIMELINE_START, cutoffDay),
    axisYears: AXIS_K_YEARS,
    seaLevel,
    iceSlices: iceDays,
    regions: regionGrid(),
    sources,
    events: [],
    people: [],
    vignettes: vignetteFiles.map(({ v, structure, text }) => ({
      id: v.structure.id,
      fromDay: v.structure.fromDay,
      toDay: v.structure.toDay,
      fromApproximate: v.fromApproximate,
      toApproximate: v.toApproximate,
      icon: v.structure.icon,
      title: v.text[language].title,
      structure,
      text: text[language],
    })),
    landmarks: landmarkFiles.map(({ l, structure, text }) => ({
      id: l.structure.id,
      fromDay: l.structure.fromDay,
      toDay: l.structure.toDay,
      fromApproximate: l.fromApproximate,
      toApproximate: false,
      icon: l.structure.icon,
      title: l.text[language].title,
      structure,
      text: text[language],
    })),
  };
  index[language] = output.writeJson(`index-${language}`, idx);
}

function finishLayer(
  name: string,
  layer: LayerOut,
  minLevel: number,
  maxLvl: number,
  timed: boolean,
) {
  const parts: Record<string, string> = {};
  for (const [path, part] of layer.parts) {
    parts[path] = output.writeJson(`${name}/parts/${path.replace('/', '-')}`, part);
  }
  return { minLevel, maxLevel: maxLvl, timed, chunks: layer.chunks, parts, deep: layer.deep };
}

const manifest: Manifest = {
  version: release.version,
  buildId: createHash('sha256').update(JSON.stringify(index)).digest('hex').slice(0, 12),
  fixture,
  cutoffDay,
  timelineStartDay: TIMELINE_START,
  languages: [...LANGUAGES],
  windows,
  index,
  lens: { file: lensFile, version: lensVersion, exponent: lensExponent },
  layers: {
    terrain: finishLayer('terrain', terrain, 0, maxLevel, false),
  },
  climate: { days: iceDays, files: climateFiles },
  foliage: { days: iceDays, files: foliageFiles },
};
output.writeNamed('manifest.json', new TextEncoder().encode(JSON.stringify(manifest)));

await output.finish();
const brotliKb = (files: string[]) =>
  (files.reduce((n, f) => n + (output.sizes.get(f) ?? 0), 0) / 1000).toFixed(0);
log(
  `climate slices ${brotliKb(climateFiles)} KB Brotli, foliage slices ${brotliKb(foliageFiles)} KB`,
);
const mb = (n: number) => (n / 1e6).toFixed(1);
log(
  `${output.files} files, ${mb(output.rawBytes)} MB raw, ${mb(output.compressedBytes)} MB Brotli → ${OUT}`,
);
for (const language of LANGUAGES)
  log(`index ${language}: ${(output.sizes.get(index[language])! / 1000).toFixed(0)} KB Brotli`);
