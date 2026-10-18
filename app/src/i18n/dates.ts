// Date and number formatting per language (spec milestone 1, section 3.2).
// Intl.DateTimeFormat does not handle years before 1 CE well, so years and
// eras are formatted here.

import en from '../../messages/en.json' with { type: 'json' };
import de from '../../messages/de.json' with { type: 'json' };
import { dateFromDay, type Day } from '../time/calendar.ts';
import { dateTimeFormat, numberFormat } from './intl.ts';
import type { Language } from './messages.ts';

const FULL_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
};
const RATE_DIGITS: Intl.NumberFormatOptions = { maximumSignificantDigits: 2 };

export function formatNumber(n: number, language: Language): string {
  return numberFormat(language).format(n);
}

/** Year number as written: no separator up to four digits, one from five. */
export function formatYearNumber(year: number, language: Language): string {
  return year >= 10000 ? formatNumber(year, language) : String(year);
}

const eraWords = (m: typeof en) => ({
  bce: m['date.bce'],
  ce: m['date.ce'],
  approx: m['date.approximate'],
});
/** Era words from the message files, so the dates are localised like every other string. */
const ERA_WORDS: Record<Language, { bce: string; ce: string; approx: string }> = {
  en: eraWords(en),
  de: eraWords(de),
};

/** Formats an astronomical year, e.g. -752 → "753 BCE", 79 → "79 CE", 1492 → "1492". */
export function formatYear(astroYear: number, language: Language, approximate = false): string {
  const words = ERA_WORDS[language];
  let text: string;
  if (astroYear <= 0) text = `${formatYearNumber(1 - astroYear, language)} ${words.bce}`;
  else if (astroYear < 1000) text = `${astroYear} ${words.ce}`;
  else text = String(astroYear);
  return approximate ? `${words.approx} ${text}` : text;
}

export interface DateDisplayContext {
  /** Effective clock rate in years per minute. */
  yearsPerMinute: number;
  /** True when history is not advancing (paused) and not scrubbing. */
  stationary: boolean;
}

/** The date readout above the timeline (spec milestone 1, section 3.2). */
export function formatDateReadout(day: Day, language: Language, ctx: DateDisplayContext): string {
  const { year, month, day: dom } = dateFromDay(day);
  if (year <= -9999) {
    // Before 10,000 BCE: rounded to 100 years while moving.
    if (!ctx.stationary) {
      const bce = 1 - year;
      const rounded = Math.round(bce / 100) * 100;
      return formatYear(1 - rounded, language, true);
    }
    return formatYear(year, language);
  }
  if (year <= 0) return formatYear(year, language, !ctx.stationary && ctx.yearsPerMinute > 50);
  if (year >= 1500 && ctx.stationary) return formatFullDate(year, month, dom, language);
  return formatYear(year, language);
}

/** "14 July 1789" / "14. Juli 1789" for years from 1500. */
export function formatFullDate(
  year: number,
  month: number,
  day: number,
  language: Language,
): string {
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  return dateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', FULL_DATE).format(date);
}

/** Rate readout number, rounded to two significant figures. */
export function roundRate(yearsPerMinute: number): number {
  if (yearsPerMinute <= 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(yearsPerMinute)) - 1);
  return Math.round(yearsPerMinute / magnitude) * magnitude;
}

export function formatRateNumber(yearsPerMinute: number, language: Language): string {
  const r = roundRate(yearsPerMinute);
  return numberFormat(language, RATE_DIGITS).format(r);
}
