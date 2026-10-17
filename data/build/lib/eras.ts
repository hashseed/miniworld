// Era records for the timeline (spec milestone 1, section 7.4).

import type { EraRecord } from '../../../app/src/content/types.ts';
import { LANGUAGES, type Language } from '../../../app/src/i18n/messages.ts';
import { astronomicalYear, dayOfYearStart } from '../../../app/src/time/calendar.ts';

type CuratedDate =
  { start: true } | { today: true } | { year: number; era: 'BCE' | 'CE'; approximate: boolean };

export interface CuratedEra {
  id: string;
  lane: string;
  from: CuratedDate;
  to: CuratedDate;
  color: string;
  label: Record<Language, string>;
  source: { title: string; publisher: string };
}

export interface CuratedEras {
  lanes: { id: string; label: Record<Language, string> }[];
  eras: CuratedEra[];
}

export function validateEras(data: CuratedEras, startDay: number, cutoffDay: number): string[] {
  const errors: string[] = [];
  const lanes = new Set(data.lanes.map((l) => l.id));
  const ids = new Set<string>();
  for (const lane of data.lanes)
    for (const lang of LANGUAGES)
      if (!lane.label[lang]?.trim()) errors.push(`lane ${lane.id}: missing ${lang} label`);
  for (const e of data.eras) {
    if (ids.has(e.id)) errors.push(`era ${e.id}: duplicate id`);
    ids.add(e.id);
    if (!lanes.has(e.lane)) errors.push(`era ${e.id}: unknown lane ${e.lane}`);
    for (const lang of LANGUAGES)
      if (!e.label[lang]?.trim()) errors.push(`era ${e.id}: missing ${lang} label`);
    if (!e.source?.title || !e.source?.publisher) errors.push(`era ${e.id}: missing source`);
    if (!/^#[0-9a-f]{6}$/i.test(e.color)) errors.push(`era ${e.id}: bad colour`);
    const from = toDay(e.from, startDay, cutoffDay);
    const to = toDay(e.to, startDay, cutoffDay);
    if (from >= to) errors.push(`era ${e.id}: ends before it starts`);
    if (from < startDay || to > cutoffDay) errors.push(`era ${e.id}: outside the timeline`);
  }
  return errors;
}

function toDay(d: CuratedDate, startDay: number, cutoffDay: number): number {
  if ('start' in d) return startDay;
  if ('today' in d) return cutoffDay;
  return dayOfYearStart(astronomicalYear(d.year, d.era));
}

function isApprox(d: CuratedDate): boolean {
  return 'year' in d && d.approximate;
}

export function erasForLanguage(
  data: CuratedEras,
  language: Language,
  startDay: number,
  cutoffDay: number,
): { lanes: { id: string; label: string }[]; eras: EraRecord[] } {
  return {
    lanes: data.lanes.map((l) => ({ id: l.id, label: l.label[language] })),
    eras: data.eras.map((e) => ({
      id: e.id,
      lane: e.lane,
      fromDay: toDay(e.from, startDay, cutoffDay),
      toDay: toDay(e.to, startDay, cutoffDay),
      fromApproximate: isApprox(e.from),
      toApproximate: isApprox(e.to),
      color: e.color,
      label: e.label[language],
    })),
  };
}
