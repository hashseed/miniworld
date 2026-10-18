import { describe, expect, it } from 'vitest';
import {
  ARID_GRID_H,
  ARID_GRID_W,
  ICE_DISTANCE_ZERO,
  ICE_GRID_H,
  ICE_GRID_W,
} from '../../../app/src/content/formats.ts';
import { climateHabitat, insideRing } from './habitat.ts';

// Two slices: ice north of 60°N in the first, a desert band from 15°N to 30°N in the second.
const ice = new Uint8Array(ICE_GRID_W * ICE_GRID_H);
for (let r = 0; r < ICE_GRID_H; r++)
  ice.fill(
    90 - ((r + 0.5) * 180) / ICE_GRID_H > 60 ? 255 : 0,
    r * ICE_GRID_W,
    (r + 1) * ICE_GRID_W,
  );
const desert = new Uint8Array(ARID_GRID_W * ARID_GRID_H);
for (let r = 0; r < ARID_GRID_H; r++) {
  const lat = 90 - ((r + 0.5) * 180) / ARID_GRID_H;
  desert.fill(lat > 15 && lat < 30 ? 240 : 40, r * ARID_GRID_W, (r + 1) * ARID_GRID_W);
}
const habitat = climateHabitat({
  slices: [
    { day: 0, ice, aridity: new Uint8Array(ARID_GRID_W * ARID_GRID_H).fill(40) },
    { day: 1000, ice: new Uint8Array(ICE_GRID_W * ICE_GRID_H), aridity: desert },
  ],
  isSea: (lat, lon, day) => lon < 0 && (day < 500 || lon < -10),
  isLake: (lat, lon) => lat > -1 && lat < 1 && lon > 30 && lon < 31,
  isRiver: (lat, lon) => lon > 20 && lon < 20.1,
  inRiver: (lat, lon) => lon > 20 && lon < 20.05,
  elevation: (lat, lon) => (lon > 40 ? 4000 : 100),
});

describe('the habitat', () => {
  it('keeps people off sea, lakes, ice, desert and high mountains', () => {
    expect(habitable(10, 10, 0)).toBe(true);
    expect(habitable(10, -5, 0)).toBe(false); // sea
    expect(habitable(10, -5, 600)).toBe(true); // the sea has fallen
    expect(habitable(0, 30.5, 0)).toBe(false); // lake
    expect(habitable(70, 10, 0)).toBe(false); // ice
    expect(habitable(70, 10, 1000)).toBe(true); // ice gone in the next slice
    expect(habitable(20, 10, 999)).toBe(true);
    expect(habitable(20, 10, 1000)).toBe(false); // desert
    expect(habitable(10, 45, 0)).toBe(false); // high ground
  });

  it('prefers sites near water', () => {
    expect(habitat.score(10, 20.3, 0)).toBeGreaterThan(habitat.score(10, 25, 0));
  });

  it('reads the ice border distance with its zero', () => {
    expect(ICE_DISTANCE_ZERO).toBeGreaterThan(0);
    expect(habitable(59, 10, 0)).toBe(true);
  });
});

describe('polygons', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  it('tells inside from outside', () => {
    expect(insideRing(square, 5, 5)).toBe(true);
    expect(insideRing(square, 5, 15)).toBe(false);
    expect(insideRing(square, -1, 5)).toBe(false);
  });
});

function habitable(lat: number, lon: number, day: number): boolean {
  return habitat.habitable(lat, lon, day);
}
