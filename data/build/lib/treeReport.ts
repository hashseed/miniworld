// Keeping track of the tree of humankind (spec humankind.md, section 6): the
// report, the questions `at` and `lineage`, and a map of the camps.

import { formatYear } from '../../../app/src/i18n/dates.ts';
import { dateFromDay, DAYS_PER_YEAR, type Day } from '../../../app/src/time/calendar.ts';
import { aliveOn, homeOn, NEVER, type Tree } from '../../../app/src/world/tree.ts';
import { regionAt } from './regions.ts';

export const yearOf = (day: Day): string => formatYear(dateFromDay(day).year, 'en');

/** Parses "62000 BCE", "62000BCE", "1500 CE" or "1500" into the first day of that year. */
export function parseYear(text: string, dayOfYearStart: (astro: number) => Day): Day | undefined {
  const m = /^\s*(\d[\d,]*)\s*(BCE|CE)?\s*$/i.exec(text);
  if (!m) return undefined;
  const n = Number(m[1]!.replaceAll(',', ''));
  return dayOfYearStart(m[2]?.toUpperCase() === 'BCE' ? 1 - n : n);
}

/** Where a lodging stands, in degrees. */
const place = (tree: Tree, lodging: number) => {
  const l = tree.lodgings[lodging]!;
  return { lat: l.lat / 1e6, lon: l.lon / 1e6 };
};

/** The camps standing on a day, with their place and the figures living there. */
export function campsOn(tree: Tree, day: Day) {
  const camps = new Map<
    number,
    { lat: number; lon: number; lodgings: number; figures: number[] }
  >();
  for (const l of tree.lodgings) {
    if (l.built > day || (l.gone !== NEVER && l.gone <= day)) continue;
    const c = camps.get(l.camp) ?? { ...place(tree, l.id), lodgings: 0, figures: [] };
    c.lodgings++;
    camps.set(l.camp, c);
  }
  for (const f of tree.figures) {
    if (!aliveOn(f, day)) continue;
    camps.get(tree.lodgings[homeOn(f, day)]!.camp)?.figures.push(f.id);
  }
  return camps;
}

/** The camp a camp budded from: where its founder lived before (section 6, tree overlay). */
export function parentCamps(tree: Tree): Map<number, number> {
  const parents = new Map<number, number>();
  for (const m of tree.moments) {
    if (m.kind !== 'camp-founded') continue;
    const homes = tree.figures[m.figure]!.homes;
    const i = homes.findIndex(([d, l]) => d === m.day && tree.lodgings[l]!.camp === m.camp);
    if (i > 0) parents.set(m.camp, tree.lodgings[homes[i - 1]![1]]!.camp);
  }
  return parents;
}

/** The report of section 6, as Markdown. */
export function treeReport(tree: Tree, startDay: Day, endDay: Day, windowYears = 1000): string {
  const lines: string[] = [];
  const founded = tree.moments.filter((m) => m.kind === 'camp-founded');
  const moved = tree.moments.filter((m) => m.kind === 'camp-moved-away');
  lines.push('# Tree of humankind', '');
  lines.push(
    `From ${yearOf(startDay)} to ${yearOf(endDay)}: ${tree.figures.length} figures, ` +
      `${tree.lodgings.length} lodgings, ${founded.length + 1} camps founded, ` +
      `${moved.length} camps moved away from sea, ice or desert. ` +
      `The deepest line has ${Math.max(...tree.figures.map((f) => f.depth))} generations of figures.`,
    '',
  );
  const regions = new Set<string>();
  const rows: {
    day: Day;
    byRegion: Map<string, { camps: number; figures: number }>;
    born: number;
    founded: number;
  }[] = [];
  const step = Math.round(windowYears * DAYS_PER_YEAR);
  for (let day = startDay; day < endDay; day += step) {
    const byRegion = new Map<string, { camps: number; figures: number }>();
    for (const c of campsOn(tree, day + step - 1).values()) {
      const r = regionAt(c.lat, c.lon);
      regions.add(r);
      const v = byRegion.get(r) ?? { camps: 0, figures: 0 };
      v.camps++;
      v.figures += c.figures.length;
      byRegion.set(r, v);
    }
    rows.push({
      day,
      byRegion,
      born: tree.figures.filter((f) => f.born >= day && f.born < day + step).length,
      founded: founded.filter((m) => m.day >= day && m.day < day + step).length,
    });
  }
  const names = [...regions];
  lines.push(`## Per ${windowYears} years`, '');
  lines.push(
    `| From | ${names.map((n) => `${n} camps / figures`).join(' | ')} | born | camps founded |`,
    `|---|${names.map(() => '---:').join('|')}|---:|---:|`,
  );
  for (const r of rows)
    lines.push(
      `| ${yearOf(r.day)} | ${names
        .map((n) => {
          const v = r.byRegion.get(n);
          return v ? `${v.camps} / ${v.figures}` : '';
        })
        .join(' | ')} | ${r.born} | ${r.founded} |`,
    );
  lines.push('', '## Branches', '');
  for (const b of tree.branches) {
    const f = tree.figures[b.figure]!;
    const p = place(tree, f.homes[0]![1]);
    lines.push(
      `- Branch ${b.id} (${b.reason}), ${yearOf(b.day)} at ${p.lat.toFixed(1)}°, ${p.lon.toFixed(1)}°, ` +
        `first figure ${b.figure}${b.parent === NEVER ? '' : `, from branch ${b.parent}`}`,
    );
  }
  lines.push('', '## Key moments', '');
  for (const m of tree.moments.slice(0, 200))
    lines.push(
      `- ${yearOf(m.day)}: ${m.kind}, figure ${m.figure}, camp ${m.camp} at ` +
        `${(m.lat / 1e6).toFixed(1)}°, ${(m.lon / 1e6).toFixed(1)}°`,
    );
  if (tree.moments.length > 200) lines.push(`- … and ${tree.moments.length - 200} more`);
  lines.push(
    '',
    'The checks of section 5 run in the data build, which fails if any of them does.',
    '',
  );
  return lines.join('\n');
}

/** The camps and figures alive on a day, as text (section 6, `at`). */
export function treeAt(tree: Tree, day: Day, region?: string): string {
  const out: string[] = [];
  let figures = 0;
  for (const [id, c] of campsOn(tree, day)) {
    if (region && regionAt(c.lat, c.lon) !== region) continue;
    figures += c.figures.length;
    out.push(
      `camp ${id} at ${c.lat.toFixed(2)}°, ${c.lon.toFixed(2)}° (${regionAt(c.lat, c.lon)}): ` +
        `${c.lodgings} lodgings, figures ${c.figures.join(', ')}`,
    );
  }
  out.unshift(`${yearOf(day)}: ${out.length} camps, ${figures} figures`);
  return out.join('\n');
}

/** A figure's line back to its root, shortened to where its home camp changed (section 6, `lineage`). */
export function treeLineage(tree: Tree, id: number): string {
  const steps: string[] = [];
  let lastCamp = NEVER;
  for (let f = id; f !== NEVER; f = tree.figures[f]!.parent) {
    const fig = tree.figures[f]!;
    const lodging = tree.lodgings[fig.homes[0]![1]]!;
    if (lodging.camp === lastCamp && fig.parent !== NEVER) continue;
    lastCamp = lodging.camp;
    steps.push(
      `figure ${f}, camp ${lodging.camp} at ${(lodging.lat / 1e6).toFixed(1)}°, ` +
        `${(lodging.lon / 1e6).toFixed(1)}° ${yearOf(fig.born)}`,
    );
  }
  return `${steps.join(' ← ')} (${tree.figures[id]!.depth} generations)`;
}

/**
 * A map of the camps ever founded, coloured from early (dark) to late
 * (light), with a line from each camp to the camp it budded from, over the
 * land rings given, on an equirectangular map of the box.
 */
export function treeMapSvg(
  tree: Tree,
  land: [number, number][][],
  box: { west: number; east: number; south: number; north: number },
  startDay: Day,
  endDay: Day,
): string {
  const scale = 12;
  const W = (box.east - box.west) * scale;
  const H = (box.north - box.south) * scale;
  const x = (lon: number) => ((lon - box.west) * scale).toFixed(1);
  const y = (lat: number) => ((box.north - lat) * scale).toFixed(1);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#cfe3ef"/>`,
  ];
  for (const ring of land)
    parts.push(
      `<path d="${ring.map(([lon, lat], i) => `${i ? 'L' : 'M'}${x(lon)} ${y(lat)}`).join('')}Z" fill="#efe6cf" stroke="#b9ab88"/>`,
    );
  // Each camp at its first place, from its first lodging.
  const first = new Map<number, { lat: number; lon: number; day: Day }>();
  for (const l of tree.lodgings)
    if (!first.has(l.camp)) first.set(l.camp, { lat: l.lat / 1e6, lon: l.lon / 1e6, day: l.built });
  const colour = (day: Day) => {
    const t = Math.min(1, Math.max(0, (day - startDay) / (endDay - startDay)));
    return `hsl(${Math.round(10 + 40 * t)} 75% ${Math.round(30 + 40 * t)}%)`;
  };
  // Each camp's wanderings, from spot to spot as the band moves on.
  const tracks = new Map<number, [number, number][]>();
  for (const l of tree.lodgings) {
    const track = tracks.get(l.camp) ?? [];
    const last = track.at(-1);
    if (!last || last[0] !== l.lon || last[1] !== l.lat) track.push([l.lon, l.lat]);
    tracks.set(l.camp, track);
  }
  for (const track of tracks.values())
    if (track.length > 1)
      parts.push(
        `<polyline points="${track.map(([lon, lat]) => `${x(lon / 1e6)},${y(lat / 1e6)}`).join(' ')}" fill="none" stroke="#8a7a5a" stroke-width="1" stroke-opacity="0.6"/>`,
      );
  // A line from where the founding group set out to the camp it founded.
  for (const m of tree.moments) {
    if (m.kind !== 'camp-founded') continue;
    const homes = tree.figures[m.figure]!.homes;
    const i = homes.findIndex(([d, l]) => d === m.day && tree.lodgings[l]!.camp === m.camp);
    if (i < 1) continue;
    const from = tree.lodgings[homes[i - 1]![1]]!;
    const a = first.get(m.camp)!;
    const b = { lat: from.lat / 1e6, lon: from.lon / 1e6 };
    parts.push(
      `<line x1="${x(b.lon)}" y1="${y(b.lat)}" x2="${x(a.lon)}" y2="${y(a.lat)}" stroke="${colour(a.day)}" stroke-width="2"/>`,
    );
  }
  for (const [, c] of first)
    parts.push(
      `<circle cx="${x(c.lon)}" cy="${y(c.lat)}" r="5" fill="${colour(c.day)}" stroke="#222"/>`,
    );
  const root = first.get(0)!;
  parts.push(
    `<circle cx="${x(root.lon)}" cy="${y(root.lat)}" r="9" fill="none" stroke="#c43f26" stroke-width="3"/>`,
    `<text x="12" y="28" font-family="sans-serif" font-size="20">Camps of the tree of humankind, ${yearOf(startDay)} (dark) to ${yearOf(endDay)} (light); grey: moves</text>`,
    '</svg>',
  );
  return parts.join('\n');
}
