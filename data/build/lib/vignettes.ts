// Vignette templates and records (spec milestone 2, sections 6 and 18): reads
// data/curated/templates/*.yaml and data/curated/vignettes/*.md, validates
// them and compiles each record into a structure file and a text file per
// language for the vignette layer (section 18.4).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'yaml';
import { PROPS } from '../../../assets/src/landmarks.ts';
import { LANGUAGES, type Language } from '../../../app/src/i18n/messages.ts';
import { DAYS_PER_YEAR, astronomicalYear, dayOfYearStart } from '../../../app/src/time/calendar.ts';
import {
  VERBS,
  loopErrors,
  type CompiledAction,
  type CompiledGroup,
  type CompiledTemplate,
  type CompiledVignette,
  type Verb,
} from '../../../app/src/world/vignette.ts';

/** Culture profiles of milestone 2 (section 4), until culture records exist. */
const CULTURES = new Set([
  'african-stone-age',
  'neanderthal',
  'coastal-asia-hunter',
  'first-australians',
  'ice-age-hunter',
  'steppe-beringia-hunter',
  'natufian',
  'old-kingdom-egyptian',
]);
/** Scene-marker icons the app can draw (section 7.2). */
export const ICONS = new Set(['spear', 'pyramid']);
type ParamKind = 'culture' | 'animal' | 'prop';
const LEARN_MORE: Record<Language, string> = { en: 'Learn more', de: 'Mehr erfahren' };

export interface VignetteText {
  title: string;
  body: string;
  learnMore: string;
}

export interface BuiltVignette {
  structure: CompiledVignette;
  text: Record<Language, VignetteText>;
  regions: string[];
  fromApproximate: boolean;
  toApproximate: boolean;
}

export type Yaml = string | Yaml[] | { [key: string]: Yaml };

export class Errors {
  list: string[] = [];
  private where: string;
  constructor(where: string) {
    this.where = where;
  }
  add(message: string): void {
    this.list.push(`${this.where}: ${message}`);
  }
}

export function isMap(v: Yaml | undefined): v is { [key: string]: Yaml } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function str(v: Yaml | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function num(v: Yaml | undefined): number | undefined {
  if (typeof v !== 'string' || !/^-?\d+(\.\d+)?$/.test(v)) return undefined;
  return Number(v);
}

export function unknownFields(e: Errors, what: string, v: Yaml, allowed: string[]): void {
  if (!isMap(v)) return;
  for (const k of Object.keys(v))
    if (!allowed.includes(k)) e.add(`${what} has unknown field "${k}"`);
}

/** "120 s", "80 m", "1000 years": a number with the expected unit. */
function quantity(v: Yaml | undefined, unit: string): number | undefined {
  const m = typeof v === 'string' ? /^(\d+(?:\.\d+)?)\s*(\w+)$/.exec(v.trim()) : null;
  if (!m || m[2] !== unit) return undefined;
  return Number(m[1]);
}

export interface ParsedDate {
  /** First day the date covers. */
  first: number;
  /** Day after the last day the date covers. */
  end: number;
  approximate: boolean;
}

/** Written dates of content-format section 3, at year precision. */
export function parseDate(
  v: Yaml | undefined,
  startDay: number,
  cutoffDay: number,
): ParsedDate | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (s === 'start') return { first: startDay, end: startDay, approximate: false };
  if (s === 'today') return { first: cutoffDay, end: cutoffDay, approximate: false };
  const m = /^(c\.\s*)?(\d{1,3}(?:,\d{3})*|\d+)(\s+BCE)?$/.exec(s);
  if (!m) return undefined;
  const year = Number(m[2]!.replace(/,/g, ''));
  if (year < 1) return undefined;
  const astro = m[3] ? astronomicalYear(year, 'BCE') : year;
  return { first: dayOfYearStart(astro), end: dayOfYearStart(astro + 1), approximate: !!m[1] };
}

// --- Templates -------------------------------------------------------------------

export function compileTemplate(
  file: string,
  text: string,
): { template?: CompiledTemplate; params: Record<string, ParamKind>; errors: string[] } {
  const e = new Errors(`templates/${basename(file)}`);
  const params: Record<string, ParamKind> = {};
  let y: Yaml;
  try {
    y = parse(text, { schema: 'failsafe' }) as Yaml;
  } catch (err) {
    e.add(`not valid YAML (${(err as Error).message})`);
    return { params, errors: e.list };
  }
  if (!isMap(y)) {
    e.add('must be a map');
    return { params, errors: e.list };
  }
  unknownFields(e, 'template', y, ['id', 'params', 'loop', 'stage', 'cast', 'beats']);
  const id = str(y.id);
  if (id !== basename(file, '.yaml')) e.add(`id "${id}" must equal the file name`);
  if (isMap(y.params))
    for (const [k, v] of Object.entries(y.params)) {
      if (v === 'culture' || v === 'animal' || v === 'prop') params[k] = v;
      else e.add(`parameter ${k} has unknown kind "${String(v)}"`);
    }
  else e.add('params must be a map');
  const loopS = quantity(y.loop, 's');
  if (!loopS) e.add('loop must be like "120 s"');
  const stage = isMap(y.stage) ? y.stage : {};
  unknownFields(e, 'stage', stage, ['radius', 'marks', 'fit']);
  const radiusM = quantity(stage.radius, 'm');
  if (!radiusM) e.add('stage.radius must be like "80 m"');
  const fitM = stage.fit === undefined ? undefined : quantity(stage.fit, 'm');
  if (stage.fit !== undefined && !fitM) e.add('stage.fit must be like "230 m"');
  const marks: Record<string, [number, number]> = {};
  if (isMap(stage.marks))
    for (const [k, v] of Object.entries(stage.marks)) {
      const x = Array.isArray(v) ? num(v[0]) : undefined;
      const z = Array.isArray(v) ? num(v[1]) : undefined;
      if (x === undefined || z === undefined || (v as Yaml[]).length !== 2) {
        e.add(`mark ${k} must be [x, z] in metres`);
        continue;
      }
      if (radiusM && Math.sqrt(x * x + z * z) > radiusM) e.add(`mark ${k} lies outside the stage`);
      marks[k] = [Math.round(x * 100), Math.round(z * 100)];
    }
  else e.add('stage.marks must be a map');

  const groups: CompiledGroup[] = [];
  if (isMap(y.cast))
    for (const [name, v] of Object.entries(y.cast)) {
      if (!isMap(v)) {
        e.add(`cast ${name} must be a map`);
        continue;
      }
      unknownFields(e, `cast ${name}`, v, ['culture', 'animal', 'prop', 'role', 'count', 'at']);
      const kind =
        v.culture !== undefined
          ? 'human'
          : v.animal !== undefined
            ? 'animal'
            : v.prop !== undefined
              ? 'prop'
              : undefined;
      const paramKind: ParamKind | undefined = kind === 'human' ? 'culture' : kind;
      const ref = str(kind === 'human' ? v.culture : kind === 'animal' ? v.animal : v.prop);
      if (!kind || !ref?.startsWith('$'))
        e.add(`cast ${name} needs culture: $param, animal: $param or prop: $param`);
      else if (params[ref.slice(1)] !== paramKind)
        e.add(`cast ${name} uses ${ref}, which is not a ${paramKind} parameter`);
      const count = num(v.count);
      if (!count || !Number.isInteger(count) || count < 1)
        e.add(`cast ${name} needs a whole count of at least 1`);
      const at = str(v.at);
      if (!at || !marks[at]) e.add(`cast ${name} starts at unknown mark "${at}"`);
      groups.push({
        name,
        kind: kind ?? 'human',
        look: ref ?? '',
        role: str(v.role),
        count: count ?? 1,
        at: at ?? '',
        actions: [],
      });
    }
  else e.add('cast must be a map');

  if (Array.isArray(y.beats))
    for (const beat of y.beats) {
      if (!isMap(beat)) {
        e.add('every beat must be a map');
        continue;
      }
      const at = num(beat.at);
      if (at === undefined || at < 0 || (loopS && at >= loopS)) {
        e.add(`beat at "${String(beat.at)}" lies outside the loop`);
        continue;
      }
      for (const [groupName, action] of Object.entries(beat)) {
        if (groupName === 'at') continue;
        const group = groups.find((g) => g.name === groupName);
        if (!group) {
          e.add(`beat at ${at} s names unknown group "${groupName}"`);
          continue;
        }
        let verb: string | undefined;
        let object: string | undefined;
        if (typeof action === 'string') verb = action;
        else if (isMap(action) && Object.keys(action).length === 1) {
          verb = Object.keys(action)[0];
          object = str(Object.values(action)[0]);
        }
        if (!verb || !(verb in VERBS)) {
          e.add(`beat at ${at} s uses unknown action "${verb ?? JSON.stringify(action)}"`);
          continue;
        }
        const takes = VERBS[verb as Verb];
        if (takes === 'mark' && (!object || !marks[object]))
          e.add(`beat at ${at} s: ${verb} needs a mark, got "${object}"`);
        if (
          (takes === 'group' || (takes === 'optional-group' && object)) &&
          !groups.some((g) => g.name === object)
        )
          e.add(`beat at ${at} s: ${verb} needs a group, got "${object}"`);
        if (takes === 'none' && object) e.add(`beat at ${at} s: ${verb} takes no object`);
        const a: CompiledAction = { atMs: Math.round(at * 1000), verb: verb as Verb };
        if (object) a.object = object;
        group.actions.push(a);
      }
    }
  else e.add('beats must be a list');
  for (const g of groups) g.actions.sort((a, b) => a.atMs - b.atMs);

  if (e.list.length) return { params, errors: e.list };
  const template: CompiledTemplate = {
    id: id!,
    loopMs: Math.round(loopS! * 1000),
    radiusCm: Math.round(radiusM! * 100),
    marks,
    groups,
  };
  if (fitM) template.fitCm = Math.round(fitM * 100);
  for (const msg of loopErrors(template)) e.add(msg);
  return { template, params, errors: e.list };
}

// --- Records ---------------------------------------------------------------------

const RECORD_FIELDS = [
  'id',
  'kind',
  'template',
  'with',
  'when',
  'repeat',
  'progress',
  'region',
  'icon',
  'debated',
  'sources',
  'links',
];

/** Splits the language sections of a record (content-format section 2). */
export function parseText(e: Errors, body: string): Record<Language, VignetteText> | undefined {
  const out = {} as Record<Language, VignetteText>;
  const parts = body.split(/^## (\w+)\s*$/m);
  const seen = new Set<string>();
  for (let i = 1; i < parts.length; i += 2) {
    const lang = parts[i]!;
    if (!(LANGUAGES as readonly string[]).includes(lang)) {
      e.add(`unknown language section "## ${lang}"`);
      continue;
    }
    seen.add(lang);
    const text = parts[i + 1]!.trim();
    const m = /^# (.+)\n([\s\S]*)$/.exec(text);
    if (!m) {
      e.add(`${lang}: the section must start with "# Title"`);
      continue;
    }
    const [main, ...rest] = m[2]!.split(/^### (.+)$/m);
    let learnMore = '';
    if (rest.length) {
      if (rest[0]!.trim() !== LEARN_MORE[lang as Language] || rest.length !== 2)
        e.add(`${lang}: the only sub-heading allowed is "### ${LEARN_MORE[lang as Language]}"`);
      learnMore = (rest[1] ?? '').trim();
    }
    if (!main!.trim()) e.add(`${lang}: card text is missing`);
    out[lang as Language] = { title: m[1]!.trim(), body: main!.trim(), learnMore };
  }
  for (const lang of LANGUAGES) if (!seen.has(lang)) e.add(`missing language section "## ${lang}"`);
  const withLearnMore = LANGUAGES.filter((l) => out[l]?.learnMore).length;
  if (withLearnMore !== 0 && withLearnMore !== LANGUAGES.length)
    e.add('"Learn more" must be present in every language or in none');
  return e.list.length ? undefined : out;
}

export interface VignetteInputs {
  curated: string;
  lanes: Set<string>;
  animals: Set<string>;
  startDay: number;
  cutoffDay: number;
  /** Landmark parts a singular vignette can build, by landmark and part (giza.md section 11.4). */
  landmarkParts?: Map<string, Map<string, LandmarkPartInfo>>;
}

export interface LandmarkPartInfo {
  /** Base of the part's model in metres, which a template's fit is scaled to. */
  baseM: number;
  /** The landmark's true point in whole microdegrees. */
  lat: number;
  lon: number;
}

export function buildVignettes(inp: VignetteInputs): {
  vignettes: BuiltVignette[];
  errors: string[];
} {
  const errors: string[] = [];
  const templates = new Map<
    string,
    { template: CompiledTemplate; params: Record<string, ParamKind> }
  >();
  const tdir = join(inp.curated, 'templates');
  if (existsSync(tdir))
    for (const f of readdirSync(tdir)
      .filter((n) => n.endsWith('.yaml'))
      .sort()) {
      const r = compileTemplate(f, readFileSync(join(tdir, f), 'utf8'));
      errors.push(...r.errors);
      if (r.template) templates.set(r.template.id, { template: r.template, params: r.params });
    }
  const sourcesFile = join(inp.curated, 'sources.yaml');
  const sources = existsSync(sourcesFile)
    ? (parse(readFileSync(sourcesFile, 'utf8'), { schema: 'failsafe' }) as Yaml)
    : {};
  const vignettes: BuiltVignette[] = [];
  const vdir = join(inp.curated, 'vignettes');
  if (existsSync(vdir))
    for (const f of readdirSync(vdir)
      .filter((n) => n.endsWith('.md'))
      .sort()) {
      const e = new Errors(`vignettes/${f}`);
      const raw = readFileSync(join(vdir, f), 'utf8');
      const fm = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
      if (!fm) {
        errors.push(`vignettes/${f}: missing front matter`);
        continue;
      }
      let y: Yaml;
      try {
        y = parse(fm[1]!, { schema: 'failsafe' }) as Yaml;
      } catch (err) {
        errors.push(`vignettes/${f}: front matter is not valid YAML (${(err as Error).message})`);
        continue;
      }
      if (!isMap(y)) {
        errors.push(`vignettes/${f}: front matter must be a map`);
        continue;
      }
      const built = compileRecord(e, f, y, fm[2]!, templates, sources, inp);
      errors.push(...e.list);
      if (built) vignettes.push(built);
    }
  return { vignettes, errors };
}

function compileRecord(
  e: Errors,
  file: string,
  y: { [key: string]: Yaml },
  body: string,
  templates: Map<string, { template: CompiledTemplate; params: Record<string, ParamKind> }>,
  sources: Yaml,
  inp: VignetteInputs,
): BuiltVignette | undefined {
  unknownFields(e, 'record', y, RECORD_FIELDS);
  const id = str(y.id);
  if (id !== basename(file, '.md')) e.add(`id "${id}" must equal the file name`);
  if (y.kind !== 'vignette') e.add('kind must be "vignette"');
  const t = templates.get(str(y.template) ?? '');
  if (!t) e.add(`unknown template "${String(y.template)}"`);

  // Fill the template's parameters.
  const filled: Record<string, string> = {};
  const withMap = isMap(y.with) ? y.with : {};
  if (t) {
    for (const [p, kind] of Object.entries(t.params)) {
      const v = str(withMap[p]);
      if (!v) e.add(`parameter ${p} is not filled`);
      else if (kind === 'culture' && !CULTURES.has(v)) e.add(`unknown culture "${v}"`);
      else if (kind === 'animal' && !inp.animals.has(v)) e.add(`unknown animal "${v}"`);
      else if (kind === 'prop' && !(PROPS as readonly string[]).includes(v))
        e.add(`unknown prop "${v}"`);
      else filled[p] = v;
    }
    for (const k of Object.keys(withMap))
      if (!(k in t.params)) e.add(`template has no parameter "${k}"`);
  }

  const when = isMap(y.when) ? y.when : {};
  const from = parseDate(when.from, inp.startDay, inp.cutoffDay);
  const to = parseDate(when.to, inp.startDay, inp.cutoffDay);
  if (!from || !to) e.add('when needs a from and a to date');
  else {
    if (from.first >= to.end) e.add('when ends before it starts');
    if (from.first < inp.startDay || to.end > inp.cutoffDay + 1)
      e.add('when lies outside the timeline');
  }

  const repeat = isMap(y.repeat) ? y.repeat : undefined;
  const progress = isMap(y.progress) ? y.progress : undefined;
  if (!repeat === !progress)
    e.add('a vignette needs either repeat (repeated) or progress (singular), not both');
  const perYears = repeat ? quantity(repeat.per, 'years') : undefined;
  if (repeat && !perYears) e.add('repeat.per must be like "1000 years"');
  const count = repeat ? num(repeat.count) : 1;
  if (!count || !Number.isInteger(count) || count < 1)
    e.add('repeat.count must be a whole number of at least 1');
  const points = isMap(repeat?.sites) ? repeat.sites.points : undefined;
  const sites: CompiledVignette['sites'] = [];
  let part: LandmarkPartInfo | undefined;
  if (progress) {
    unknownFields(e, 'progress', progress, ['landmark', 'part']);
    const landmark = str(progress.landmark) ?? '';
    const partName = str(progress.part) ?? '';
    part = inp.landmarkParts?.get(landmark)?.get(partName);
    if (!part) e.add(`progress names unknown landmark part "${landmark}/${partName}"`);
    else sites.push({ name: landmark, lat: part.lat, lon: part.lon });
    if (t && !t.template.fitCm) e.add('a singular vignette needs a template with stage.fit');
  } else if (!Array.isArray(points) || points.length === 0)
    e.add('repeat.sites.points must list candidate points');
  else
    for (const p of points) {
      if (!isMap(p)) {
        e.add('every site must be a map');
        continue;
      }
      unknownFields(e, 'site', p, ['name', 'at', 'from', 'to']);
      const lat = Array.isArray(p.at) ? num(p.at[0]) : undefined;
      const lon = Array.isArray(p.at) ? num(p.at[1]) : undefined;
      const name = str(p.name) ?? '';
      if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        e.add(`site ${name} needs at: [lat, lon]`);
        continue;
      }
      const site: CompiledVignette['sites'][number] = {
        name,
        lat: Math.round(lat * 1e6),
        lon: Math.round(lon * 1e6),
      };
      if (p.from !== undefined) {
        const d = parseDate(p.from, inp.startDay, inp.cutoffDay);
        if (!d) e.add(`site ${name} has a date it cannot parse`);
        else site.fromDay = d.first;
      }
      if (p.to !== undefined) {
        const d = parseDate(p.to, inp.startDay, inp.cutoffDay);
        if (!d) e.add(`site ${name} has a date it cannot parse`);
        else site.toDay = d.end;
      }
      sites.push(site);
    }

  const regions = Array.isArray(y.region)
    ? y.region.map((r) => str(r) ?? '')
    : [str(y.region) ?? ''];
  for (const r of regions) if (!inp.lanes.has(r)) e.add(`unknown region "${r}"`);
  const icon = str(y.icon) ?? '';
  if (!ICONS.has(icon)) e.add(`unknown icon "${icon}"`);
  const refs = Array.isArray(y.sources) ? y.sources : [];
  if (!refs.length) e.add('names no source');
  for (const r of refs) {
    const ref = isMap(r) ? str(r.ref) : undefined;
    if (!ref || !isMap(sources) || !isMap(sources[ref] as Yaml | undefined))
      e.add(`unknown source "${ref}"`);
  }
  const text = parseText(e, body);

  if (e.list.length || !t || !from || !to || !text) return undefined;
  const template: CompiledTemplate = {
    ...t.template,
    groups: t.template.groups.map((g) => ({ ...g, look: filled[g.look.slice(1)]! })),
  };
  if (part && template.fitCm) {
    // Scale the stage to the part it builds, so one template serves every size.
    const k = (part.baseM * 100) / template.fitCm;
    template.marks = Object.fromEntries(
      Object.entries(template.marks).map(([name, [x, z]]) => [
        name,
        [Math.round(x * k), Math.round(z * k)] as [number, number],
      ]),
    );
    template.radiusCm = Math.round(template.radiusCm * k);
    template.fitCm = Math.round(part.baseM * 100);
    for (const msg of loopErrors(template)) e.add(msg);
    if (e.list.length) return undefined;
  }
  const structure: CompiledVignette = {
    id: id!,
    fromDay: from.first,
    toDay: to.end,
    periodDays: perYears ? Math.round(perYears * DAYS_PER_YEAR) : to.end - from.first,
    count: count!,
    sites,
    icon,
    template,
  };
  if (progress)
    structure.progress = { landmark: str(progress.landmark)!, part: str(progress.part)! };
  return {
    structure,
    text,
    regions,
    fromApproximate: from.approximate,
    toApproximate: to.approximate,
  };
}
