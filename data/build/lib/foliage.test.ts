import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { foliageGrid } from './foliage.ts';
import { TimeStack, type HumidPeriod } from './climate.ts';
import { readExtract } from './extract.ts';
import {
  decodeFoliageSlice,
  encodeFoliageSlice,
  FOLIAGE_GRID_W,
} from '../../../app/src/content/formats.ts';
import { HUMID_SAVANNA } from '../../../app/src/globe/foliageKinds.ts';

const root = new URL('../../sources/', import.meta.url).pathname;
const biome = readExtract(root + 'beyer-2020/biome');
const rainExtract = readExtract(root + 'beyer-2020/BIO12');
const rain = new TimeStack(rainExtract.header, rainExtract.data);
const stack = (path: string) => {
  const e = readExtract(root + path);
  return new TimeStack(e.header, e.data);
};
const periods = (
  JSON.parse(
    readFileSync(new URL('../../curated/humid-periods.json', import.meta.url), 'utf8'),
  ) as { periods: HumidPeriod[] }
).periods;

const inputs = {
  biome,
  precipitation: rain,
  temperature: stack('beyer-2020/BIO1'),
  ice: stack('paleomist-1.0/ice_thickness'),
  periods,
};
const at = (cells: Uint8Array, lat: number, lon: number) =>
  cells[Math.floor((90 - lat) / 0.5) * FOLIAGE_GRID_W + Math.floor((lon + 180) / 0.5)]!;

describe('foliage slices', () => {
  const now = foliageGrid(inputs, 0);
  const today = now.classes;
  const greenSahara = foliageGrid(inputs, 8000).classes;
  const glacial = foliageGrid(inputs, 21000);

  it('keeps forests and deserts from the biome data', () => {
    expect(at(today, -3, -60)).toBe(1); // Amazon: tropical evergreen forest
    expect(at(today, 23, 10)).toBe(27); // Sahara today: barren
  });

  it('turns the Sahara to savanna in the African Humid Period', () => {
    expect(at(greenSahara, 18, 10)).toBeGreaterThan(HUMID_SAVANNA);
    expect(at(today, 18, 10)).toBeLessThan(HUMID_SAVANNA);
  });

  it('keeps the forests of today dense', () => {
    expect(at(now.density, -3, -60)).toBeGreaterThan(240); // Amazon
    expect(at(now.density, 51, 10)).toBeGreaterThan(240); // Germany
    expect(at(now.density, 55, -100)).toBeGreaterThan(200); // Canadian taiga
    let forest = 0;
    let thin = 0;
    for (let i = 0; i < today.length; i++)
      if (today[i]! >= 1 && today[i]! <= 11) {
        forest++;
        if (now.density[i]! < 200) thin++;
      }
    expect(thin / forest).toBeLessThan(0.1);
  });

  it('thins trees near the ice sheets and in the ice-age cold', () => {
    expect(at(glacial.density, 51, 10)).toBeLessThan(90); // Germany, south of the ice
    expect(at(glacial.density, 56, 38)).toBeLessThan(90); // Russian plain near Moscow
    expect(at(glacial.density, -3, -60)).toBeGreaterThan(200); // Amazon
  });

  it('round-trips through the slice format', () => {
    const slice = { day: -42, cells: today, density: now.density };
    const back = decodeFoliageSlice(encodeFoliageSlice(slice).slice().buffer);
    expect(back.day).toBe(-42);
    expect(back.cells).toEqual(today);
    expect(back.density).toEqual(now.density);
  });
});
