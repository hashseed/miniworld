// Offline data build (spec milestone 1, section 10): reads only from
// data/sources and data/curated, validates everything, and writes the
// manifest, the startup index per language and content-hashed chunks to
// app/public/data.
//
// Usage: node data/build/build-data.ts [--fixture] [--max-level N]

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeIceChunk, encodeTerrainTile } from '../../app/src/content/formats.ts';
import {
  chunkKey,
  type Manifest,
  type StartupIndex,
  type SourceInfo,
} from '../../app/src/content/types.ts';
import { ancestorAt, tilePath, type TileKey } from '../../app/src/globe/cube.ts';
import { LANGUAGES, type Language } from '../../app/src/i18n/messages.ts';
import { TIMELINE_START, continuousYear, dayFromDate } from '../../app/src/time/calendar.ts';
import { buildWatchTable, yearAtSeconds, totalSeconds } from '../../app/src/time/watchTable.ts';
import { dayFromContinuousYear } from '../../app/src/time/calendar.ts';
import { erasForLanguage, validateEras, type CuratedEras } from './lib/eras.ts';
import { fixtureElevation } from './lib/fixture.ts';
import { Grid, GridPyramid, type GridData } from './lib/grid.ts';
import {
  DesertField,
  IceField,
  iceChunksForTile,
  iceStepYears,
  iceTileKeys,
  iceTilePoints,
  seaLevelCurve,
  sliceDay,
  validateDesertModel,
  validateIceModel,
  type DesertModel,
  type IceAgeModel,
} from './lib/ice.ts';
import { checkLicences, type SourceEntry } from './lib/licence.ts';
import { floodInlandSeas, INLAND_SEAS, oceanConnection } from './lib/ocean.ts';
import { Output } from './lib/output.ts';
import { readEtopo } from './lib/readers.ts';
import { enlargeIslands, smoothElevation } from './lib/simplify.ts';
import { regionGrid } from './lib/regions.ts';
import { allTileKeys, buildTerrainTile, isDeepTile } from './lib/terrain.ts';
import { NO_LAKE, rasterizeLakes, rasterizeRivers } from './lib/water.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const SOURCES = join(ROOT, 'data/sources');
const OUT = join(ROOT, 'app/public/data');

/** Watching seconds per content time window (spec milestone 1, section 10.3). */
export const WINDOW_SECONDS = 600;
const PART_LEVEL = 2;
/** Simplified map (spec milestone 1, section 4.2). */
const SMOOTHING_KM = 25;
// Only the major rivers (decided by Yang on 2026-10-17): Natural Earth scale
// rank 3 or lower, plus the Tigris and Rhine, which history needs.
const MAX_RIVER_RANK = 3;
const EXTRA_RIVERS = new Set(['Tigris', 'Dicle', 'Rhine', 'Rhein', 'Rhin', 'Waal']);
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
  : await readEtopo(sourceFiles('etopo-2022')[0]!);
// The map is simplified (spec milestone 1, section 4.2): 2 arc-minutes is
// plenty under a 25 km smoothing and keeps the build's memory in bounds.
while (source.width > 10800) {
  const m = source.downsampleMean();
  source = new Grid(m.width, m.height, Int16Array.from(m.data, Math.round));
}
const elevation = smoothElevation(source, SMOOTHING_KM);
const islands = enlargeIslands(elevation);
log(
  `elevation grid ${elevation.width} × ${elevation.height}, smoothed ${SMOOTHING_KM} km, ${islands} islands enlarged`,
);
const pyramid = new GridPyramid(elevation);

// The ocean mask runs on a grid of about 2 arc-minutes, using the minimum of
// each block so narrow straits stay open.
let conn: Grid<GridData> = elevation;
while (conn.width > 10800) conn = downsampleMin(conn);
log(`ocean mask grid ${conn.width} × ${conn.height}`);
const ocean = new Grid(conn.width, conn.height, oceanConnection(conn));

const lakeLevel = new Grid(
  conn.width,
  conn.height,
  new Int16Array(conn.width * conn.height).fill(NO_LAKE),
);
const lakes = rasterizeLakes(
  conn,
  neFile('ne_10m_lakes.geojson'),
  lakeLevel.data,
  MAX_LAKE_RANK,
  MIN_LAKE_KM2,
);
floodInlandSeas(conn, INLAND_SEAS, (i, level) => (lakeLevel.data[i] = level));
const rivers = new Grid(conn.width, conn.height, new Uint8Array(conn.width * conn.height));
const riverCount = rasterizeRivers(
  conn,
  neFile('ne_10m_rivers_lake_centerlines.geojson'),
  rivers.data,
  MAX_RIVER_RANK,
  EXTRA_RIVERS,
);
log(`${lakes} lakes, ${riverCount} river lines`);

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

const terrain = newLayer();
let tileCount = 0;
for (const key of allTileKeys(maxLevel)) {
  const tile = buildTerrainTile(key, { heights: pyramid, ocean, lakeLevel, rivers });
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

const iceModel = JSON.parse(
  readFileSync(join(ROOT, 'data/curated/ice-age.json'), 'utf8'),
) as IceAgeModel;
const desertModel = JSON.parse(
  readFileSync(join(ROOT, 'data/curated/deserts.json'), 'utf8'),
) as DesertModel;
const iceErrors = [...validateIceModel(iceModel), ...validateDesertModel(desertModel)];
if (iceErrors.length) fail(iceErrors.join('\n'));
const seaLevel = seaLevelCurve(iceModel, TIMELINE_START, cutoffDay);
const iceYears = iceStepYears(TIMELINE_START);
const iceDays = iceYears.map(sliceDay); // ascending, as the years descend
const bed = (lat: number, lon: number) => elevation.bilinear(lat, lon);
const ice = newLayer();
let iceChunks = 0;
for (const key of iceTileKeys()) {
  const { lats, lons } = iceTilePoints(key);
  const field = new IceField(iceModel, lats, lons, bed);
  const samples = iceYears.map((bp) => field.thickness(bp));
  const deserts = new DesertField(desertModel, lats, lons);
  const aridity = iceYears.map((bp) => deserts.aridity(bp));
  for (const [w, chunk] of iceChunksForTile(key, iceDays, samples, aridity, windows, cutoffDay)) {
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
  `${iceChunks} ice chunks from ${iceYears.length} model steps; lowest sea level ${Math.min(...seaLevel.metres)} m`,
);

// --- Index and manifest ---------------------------------------------------------

const sources: SourceInfo[] = registry.sources
  .filter((s) => (fixture ? s.id === 'natural-earth' : true))
  .map((s) => ({ id: s.id, title: s.title, licence: s.licence, citation: s.citation, url: s.url }))
  .concat(
    Object.entries({ ...iceModel.sources, ...desertModel.sources }).map(([id, r]) => ({
      id,
      title: r.title,
      licence: 'reference',
      citation: `${r.publisher}: ${r.title} (reference for the rough ice-age and desert models)`,
      url: r.url,
    })),
  );

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

function downsampleMin(g: Grid<GridData>): Grid<Int16Array> {
  const w = g.width >> 1;
  const h = g.height >> 1;
  const out = new Int16Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const i = 2 * r * g.width + 2 * c;
      out[r * w + c] = Math.min(
        g.data[i]!,
        g.data[i + 1]!,
        g.data[i + g.width]!,
        g.data[i + g.width + 1]!,
      );
    }
  return new Grid(w, h, out);
}
