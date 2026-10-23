import { describe, expect, it } from 'vitest';
import { LOOKS } from '../../../assets/src/people.ts';
import { SHELTERS } from '../../../assets/src/shelters.ts';
import { PROFILES } from './cultures.ts';
import {
  NEOLITHIC_PROFILES,
  NEOLITHIC_ROLES,
  NEOLITHIC_TOOLS,
  type NeolithicProfileId,
} from './neolithicProfiles.ts';

const ids = Object.keys(NEOLITHIC_PROFILES) as NeolithicProfileId[];

describe('Neolithic profiles', () => {
  it('are all culture profiles with a look', () => {
    for (const id of ids) {
      expect(PROFILES as readonly string[]).toContain(id);
      expect(LOOKS[id]).toBeDefined();
    }
  });

  it.each(ids)('%s has a role mix summing to 100 over known roles', (id) => {
    const mix = NEOLITHIC_PROFILES[id].mix;
    expect(Object.keys(mix).sort()).toEqual([...NEOLITHIC_ROLES].sort());
    expect(Object.values(mix).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it.each(ids)('%s holds the tools its record names and uses known tools', (id) => {
    const rec = NEOLITHIC_PROFILES[id];
    for (const kind of ['man', 'woman', 'child'] as const) {
      expect(rec.tools[kind]).toBe(LOOKS[id].tools[kind]);
      expect(NEOLITHIC_TOOLS as readonly string[]).toContain(rec.tools[kind]);
    }
  });

  it.each(ids)('%s names shelters of the model set', (id) => {
    for (const shelter of NEOLITHIC_PROFILES[id].architecture)
      expect(SHELTERS as readonly string[]).toContain(shelter);
  });
});
