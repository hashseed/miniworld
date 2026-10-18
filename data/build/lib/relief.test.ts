import { describe, expect, it } from 'vitest';
import { Grid } from './grid.ts';
import { famousRelief, PEAK_HEIGHT_SHARE, validateMountains, type Mountain } from './relief.ts';

const peak: Mountain = {
  id: 'p',
  name: 'P',
  reason: 'r',
  source: 's',
  kind: 'peak',
  line: [[0.5, 0.5]],
  widthKm: 40,
  heightM: 4000,
};

const range: Mountain = {
  id: 'r',
  name: 'R',
  reason: 'r',
  source: 's',
  kind: 'range',
  line: [
    [10, 0],
    [10, 2],
  ],
  widthKm: 30,
};

describe('famousRelief', () => {
  const w = 360 * 15;
  const h = 180 * 15;
  const g = (v: number) => new Grid(w, h, new Int16Array(w * h).fill(v));
  const at = (lon: number, lat: number) =>
    Math.floor((90 - lat) * 15) * w + Math.floor((lon + 180) * 15);

  it('keeps the land and raises a cone at a listed peak', () => {
    const out = famousRelief(g(1180), g(1180), [peak]);
    expect(out.data[at(0.5, 0.5)]).toBeGreaterThan(4000 * PEAK_HEIGHT_SHARE - 100);
    expect(out.data[at(0.6, 0.5)]).toBeLessThan(out.data[at(0.5, 0.5)]!);
    expect(out.data[at(3, 3)]).toBe(1180);
  });

  it('keeps the sea floor', () => {
    expect(famousRelief(g(-50), g(1000), [peak, range]).data[at(10, 1)]).toBe(-50);
  });

  it('uses the less smoothed relief along a listed range', () => {
    const out = famousRelief(g(1000), g(3000), [range]);
    expect(out.data[at(10, 1)]).toBe(3000);
    expect(out.data[at(14, 1)]).toBe(1000);
  });
});

describe('validateMountains', () => {
  it('needs a source, a reason, a peak height and the right number of points', () => {
    expect(validateMountains([peak, range])).toEqual([]);
    expect(validateMountains([{ ...peak, source: '', line: [] }])).toHaveLength(2);
    expect(validateMountains([{ ...peak, heightM: undefined }])).toHaveLength(1);
  });
});
