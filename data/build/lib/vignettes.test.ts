import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TIMELINE_START,
  astronomicalYear,
  dayOfYearStart,
} from '../../../app/src/time/calendar.ts';
import { buildVignettes, compileTemplate, parseDate } from './vignettes.ts';

const CURATED = new URL('../../curated', import.meta.url).pathname;
const TEMPLATE = readFileSync(join(CURATED, 'templates/big-game-hunt.yaml'), 'utf8');

describe('vignette formats', () => {
  it('builds the mammoth hunt without errors', () => {
    const r = buildVignettes({
      curated: CURATED,
      lanes: new Set(['europe']),
      animals: new Set(['woolly-mammoth']),
      startDay: TIMELINE_START,
      cutoffDay: 0,
    });
    expect(r.errors).toEqual([]);
    const v = r.vignettes.find((x) => x.structure.id === 'mammoth-hunt')!;
    expect(v.structure.fromDay).toBe(dayOfYearStart(astronomicalYear(43000, 'BCE')));
    expect(v.structure.toDay).toBe(dayOfYearStart(astronomicalYear(10000, 'BCE') + 1));
    expect(v.text.en.title).toBe('Mammoth hunt');
    expect(v.text.de.title).toBe('Mammutjagd');
    expect(v.text.de.learnMore).not.toBe('');
    expect(v.structure.template.groups.find((g) => g.name === 'prey')!.look).toBe('woolly-mammoth');
  });

  it('parses written dates', () => {
    expect(parseDate('c. 43,000 BCE', 0, 0)).toEqual({
      first: dayOfYearStart(-42999),
      end: dayOfYearStart(-42998),
      approximate: true,
    });
    expect(parseDate('1492', 0, 0)!.approximate).toBe(false);
    expect(parseDate('43000BC', 0, 0)).toBeUndefined();
  });

  it('rejects unknown verbs, marks and groups', () => {
    const bad = TEMPLATE.replace('{ walk-to: lookout }', '{ fly-to: lookout }')
      .replace('{ run-to: trap }', '{ run-to: nowhere }')
      .replace('{ throw-at: prey }', '{ throw-at: ghosts }');
    const r = compileTemplate('big-game-hunt.yaml', bad);
    expect(r.errors.join('\n')).toMatch(/unknown action "fly-to"/);
    expect(r.errors.join('\n')).toMatch(/run-to needs a mark, got "nowhere"/);
    expect(r.errors.join('\n')).toMatch(/throw-at needs a group, got "ghosts"/);
  });

  it('rejects a loop that does not close', () => {
    const bad = TEMPLATE.replace('  - { at: 55, prey: appear }\n', '');
    const r = compileTemplate('big-game-hunt.yaml', bad);
    expect(r.errors.join('\n')).toMatch(/prey #0 ends away from its starting mark/);
    expect(r.errors.join('\n')).toMatch(/prey #0 ends hidden/);
  });
});
