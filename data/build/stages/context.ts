// What every stage of the data build shares (spec milestone 1, section 10):
// the options, the checked source files, the curated inputs, the timeline,
// the output and the log.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TIME_WINDOWS } from '../../../app/src/content/formats.ts';
import { DATA_MAX_LEVEL } from '../../../app/src/geo/cube.ts';
import { TIMELINE_START, dayFromDate } from '../../../app/src/time/calendar.ts';
import { dayAtPosition, logAxis } from '../../../app/src/time/axis.ts';
import { checkLicences, type SourceEntry } from '../lib/licence.ts';
import type { Output } from '../lib/output.ts';

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
  /** A file under data/curated, parsed as JSON. */
  curated<T>(name: string): T;
}

/** The context of the stages that write files, once the inputs are valid. */
export interface WriteContext extends BuildContext {
  output: Output;
}

export function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function fail(message: string): never {
  console.error(`build-data: ${message}`);
  process.exit(1);
}

/** Reads the options, checks the sources and their licences, and lays out the timeline. */
export function createContext(args: string[]): BuildContext {
  const useFixture = args.includes('--fixture');
  const maxLevelArg = args.indexOf('--max-level');
  const maxLevel = maxLevelArg >= 0 ? Number(args[maxLevelArg + 1]) : DATA_MAX_LEVEL;

  const started = performance.now();
  /** Logs a step with the seconds since the build started, so slow stages show. */
  const log = (message: string) => {
    const s = ((performance.now() - started) / 1000).toFixed(1).padStart(5);
    console.log(`build-data ${s}s: ${message}`);
  };
  const curated = <T>(name: string) =>
    JSON.parse(readFileSync(join(ROOT, 'data/curated', name), 'utf8')) as T;

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

  // Time windows of equal width on the log timeline axis.
  const release = curated<{ version: string; cutoffDate: string }>('release.json');
  const [cy, cm, cd] = release.cutoffDate.split('-').map(Number) as [number, number, number];
  const cutoffDay = dayFromDate(cy, cm, cd);
  const axis = logAxis(TIMELINE_START, cutoffDay);
  const windows: number[] = [];
  for (let i = 0; i < TIME_WINDOWS; i++)
    windows.push(i === 0 ? TIMELINE_START : Math.floor(dayAtPosition(axis, i / TIME_WINDOWS)));
  log(`${windows.length} time windows on the log timeline axis`);

  return {
    fixture,
    maxLevel,
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
