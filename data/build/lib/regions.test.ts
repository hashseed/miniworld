import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { regionAt, regionGrid } from './regions.ts';

const REGIONS = Object.keys(
  parse(
    readFileSync(new URL('../../curated/vocab/regions.yaml', import.meta.url), 'utf8'),
  ) as object,
);

describe('region lookup', () => {
  it.each([
    [41.9, 12.5, 'europe'], // Rome
    [52.5, 13.4, 'europe'], // Berlin
    [55.8, 37.6, 'europe'], // Moscow
    [55.8, 49.1, 'europe'], // Kazan
    [30.0, 31.2, 'mena'], // Cairo
    [33.3, 44.4, 'mena'], // Baghdad
    [35.7, 51.4, 'mena'], // Tehran
    [-1.3, 36.8, 'africa'], // Nairobi
    [39.65, 66.96, 'central-asia'], // Samarkand
    [43.2, 76.9, 'central-asia'], // Almaty
    [47.9, 106.9, 'central-asia'], // Ulaanbaatar
    [28.6, 77.2, 'south-asia'], // Delhi
    [34.5, 69.2, 'south-asia'], // Kabul
    [39.9, 116.4, 'east-asia'], // Beijing
    [35.7, 139.7, 'east-asia'], // Tokyo
    [37.6, 127.0, 'east-asia'], // Seoul
    [13.4, 103.9, 'southeast-asia'], // Angkor
    [21.0, 105.8, 'southeast-asia'], // Hanoi
    [-6.2, 106.8, 'southeast-asia'], // Jakarta
    [21.2, 94.9, 'southeast-asia'], // Bagan
    [19.4, -99.1, 'americas'], // Mexico City
    [-13.5, -72.0, 'americas'], // Cusco
    [-33.9, 151.2, 'oceania'], // Sydney
    [-6.0, 144.0, 'oceania'], // New Guinea Highlands
    [21.3, -157.8, 'oceania'], // Honolulu
    [-36.8, 174.8, 'oceania'], // Auckland
  ])('puts %f, %f in %s', (lat, lon, region) => {
    expect(regionAt(lat, lon)).toBe(region);
  });

  it('builds a full grid over the regions of the vocabulary', () => {
    const g = regionGrid(REGIONS);
    expect(g.cells.length).toBe(g.cols * g.rows);
    expect(g.lanes).toEqual(REGIONS);
    // Every region owns at least one cell.
    for (let i = 0; i < REGIONS.length; i++) expect(g.cells).toContain(String(i));
  });

  it('fails when the lookup names a region the vocabulary lacks', () => {
    expect(() => regionGrid(REGIONS.filter((r) => r !== 'oceania'))).toThrow(/oceania/);
  });
});
