import { describe, expect, it } from 'vitest';
import { LOOKS } from '../../../assets/src/people.ts';
import { SHELTERS } from '../../../assets/src/shelters.ts';
import { campLodgingOf, CULTURES, huntsOf, PROFILES, type Profile } from './cultures.ts';
import {
  NEOLITHIC_PROFILES,
  NEOLITHIC_ROLES,
  NEOLITHIC_TOOLS,
  isNeolithicProfile,
  neolithicProfile,
} from './neolithicProfiles.ts';

const ids = Object.keys(NEOLITHIC_PROFILES) as Profile[];

describe('Neolithic profiles', () => {
  it('are all culture profiles with a look', () => {
    for (const id of ids) {
      expect(PROFILES as readonly string[]).toContain(id);
      expect(LOOKS[id]).toBeDefined();
    }
  });

  it.each(ids)('%s has a role mix summing to 100 over known roles', (id) => {
    const mix = neolithicProfile(id).mix;
    expect(Object.keys(mix).sort()).toEqual([...NEOLITHIC_ROLES].sort());
    expect(Object.values(mix).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it.each(ids)('%s holds the tools its record names and uses known tools', (id) => {
    const rec = neolithicProfile(id);
    for (const kind of ['man', 'woman', 'child'] as const) {
      expect(rec.tools[kind]).toBe(LOOKS[id].tools[kind]);
      expect(NEOLITHIC_TOOLS as readonly string[]).toContain(rec.tools[kind]);
    }
  });

  it.each(ids)('%s names shelters of the model set', (id) => {
    for (const shelter of neolithicProfile(id).architecture)
      expect(SHELTERS as readonly string[]).toContain(shelter);
  });

  it('are the profiles of the culture table with a farming block', () => {
    // The ten of the farming spread and their two successors (culture-succession.md section 3.2).
    expect(ids.length).toBe(12);
    for (const p of PROFILES)
      expect(isNeolithicProfile(p)).toBe(CULTURES.get(p)?.farming !== undefined);
    expect(() => neolithicProfile('african-stone-age')).toThrow();
  });
});

describe('culture table', () => {
  it('has a row for every profile', () => {
    expect([...CULTURES.keys()].sort()).toEqual([...PROFILES].sort());
  });

  it('names each camp lodging', () => {
    expect(campLodgingOf('natufian')).toBe('shelter-natufian-house');
    expect(campLodgingOf('lbk-farmer')).toBe('shelter-lbk-longhouse');
    expect(campLodgingOf('old-kingdom-egyptian')).toBeUndefined();
    expect(campLodgingOf(undefined)).toBeUndefined();
  });

  it("gives a profile without prey of its own the founder people's prey", () => {
    expect(huntsOf('neanderthal')).toEqual(huntsOf('african-stone-age'));
    expect(huntsOf(undefined)).toEqual(['animal-zebra', 'animal-eland']);
    expect(huntsOf('ice-age-hunter')).toContain('animal-mammoth');
  });
});
