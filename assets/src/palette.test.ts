import { describe, expect, it } from 'vitest';
import { ART_SCALE, EARTH, OPENING, PLINTH, ROOF, SHELTER, TIMBER } from './palette.ts';
import { PLINTH_DEPTH_M } from './plinth.ts';

describe('palette', () => {
  it('defines valid 6-digit hex colors across every material group', () => {
    const groups = { TIMBER, EARTH, ROOF, OPENING, SHELTER, PLINTH };
    for (const [groupName, group] of Object.entries(groups)) {
      for (const [key, value] of Object.entries(group)) {
        expect(value, `${groupName}.${key}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('matches canonical plinth depth with plinth.ts', () => {
    expect(ART_SCALE.plinthDepthM).toBe(PLINTH_DEPTH_M);
    expect(ART_SCALE.adultHeightM).toBe(1.7);
  });
});
