import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  aridityGrid,
  humidMinimum,
  iceThickness,
  meanSeaLevel,
  TimeStack,
  validateHumidPeriods,
  type HumidPeriod,
} from './climate.ts';
import { iceGrid } from './ice.ts';
import { ICE_GRID_H, ICE_GRID_W, ICE_DISTANCE_ZERO } from '../../../app/src/content/formats.ts';
import { readExtract } from './extract.ts';

const root = new URL('../../sources/', import.meta.url).pathname;
const stack = (path: string) => {
  const { header, data } = readExtract(root + path);
  return new TimeStack(header, data);
};
const ice = stack('paleomist-1.0/ice_thickness');
const rain = stack('beyer-2020/BIO12');

const at = (lat: number, lon: number) => ({
  lats: Float64Array.of(lat),
  lons: Float64Array.of(lon),
});
const thickness = (lat: number, lon: number, bp: number) => {
  const p = at(lat, lon);
  return iceThickness(ice, p.lats, p.lons, bp)[0]!;
};
const humid = (
  JSON.parse(
    readFileSync(new URL('../../curated/humid-periods.json', import.meta.url), 'utf8'),
  ) as { periods: HumidPeriod[] }
).periods;
const W = 360;
const H = 180;
const grids = new Map<number, Uint8Array>();
/** Aridity 0..255 at the 1° cell holding a point. */
const dryness = (lat: number, lon: number, bp: number) => {
  let g = grids.get(bp);
  if (!g) grids.set(bp, (g = aridityGrid(rain, humid, W, H, bp)));
  const r = Math.floor(((90 - lat) / 180) * H);
  const c = Math.floor(((lon + 180) / 360) * W);
  return g[r * W + c]!;
};

describe('reconstructions', () => {
  it('covers Hudson Bay and Scandinavia at the glacial maximum and clears them today', () => {
    expect(thickness(60, -85, 21000)).toBeGreaterThan(1000);
    expect(thickness(63, 16, 21000)).toBeGreaterThan(1000);
    expect(thickness(60, -85, 0)).toBe(0);
    expect(thickness(63, 16, 0)).toBe(0);
  });

  it('keeps Greenland and Antarctica today', () => {
    expect(thickness(72, -40, 0)).toBeGreaterThan(1000);
    expect(thickness(-80, 0, 0)).toBeGreaterThan(1000);
  });

  it('has a dry Sahara today and green Europe', () => {
    expect(dryness(23, 10, 0)).toBeGreaterThan(230);
    expect(dryness(50, 10, 0)).toBeLessThan(80);
  });

  it('greens the Sahara in the African Humid Period and dries it again by 3000 BCE', () => {
    expect(validateHumidPeriods(humid)).toEqual([]);
    expect(dryness(23, 10, 8000)).toBeLessThan(120);
    expect(dryness(23, 10, 16000)).toBeGreaterThan(200);
    expect(dryness(23, 10, 4000)).toBeGreaterThan(230);
    expect(humidMinimum(humid, 45, 10, 8000)).toBe(0);
  });

  it('stores the ice cover as a distance from its border', () => {
    const grid = (bp: number) => iceGrid((lats, lons) => iceThickness(ice, lats, lons, bp));
    const cell = (g: Uint8Array, lat: number, lon: number) =>
      g[
        Math.floor(((90 - lat) / 180) * ICE_GRID_H) * ICE_GRID_W +
          Math.floor(((lon + 180) / 360) * ICE_GRID_W)
      ]!;
    const glacial = grid(20000);
    const today = grid(0);
    expect(cell(glacial, 60, -85)).toBeGreaterThan(ICE_DISTANCE_ZERO + 50);
    expect(cell(today, 60, -85)).toBeLessThan(ICE_DISTANCE_ZERO);
    expect(cell(today, 72, -40)).toBeGreaterThan(ICE_DISTANCE_ZERO + 20);
    expect(cell(today, 48, 2)).toBe(0);
  });

  it('puts the mean sea level near −120 m at the glacial maximum and 0 m today', () => {
    const points = meanSeaLevel(stack('paleomist-1.0/sea_level'), () => true);
    const byYear = new Map(points);
    expect(byYear.get(0)!).toBeCloseTo(0, -1);
    expect(byYear.get(22500)!).toBeLessThan(-90);
    expect(byYear.get(22500)!).toBeGreaterThan(-150);
  });
});
