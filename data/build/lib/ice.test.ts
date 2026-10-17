import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DesertField,
  IceField,
  iceStepYears,
  monotoneCubic,
  seaLevelCurve,
  sheetSize,
  sliceDay,
  validateDesertModel,
  validateIceModel,
  type DesertModel,
  type IceAgeModel,
} from './ice.ts';

const model = JSON.parse(
  readFileSync(new URL('../../curated/ice-age.json', import.meta.url), 'utf8'),
) as IceAgeModel;

function thicknessAt(lat: number, lon: number, yearsBP: number, bed = 500): number {
  const field = new IceField(model, Float64Array.of(lat), Float64Array.of(lon), () => bed);
  return field.thickness(yearsBP)[0]!;
}

describe('ice-age model', () => {
  it('is valid', () => {
    expect(validateIceModel(model)).toEqual([]);
  });

  it('puts the sea about 125 m lower at the glacial maximum and at 0 m today', () => {
    const start = sliceDay(52000);
    const curve = seaLevelCurve(model, start, sliceDay(-75));
    expect(Math.min(...curve.metres)).toBeCloseTo(-125, 0);
    expect(curve.metres[curve.metres.length - 1]).toBeCloseTo(0, 0);
  });

  it('covers Hudson Bay and Scandinavia at 20,000 BCE and clears them by 6000 BCE', () => {
    expect(thicknessAt(60, -85, 22000)).toBeGreaterThan(2500);
    expect(thicknessAt(63, 18, 22000)).toBeGreaterThan(2000);
    expect(thicknessAt(60, -85, 7900)).toBe(0);
    expect(thicknessAt(63, 18, 7900)).toBe(0);
  });

  it('keeps Greenland and Antarctica today', () => {
    expect(thicknessAt(73, -40, 0)).toBeGreaterThan(2500);
    expect(thicknessAt(-85, 120, 0)).toBeGreaterThan(2500);
  });

  it('leaves warm regions and deep ocean without ice', () => {
    expect(thicknessAt(30, 0, 22000)).toBe(0);
    expect(thicknessAt(60, -85, 22000, -2000)).toBe(0);
  });

  it('thins towards the edge', () => {
    const centre = thicknessAt(60, -85, 22000);
    const edge = thicknessAt(44, -88, 22000);
    expect(edge).toBeLessThan(centre);
  });

  it('interpolates sheet size between control points', () => {
    const laurentide = model.sheets.find((s) => s.id === 'laurentide')!;
    expect(sheetSize(laurentide, 21000)).toBe(1);
    expect(sheetSize(laurentide, 0)).toBe(0);
    expect(sheetSize(laurentide, 19500)).toBeCloseTo(0.975);
  });

  it('steps every 1,000 years back to the start', () => {
    const years = iceStepYears(sliceDay(51950));
    expect(years[0]).toBe(52000);
    expect(years[years.length - 1]).toBe(0);
  });
});

describe('monotone cubic', () => {
  it('interpolates monotonically without overshoot', () => {
    const f = monotoneCubic([0, 1, 2, 3], [-120, -120, -40, 0]);
    let prev = -Infinity;
    for (let x = 0; x <= 3; x += 0.01) {
      const y = f(x);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(y).toBeGreaterThanOrEqual(-120 - 1e-9);
      expect(y).toBeLessThanOrEqual(0);
      prev = y;
    }
  });
});

describe('desert model', () => {
  const deserts = JSON.parse(
    readFileSync(new URL('../../curated/deserts.json', import.meta.url), 'utf8'),
  ) as DesertModel;
  const aridityAt = (lat: number, lon: number, yearsBP: number) =>
    new DesertField(deserts, Float64Array.of(lat), Float64Array.of(lon)).aridity(yearsBP)[0]!;

  it('is valid', () => {
    expect(validateDesertModel(deserts)).toEqual([]);
  });

  it('has a dry Sahara in the ice age and today, and a green one at 6000 BCE', () => {
    expect(aridityAt(21, 10, 20000)).toBe(1000);
    expect(aridityAt(21, 10, 0)).toBe(1000);
    expect(aridityAt(21, 10, 7950)).toBeLessThan(300);
  });

  it('reaches further south in the ice age', () => {
    expect(aridityAt(14.5, 10, 20000)).toBeGreaterThan(aridityAt(14.5, 10, 0));
  });
});
