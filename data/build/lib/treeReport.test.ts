import { describe, expect, it } from 'vitest';
import {
  astronomicalYear,
  dayOfYearStart,
  TIMELINE_START,
} from '../../../app/src/time/calendar.ts';
import { NEVER, type Tree } from '../../../app/src/world/tree.ts';
import { campsOn, parentCamps, parseYear, treeAt, treeLineage, yearOf } from './treeReport.ts';

const d0 = TIMELINE_START;
// The first person (0) in camp 0; her child (1) founds camp 1 with a lodging there.
const tree: Tree = {
  figures: [
    { id: 0, parent: NEVER, born: d0, branch: 0, depth: 0, homes: [[d0, 0]], lost: NEVER },
    {
      id: 1,
      parent: 0,
      born: d0 + 100,
      branch: 0,
      depth: 1,
      homes: [
        [d0 + 100, 0],
        [d0 + 500, 1],
      ],
      lost: NEVER,
    },
  ],
  lodgings: [
    {
      id: 0,
      camp: 0,
      lat: 3_950_000,
      lon: 36_200_000,
      built: d0,
      gone: NEVER,
      builder: 0,
      kind: 'hut',
    },
    {
      id: 1,
      camp: 1,
      lat: 0,
      lon: 30_000_000,
      built: d0 + 500,
      gone: NEVER,
      builder: 1,
      kind: 'hut',
    },
  ],
  branches: [{ id: 0, parent: NEVER, figure: 0, day: d0, reason: 'root' }],
  moments: [
    { day: d0, kind: 'root', figure: 0, camp: 0, branch: 0, lat: 3_950_000, lon: 36_200_000 },
    { day: d0 + 500, kind: 'camp-founded', figure: 1, camp: 1, branch: 0, lat: 0, lon: 30_000_000 },
  ],
};

describe('tree questions', () => {
  it('parses and writes years', () => {
    const at = (astro: number) => dayOfYearStart(astro);
    expect(parseYear('62000 BCE', at)).toBe(dayOfYearStart(astronomicalYear(62000, 'BCE')));
    expect(parseYear('62,000BCE', at)).toBe(dayOfYearStart(astronomicalYear(62000, 'BCE')));
    expect(parseYear('1500', at)).toBe(dayOfYearStart(1500));
    expect(parseYear('soon', at)).toBeUndefined();
    expect(yearOf(d0)).toBe('70,000 BCE');
  });

  it('finds the camps of a day and where each camp came from', () => {
    expect([...campsOn(tree, d0 + 200).keys()]).toEqual([0]);
    expect(campsOn(tree, d0 + 600).get(1)!.figures).toEqual([1]);
    expect(parentCamps(tree)).toEqual(new Map([[1, 0]]));
    expect(treeAt(tree, d0 + 600)).toMatch(/^69,999 BCE: 2 camps, 2 figures/);
  });

  it('traces a line back to the first person', () => {
    expect(treeLineage(tree, 1)).toBe(
      'figure 1, camp 0 at 4.0°, 36.2° 70,000 BCE ← figure 0, camp 0 at 4.0°, 36.2° 70,000 BCE (1 generations)',
    );
  });
});
