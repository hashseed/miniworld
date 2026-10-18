import { describe, expect, it } from 'vitest';
import { featureLines, featurePolygons, rasterizePolygon, type Polygon } from './rasterize.ts';

// A 10° world: 36 columns, 18 rows.
const target = { width: 36, height: 18 };
const cells = (polygon: Polygon) => {
  const out: string[] = [];
  rasterizePolygon(target, polygon, (c, r) => out.push(`${c},${r}`));
  return out.sort();
};
const square = (w: number, s: number, e: number, n: number) => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
  [w, s],
];

describe('rasterize polygons', () => {
  it('fills the cells whose centres lie inside a ring', () => {
    // Cell centres at 5, 15, 25°E and 25, 15, 5°N.
    expect(cells([square(0, 0, 30, 30)])).toEqual(
      ['18,6', '18,7', '18,8', '19,6', '19,7', '19,8', '20,6', '20,7', '20,8'].sort(),
    );
  });

  it('leaves a hole empty', () => {
    const filled = cells([square(0, 0, 30, 30), square(10, 10, 20, 20)]);
    expect(filled).toHaveLength(8);
    expect(filled).not.toContain('19,7');
  });

  it('wraps across the date line', () => {
    expect(cells([square(170, 0, 190, 10)])).toEqual(['0,8', '35,8']);
  });
});

describe('feature geometry', () => {
  const ring = square(0, 0, 1, 1);
  const line = [
    [0, 0],
    [1, 1],
  ];
  const feature = (type: string, coordinates: unknown) => ({
    properties: {},
    geometry: { type, coordinates },
  });

  it('reads polygons from Polygon and MultiPolygon features', () => {
    expect(featurePolygons(feature('Polygon', [ring]))).toEqual([[ring]]);
    expect(featurePolygons(feature('MultiPolygon', [[ring], [ring]]))).toEqual([[ring], [ring]]);
    expect(featurePolygons(feature('LineString', line))).toEqual([]);
    expect(featurePolygons({ properties: {}, geometry: null })).toEqual([]);
  });

  it('reads lines from LineString and MultiLineString features', () => {
    expect(featureLines(feature('LineString', line))).toEqual([line]);
    expect(featureLines(feature('MultiLineString', [line, line]))).toEqual([line, line]);
    expect(featureLines(feature('Polygon', [ring]))).toEqual([]);
    expect(featureLines({ properties: {}, geometry: null })).toEqual([]);
  });
});
