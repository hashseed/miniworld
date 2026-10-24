// What every stage of the data build shares (spec milestone 1, section 10):
// the options, the checked source files, the curated inputs, the timeline,
// the output and the log.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { TIME_WINDOWS } from '../../../app/src/content/formats.ts';
import { DATA_MAX_LEVEL } from '../../../app/src/geo/cube.ts';
import { TIMELINE_END, TIMELINE_START, dayFromDate } from '../../../app/src/time/calendar.ts';
import { dayAtPosition } from '../../../app/src/time/axis.ts';
import { BuildCache, cacheKey } from '../lib/buildCache.ts';
import { checkLicences, type SourceEntry } from '../lib/licence.ts';
import type { Output } from '../lib/output.ts';
import { tableErrors, type Table, type TableName } from '../../schema/tables.ts';

export const ROOT = new URL('../../..', import.meta.url).pathname;
const SOURCES = join(ROOT, 'data/sources');

export interface BuildContext {
  /** Built from the synthetic test fixture, not for release. */
  fixture: boolean;
  maxLevel: number;
  release: { version: string; cutoffDate: string };
  registry: SourceEntry[];
  cutoffDay: number;
  /** First day of each content time window (section 10.3). */
  windows: number[];
  log(message: string): void;
  fail(message: string): never;
  /** The checked files of a registered source. */
  sourceFiles(id: string): string[];
  /** A Natural Earth file by its name. */
  neFile(name: string): string;
  /** A curated table under data/curated, parsed and checked against its schema (content-format.md section 1.1). */
  curated<N extends TableName>(name: N): Table<N>;
  /** The names of the curated files read through `curated` since the list was last cleared. */
  curatedReads: Set<string>;
  /** Caches are off (`--no-cache`, `--fresh`). */
  noCache: boolean;
  /**
   * The cache of the land: the map grids, the coarse coasts and the climate slices, kept
   * while the sources, the land's curated files, the build code that makes them and the
   * options stay the same (section 10). `--fresh` turns it off.
   */
  landCache: BuildCache;
}

/** The context of the stages that write files, once the inputs are valid. */
export interface WriteContext extends BuildContext {
  output: Output;
}

export function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** The curated files the land and its climate are made from (stages terrain and climate). */
const LAND_CURATED = [
  'straits.json',
  'islands.json',
  'removed-areas.json',
  'mountains.json',
  'humid-periods.json',
  'rivers.json',
  'inland-seas.json',
];

function fail(message: string): never {
  console.error(`build-data: ${message}`);
  process.exit(1);
}

/** Reads the options, checks the sources and their licences, and lays out the timeline. */
export function createContext(args: string[]): BuildContext {
  // `--clean` forgets every cache first; `--no-cache` (or `--fresh`) uses and writes none.
  const noCache = args.includes('--no-cache') || args.includes('--fresh');
  if (args.includes('--clean'))
    for (const d of ['cache', 'sites', 'stages', 'brotli'])
      rmSync(join(ROOT, 'data/out', d), { recursive: true, force: true });
  const useFixture = args.includes('--fixture');
  const maxLevelArg = args.indexOf('--max-level');
  const maxLevel = maxLevelArg >= 0 ? Number(args[maxLevelArg + 1]) : DATA_MAX_LEVEL;

  const started = performance.now();
  /** Logs a step with the seconds since the build started, so slow stages show. */
  const log = (message: string) => {
    const s = ((performance.now() - started) / 1000).toFixed(1).padStart(5);
    console.log(`build-data ${s}s: ${message}`);
  };
  const curatedReads = new Set<string>();
  const curated = <N extends TableName>(name: N): Table<N> => {
    curatedReads.add(name);
    const value: unknown = JSON.parse(readFileSync(join(ROOT, 'data/curated', name), 'utf8'));
    const errors = tableErrors(name, value);
    if (errors.length) fail(errors.join('\n'));
    return value as Table<N>;
  };

  // Sources and licences.
  const registry = (
    JSON.parse(readFileSync(join(ROOT, 'data/sources.json'), 'utf8')) as {
      sources: SourceEntry[];
    }
  ).sources;
  const licenceErrors = checkLicences(registry);
  if (licenceErrors.length) fail(licenceErrors.join('\n'));
  const byId = new Map(registry.map((s) => [s.id, s]));
  const sourceFiles = (id: string) => {
    const s = byId.get(id);
    if (!s) fail(`unknown source ${id}`);
    return s.files.map((f) => {
      const path = join(SOURCES, id, f.path);
      if (!existsSync(path)) fail(`${id}: missing ${f.path}; run npm run fetch-data`);
      if (sha256(path) !== f.sha256) fail(`${id}: checksum mismatch for ${f.path}`);
      return path;
    });
  };
  const natural = sourceFiles('natural-earth');
  const neFile = (name: string) =>
    natural.find((p) => p.endsWith(name)) ?? fail(`natural-earth: missing ${name}`);

  const realData = (byId.get('etopo-2022')?.files.length ?? 0) > 0;
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

  // Time windows of equal watching time (section 10.3).
  const release = curated('release.json');
  const [cy, cm, cd] = release.cutoffDate.split('-').map(Number) as [number, number, number];
  const cutoffDay = dayFromDate(cy, cm, cd);
  // The curve from watching to history time ends on the cutoff (spec section 2.1).
  if (cutoffDay !== TIMELINE_END)
    throw new Error('release.json: the cutoff moved; rerun scripts/time-curve.ts for the new end');
  const windows: number[] = [];
  for (let i = 0; i < TIME_WINDOWS; i++)
    windows.push(i === 0 ? TIMELINE_START : Math.floor(dayAtPosition(i / TIME_WINDOWS)));
  log(`${windows.length} time windows of equal watching time`);

  // Everything the land depends on: the sources, the land's curated files, the code.
  const code = (dir: string, skip: string[] = []) =>
    readdirSync(join(ROOT, dir))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !skip.includes(f))
      .sort()
      .map((f) => join(ROOT, dir, f));
  const landKey = cacheKey(
    [
      join(ROOT, 'data/sources.json'),
      ...LAND_CURATED.map((f) => join(ROOT, 'data/curated', f)),
      // The tree's own code and the sites' cache are left out: tuning the tree keeps the land.
      ...code('data/build/lib', [
        'humankind.ts',
        'cultureAreas.ts',
        'arrivals.ts',
        'treeReport.ts',
        'farming.ts',
      ]),
      join(ROOT, 'data/build/stages/terrain.ts'),
      join(ROOT, 'data/build/stages/climate.ts'),
      join(ROOT, 'data/build/stages/context.ts'),
      ...[
        'app/src/content',
        'app/src/core',
        'app/src/geo',
        'app/src/planet',
        'app/src/time',
      ].flatMap((d) => code(d)),
      join(ROOT, 'app/src/globe/foliageKinds.ts'),
    ],
    { fixture, maxLevel, cutoffDay },
  );
  const landCache = new BuildCache(join(ROOT, 'data/out/cache'), landKey, !noCache);
  if (landCache.on) log(`land cache ${landKey}`);

  return {
    fixture,
    maxLevel,
    landCache,
    noCache,
    curatedReads,
    release,
    registry,
    cutoffDay,
    windows,
    log,
    fail,
    sourceFiles,
    neFile,
    curated,
  };
}
