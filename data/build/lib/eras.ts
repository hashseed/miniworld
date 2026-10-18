// Era records for the timeline (spec milestone 1, sections 7.1 and 7.4;
// content-format.md sections 1 to 5 and 9): the regions and lanes from
// data/curated/vocab, one record per era under data/curated/eras, and the
// check that the records agree with the list in docs/spec/eras.md. Pure
// functions of the texts handed in; the content stage reads the files.

import { parse } from 'yaml';
import type { EraRecord } from '../../../app/src/content/types.ts';
import { LANGUAGES, type Language } from '../../../app/src/i18n/messages.ts';
import { Errors, isMap, parseDate, str, unknownFields, type Yaml } from './vignettes.ts';

export interface Lane {
  id: string;
  label: Record<Language, string>;
}

export interface Vocab {
  regions: Lane[];
  /** Timeline lanes from top to bottom: World, then the regions. */
  lanes: Lane[];
}

export interface CuratedEra {
  id: string;
  lane: string;
  /** Written dates, as in the record and in eras.md. */
  written: { from: string; to: string };
  fromDay: number;
  toDay: number;
  fromApproximate: boolean;
  toApproximate: boolean;
  colour: string;
  label: Record<Language, string>;
}

export interface CuratedEras {
  lanes: Lane[];
  eras: CuratedEra[];
}

const ERA_FIELDS = [
  'id',
  'kind',
  'lane',
  'when',
  'colour',
  'polity',
  'sources',
  'debated',
  'aliases',
];
const DEBATED = new Set(['date', 'place', 'cause', 'numbers', 'method']);

function yaml(text: string): Yaml | undefined {
  return parse(text, { schema: 'failsafe' }) as Yaml | undefined;
}

function labels(e: Errors, what: string, v: Yaml | undefined): Record<Language, string> {
  const out = {} as Record<Language, string>;
  for (const lang of LANGUAGES) {
    const l = isMap(v) ? str(v[lang])?.trim() : undefined;
    if (!l) e.add(`${what}: missing ${lang} label`);
    out[lang] = l ?? '';
  }
  return out;
}

/** Reads vocab/regions.yaml and vocab/lanes.yaml (content-format section 1). */
export function readLanes(regionsYaml: string, lanesYaml: string): Vocab & { errors: string[] } {
  const e = new Errors('vocab');
  const regions: Lane[] = [];
  const r = yaml(regionsYaml);
  if (!isMap(r)) e.add('regions.yaml must map region ids to labels');
  else
    for (const [id, v] of Object.entries(r)) {
      unknownFields(e, `region ${id}`, v, [...LANGUAGES]);
      regions.push({ id, label: labels(e, `region ${id}`, v) });
    }
  const lanes: Lane[] = [];
  const l = yaml(lanesYaml);
  if (!Array.isArray(l)) e.add('lanes.yaml must be a list');
  else
    for (const v of l) {
      if (!isMap(v)) {
        e.add('every lane must be a map');
        continue;
      }
      if (v.region !== undefined) {
        unknownFields(e, `lane ${str(v.region)}`, v, ['region']);
        const region = regions.find((x) => x.id === str(v.region));
        if (!region) e.add(`lane names unknown region "${str(v.region)}"`);
        else if (lanes.some((x) => x.id === region.id)) e.add(`region ${region.id} has two lanes`);
        else lanes.push(region);
      } else {
        unknownFields(e, `lane ${str(v.id)}`, v, ['id', ...LANGUAGES]);
        const id = str(v.id);
        if (!id) e.add('a lane needs an id or a region');
        else if (lanes.some((x) => x.id === id)) e.add(`lane ${id} appears twice`);
        else lanes.push({ id, label: labels(e, `lane ${id}`, v) });
      }
    }
  for (const region of regions)
    if (!lanes.some((x) => x.id === region.id)) e.add(`region ${region.id} has no lane`);
  return { regions, lanes, errors: e.list };
}

export interface EraInputs {
  lanes: Set<string>;
  /** The parsed sources.yaml. */
  sources: Yaml;
  startDay: number;
  cutoffDay: number;
}

/** Parses and checks one era record (`eras/<file>`); returns the era when it is valid. */
export function parseEra(
  file: string,
  text: string,
  inp: EraInputs,
): { era?: CuratedEra; errors: string[] } {
  const e = new Errors(`eras/${file}`);
  const fm = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!fm) {
    e.add('missing front matter');
    return { errors: e.list };
  }
  let y: Yaml | undefined;
  try {
    y = yaml(fm[1]!);
  } catch (err) {
    e.add(`front matter is not valid YAML (${(err as Error).message})`);
    return { errors: e.list };
  }
  if (!isMap(y)) {
    e.add('front matter must be a map');
    return { errors: e.list };
  }
  unknownFields(e, 'record', y, ERA_FIELDS);
  const id = str(y.id);
  if (!id || `${id}.md` !== file) e.add(`id "${id ?? ''}" must equal the file name`);
  if (y.kind !== 'era') e.add('kind must be "era"');
  const lane = str(y.lane) ?? '';
  if (!inp.lanes.has(lane)) e.add(`unknown lane "${lane}"`);

  const when = isMap(y.when) ? y.when : undefined;
  if (when) unknownFields(e, 'when', when, ['from', 'to']);
  const wFrom = str(when?.from);
  const wTo = str(when?.to);
  const from = parseDate(wFrom, inp.startDay, inp.cutoffDay);
  const to = parseDate(wTo, inp.startDay, inp.cutoffDay);
  // An era's dates are boundaries at the start of their year (content-format section 3).
  const fromDay = from?.first ?? 0;
  const toDay = to?.first ?? 0;
  if (!from || !to) e.add('when needs a from and a to date');
  else {
    if (fromDay >= toDay) e.add('ends before it starts');
    if (fromDay < inp.startDay || toDay > inp.cutoffDay) e.add('lies outside the timeline');
  }

  const colour = str(y.colour) ?? '';
  if (y.polity !== undefined) e.add(`unknown polity "${str(y.polity) ?? ''}"`);
  else if (!/^#[0-9a-f]{6}$/i.test(colour)) e.add(`bad colour "${colour}"`);
  if (y.debated !== undefined && !DEBATED.has(str(y.debated) ?? ''))
    e.add(`debated cannot be "${str(y.debated) ?? ''}"`);
  if (y.aliases !== undefined && !Array.isArray(y.aliases)) e.add('aliases must be a list');

  const refs = Array.isArray(y.sources) ? y.sources : [];
  if (!refs.length) e.add('names no source');
  for (const r of refs) {
    if (isMap(r)) unknownFields(e, 'source', r, ['ref', 'note']);
    const ref = isMap(r) ? str(r.ref) : undefined;
    if (!ref || !isMap(inp.sources) || !isMap(inp.sources[ref])) e.add(`unknown source "${ref}"`);
  }

  const label = parseTitles(e, fm[2]!);
  if (e.list.length) return { errors: e.list };
  return {
    era: {
      id: id!,
      lane,
      written: { from: wFrom!.trim(), to: wTo!.trim() },
      fromDay,
      toDay,
      fromApproximate: from!.approximate,
      toApproximate: to!.approximate,
      colour,
      label,
    },
    errors: [],
  };
}

/** The body of a record without card text: one `## <lang>` section per language holding only `# Title`. */
function parseTitles(e: Errors, body: string): Record<Language, string> {
  const out = {} as Record<Language, string>;
  const parts = body.split(/^## (\S+)[ \t]*$/m);
  if (parts[0]!.trim()) e.add('text before the first language section');
  for (let i = 1; i < parts.length; i += 2) {
    const lang = parts[i]!;
    if (!(LANGUAGES as readonly string[]).includes(lang)) {
      e.add(`unknown language section "## ${lang}"`);
      continue;
    }
    if (out[lang as Language] !== undefined) e.add(`language section "## ${lang}" appears twice`);
    const m = /^# (.+)$/.exec(parts[i + 1]!.trim());
    if (!m) e.add(`${lang}: the section must hold only "# Title"`);
    else out[lang as Language] = m[1]!.trim();
  }
  for (const lang of LANGUAGES)
    if (!parts.some((p, i) => i % 2 === 1 && p === lang))
      e.add(`missing language section "## ${lang}"`);
  return out;
}

/** Checks across records: duplicate ids. */
export function validateEras(eras: CuratedEra[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const era of eras) {
    if (ids.has(era.id)) errors.push(`era ${era.id}: duplicate id`);
    ids.add(era.id);
  }
  return errors;
}

/** "Start of timeline", "c. 1 CE" and "c. 10,000 BCE" as the records write them. */
function writtenDate(s: string): string {
  const t = s.trim();
  if (t === 'Start of timeline') return 'start';
  if (t === 'End of timeline') return 'today';
  return t.replace(/ CE$/, '').replace(/,/g, '');
}

/**
 * Checks that the records and the rows of docs/spec/eras.md agree: every row
 * has a record and every record a row, with the same lane, labels and dates
 * (content-format section 9).
 */
export function checkEraList(md: string, lanes: Lane[], eras: CuratedEra[]): string[] {
  const errors: string[] = [];
  const byId = new Map(eras.map((x) => [x.id, x]));
  const listed = new Set<string>();
  let lane: Lane | undefined;
  for (const line of md.split('\n')) {
    const h = /^## (.+)$/.exec(line);
    if (h) {
      lane = lanes.find((l) => l.label.en === h[1]!.trim());
      if (!lane) errors.push(`eras.md: section "${h[1]}" is not a lane`);
      continue;
    }
    if (!lane || !line.startsWith('|') || /^\|\s*(ID|---)/.test(line)) continue;
    const [idCell = '', en = '', de = '', from = '', to = ''] = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    const id = /^`([^`]+)`$/.exec(idCell)?.[1];
    if (!id) {
      errors.push(`eras.md: row "${en}" has no ID`);
      continue;
    }
    listed.add(id);
    const era = byId.get(id);
    if (!era) {
      errors.push(`eras.md: ${id} has no record`);
      continue;
    }
    const differs = (what: string, spec: string, rec: string) => {
      if (spec !== rec)
        errors.push(`eras/${id}.md: ${what} "${rec}" differs from eras.md "${spec}"`);
    };
    differs('lane', lane.id, era.lane);
    differs('en label', en, era.label.en);
    differs('de label', de, era.label.de);
    differs('from', writtenDate(from), writtenDate(era.written.from));
    differs('to', writtenDate(to), writtenDate(era.written.to));
  }
  for (const era of eras) if (!listed.has(era.id)) errors.push(`eras/${era.id}.md: not in eras.md`);
  return errors;
}

/** The lanes and eras of one language for the startup index. */
export function erasForLanguage(
  data: CuratedEras,
  language: Language,
): { lanes: { id: string; label: string }[]; eras: EraRecord[] } {
  return {
    lanes: data.lanes.map((l) => ({ id: l.id, label: l.label[language] })),
    eras: data.eras.map((e) => ({
      id: e.id,
      lane: e.lane,
      fromDay: e.fromDay,
      toDay: e.toDay,
      fromApproximate: e.fromApproximate,
      toApproximate: e.toApproximate,
      color: e.colour,
      label: e.label[language],
    })),
  };
}
