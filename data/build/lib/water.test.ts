import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Grid } from './grid.ts';
import { NO_LAKE, rasterizeLakes, riverCoreKm, smoothLine } from './water.ts';

describe('rivers', () => {
  it('gives major rivers a core at least as wide as minor ones', () => {
    for (let rank = 0; rank < 12; rank++)
      expect(riverCoreKm(rank)).toBeGreaterThanOrEqual(riverCoreKm(rank + 1));
    expect(riverCoreKm(1)).toBeGreaterThan(riverCoreKm(6));
  });

  it('smooths a line, keeping its ends and doubling its points each round', () => {
    const line = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    const once = smoothLine(line, 1);
    expect(once).toHaveLength(6);
    expect(once[1]).toEqual([2.5, 0]);
    const twice = smoothLine(line);
    expect(twice).toHaveLength(12);
    expect(twice[0]).toEqual([0, 0]);
    expect(twice[twice.length - 1]).toEqual([10, 10]);
    // Two points are already straight.
    expect(smoothLine([line[0]!, line[1]!])).toHaveLength(2);
  });
});

describe('lakes', () => {
  // A 10° world with ground at 100 m and a 30° square lake at 0..30°E, 0..30°N.
  const W = 36;
  const H = 18;
  const square = (w: number, s: number, e: number, n: number) => [
    [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ],
  ];
  const path = join(mkdtempSync(join(tmpdir(), 'lakes-')), 'lakes.json');
  writeFileSync(
    path,
    JSON.stringify({
      features: [
        {
          properties: { scalerank: 1 },
          geometry: { type: 'Polygon', coordinates: square(0, 0, 30, 30) },
        },
        {
          properties: { scalerank: 6 },
          geometry: { type: 'Polygon', coordinates: square(-60, -30, -40, -10) },
        },
      ],
    }),
  );

  it('marks lake cells with the shore level and leaves the rest', () => {
    const heights = new Grid(W, H, new Int16Array(W * H).fill(100));
    const out = new Int16Array(W * H).fill(NO_LAKE);
    expect(rasterizeLakes(heights, path, out, 3)).toBe(1);
    const lake = new Set<number>();
    for (let r = 6; r <= 8; r++) for (let c = 18; c <= 20; c++) lake.add(r * W + c);
    for (let i = 0; i < W * H; i++) expect(out[i]).toBe(lake.has(i) ? 100 : NO_LAKE);
  });

  it('draws lakes of every rank without a limit', () => {
    const heights = new Grid(W, H, new Int16Array(W * H).fill(100));
    const out = new Int16Array(W * H).fill(NO_LAKE);
    expect(rasterizeLakes(heights, path, out)).toBe(2);
  });
});
