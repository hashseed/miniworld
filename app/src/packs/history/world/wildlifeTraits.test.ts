import { describe, expect, it } from 'vitest';
import { flies, roamOf, swims, traitsOf, WILD_GROUPS } from './wildlife.ts';

const groupOf = (model: string) => WILD_GROUPS.find((g) => g.model === model)!;

describe('wildlife model traits', () => {
  it('come from the data file, with none for an unlisted model', () => {
    expect(traitsOf('animal-dolphin')).toEqual({ moves: 'swim', swim: 'leap' });
    expect(traitsOf('animal-zebra')).toEqual({});
    expect(traitsOf('toString')).toEqual({});
  });

  it('decide who flies, swims and how far they roam', () => {
    expect(flies(groupOf('animal-parrot'))).toBe(true);
    expect(swims(groupOf('animal-whale'))).toBe(true);
    expect(flies(groupOf('animal-elephant')) || swims(groupOf('animal-elephant'))).toBe(false);
    expect(roamOf(groupOf('animal-crocodile'))).toBe(80);
    expect(roamOf(groupOf('animal-elephant'))).toBe(1000);
  });
});
