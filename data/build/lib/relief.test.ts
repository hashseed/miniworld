import { describe, expect, it } from 'vitest';
import { Grid } from './grid.ts';
import { famousRelief, validateMountains, type Mountain } from './relief.ts';

const peak: Mountain = {
  id: 'p',
  name: 'P',
  reason: 'r',
  source: 's',
  kind: 'peak',
  line: [[0.5, 0.5]],
  widthKm: 40,
};

describe('famousRelief', () => {
  it('keeps the land and the sea floor and raises a cone at a listed peak', () => {
    const w = 360 * 15;
    const h = 180 * 15;
    const g = (v: number) => new Grid(w, h, new Int16Array(w * h).fill(v));
    const at = (lon: number, lat: number) =>
      Math.floor((90 - lat) * 15) * w + Math.floor((lon + 180) * 15);
    const out = famousRelief(g(1180), g(1180), g(1180), g(2500), [peak]);
    expect(out.data[at(0.5, 0.5)]).toBeGreaterThan(2400);
    expect(out.data[at(0.6, 0.5)]).toBeLessThan(out.data[at(0.5, 0.5)]!);
    expect(out.data[at(3, 3)]).toBe(1180);
    expect(famousRelief(g(1000), g(-50), g(1000), g(2500), [peak]).data[at(3, 3)]).toBe(-50);
  });
});

describe('validateMountains', () => {
  it('needs a source, a reason and the right number of points', () => {
    expect(validateMountains([peak])).toEqual([]);
    expect(validateMountains([{ ...peak, source: '', line: [] }])).toHaveLength(2);
  });
});
