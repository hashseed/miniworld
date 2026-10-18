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
const periods = (
  JSON.parse(
    readFileSync(new URL('../../curated/humid-periods.json', import.meta.url), 'utf8'),
  ) as { periods: HumidPeriod[] }
).periods;

const at = (cells: Uint8Array, lat: number, lon: number) =>
  cells[Math.floor((90 - lat) / 0.5) * FOLIAGE_GRID_W + Math.floor((lon + 180) / 0.5)]!;

describe('foliage slices', () => {
  const today = foliageGrid(biome, rain, periods, 0);
  const greenSahara = foliageGrid(biome, rain, periods, 8000);

  it('keeps forests and deserts from the biome data', () => {
    expect(at(today, -3, -60)).toBe(1); // Amazon: tropical evergreen forest
    expect(at(today, 23, 10)).toBe(27); // Sahara today: barren
  });

  it('turns the Sahara to savanna in the African Humid Period', () => {
    expect(at(greenSahara, 18, 10)).toBeGreaterThan(HUMID_SAVANNA);
    expect(at(today, 18, 10)).toBeLessThan(HUMID_SAVANNA);
  });

  it('round-trips through the slice format', () => {
    const back = decodeFoliageSlice(encodeFoliageSlice({ day: -42, cells: today }).slice().buffer);
    expect(back.day).toBe(-42);
    expect(back.cells).toEqual(today);
  });
});
