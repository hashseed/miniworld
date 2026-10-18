// Message formatting with placeholders and plural forms (spec milestone 1,
// section 8.4). Supports "{name}" and "{name, plural, one {...} other {...}}",
// where "#" inside a plural branch is replaced by the formatted number.

export type Language = 'en' | 'de';
export const LANGUAGES: readonly Language[] = ['en', 'de'];
export const FALLBACK_LANGUAGE: Language = 'en';

export type Messages = Record<string, string>;
export type Params = Record<string, string | number>;

export function formatMessage(
  template: string,
  params: Params,
  language: Language,
  formatNumber: (n: number) => string = (n) => new Intl.NumberFormat(language).format(n),
): string {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i]!;
    if (ch !== '{') {
      out += ch;
      i++;
      continue;
    }
    const end = matchingBrace(template, i);
    const body = template.slice(i + 1, end);
    out += formatArgument(body, params, language, formatNumber);
    i = end + 1;
  }
  return out;
}

function matchingBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced braces in message: ${s}`);
}

function formatArgument(
  body: string,
  params: Params,
  language: Language,
  formatNumber: (n: number) => string,
): string {
  const comma = body.indexOf(',');
  if (comma < 0) {
    const v = params[body.trim()];
    if (v === undefined) return `{${body}}`;
    return typeof v === 'number' ? formatNumber(v) : v;
  }
  const name = body.slice(0, comma).trim();
  const rest = body.slice(comma + 1);
  const comma2 = rest.indexOf(',');
  const kind = rest.slice(0, comma2).trim();
  if (kind !== 'plural') throw new Error(`Unsupported message argument: ${kind}`);
  const value = params[name];
  const n = typeof value === 'number' ? value : Number(value);
  const branches = parseBranches(rest.slice(comma2 + 1));
  const exact = branches.get(`=${n}`);
  const category = new Intl.PluralRules(language).select(n);
  const branch = exact ?? branches.get(category) ?? branches.get('other') ?? '';
  const display = typeof value === 'string' ? value : formatNumber(n);
  return formatMessage(branch, params, language, formatNumber).replaceAll('#', display);
}

function parseBranches(s: string): Map<string, string> {
  const branches = new Map<string, string>();
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i]!)) i++;
    if (i >= s.length) break;
    const keyStart = i;
    while (i < s.length && s[i] !== '{' && !/\s/.test(s[i]!)) i++;
    const key = s.slice(keyStart, i);
    while (i < s.length && s[i] !== '{') i++;
    const end = matchingBrace(s, i);
    branches.set(key, s.slice(i + 1, end));
    i = end + 1;
  }
  return branches;
}

/** Picks the viewer's language from the browser, falling back to English. */
export function detectLanguage(browserLanguages: readonly string[]): Language {
  for (const tag of browserLanguages) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'de') return 'de';
    if (base === 'en') return 'en';
  }
  return FALLBACK_LANGUAGE;
}
