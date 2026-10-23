// Farming onset stage of the data build (spec neolithic/farming-spread.md): the wave of
// advance from the centres and waypoints over a 0.5 degree grid, checked against the
// waypoints, written as one binary file the app looks onsets up in.

import { OCEAN_MIN_LEVEL, OCEAN_NEVER } from '../../../app/src/content/formats.ts';
import { dayOfFarmingYear, type FarmingSeedInfo } from '../../../app/src/world/farmingOnset.ts';
import {
  checkFarming,
  computeFarming,
  encodeFarming,
  type Box,
  type FarmingInput,
  type FarmingSeed,
  type FarmingZone,
} from '../lib/farming.ts';
import { climateHabitat } from '../lib/habitat.ts';
import type { Climate } from './climate.ts';
import type { WriteContext } from './context.ts';
import type { WorldMap } from './terrain.ts';

/** The year the coast is judged by: the sea of the middle of the wave's first millennia. */
const LAND_YEAR_BCE = 6000;
/** Farmers need an annual mean of at least this, the coldest limit of the farmer profiles. */
const COLDEST_C = -5;
const KOPPEN_DRY_MM_PER_C = 10;
const KOPPEN_DRY_MM = 140;
/** Higher ground than this has no farmers, except on the plateaus below (peopling.md section 5.2). */
const HIGHEST_M = 3500;
const HIGHEST_PLATEAU_M = 4800;
const PLATEAUS: Box[] = [
  // The Andes and the altiplano.
  { lat: [-40, 10], lon: [-82, -60] },
  // The Tibetan Plateau.
  { lat: [27, 37], lon: [78, 103] },
];

interface CentreFile {
  id: string;
  package: { en: string; de: string };
  source: string;
  /** When the package starts to spread, if later than the centre's date; needs a note. */
  spreadBce?: number;
  spreadNote?: string;
}

interface FarmingFile {
  speeds: {
    seaMaxHopKm: { value: number };
    zones: (FarmingZone & { range?: number[]; source: string })[];
    default: { kmPerYear: number };
  };
  holds: { id: string; box: Box; notBeforeBce: number; source: string }[];
  noFarming: { id: string; box: Box; source: string }[];
  barriers: { id: string; box: Box; source: string }[];
  centres: CentreFile[];
  waypoints: {
    id: string;
    bce: number;
    lat: number;
    lon: number;
    en: string;
    de: string;
    package: { en: string; de: string };
    source: string;
    approximate?: boolean;
    herdingOnly?: boolean;
    toleranceYears: number;
  }[];
}

/** The curated records, checked: the first build check of farming-spread.md section 6. */
export function readFarming(
  file: FarmingFile,
  thresholds: { id: string; bce: number; lat: number; lon: number; en: string; de: string }[],
): {
  input: Omit<FarmingInput, 'land' | 'habitable'>;
  infos: FarmingSeedInfo[];
  tolerance: Map<string, number>;
  errors: string[];
} {
  const errors: string[] = [];
  const bad = (lat: number, lon: number) =>
    !(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || Number.isNaN(lat + lon);
  const seeds: FarmingSeed[] = [];
  const infos: FarmingSeedInfo[] = [];
  const tolerance = new Map<string, number>();
  for (const t of thresholds) {
    const c = file.centres.find((x) => x.id === t.id);
    if (!c?.package.en || !c.package.de || !c.source)
      errors.push(`farming.json: centre ${t.id} needs a package (en, de) and a source`);
    if (c?.spreadBce !== undefined && (!c.spreadNote || c.spreadBce > t.bce))
      errors.push(
        `farming.json: centre ${t.id} spreadBce must be later than its date and have a spreadNote`,
      );
    seeds.push({
      id: t.id,
      bce: t.bce,
      lat: t.lat,
      lon: t.lon,
      kind: 'centre',
      ...(c?.spreadBce !== undefined ? { spreadBce: c.spreadBce } : {}),
    });
    infos.push({
      id: t.id,
      bce: t.bce,
      approximate: true,
      herdingOnly: false,
      en: t.en,
      de: t.de,
      package: c?.package ?? { en: '', de: '' },
    });
  }
  for (const w of file.waypoints) {
    if (
      !w.id ||
      !w.en ||
      !w.de ||
      !w.source ||
      !w.package?.en ||
      !w.package?.de ||
      bad(w.lat, w.lon)
    )
      errors.push(
        `farming.json: waypoint ${w.id || '(no id)'} needs en, de, a package, a source and a place`,
      );
    if (!(w.toleranceYears > 0))
      errors.push(`farming.json: waypoint ${w.id} needs a toleranceYears`);
    // A date beyond 300 years of tolerance is, by the spec, an uncertain one.
    if (w.toleranceYears >= 300 && !w.approximate)
      errors.push(
        `farming.json: waypoint ${w.id} has a wide tolerance but is not marked approximate`,
      );
    seeds.push({
      id: w.id,
      bce: w.bce,
      lat: w.lat,
      lon: w.lon,
      kind: 'waypoint',
      ...(w.herdingOnly ? { herdingOnly: true } : {}),
    });
    tolerance.set(w.id, w.toleranceYears);
    infos.push({
      id: w.id,
      bce: w.bce,
      approximate: w.approximate === true,
      herdingOnly: w.herdingOnly === true,
      en: w.en,
      de: w.de,
      package: w.package,
    });
  }
  if (new Set(seeds.map((s) => s.id)).size !== seeds.length)
    errors.push('farming.json: seed ids must be unique');
  return {
    input: {
      seeds,
      zones: file.speeds.zones,
      defaultKmPerYear: file.speeds.default.kmPerYear,
      seaMaxHopKm: file.speeds.seaMaxHopKm.value,
      holds: file.holds,
      noFarming: file.noFarming,
      barriers: file.barriers,
    },
    infos,
    tolerance,
    errors,
  };
}

/** Builds the raster; returns its file name, or undefined on the fixture map. */
export function buildFarming(
  ctx: WriteContext,
  map: WorldMap,
  climate: Climate,
): string | undefined {
  const { log, fail } = ctx;
  if (ctx.fixture) {
    log('farming onset skipped on the fixture map');
    return undefined;
  }
  const file = ctx.curated<FarmingFile>('farming.json');
  const { thresholds } = ctx.curated<{
    thresholds: { id: string; bce: number; lat: number; lon: number; en: string; de: string }[];
  }>('neolithic.json');
  const read = readFarming(file, thresholds);
  if (read.errors.length) fail(read.errors.join('\n'));
  const { connection, lakes, elevation } = map;
  const level = climate.seaLevelAt(dayOfFarmingYear(LAND_YEAR_BCE));
  const isLand = (lat: number, lon: number) => {
    const v = connection.nearest(lat, lon);
    return !(v !== OCEAN_NEVER && OCEAN_MIN_LEVEL + v <= level) && lakes.nearest(lat, lon) < 128;
  };
  const habitat = (highestM: number) =>
    climateHabitat({
      slices: climate.slices,
      isSea: () => false,
      isLake: () => false,
      isRiver: () => false,
      inRiver: () => false,
      elevation: (lat, lon) => elevation.bilinear(lat, lon),
      highestM,
      wetForItsWarmth: (lat, lon, day) => {
        const t = climate.temperatureAt(lat, lon, day);
        const mm = climate.precipitationAt(lat, lon, day);
        return t !== undefined && mm !== undefined && mm >= KOPPEN_DRY_MM_PER_C * t + KOPPEN_DRY_MM;
      },
    });
  const low = habitat(HIGHEST_M);
  const high = habitat(HIGHEST_PLATEAU_M);
  const D = 0.2;
  const input: FarmingInput = {
    ...read.input,
    land: (lat, lon) =>
      isLand(lat, lon) ||
      isLand(lat + D, lon) ||
      isLand(lat - D, lon) ||
      isLand(lat, lon + D) ||
      isLand(lat, lon - D),
    habitable: (lat, lon, bce) => {
      const day = dayOfFarmingYear(Math.round(bce));
      const t = climate.temperatureAt(lat, lon, day);
      if (t !== undefined && t < COLDEST_C) return false;
      const h = PLATEAUS.some(
        (b) => lat >= b.lat[0] && lat <= b.lat[1] && lon >= b.lon[0] && lon <= b.lon[1],
      )
        ? high
        : low;
      return h.habitable(lat, lon, day);
    },
  };
  const raster = computeFarming(input);
  const check = checkFarming(input, raster, read.tolerance);
  if (check.errors.length) fail(`farming onset:\n${check.errors.join('\n')}`);
  let cells = 0;
  for (const t of raster.onset) if (!Number.isNaN(t)) cells++;
  log(
    `farming onset: ${cells} cells, ${check.report.length} places earlier than the nearest waypoint by 500 years`,
  );
  for (const line of check.report.slice(0, 12)) log(`  ${line}`);
  return ctx.output.write('farming', 'bin', encodeFarming(raster, read.infos));
}

interface CentreRecord {
  id: string;
  bce: number;
  lat: number;
  lon: number;
  en: string;
  de: string;
}

const centresOf = (neolithicJson: string): CentreRecord[] =>
  (JSON.parse(neolithicJson) as { thresholds: CentreRecord[] }).thresholds;

/** The ids of the first-farming events: one per centre (farming-spread.md section 9.5). */
export const farmingEventIds = (neolithicJson: string): string[] =>
  centresOf(neolithicJson).map((c) => `farming-${c.id}`);

/** The first-farming events of the events dialog: where and when each centre starts. */
export function farmingEvents(neolithicJson: string): {
  id: string;
  kind: 'farming';
  title: { en: string; de: string };
  day: number;
  lat: number;
  lon: number;
  card: string;
}[] {
  return centresOf(neolithicJson).map((c) => ({
    id: `farming-${c.id}`,
    kind: 'farming' as const,
    title: { en: `First farming: ${c.en}`, de: `Erste Landwirtschaft: ${c.de}` },
    day: dayOfFarmingYear(c.bce),
    lat: c.lat,
    lon: c.lon,
    card: `farming-${c.id}`,
  }));
}
