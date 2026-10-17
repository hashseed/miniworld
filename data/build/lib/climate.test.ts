import { describe, expect, it } from 'vitest';
import { aridity, iceThickness, meanSeaLevel, TimeStack } from './climate.ts';
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
const dryness = (lat: number, lon: number, bp: number) => {
  const p = at(lat, lon);
  return aridity(rain, p.lats, p.lons, bp)[0]!;
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
    expect(dryness(23, 10, 0)).toBeGreaterThan(900);
    expect(dryness(50, 10, 0)).toBeLessThan(300);
  });

  it('puts the mean sea level near −120 m at the glacial maximum and 0 m today', () => {
    const points = meanSeaLevel(stack('paleomist-1.0/sea_level'), () => true);
    const byYear = new Map(points);
    expect(byYear.get(0)!).toBeCloseTo(0, -1);
    expect(byYear.get(22500)!).toBeLessThan(-90);
    expect(byYear.get(22500)!).toBeGreaterThan(-150);
  });
});
