// Builds the data the geo-history app loads (geo-history.md, sections 4 to 6):
// the simplified plate model and the curated tables, validated, in one object.
// Reads only from data/sources and data/packs/geo-history/curated.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCoasts } from './coasts.ts';
import { checkLicences, type SourceEntry } from '../../../build/lib/licence.ts';
import {
  climateTable,
  momentsTable,
  periodsTable,
  sourcesTable,
  supercontinentsTable,
} from '../schema/curated.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const CURATED = join(ROOT, 'data/packs/geo-history/curated');

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export interface GeoData {
  version: string;
  /** Rows [plate, age, pole lat, pole lon, angle, fixed plate]. */
  rotations: number[][];
  land: { plate: number; begin: number; end: number; rings: number[][] }[];
  boundaries: {
    kind: 'ridge' | 'subduction' | 'transform';
    plate: number;
    begin: number;
    end: number;
    left?: number;
    right?: number;
    at?: number;
    side?: 'L' | 'R' | 'U';
    lines: number[][];
  }[];
  /** Today's coastlines, each piece moving with a plate: { plate, line: [lat, lon, ...] }. */
  coasts: { plate: number; line: number[] }[];
  periods: unknown[];
  supercontinents: unknown[];
  moments: unknown[];
  climate: { lat: number; colour: string }[];
  /** Attribution for the About panel. */
  credits: { id: string; citation: string; licence: string }[];
}

export function buildGeoData(): GeoData {
  const sources = (
    json(join(ROOT, 'data/sources.json')) as { sources: (SourceEntry & { pack?: string })[] }
  ).sources;
  const mine = sources.filter((s) => s.pack === 'geo-history');
  const problems = checkLicences(mine);
  // The extracts must be the ones whose checksums are recorded.
  for (const s of mine)
    for (const f of s.files) {
      const sum = createHash('sha256')
        .update(readFileSync(join(ROOT, 'data/sources', s.id, f.path)))
        .digest('hex');
      if (sum !== f.sha256)
        problems.push(`${s.id}/${f.path}: checksum differs from data/sources.json`);
    }

  const bib = sourcesTable.parse(json(join(CURATED, 'sources.json')));
  const known = new Set(bib.sources.map((s) => s.id));
  const periods = periodsTable.parse(json(join(CURATED, 'periods.json')));
  const supers = supercontinentsTable.parse(json(join(CURATED, 'supercontinents.json')));
  const climate = climateTable.parse(json(join(CURATED, 'climate-bands.json')));
  const moments = momentsTable.parse(json(join(CURATED, 'moments.json')));
  const named = [
    periods.source,
    ...supers.supercontinents.flatMap((s) => s.sources),
    ...climate.sources,
    ...moments.moments.flatMap((m) => m.sources),
  ];
  for (const id of named)
    if (!known.has(id)) problems.push(`source "${id}" is not in sources.json of the pack`);
  const ids = moments.moments.map((m) => m.id);
  if (new Set(ids).size !== ids.length) problems.push('moment ids are not unique');
  if (problems.length) throw new Error(`geo-history data: ${problems.join('; ')}`);

  const rotations = json(join(ROOT, 'data/sources/merdith-2021/rotations.json')) as number[][];
  const land = json(join(ROOT, 'data/sources/merdith-2021/land.json')) as GeoData['land'];
  const boundaries = json(
    join(ROOT, 'data/sources/merdith-2021/boundaries.json'),
  ) as GeoData['boundaries'];
  const coasts = buildCoasts(
    json(join(ROOT, 'data/sources/natural-earth/ne_10m_land.geojson')) as Parameters<
      typeof buildCoasts
    >[0],
    land,
  );
  const used = new Set([...named, 'merdith-2021']);
  const credits = bib.sources
    .filter((s) => used.has(s.id))
    .map((s) => ({
      id: s.id,
      citation: s.citation,
      licence: s.id === 'merdith-2021' ? 'CC BY 4.0' : '',
    }));
  const data: GeoData = {
    version: '',
    rotations,
    land,
    boundaries,
    coasts,
    periods: periods.periods,
    supercontinents: supers.supercontinents,
    moments: moments.moments,
    climate: climate.stops.map((s) => ({ lat: s.lat, colour: s.colour })),
    credits,
  };
  data.version = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 12);
  return data;
}
