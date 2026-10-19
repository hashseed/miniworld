import { describe, expect, it } from 'vitest';
import { filledTo, MARCH, PLACES } from './LoadingScreen.tsx';

describe('loading screen march (milestone-1 section 8.6)', () => {
  it('fills the march in white from the ape to the modern human as loading goes on', () => {
    expect(filledTo(0)).toBe(0);
    for (let a = 0; a < 1; a += 0.05) expect(filledTo(a + 0.05)).toBeGreaterThan(filledTo(a));
    // The walkers stand in order along the line, from the most bent to the most upright.
    for (let k = 1; k < MARCH.length; k++) {
      expect(PLACES[k]!).toBeGreaterThan(PLACES[k - 1]!);
      expect(MARCH[k]!.lean).toBeLessThan(MARCH[k - 1]!.lean);
    }
    // The modern human is white only when the world is nearly ready.
    expect(filledTo(0.8)).toBeLessThan(PLACES[MARCH.length - 1]!);
    expect(filledTo(1)).toBeGreaterThan(PLACES[MARCH.length - 1]! + 40);
  });
});
