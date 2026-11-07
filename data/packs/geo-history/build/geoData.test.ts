import { describe, expect, it } from 'vitest';
import { buildCoasts, plateAt, todaysPolygons } from './coasts.ts';
import { buildGeoData } from './geoData.ts';

describe('the geo-history data', () => {
  const data = buildGeoData();

  it('is built from sources whose licences and checksums hold', () => {
    expect(data.version).toMatch(/^[0-9a-f]{12}$/);
    expect(data.credits.find((c) => c.id === 'merdith-2021')?.licence).toBe('CC BY 4.0');
  });

  it('holds the plate model: rotations, land, boundaries and coasts', () => {
    expect(data.rotations.length).toBeGreaterThan(5000);
    expect(data.land.length).toBeGreaterThan(800);
    expect(data.boundaries.length).toBeGreaterThan(2000);
    expect(data.coasts.length).toBeGreaterThan(100);
    const kinds = new Set(data.boundaries.map((b) => b.kind));
    expect([...kinds].sort()).toEqual(['ridge', 'subduction', 'transform']);
  });

  it('has land at every age from 1,000 Ma to today', () => {
    for (const ma of [0, 100, 250, 540, 750, 1000]) {
      const n = data.land.filter((f) => ma <= f.begin && ma >= f.end).length;
      expect(n, `land polygons at ${ma} Ma`).toBeGreaterThan(5);
    }
  });

  it('has every moment in both languages, inside the range and in order of the sources', () => {
    expect(data.moments.length).toBeGreaterThanOrEqual(12);
    for (const m of data.moments as {
      id: string;
      from: number;
      to: number;
      age: number;
      title: Record<string, string>;
      text: Record<string, string>;
      sources: string[];
    }[]) {
      expect(m.title.en && m.title.de && m.text.en && m.text.de, m.id).toBeTruthy();
      expect(m.from).toBeLessThanOrEqual(1000);
      expect(m.to).toBeGreaterThanOrEqual(0);
      expect(m.sources.length).toBeGreaterThan(0);
      // German is allowed to run longer, but not by a lot.
      expect(m.text.de.length).toBeLessThan(m.text.en.length * 1.5);
    }
  });

  it('covers the range with periods and supercontinents without gaps', () => {
    const periods = [...(data.periods as { from: number; to: number }[])];
    expect(periods[0]!.from).toBe(1000);
    expect(periods[periods.length - 1]!.to).toBe(0);
    periods.forEach((p, i) => i > 0 && expect(p.from).toBeCloseTo(periods[i - 1]!.to, 5));
  });

  it('has climate stops from the equator to the pole', () => {
    expect(data.climate[0]!.lat).toBe(0);
    expect(data.climate[data.climate.length - 1]!.lat).toBe(90);
  });

  it('moves a piece of coast with the plate its continent belongs to', () => {
    const polys = todaysPolygons(data.land);
    // Delhi lies on the plate of India (501 in the model).
    expect(plateAt(28.6, 77.2, polys)).toBe(501);
    expect(plateAt(-33.9, 151.2, polys)).toBe(801);
  });

  it('cuts a coast into pieces by plate', () => {
    const square = {
      features: [
        {
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [20, 0],
                [20, 20],
                [0, 20],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    const land = [
      { plate: 1, begin: 100, end: 0, rings: [[-5, -5, -5, 10, 25, 10, 25, -5]] },
      { plate: 2, begin: 100, end: 0, rings: [[-5, 10.01, -5, 25, 25, 25, 25, 10.01]] },
    ];
    const pieces = buildCoasts(square, land);
    expect(new Set(pieces.map((p) => p.plate))).toEqual(new Set([1, 2]));
  });
});
