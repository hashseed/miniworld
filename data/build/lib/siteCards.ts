// Site cards (spec humankind.md, section 8.3): reads data/curated/site-cards/*.md,
// one record per anchor, validates them against the anchors and the sources, and
// compiles a text file per language.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { LANGUAGES, type Language } from '../../../app/src/i18n/messages.ts';
import { Errors, isMap, str, unknownFields, type CardText, type Yaml } from './records.ts';

const RECORD_FIELDS = ['id', 'kind', 'sources'];

/** The labels and sub-headings of a card of a place (humankind.md section 8.3) and of an arrival (section 8.4), in order. */
const LABELS: Record<
  'site-card' | 'event-card',
  Record<Language, { facts: string[]; sections: string[] }>
> = {
  'site-card': {
    en: {
      facts: ['Made', 'Discovered'],
      sections: ['What was found', 'How it looked', 'What it was for'],
    },
    de: {
      facts: ['Entstanden', 'Entdeckt'],
      sections: ['Was man fand', 'So sah es aus', 'Wozu es diente'],
    },
  },
  'event-card': {
    en: {
      facts: ['When', 'Where'],
      sections: ['What we know', 'How it may have looked', 'What is debated'],
    },
    de: {
      facts: ['Wann', 'Wo'],
      sections: ['Was man weiß', 'Wie es ausgesehen haben könnte', 'Was umstritten ist'],
    },
  },
};

export interface BuiltSiteCard {
  id: string;
  text: Record<Language, CardText>;
}

export interface SiteCardInputs {
  curated: string;
  /** Folder of the records; `<curated>/site-cards` unless a test passes its fixtures. */
  records?: string;
  /** The ids of the anchors. */
  anchors: Set<string>;
  /** The ids of the arrival points that are events (milestone-1 section 8.3). */
  arrivals?: Set<string>;
}

/** Parses the language sections of a card, checking its structure. */
function parseCardText(
  e: Errors,
  body: string,
  kind: 'site-card' | 'event-card',
): Record<Language, CardText> | undefined {
  const out = {} as Record<Language, CardText>;
  const parts = body.split(/^## (\w+)\s*$/m);
  const seen = new Set<string>();
  for (let i = 1; i < parts.length; i += 2) {
    const lang = parts[i]!;
    if (!(LANGUAGES as readonly string[]).includes(lang)) {
      e.add(`unknown language section "## ${lang}"`);
      continue;
    }
    seen.add(lang);
    const labels = LABELS[kind][lang as Language];
    const m = /^# (.+)\n([\s\S]*)$/.exec(parts[i + 1]!.trim());
    if (!m) {
      e.add(`${lang}: the section must start with "# Title"`);
      continue;
    }
    const [head, ...rest] = m[2]!.split(/^### (.+)$/m);
    const lines = head!
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    labels.facts.forEach((label, k) => {
      if (!lines[k]?.startsWith(`**${label}:** `) || lines[k]!.length < label.length + 8)
        e.add(`${lang}: paragraph ${k + 1} must start with "**${label}:**" and say something`);
    });
    if (lines.length !== labels.facts.length)
      e.add(`${lang}: before the first sub-heading only ${labels.facts.length} lines are allowed`);
    labels.sections.forEach((title, k) => {
      if (rest[k * 2]?.trim() !== title || !rest[k * 2 + 1]?.trim())
        e.add(`${lang}: sub-heading ${k + 1} must be "### ${title}" with text`);
    });
    if (rest.length !== labels.sections.length * 2)
      e.add(`${lang}: the only sub-headings allowed are ${labels.sections.join(', ')}`);
    out[lang as Language] = {
      title: m[1]!.trim(),
      body: m[2]!.trim(),
      learnMore: '',
    };
  }
  for (const lang of LANGUAGES) if (!seen.has(lang)) e.add(`missing language section "## ${lang}"`);
  return e.list.length ? undefined : out;
}

const arrivals = (inp: SiteCardInputs) => inp.arrivals ?? new Set<string>();

export function buildSiteCards(inp: SiteCardInputs): { cards: BuiltSiteCard[]; errors: string[] } {
  const errors: string[] = [];
  const cards: BuiltSiteCard[] = [];
  const dir = inp.records ?? join(inp.curated, 'site-cards');
  const sourcesFile = join(inp.curated, 'sources.yaml');
  const sources = existsSync(sourcesFile)
    ? (parse(readFileSync(sourcesFile, 'utf8'), { schema: 'failsafe' }) as Yaml)
    : {};
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((n) => n.endsWith('.md'))
        .sort()
    : [];
  for (const f of files) {
    const e = new Errors(`site-cards/${f}`);
    const fm = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(readFileSync(join(dir, f), 'utf8'));
    if (!fm) {
      errors.push(`site-cards/${f}: missing front matter`);
      continue;
    }
    let y: Yaml;
    try {
      y = parse(fm[1]!, { schema: 'failsafe' }) as Yaml;
    } catch (err) {
      errors.push(`site-cards/${f}: front matter is not valid YAML (${(err as Error).message})`);
      continue;
    }
    if (!isMap(y)) {
      errors.push(`site-cards/${f}: front matter must be a map`);
      continue;
    }
    unknownFields(e, 'record', y, RECORD_FIELDS);
    const id = str(y.id);
    if (!id || `${id}.md` !== f) e.add('id must equal the file name');
    const kind = str(y.kind);
    if (kind !== 'site-card' && kind !== 'event-card')
      e.add('kind must be "site-card" or "event-card"');
    const arrivals = inp.arrivals ?? new Set<string>();
    if (id && kind === 'event-card' && !arrivals.has(id))
      e.add(`no arrival event has the id "${id}"`);
    if (id && kind === 'site-card' && !inp.anchors.has(id)) e.add(`no anchor has the id "${id}"`);
    const refs = Array.isArray(y.sources) ? y.sources : [];
    if (!refs.length) e.add('names no source');
    for (const r of refs) {
      if (isMap(r)) unknownFields(e, 'source', r, ['ref', 'note']);
      const ref = isMap(r) ? str(r.ref) : undefined;
      if (!ref || !isMap(sources) || !isMap(sources[ref] as Yaml | undefined))
        e.add(`unknown source "${ref}"`);
    }
    const text = parseCardText(e, fm[2]!, kind === 'event-card' ? 'event-card' : 'site-card');
    errors.push(...e.list);
    if (id && text && !e.list.length) cards.push({ id, text });
  }
  for (const a of [...inp.anchors].sort())
    if (!files.includes(`${a}.md`))
      errors.push(`site-cards/${a}.md: missing card for anchor "${a}"`);
  for (const a of [...arrivals(inp)].sort())
    if (!files.includes(`${a}.md`))
      errors.push(`site-cards/${a}.md: missing event card for arrival "${a}"`);
  return { cards, errors };
}
