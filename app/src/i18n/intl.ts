// Intl formatters are slow to create, so each one is made once per language
// and options and then reused (the date readout formats every frame).

const numbers = new Map<string, Intl.NumberFormat>();
const dates = new Map<string, Intl.DateTimeFormat>();
const plurals = new Map<string, Intl.PluralRules>();

function cached<T>(
  map: Map<string, T>,
  locale: string,
  options: object | undefined,
  make: () => T,
): T {
  const key = options ? `${locale}|${JSON.stringify(options)}` : locale;
  let f = map.get(key);
  if (!f) {
    f = make();
    map.set(key, f);
  }
  return f;
}

export function numberFormat(
  locale: string,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  return cached(numbers, locale, options, () => new Intl.NumberFormat(locale, options));
}

export function dateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return cached(dates, locale, options, () => new Intl.DateTimeFormat(locale, options));
}

export function pluralRules(locale: string): Intl.PluralRules {
  return cached(plurals, locale, undefined, () => new Intl.PluralRules(locale));
}
