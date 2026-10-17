// Offline data build (spec milestone 1, section 10): reads only from
// data/sources and data/curated, validates everything, and writes the
// manifest, the startup index per language and content-hashed chunks to
// app/public/data.
//
// Usage: node data/build/build-data.ts [--fixture] [--max-level N]

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  encodeIceChunk,
  encodeTerrainTile,
  OCEAN_MIN_LEVEL,
  OCEAN_NEVER,
} from '../../app/src/content/formats.ts';
import {
  chunkKey,
  type Manifest,
  type StartupIndex,
  type SourceInfo,
} from '../../app/src/content/types.ts';
import { ancestorAt, tilePath, TILE_N, type TileKey } from '../../app/src/globe/cube.ts';
import { LANGUAGES, type Language } from '../../app/src/i18n/messages.ts';
import { TIMELINE_START, continuousYear, dayFromDate } from '../../app/src/time/calendar.ts';
import { buildWatchTable, yearAtSeconds, totalSeconds } from '../../app/src/time/watchTable.ts';
import { dayFromContinuousYear } from '../../app/src/time/calendar.ts';
import { erasForLanguage, validateEras, type CuratedEras } from './lib/eras.ts';
import { fixtureElevation } from './lib/fixture.ts';
import { Grid, GridPyramid } from './lib/grid.ts';
import {
  iceChunksForTile,
  iceStepYears,
  iceTileKeys,
  iceTilePoints,
  seaLevelCurve,
  sliceDay,
} from './lib/ice.ts';
import { aridity, iceThickness, meanSeaLevel, TimeStack } from './lib/climate.ts';
import { readExtract } from './lib/extract.ts';
import { checkLicences, type SourceEntry } from './lib/licence.ts';
import { floodInlandSeas, INLAND_SEAS, oceanConnection } from './lib/ocean.ts';
import { Output } from './lib/output.ts';
import { readElevation } from './lib/readers.ts';
import { enlargeIslands, smoothElevation } from './lib/simplify.ts';
import {
  blendPolar,
  polarWeight,
  carveStraits,
  smoothLakes,
  smoothOcean,
  coarseOcean,
  joinInlandSeas,
  COARSE_MIN_SPACING_KM,
  validateIslands,
  validateStraits,
  type KeptIsland,
  type Strait,
} from './lib/coast.ts';
import { regionGrid } from './lib/regions.ts';
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

/** Watching seconds per content time window (spec milestone 1, section 10.3). */
export const WINDOW_SECONDS = 600;
const PART_LEVEL = 2;
/** Simplified map (spec milestone 1, section 4.2). */
const SMOOTHING_KM = 40;
const POLAR_SMOOTHING_KM = 150;
// Only a short list of the rivers history needs most (decided by Yang on
// 2026-10-17), by their Natural Earth names, including local spellings.
const AMAZON_BASIN: [number, number, number, number] = [-80, -20, -45, 6];
const RIVERS: RiverPick[] = [
  ...['Nile', 'Rosetta Branch', 'Damietta Branch'],
  ...['Euphrates', 'Firat', 'Al Furat', 'Tigris', 'Dicle', 'Shatt al Arab'],
  ...['Indus', 'Ganges', 'Huang', 'Yangtze', 'Chang Jiang', 'Mekong'],
  ...['Danube', 'Donau', 'Bratul Chillia', 'Bratul Sulina', 'Bratul Sfintu Gheorghe'],
  ...['Rhine', 'Rhein', 'Rhin', 'Waal', 'Volga', 'Mississippi', 'Congo', 'Niger'],
  ...['Amazonas', 'Madeira', 'Xingu', 'Tapajós'],
].map((name) => ({ name }));
RIVERS.push({ name: 'Negro', box: AMAZON_BASIN });
const MAX_LAKE_RANK = 4;
const MIN_LAKE_KM2 = 3000;

const args = process.argv.slice(2);
const useFixture = args.includes('--fixture');
const maxLevelArg = args.indexOf('--max-level');
const maxLevel = maxLevelArg >= 0 ? Number(args[maxLevelArg + 1]) : 6;

function fail(message: string): never {
  console.error(`build-data: ${message}`);
  process.exit(1);
}

function log(message: string): void {
  console.log(`build-data: ${message}`);
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
const watch = buildWatchTable(continuousYear(TIMELINE_START), continuousYear(cutoffDay));
const windows: number[] = [];
for (let s = 0; s < totalSeconds(watch); s += WINDOW_SECONDS) {
  windows.push(
    s === 0 ? TIMELINE_START : Math.floor(dayFromContinuousYear(yearAtSeconds(watch, s))),
  );
}
log(`${windows.length} time windows of ${WINDOW_SECONDS / 60} min`);

// --- Eras -----------------------------------------------------------------

const eras = JSON.parse(readFileSync(join(ROOT, 'data/curated/eras.json'), 'utf8')) as CuratedEras;
const eraErrors = validateEras(eras, TIMELINE_START, cutoffDay);
if (eraErrors.length) fail(eraErrors.join('\n'));

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
const mapErrors = [...validateStraits(straits.straits), ...validateIslands(keptIslands.islands)];
if (mapErrors.length) fail(mapErrors.join('\n'));

// Islands are edited on today's coastline before anything else (section 4.2).
const islands = enlargeIslands(source, keptIslands.islands);
const elevation = blendPolar(
  smoothElevation(source, SMOOTHING_KM),
  smoothElevation(source, POLAR_SMOOTHING_KM),
);
log(
  `elevation grid ${elevation.width} × ${elevation.height}, smoothed ${SMOOTHING_KM} km, ` +
    `${islands.removed} small islands removed, ${islands.grown} enlarged`,
);
const pyramid = new GridPyramid(elevation);

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
  const spacingKm = ((90 / (1 << level)) * 111.32) / TILE_N;
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
const iceYears = iceStepYears(TIMELINE_START);
const iceDays = iceYears.map(sliceDay); // ascending, as the years descend
const ice = newLayer();
let iceChunks = 0;
for (const key of iceTileKeys()) {
  const { lats, lons } = iceTilePoints(key);
  const samples = iceYears.map((bp) =>
    iceThickness(iceStack, lats, lons, bp, {
      bed: (lat, lon) => Math.max(0, elevation.bilinear(lat, lon)),
      weight: polarWeight,
    }),
  );
  const dryness = iceYears.map((bp) => aridity(precipitation, lats, lons, bp));
  for (const [w, chunk] of iceChunksForTile(key, iceDays, samples, dryness, windows, cutoffDay)) {
    const path = tilePath(key);
    place(ice, key).chunks[chunkKey(path, String(w), 'xx')] = output.write(
      `ice/${path}/${w}`,
      'bin',
      encodeIceChunk(chunk),
    );
    iceChunks++;
  }
}
log(
  `${iceChunks} ice chunks from ${iceYears.length} steps; lowest sea level ${Math.min(...seaLevel.metres)} m`,
);

// --- Index and manifest ---------------------------------------------------------

const sources: SourceInfo[] = registry.sources
  .filter((s) => !(fixture && s.id === 'etopo-2022'))
  .map((s) => ({ id: s.id, title: s.title, licence: s.licence, citation: s.citation, url: s.url }));

const index = {} as Record<Language, string>;
for (const language of LANGUAGES) {
  const idx: StartupIndex = {
    language,
    ...erasForLanguage(eras, language, TIMELINE_START, cutoffDay),
    watchTable: watch,
    seaLevel,
    iceSlices: iceDays,
    regions: regionGrid(),
    sources,
    events: [],
    people: [],
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
  layers: {
    terrain: finishLayer('terrain', terrain, 0, maxLevel, false),
    ice: finishLayer('ice', ice, 3, 3, true),
  },
};
output.writeNamed('manifest.json', new TextEncoder().encode(JSON.stringify(manifest)));

const mb = (n: number) => (n / 1e6).toFixed(1);
log(
  `${output.files} files, ${mb(output.rawBytes)} MB raw, ${mb(output.compressedBytes)} MB Brotli → ${OUT}`,
);
for (const language of LANGUAGES)
  log(`index ${language}: ${(output.sizes.get(index[language])! / 1000).toFixed(0)} KB Brotli`);
