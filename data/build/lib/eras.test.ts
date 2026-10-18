import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { TIMELINE_START, dayFromDate, dayOfYearStart } from '../../../app/src/time/calendar.ts';
import {
  checkEraList,
  erasForLanguage,
  parseEra,
  readLanes,
  validateEras,
  type CuratedEra,
} from './eras.ts';
import type { Yaml } from './vignettes.ts';

const START = dayOfYearStart(-9999);
const CUTOFF = dayOfYearStart(2025);
const REGIONS = `europe: { en: Europe, de: Europa }\n`;
const LANES = `- { id: world, en: World, de: Welt }\n- { region: europe }\n`;
const SOURCES = parse('a-history: { title: A history, publisher: A press }', {
  schema: 'failsafe',
}) as Yaml;
const inputs = {
  lanes: new Set(['world', 'europe']),
  sources: SOURCES,
  startDay: START,
  cutoffDay: CUTOFF,
};

const record = (
  over: Partial<Record<'id' | 'lane' | 'from' | 'to' | 'colour' | 'extra' | 'body', string>> = {},
) => {
  const o = {
    id: 'rome',
    lane: 'europe',
    from: 'c. 753 BCE',
    to: '476',
    colour: "'#aa3322'",
    extra: '',
    body: '## en\n\n# Roman world\n\n## de\n\n# Römische Welt\n',
    ...over,
  };
  return `---
id: ${o.id}
kind: era
lane: ${o.lane}
when:
  from: ${o.from}
  to: ${o.to}
colour: ${o.colour}
sources:
  - ref: a-history
    note: 'p. 12'
${o.extra}---

${o.body}`;
};
const errorsOf = (text: string, file = 'rome.md') =>
  parseEra(file, text, inputs).errors.map((e) => e.replace(/^eras\/[\w-]+\.md: /, ''));

describe('era vocabularies', () => {
  it('reads the regions and the lanes they make', () => {
    const v = readLanes(REGIONS, LANES);
    expect(v.errors).toEqual([]);
    expect(v.regions).toEqual([{ id: 'europe', label: { en: 'Europe', de: 'Europa' } }]);
    expect(v.lanes.map((l) => [l.id, l.label.de])).toEqual([
      ['world', 'Welt'],
      ['europe', 'Europa'],
    ]);
  });

  it('reports missing labels, unknown and missing regions', () => {
    const v = readLanes(
      `europe: { en: Europe, de: ' ' }\nasia: { en: Asia, de: Asien, fr: Asie }\n`,
      `- { id: world, en: World }\n- { region: europe }\n- { region: mars }\n- { region: europe }\n`,
    );
    expect(v.errors).toEqual([
      'vocab: region europe: missing de label',
      'vocab: region asia has unknown field "fr"',
      'vocab: lane world: missing de label',
      'vocab: lane names unknown region "mars"',
      'vocab: region europe has two lanes',
      'vocab: region asia has no lane',
    ]);
  });

  it('reads the real vocabularies: World and nine regional lanes', () => {
    const read = (f: string) =>
      readFileSync(new URL(`../../curated/vocab/${f}`, import.meta.url), 'utf8');
    const v = readLanes(read('regions.yaml'), read('lanes.yaml'));
    expect(v.errors).toEqual([]);
    expect(v.lanes.map((l) => l.id)).toEqual(['world', ...v.regions.map((r) => r.id)]);
    expect(v.regions).toHaveLength(9);
  });
});

describe('era records', () => {
  it('accepts a valid record and turns its dates into day boundaries', () => {
    const { era, errors } = parseEra('rome.md', record(), inputs);
    expect(errors).toEqual([]);
    expect(era).toEqual({
      id: 'rome',
      lane: 'europe',
      written: { from: 'c. 753 BCE', to: '476' },
      fromDay: dayOfYearStart(-752),
      toDay: dayOfYearStart(476),
      fromApproximate: true,
      toApproximate: false,
      colour: '#aa3322',
      label: { en: 'Roman world', de: 'Römische Welt' },
    });
    const all = parseEra('rome.md', record({ from: 'start', to: 'today' }), inputs).era!;
    expect([all.fromDay, all.toDay, all.fromApproximate]).toEqual([START, CUTOFF, false]);
  });

  it('reports each kind of error', () => {
    expect(errorsOf(record({ lane: 'mars' }))).toEqual(['unknown lane "mars"']);
    expect(errorsOf(record({ colour: 'grey' }))).toEqual(['bad colour "grey"']);
    expect(errorsOf(record({ to: '800 BCE' }))).toEqual(['ends before it starts']);
    expect(errorsOf(record({ from: 'c. 20,000 BCE' }))).toEqual(['lies outside the timeline']);
    expect(errorsOf(record({ from: 'long ago' }))).toEqual(['when needs a from and a to date']);
    expect(errorsOf(record({ id: 'roma' }))).toEqual(['id "roma" must equal the file name']);
    expect(errorsOf(record({ extra: 'region: europe\n' }))).toEqual([
      'record has unknown field "region"',
    ]);
    expect(errorsOf(record().replace('ref: a-history', 'ref: a-myth'))).toEqual([
      'unknown source "a-myth"',
    ]);
    expect(errorsOf(record().replace(/sources:[\s\S]*?---/, '---'))).toEqual(['names no source']);
    expect(errorsOf(record({ body: '## en\n\n# Roman world\n' }))).toEqual([
      'missing language section "## de"',
    ]);
    expect(errorsOf(record({ body: '## en\n\n# Roman world\n\n## de\n\n#  \n' }))).toEqual([
      'de: the section must hold only "# Title"',
    ]);
    expect(
      errorsOf(record({ body: '## en\n\n# Roman world\n\nA card.\n\n## de\n\n# Römische Welt\n' })),
    ).toEqual(['en: the section must hold only "# Title"']);
    expect(errorsOf(record({ body: '## en\n\n# A\n\n## de\n\n# B\n\n## fr\n\n# C\n' }))).toEqual([
      'unknown language section "## fr"',
    ]);
    expect(errorsOf('no front matter')).toEqual(['missing front matter']);
  });

  it('reports duplicate ids across records', () => {
    const era = parseEra('rome.md', record(), inputs).era!;
    expect(validateEras([era, era])).toEqual(['era rome: duplicate id']);
  });

  it('picks the labels of one language for the startup index', () => {
    const era = parseEra('rome.md', record(), inputs).era!;
    const v = readLanes(REGIONS, LANES);
    const de = erasForLanguage({ lanes: v.lanes, eras: [era] }, 'de');
    expect(de.lanes).toEqual([
      { id: 'world', label: 'Welt' },
      { id: 'europe', label: 'Europa' },
    ]);
    expect(de.eras[0]).toEqual({
      id: 'rome',
      lane: 'europe',
      fromDay: dayOfYearStart(-752),
      toDay: dayOfYearStart(476),
      fromApproximate: true,
      toApproximate: false,
      color: '#aa3322',
      label: 'Römische Welt',
    });
  });
});

describe('era list in the spec', () => {
  const v = readLanes(REGIONS, LANES);
  const era = parseEra('rome.md', record(), inputs).era!;
  const md = (rows: string) =>
    `# Eras\n\n## Europe\n\n| ID | English | German | From | To | Note |\n| --- | --- | --- | --- | --- | --- |\n${rows}`;

  it('accepts rows that match the records', () => {
    expect(
      checkEraList(
        md('| `rome` | Roman world | Römische Welt | c. 753 BCE | 476 CE | |\n'),
        v.lanes,
        [era],
      ),
    ).toEqual([]);
  });

  it('reports rows and records that disagree or are missing', () => {
    const other: CuratedEra = { ...era, id: 'gaul' };
    expect(
      checkEraList(
        md(
          '| `rome` | Roman World | Römische Welt | 753 BCE | End of timeline | |\n| `etruria` | Etruria | Etrurien | c. 900 BCE | c. 90 BCE | |\n| | Celts | Kelten | c. 450 BCE | c. 50 BCE | |\n',
        ),
        v.lanes,
        [era, other],
      ),
    ).toEqual([
      'eras/rome.md: en label "Roman world" differs from eras.md "Roman World"',
      'eras/rome.md: from "c. 753 BCE" differs from eras.md "753 BCE"',
      'eras/rome.md: to "476" differs from eras.md "today"',
      'eras.md: etruria has no record',
      'eras.md: row "Celts" has no ID',
      'eras/gaul.md: not in eras.md',
    ]);
  });
});

describe('the curated eras', () => {
  it('are valid records that agree with docs/spec/eras.md', () => {
    const curated = new URL('../../curated/', import.meta.url);
    const read = (f: string) => readFileSync(new URL(f, curated), 'utf8');
    const v = readLanes(read('vocab/regions.yaml'), read('vocab/lanes.yaml'));
    const sources = parse(read('sources.yaml'), { schema: 'failsafe' }) as Yaml;
    const opts = {
      lanes: new Set(v.lanes.map((l) => l.id)),
      sources,
      startDay: TIMELINE_START,
      cutoffDay: dayFromDate(1991, 12, 26),
    };
    const errors: string[] = [];
    const eras: CuratedEra[] = [];
    for (const f of readdirSync(new URL('eras/', curated)).filter((n) => n.endsWith('.md'))) {
      const r = parseEra(f, read(`eras/${f}`), opts);
      errors.push(...r.errors);
      if (r.era) eras.push(r.era);
    }
    errors.push(...validateEras(eras));
    const spec = readFileSync(new URL('../../../docs/spec/eras.md', import.meta.url), 'utf8');
    errors.push(...checkEraList(spec, v.lanes, eras));
    expect(errors).toEqual([]);
    // Every lane has eras.
    for (const l of v.lanes) expect(eras.some((e) => e.lane === l.id)).toBe(true);
  });
});
