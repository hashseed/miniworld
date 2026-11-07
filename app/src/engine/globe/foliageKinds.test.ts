import { describe, expect, it } from 'vitest';
import {
  ACACIA,
  BUSH,
  CONIFER,
  groundOf,
  HUMID_SAVANNA,
  isDry,
  pickKind,
  recipeOf,
} from './foliageKinds.ts';

describe('foliage kinds', () => {
  it('picks kinds by the share of slots in a recipe', () => {
    const taiga = recipeOf(10);
    expect(pickKind(taiga, 0.5)).toBe(CONIFER);
    expect(pickKind(taiga, 0.9)).toBe(-1);
  });

  it('leaves deserts bare and marks them dry', () => {
    expect(recipeOf(21)).toEqual([]);
    expect(isDry(21)).toBe(true);
    expect(isDry(4)).toBe(false);
  });

  it('scales humid savanna by its strength', () => {
    const full = recipeOf(HUMID_SAVANNA + 127);
    expect(pickKind(full, 0.1)).toBe(ACACIA);
    expect(pickKind(full, 0.4)).toBe(BUSH);
    expect(isDry(HUMID_SAVANNA + 127)).toBe(false);
  });
});

describe('ground under the plants', () => {
  it('leaves deserts, barren land and ice to the milestone 1 colours', () => {
    for (const code of [0, 21, 27, 28]) expect(groundOf(code, 1)[3]).toBe(0);
  });

  it('tints forest floors and turns thinned forest to open steppe', () => {
    const dense = groundOf(10, 1);
    const thinned = groundOf(10, 0);
    expect(dense[3]).toBeGreaterThan(0.5);
    expect(thinned[0]).toBeGreaterThan(dense[0] + 0.3); // much more yellow
    expect(groundOf(20, 0)).toEqual(groundOf(20, 1)); // grassland has no trees to thin
  });

  it('greens the humid-period savanna by its strength', () => {
    expect(groundOf(HUMID_SAVANNA + 127, 1)[3]).toBeCloseTo(0.8);
    expect(groundOf(HUMID_SAVANNA + 1, 1)[3]).toBeLessThan(0.01);
  });
});
