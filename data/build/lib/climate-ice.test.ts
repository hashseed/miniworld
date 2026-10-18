import { describe, expect, it } from 'vitest';
import { iceThickness, TimeStack, type IceSmoothing } from './climate.ts';
import type { ExtractHeader } from './extract.ts';

// A synthetic 1° ice thickness grid of one layer, in metres.
const header: ExtractHeader = {
  source: 'test',
  variable: 'ice',
  description: 'test ice',
  units: 'm',
  type: 'int16',
  scale: 1,
  width: 360,
  height: 180,
  registration: 'cell',
  west: -180,
  north: 90,
  cellDegrees: 1,
};
function stack(thickness: (lat: number, lon: number) => number): TimeStack {
  const d = new Int16Array(360 * 180);
  for (let r = 0; r < 180; r++)
    for (let c = 0; c < 360; c++) d[r * 360 + c] = thickness(89.5 - r, -179.5 + c);
  return new TimeStack(header, d);
}
const one = (ice: TimeStack, lat: number, lon: number, smoothing?: IceSmoothing) =>
  iceThickness(ice, Float64Array.of(lat), Float64Array.of(lon), 0, smoothing)[0]!;
const flat = (bed: number, weight = 1): IceSmoothing => ({ bed: () => bed, weight: () => weight });

describe('polar ice smoothing', () => {
  it('keeps an even sheet even', () => {
    const ice = stack((lat) => (lat > 60 ? 1000 : 0));
    expect(one(ice, 75.5, 0.5, flat(0))).toBe(1000);
  });

  it('smooths a peak in the sheet, only where the weight is on', () => {
    const ice = stack((lat, lon) => (lat === 75.5 && lon === 0.5 ? 3000 : lat > 60 ? 1000 : 0));
    expect(one(ice, 75.5, 0.5)).toBe(3000);
    expect(one(ice, 75.5, 0.5, flat(0, 0))).toBe(3000);
    const smooth = one(ice, 75.5, 0.5, flat(0));
    expect(smooth).toBeGreaterThan(1000);
    expect(smooth).toBeLessThan(2000);
  });

  it('covers Antarctic land with ice nearby with at least 150 m', () => {
    const ice = stack((lat) => (lat < -72 ? 100 : 0));
    expect(one(ice, -70.5, 0.5)).toBe(0);
    expect(one(ice, -70.5, 0.5, flat(100))).toBeGreaterThanOrEqual(150);
    // Not below sea level, and not without ice in the disc.
    expect(one(ice, -70.5, 0.5, flat(-10))).toBeLessThan(150);
    expect(one(ice, -62.5, 0.5, flat(100))).toBe(0);
  });
});
