import { describe, expect, it } from 'vitest';
import { Grid, GridPyramid } from './grid.ts';

// A 90° world: 4 columns, 2 rows, values 0..7 row by row.
const small = () => new Grid(4, 2, Int16Array.from([0, 1, 2, 3, 4, 5, 6, 7]));

describe('grid', () => {
  it('rejects data of the wrong size', () => {
    expect(() => new Grid(4, 2, new Int16Array(7))).toThrow();
  });

  it('places cell centres at whole positions', () => {
    const g = small();
    expect(g.cellDegrees).toBe(90);
    expect(g.position(45, -135)).toEqual({ c: 0, r: 0 });
    expect(g.position(-45, 135)).toEqual({ c: 3, r: 1 });
  });

  it('wraps columns and clamps rows', () => {
    const g = small();
    expect(g.at(-1, 0)).toBe(3);
    expect(g.at(4, 1)).toBe(4);
    expect(g.at(0, -1)).toBe(0);
    expect(g.at(1, 5)).toBe(5);
    expect(g.index(-1, 1)).toBe(7);
    expect(g.index(5, 0)).toBe(1);
  });

  it('samples the nearest cell', () => {
    const g = small();
    expect(g.nearest(40, -80)).toBe(1);
    expect(g.nearest(-80, 170)).toBe(7);
  });

  it('interpolates bilinearly, also across the date line', () => {
    const g = small();
    expect(g.bilinear(45, -135)).toBe(0);
    // Halfway between columns 0 and 1 on the top row.
    expect(g.bilinear(45, -90)).toBe(0.5);
    // Halfway between the rows.
    expect(g.bilinear(0, -135)).toBe(2);
    // At 180° the sample lies halfway between column 3 and column 0.
    expect(g.bilinear(45, 180)).toBe(1.5);
  });

  it('halves the resolution by averaging 2×2 cells', () => {
    const half = small().downsampleMean();
    expect(half.width).toBe(2);
    expect(half.height).toBe(1);
    expect(Array.from(half.data)).toEqual([(0 + 1 + 4 + 5) / 4, (2 + 3 + 6 + 7) / 4]);
  });
});

describe('grid pyramid', () => {
  const base = () => {
    const d = new Int16Array(16 * 8);
    for (let i = 0; i < d.length; i++) d[i] = i % 2 ? 10 : 0;
    return new Grid(16, 8, d);
  };

  it('halves each level down to the minimum width', () => {
    const p = new GridPyramid(base(), 4);
    expect(p.levels.map((g) => [g.width, g.height])).toEqual([
      [16, 8],
      [8, 4],
      [4, 2],
    ]);
    // Alternating columns average to their mean.
    expect(Array.from(p.levels[1]!.data).every((v) => v === 5)).toBe(true);
    expect(Array.from(p.levels[2]!.data).every((v) => v === 5)).toBe(true);
  });

  it('stops at odd sizes', () => {
    const p = new GridPyramid(new Grid(12, 6, new Int16Array(72)), 1);
    expect(p.levels.map((g) => g.width)).toEqual([12, 6]);
  });

  it('picks the coarsest grid whose cells are no larger than the spacing', () => {
    const p = new GridPyramid(base(), 4);
    // Cells of 22.5°, 45° and 90°.
    expect(p.forSpacing(50).width).toBe(8);
    expect(p.forSpacing(90).width).toBe(4);
    // Finer than every level: the base grid.
    expect(p.forSpacing(1).width).toBe(16);
  });
});
