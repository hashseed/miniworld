import { describe, expect, it } from 'vitest';
import { regionAt, regionGrid } from './regions.ts';

describe('region lookup', () => {
  it.each([
    [41.9, 12.5, 'europe'], // Rome
    [52.5, 13.4, 'europe'], // Berlin
    [30.0, 31.2, 'mena'], // Cairo
    [33.3, 44.4, 'mena'], // Baghdad
    [-1.3, 36.8, 'africa'], // Nairobi
    [28.6, 77.2, 'southAsia'], // Delhi
    [39.9, 116.4, 'eastAsia'], // Beijing
    [35.7, 139.7, 'eastAsia'], // Tokyo
    [19.4, -99.1, 'americas'], // Mexico City
    [-13.5, -72.0, 'americas'], // Cusco
    [-33.9, 151.2, 'oceania'], // Sydney
    [21.3, -157.8, 'oceania'], // Honolulu
    [-36.8, 174.8, 'oceania'], // Auckland
  ])('puts %f, %f in %s', (lat, lon, lane) => {
    expect(regionAt(lat, lon)).toBe(lane);
  });

  it('builds a full grid', () => {
    const g = regionGrid();
    expect(g.cells.length).toBe(g.cols * g.rows);
    expect(g.cells).not.toContain('-');
  });
});
