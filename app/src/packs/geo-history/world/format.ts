// How ages are written (geo-history.md, section 3): "620 Ma" and "vor 620 Mio. Jahren".

import type { Language } from '../../../engine/i18n/messages.ts';

const nf = (language: Language, digits: number): Intl.NumberFormat =>
  new Intl.NumberFormat(language, { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** An age in years before today, as text; `today` is shown for 0. */
export function formatAge(years: number, language: Language, today: string): string {
  if (years <= 0) return today;
  const ma = years / 1_000_000;
  if (ma >= 1) {
    const text = nf(language, ma >= 10 ? 0 : 1).format(ma);
    return language === 'de' ? `vor ${text} Mio. Jahren` : `${text} Ma`;
  }
  const rounded = Math.max(1000, Math.round(years / 1000) * 1000);
  const text = nf(language, 0).format(language === 'de' ? rounded : rounded / 1000);
  return language === 'de' ? `vor ${text} Jahren` : `${text} ka`;
}

/** The short form for the timeline ruler: "620 Ma" in both languages. */
export function formatMa(ma: number, language: Language): string {
  if (ma === 0) return '0';
  return nf(language, ma >= 10 ? 0 : 1).format(ma);
}
