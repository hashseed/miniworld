import { describe, expect, it } from 'vitest';
import { MARCH, stepsIn } from './LoadingScreen.tsx';

describe('loading screen march (milestone-1 section 8.6)', () => {
  it('steps the walkers in from the ape to the modern human as loading goes on', () => {
    const shown = (loaded: number) => MARCH.filter((_, k) => stepsIn(k, loaded)).length;
    expect(shown(0)).toBe(0);
    expect(shown(0.05)).toBe(1);
    expect(shown(1)).toBe(MARCH.length);
    for (let a = 0; a < 1; a += 0.05) expect(shown(a + 0.05)).toBeGreaterThanOrEqual(shown(a));
    // The modern human comes only when the world is nearly ready.
    expect(stepsIn(MARCH.length - 1, 0.8)).toBe(false);
  });
});
