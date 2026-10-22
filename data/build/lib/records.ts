// Parsing helpers shared by the content records (eras, animal cards, site cards):
// failsafe YAML values, the error list, written dates and the language sections
// of a card (content-format sections 2 and 3).

import en from '../../../app/messages/en.json' with { type: 'json' };
import de from '../../../app/messages/de.json' with { type: 'json' };
import { LANGUAGES, type Language } from '../../../app/src/i18n/messages.ts';
import { astronomicalYear, dayOfYearStart } from '../../../app/src/time/calendar.ts';

/** The record heading over the "Learn more" text, as the card labels it (content-format section 2). */
const LEARN_MORE: Record<Language, string> = {
  en: en['vignette.learnMore'],
  de: de['vignette.learnMore'],
};

export interface CardText {
  title: string;
  body: string;
  learnMore: string;
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
  // The last day of the timeline is included, so what stands 'to today' is still there on it.
  if (s === 'today') return { first: cutoffDay, end: cutoffDay + 1, approximate: false };
  const m = /^(c\.\s*)?(\d{1,3}(?:,\d{3})*|\d+)(\s+BCE)?$/.exec(s);
  if (!m) return undefined;
  const year = Number(m[2]!.replace(/,/g, ''));
  if (year < 1) return undefined;
  const astro = m[3] ? astronomicalYear(year, 'BCE') : year;
  return { first: dayOfYearStart(astro), end: dayOfYearStart(astro + 1), approximate: !!m[1] };
}

/** Splits the language sections of a record (content-format section 2). */
export function parseText(e: Errors, body: string): Record<Language, CardText> | undefined {
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
