// Turns the original source downloads in data/out/<id>/ into the small
// simplified extracts kept under data/sources/<id>/ (spec milestone 1,
// section 2.2), and records their checksums in data/sources.json. Run after
// npm run fetch-data, only when adding or updating a source.
//
// Usage: node data/build/simplify-data.ts [source-id ...]

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import h5wasm, { type Dataset } from 'h5wasm/node';
import { writeExtract, type ExtractHeader } from './lib/extract.ts';
import { Grid } from './lib/grid.ts';
import { readEtopo } from './lib/readers.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SOURCES_JSON = join(ROOT, 'data/sources.json');

// The timeline starts at 70,000 BCE (71,950 years before 1950): keep every
// layer from the last one at or before that onwards.
const OLDEST_BP = 71_950;

interface Entry {
  id: string;
  files: { path: string; sha256: string; bytes: number }[];
}

function original(id: string, file: string): string {
  const path = join(ROOT, 'data/out', id, file);
  if (!existsSync(path)) throw new Error(`${path} is missing; run npm run fetch-data ${id}`);
  return path;
}

function outDir(id: string): string {
  const dir = join(ROOT, 'data/sources', id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Index of the first layer to keep from times in years before present, oldest first. */
function firstKept(yearsBP: number[]): number {
  let first = 0;
  for (let i = 0; i < yearsBP.length; i++) if (yearsBP[i]! >= OLDEST_BP) first = i;
  return first;
}

function numbers(ds: Dataset): number[] {
  return Array.from(ds.value as ArrayLike<number>, Number);
}

/** One time layer of a (time, lat, lon) dataset with latitude running south to north. */
function layer(ds: Dataset, t: number): Float32Array | Float64Array {
  return ds.slice([[t, t + 1]]) as Float32Array | Float64Array;
}

// --- ETOPO 2022: elevation averaged to 4 arc-minutes --------------------------

async function etopo(): Promise<string[]> {
  let grid: Grid = await readEtopo(original('etopo-2022', 'ETOPO_2022_v1_60s_N90W180_bed.tif'));
  // The map is simplified and smoothed by about 40 km (spec milestone 1,
  // section 4.2), so 4 arc-minutes (about 7 km) keeps every shape it shows.
  while (grid.width > 5400) {
    const m = grid.downsampleMean();
    grid = new Grid(m.width, m.height, Int16Array.from(m.data, Math.round));
  }
  const header: ExtractHeader = {
    source: 'etopo-2022',
    variable: 'elevation',
    description:
      'Bedrock elevation and sea floor depth relative to today’s sea level, mean of each cell',
    units: 'm',
    type: 'int16',
    scale: 1,
    width: grid.width,
    height: grid.height,
    registration: 'cell',
    west: -180,
    north: 90,
    cellDegrees: 360 / grid.width,
  };
  writeExtract(join(outDir('etopo-2022'), 'elevation'), header, grid.data);
  return ['elevation.json', 'elevation.bin.br'];
}

// --- PaleoMIST 1.0: grounded ice thickness and sea level every 2,500 years ----

async function paleomist(): Promise<string[]> {
  const file = new h5wasm.File(original('paleomist-1.0', 'reconstruction_0.25_degree.nc'), 'r');
  const years = numbers(file.get('time') as Dataset).map((t) => -t); // years since 1950 → BP
  const lat = numbers(file.get('lat') as Dataset);
  const lon = numbers(file.get('lon') as Dataset);
  if (lat[0] !== -90 || lat.at(-1) !== 90 || lon[0] !== -180 || lon.at(-1) !== 180)
    throw new Error('paleomist-1.0: unexpected grid');
  const first = firstKept(years);
  const kept = years.slice(first);
  // Point samples from -180 to 180 inclusive: drop the repeated 180° column and
  // store rows north to south.
  const width = lon.length - 1;
  const height = lat.length;
  const files: string[] = [];
  for (const [variable, description, clampZero] of [
    ['ice_thickness', 'Grounded ice thickness', true],
    [
      'sea_level',
      'Relative sea level change from today, including deformation of the Earth',
      false,
    ],
  ] as const) {
    const ds = file.get(variable) as Dataset;
    const out = new Int16Array(kept.length * width * height);
    kept.forEach((_, k) => {
      const src = layer(ds, first + k);
      for (let r = 0; r < height; r++) {
        const srcRow = (height - 1 - r) * lon.length;
        for (let c = 0; c < width; c++) {
          let v = src[srcRow + c]!;
          if (Number.isNaN(v)) v = 0;
          if (clampZero && v < 0) v = 0;
          out[(k * height + r) * width + c] = Math.round(v);
        }
      }
    });
    const header: ExtractHeader = {
      source: 'paleomist-1.0',
      variable,
      description,
      units: 'm',
      type: 'int16',
      scale: 1,
      width,
      height,
      registration: 'node',
      west: -180,
      north: 90,
      cellDegrees: 0.25,
      yearsBP: kept,
    };
    writeExtract(join(outDir('paleomist-1.0'), variable), header, out);
    files.push(`${variable}.json`, `${variable}.bin.br`);
  }
  file.close();
  return files;
}

// --- Beyer 2020: biomes, annual temperature and precipitation -----------------

async function beyer(): Promise<string[]> {
  const file = new h5wasm.File(original('beyer-2020', 'LateQuaternary_Environment.nc'), 'r');
  const years = numbers(file.get('time') as Dataset).map((t) => -t);
  const lat = numbers(file.get('latitude') as Dataset);
  const lon = numbers(file.get('longitude') as Dataset);
  if (lat[0] !== -59.75 || lat.at(-1) !== 89.75 || lon[0] !== -179.75)
    throw new Error('beyer-2020: unexpected grid');
  const first = firstKept(years);
  const kept = years.slice(first);
  const width = lon.length;
  const height = lat.length;
  const files: string[] = [];
  const vars = [
    ['biome', 'BIOME4 biome class (land only)', '', 'uint8', 1, 255],
    ['BIO1', 'Annual mean temperature (land only)', '°C', 'int16', 0.1, -32768],
    ['BIO12', 'Annual precipitation (land only)', 'mm', 'int16', 1, -32768],
  ] as const;
  for (const [variable, description, units, type, scale, nodata] of vars) {
    const ds = file.get(variable) as Dataset;
    const out =
      type === 'uint8'
        ? new Uint8Array(kept.length * width * height)
        : new Int16Array(kept.length * width * height);
    kept.forEach((_, k) => {
      const src = layer(ds, first + k);
      for (let r = 0; r < height; r++) {
        const srcRow = (height - 1 - r) * width;
        for (let c = 0; c < width; c++) {
          const v = src[srcRow + c]!;
          out[(k * height + r) * width + c] = Number.isNaN(v) ? nodata : Math.round(v / scale);
        }
      }
    });
    const header: ExtractHeader = {
      source: 'beyer-2020',
      variable,
      description,
      units,
      type,
      scale,
      nodata,
      width,
      height,
      registration: 'cell',
      west: -180,
      north: 90,
      cellDegrees: 0.5,
      yearsBP: kept,
    };
    writeExtract(join(outDir('beyer-2020'), variable), header, out);
    files.push(`${variable}.json`, `${variable}.bin.br`);
  }
  file.close();
  return files;
}

// --- Natural Earth: the used vector layers, unchanged ------------------------

async function naturalEarth(): Promise<string[]> {
  const files = [
    'ne_10m_lakes.geojson',
    'ne_10m_rivers_lake_centerlines.geojson',
    'ne_10m_land.geojson',
  ];
  for (const f of files)
    copyFileSync(original('natural-earth', f), join(outDir('natural-earth'), f));
  return files;
}

// --- Reba, Reitsma and Seto 2016: every city with its first dated population ---------

/** A row of a CSV file: fields split on commas outside double quotes. */
function csvRow(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}

/** A column such as BC_2250 or AD_100 as an astronomical year (1 BCE is 0). */
const yearOf = (column: string): number | undefined => {
  const m = /^(BC|AD)_(\d+)$/.exec(column);
  if (!m) return undefined;
  return m[1] === 'BC' ? 1 - Number(m[2]) : Number(m[2]);
};

async function reba(): Promise<string[]> {
  type City = {
    name: string;
    country: string;
    lat: number;
    lon: number;
    certainty: number;
    first: number;
    firstPop: number;
  };
  const cities: City[] = [];
  for (const file of ['modelskiAncientV2.csv', 'chandlerV2.csv', 'modelskiModernV2.csv']) {
    const text = new TextDecoder('windows-1252').decode(readFileSync(original('reba-2016', file)));
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const head = csvRow(lines[0]!);
    const years = head.map(yearOf);
    for (const line of lines.slice(1)) {
      const row = csvRow(line);
      const lat = Number(row[3]);
      const lon = Number(row[4]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
      let first: number | undefined;
      let firstPop = 0;
      row.forEach((v, i) => {
        const y = years[i];
        if (y === undefined || v.trim() === '' || !(Number(v) > 0)) return;
        if (first === undefined || y < first) [first, firstPop] = [y, Number(v)];
      });
      if (first === undefined) continue;
      const city = {
        name: row[0]!.trim(),
        country: row[2]!.trim(),
        lat,
        lon,
        certainty: Number(row[5]) || 3,
        first,
        firstPop,
      };
      // The same city in two files: one entry, its earliest date.
      const same = cities.find(
        (c) => c.name === city.name && Math.abs(c.lat - lat) < 0.2 && Math.abs(c.lon - lon) < 0.2,
      );
      if (!same) cities.push(city);
      else if (city.first < same.first)
        Object.assign(same, { first: city.first, firstPop: city.firstPop });
    }
  }
  cities.sort((a, b) => a.first - b.first || a.name.localeCompare(b.name));
  const dir = outDir('reba-2016');
  writeFileSync(
    join(dir, 'cities.json'),
    `${JSON.stringify(
      {
        description:
          'Every geocoded city of the three files, once, with the astronomical year of its first dated population (first, 1 BCE is 0) and that population (firstPop), its certainty (1 to 3, 1 the surest) and position in degrees.',
        cities: cities.map((c) => ({
          ...c,
          lat: Math.round(c.lat * 1e4) / 1e4,
          lon: Math.round(c.lon * 1e4) / 1e4,
        })),
      },
      null,
      0,
    )}\n`,
  );
  return ['cities.json'];
}

// --- Main -------------------------------------------------------------------

const SIMPLIFIERS: Record<string, () => Promise<string[]>> = {
  'natural-earth': naturalEarth,
  'etopo-2022': etopo,
  'paleomist-1.0': paleomist,
  'beyer-2020': beyer,
  'reba-2016': reba,
};

function checksum(path: string): { sha256: string; bytes: number } {
  const data = readFileSync(path);
  return { sha256: createHash('sha256').update(data).digest('hex'), bytes: statSync(path).size };
}

await h5wasm.ready;
const only = process.argv.slice(2);
const doc = JSON.parse(readFileSync(SOURCES_JSON, 'utf8')) as { sources: Entry[] };
for (const src of doc.sources) {
  const simplify = SIMPLIFIERS[src.id];
  if (!simplify || (only.length && !only.includes(src.id))) continue;
  const made = await simplify();
  const dir = join(ROOT, 'data/sources', src.id);
  const keep = ['LICENSE.md', ...made];
  src.files = keep
    .filter((p) => existsSync(join(dir, p)))
    .map((p) => ({ path: p, ...checksum(join(dir, p)) }));
  for (const f of src.files)
    console.log(`simplify-data: ${src.id}/${f.path} ${(f.bytes / 1e6).toFixed(1)} MB`);
}
writeFileSync(SOURCES_JSON, `${JSON.stringify(doc, null, 2)}\n`);
console.log('simplify-data: updated data/sources.json');
