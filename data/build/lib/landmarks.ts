// Landmark records (spec milestone 2, section 8, and giza.md section 11):
// reads data/curated/landmarks/*.md, validates them, moves each group off the
// drawn rivers, lakes and sea, and compiles a structure file and a text file
// per language for the landmark layer.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'yaml';
import {
  LANDMARK_ASSETS,
  PYRAMIDS,
  RAMP_REACH,
  SPHINX_LENGTH,
  type LandmarkAssetId,
} from '../../../assets/src/landmarks.ts';
import type { Language } from '../../../app/src/i18n/messages.ts';
import {
  MINIATURE,
  type CompiledLandmark,
  type CompiledPart,
} from '../../../app/src/world/landmark.ts';
import {
  Errors,
  ICONS,
  isMap,
  num,
  parseDate,
  parseText,
  str,
  unknownFields,
  type LandmarkPartInfo,
  type VignetteText,
  type Yaml,
} from './vignettes.ts';

const RECORD_FIELDS = [
  'id',
  'kind',
  'when',
  'where',
  'region',
  'icon',
  'beacon',
  'debated',
  'parts',
  'build',
  'sources',
  'links',
];

const KM_PER_DEG = 111.32;
/** Step of the move off the water, in km (giza.md section 11.2). */
const SHIFT_STEP_KM = 1;
const MAX_SHIFT_KM = 300;

export interface BuiltLandmark {
  structure: CompiledLandmark;
  text: Record<Language, VignetteText>;
  regions: string[];
  fromApproximate: boolean;
  /** Parts a singular vignette can build. */
  parts: Map<string, LandmarkPartInfo>;
  /** Radius of the group's footprint at the miniature factor, in km. */
  footprintKm: number;
}

/** Moves a built landmark's drawn point off the water (giza.md section 2). */
export function placeOffWater(
  l: BuiltLandmark,
  wet: (lat: number, lon: number) => boolean,
): number {
  const s = l.structure;
  const drawn = shiftOffWater(s.lat / 1e6, s.lon / 1e6, l.footprintKm, wet);
  s.drawnLat = Math.round(drawn.lat * 1e6);
  s.drawnLon = Math.round(drawn.lon * 1e6);
  return drawn.shiftedKm;
}

export interface LandmarkInputs {
  curated: string;
  lanes: Set<string>;
  startDay: number;
  cutoffDay: number;
}

/** Base in metres and footprint radius in metres (with the ramp) of a landmark asset. */
export function assetSize(id: LandmarkAssetId): { baseM: number; radiusM: number } {
  const a = LANDMARK_ASSETS[id] as { pyramid?: keyof typeof PYRAMIDS };
  if (a.pyramid) {
    const p = PYRAMIDS[a.pyramid];
    return { baseM: p.base, radiusM: p.base / 2 + RAMP_REACH * p.height };
  }
  return { baseM: SPHINX_LENGTH, radiusM: SPHINX_LENGTH / 2 };
}

/**
 * Moves a group west in steps of SHIFT_STEP_KM until no point of its
 * footprint (a disc of radiusKm around the drawn point) is wet. Returns the
 * drawn point in degrees.
 */
export function shiftOffWater(
  lat: number,
  lon: number,
  radiusKm: number,
  wet: (lat: number, lon: number) => boolean,
): { lat: number; lon: number; shiftedKm: number } {
  const kmPerDegLon = KM_PER_DEG * Math.cos((lat * Math.PI) / 180);
  const samples: [number, number][] = [[0, 0]];
  const step = Math.max(1, radiusKm / 8);
  for (let r = step; r <= radiusKm + 1e-9; r += step) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      samples.push([r * Math.cos(a), r * Math.sin(a)]);
    }
  }
  for (let km = 0; km <= MAX_SHIFT_KM; km += SHIFT_STEP_KM) {
    const clon = lon - km / kmPerDegLon;
    if (!samples.some(([e, n]) => wet(lat + n / KM_PER_DEG, clon + e / kmPerDegLon)))
      return { lat, lon: clon, shiftedKm: km };
  }
  return { lat, lon, shiftedKm: 0 };
}

export function buildLandmarks(inp: LandmarkInputs): {
  landmarks: BuiltLandmark[];
  errors: string[];
} {
  const errors: string[] = [];
  const landmarks: BuiltLandmark[] = [];
  const dir = join(inp.curated, 'landmarks');
  const sourcesFile = join(inp.curated, 'sources.yaml');
  const sources = existsSync(sourcesFile)
    ? (parse(readFileSync(sourcesFile, 'utf8'), { schema: 'failsafe' }) as Yaml)
    : {};
  if (!existsSync(dir)) return { landmarks, errors };
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .sort()) {
    const e = new Errors(`landmarks/${f}`);
    const raw = readFileSync(join(dir, f), 'utf8');
    const fm = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    if (!fm) {
      errors.push(`landmarks/${f}: missing front matter`);
      continue;
    }
    let y: Yaml;
    try {
      y = parse(fm[1]!, { schema: 'failsafe' }) as Yaml;
    } catch (err) {
      errors.push(`landmarks/${f}: front matter is not valid YAML (${(err as Error).message})`);
      continue;
    }
    if (!isMap(y)) {
      errors.push(`landmarks/${f}: front matter must be a map`);
      continue;
    }
    const built = compileLandmark(e, f, y, fm[2]!, sources, inp);
    errors.push(...e.list);
    if (built) landmarks.push(built);
  }
  return { landmarks, errors };
}

function point(v: Yaml | undefined): [number, number] | undefined {
  const lat = Array.isArray(v) ? num(v[0]) : undefined;
  const lon = Array.isArray(v) ? num(v[1]) : undefined;
  if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return undefined;
  return [lat, lon];
}

function compileLandmark(
  e: Errors,
  file: string,
  y: { [key: string]: Yaml },
  body: string,
  sources: Yaml,
  inp: LandmarkInputs,
): BuiltLandmark | undefined {
  unknownFields(e, 'record', y, RECORD_FIELDS);
  const id = str(y.id);
  if (id !== basename(file, '.md')) e.add(`id "${id}" must equal the file name`);
  if (y.kind !== 'landmark') e.add('kind must be "landmark"');
  const when = isMap(y.when) ? y.when : {};
  const from = parseDate(when.from, inp.startDay, inp.cutoffDay);
  const to = parseDate(when.to, inp.startDay, inp.cutoffDay);
  if (!from || !to) e.add('when needs a from and a to date');
  else if (from.first >= to.end) e.add('when ends before it starts');
  const where = isMap(y.where) ? point(y.where.point) : undefined;
  if (!where) e.add('where needs point: [lat, lon]');
  const icon = str(y.icon) ?? '';
  if (!ICONS.has(icon)) e.add(`unknown icon "${icon}"`);
  if (y.beacon !== undefined && y.beacon !== 'wonder') e.add('beacon can only be "wonder"');
  const regions = Array.isArray(y.region)
    ? y.region.map((r) => str(r) ?? '')
    : [str(y.region) ?? ''];
  for (const r of regions) if (!inp.lanes.has(r)) e.add(`unknown region "${r}"`);

  const parts: CompiledPart[] = [];
  const sizes = new Map<string, { baseM: number; radiusM: number }>();
  if (!isMap(y.parts) || Object.keys(y.parts).length === 0)
    e.add('parts must name at least one part');
  else
    for (const [name, v] of Object.entries(y.parts)) {
      if (!isMap(v)) {
        e.add(`part ${name} must be a map`);
        continue;
      }
      unknownFields(e, `part ${name}`, v, ['at', 'stages']);
      const at = point(v.at);
      if (!at) e.add(`part ${name} needs at: [lat, lon]`);
      const stages: CompiledPart['stages'] = [];
      if (!Array.isArray(v.stages) || v.stages.length === 0) e.add(`part ${name} needs stages`);
      else
        for (const s of v.stages) {
          const d = isMap(s) ? parseDate(s.from, inp.startDay, inp.cutoffDay) : undefined;
          const asset = isMap(s) ? str(s.asset) : undefined;
          if (!d) {
            e.add(`part ${name} has a stage without a date`);
            continue;
          }
          if (!asset || !(asset in LANDMARK_ASSETS)) {
            e.add(`part ${name} uses unknown asset "${asset}"`);
            continue;
          }
          if (stages.length && d.first <= stages[stages.length - 1]!.fromDay)
            e.add(`part ${name}: stages must be in date order`);
          stages.push({ fromDay: d.first, asset });
        }
      if (!at || !where || !stages.length) continue;
      // Offsets in true metres; the layer draws them at the landmark's scale.
      const north = (at[0] - where[0]) * KM_PER_DEG * 1000;
      const east = (at[1] - where[1]) * KM_PER_DEG * 1000 * Math.cos((where[0] * Math.PI) / 180);
      sizes.set(name, assetSize(stages[0]!.asset as LandmarkAssetId));
      parts.push({ name, east: Math.round(east * 100), north: Math.round(north * 100), stages });
    }

  if (y.build !== undefined && !Array.isArray(y.build)) e.add('build must be a list');
  if (Array.isArray(y.build))
    for (const b of y.build) {
      if (!isMap(b)) {
        e.add('every build must be a map');
        continue;
      }
      unknownFields(e, 'build', b, ['part', 'from', 'to', 'vignette']);
      const part = parts.find((p) => p.name === str(b.part));
      const bf = parseDate(b.from, inp.startDay, inp.cutoffDay);
      const bt = parseDate(b.to, inp.startDay, inp.cutoffDay);
      const vignette = str(b.vignette);
      if (!part) e.add(`build names unknown part "${str(b.part)}"`);
      else if (!bf || !bt || bf.first >= bt.end) e.add(`build of ${part.name} needs from and to`);
      else if (part.build) e.add(`part ${part.name} is built twice`);
      else if (!vignette) e.add(`build of ${part.name} names no vignette`);
      else {
        if (from && bf.first < from.first)
          e.add(`build of ${part.name} starts before the landmark`);
        if (bf.first !== part.stages[0]!.fromDay)
          e.add(`build of ${part.name} must start with its first stage`);
        if (part.stages[1] && bt.end > part.stages[1].fromDay)
          e.add(`build of ${part.name} runs into its next stage`);
        part.build = { fromDay: bf.first, toDay: bt.end, vignette };
      }
    }

  const refs = Array.isArray(y.sources) ? y.sources : [];
  if (!refs.length) e.add('names no source');
  for (const r of refs) {
    const ref = isMap(r) ? str(r.ref) : undefined;
    if (!ref || !isMap(sources) || !isMap(sources[ref] as Yaml | undefined))
      e.add(`unknown source "${ref}"`);
  }
  const text = parseText(e, body);
  if (e.list.length || !from || !to || !where || !text) return undefined;

  // The footprint at the miniature factor, around the landmark's point.
  let radiusKm = 0;
  for (const p of parts) {
    const off = Math.hypot(p.east, p.north) / 100;
    radiusKm = Math.max(radiusKm, ((off + sizes.get(p.name)!.radiusM) * MINIATURE) / 1000);
  }
  const lat = Math.round(where[0] * 1e6);
  const lon = Math.round(where[1] * 1e6);
  return {
    structure: {
      id: id!,
      fromDay: from.first,
      toDay: to.end,
      icon,
      beacon: y.beacon === 'wonder',
      lat,
      lon,
      drawnLat: lat,
      drawnLon: lon,
      parts,
    },
    text,
    regions,
    fromApproximate: from.approximate,
    parts: new Map(parts.map((p) => [p.name, { baseM: sizes.get(p.name)!.baseM, lat, lon }])),
    footprintKm: radiusKm,
  };
}
