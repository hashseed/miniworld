import { describe, expect, it } from 'vitest';
import { ACACIA, BUSH, CONIFER, HUMID_SAVANNA, isDry, pickKind, recipeOf } from './foliageKinds.ts';

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
