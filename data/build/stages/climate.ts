// Climate stage of the data build: the sea-level curve, and one climate and
// one foliage slice per step of the climate data (spec milestone 1, sections
// 4.3 and 5.2; foliage.md, section 2).

import {
  ARID_GRID_H,
  ARID_GRID_W,
  encodeClimateSlice,
  encodeFoliageSlice,
  OCEAN_MIN_LEVEL,
  OCEAN_NEVER,
  type ClimateSlice,
} from '../../../app/src/content/formats.ts';
import type { StartupIndex } from '../../../app/src/content/types.ts';
import { TIMELINE_START } from '../../../app/src/time/calendar.ts';
import { aridityGrid, iceThickness, meanSeaLevel, TimeStack } from '../lib/climate.ts';
import { polarWeight } from '../lib/coast.ts';
import { readExtract } from '../lib/extract.ts';
import { foliageGrid } from '../lib/foliage.ts';
import { FOLIAGE_GRID_H, FOLIAGE_GRID_W } from '../../../app/src/content/formats.ts';
import { recipeOf } from '../../../app/src/globe/foliageKinds.ts';
import { climateStepYears, iceGrid, seaLevelCurve, sliceDay } from '../lib/ice.ts';
import type { WriteContext } from './context.ts';
import type { WorldMap } from './terrain.ts';

export interface Climate {
  seaLevel: StartupIndex['seaLevel'];
  /** Mean sea level (m) on a day, from the curve. */
  seaLevelAt(day: number): number;
  /** Day of each climate slice, ascending. */
  iceDays: number[];
  slices: ClimateSlice[];
  climateFiles: string[];
  foliageFiles: string[];
  /** Tree cover, 0 to 1, at a place on a day: the share of plant slots times the tree density (humankind.md section 4.3). */
  woodAt(lat: number, lon: number, day: number): number;
  /** Annual mean temperature in °C at a place in the climate slice of a day, or undefined at sea (peopling.md section 5.2). */
  temperatureAt(lat: number, lon: number, day: number): number | undefined;
  /** Annual precipitation in mm at a place in the climate slice of a day, or undefined at sea. */
  precipitationAt(lat: number, lon: number, day: number): number | undefined;
}

export function buildClimate(ctx: WriteContext, map: WorldMap): Climate {
  const { output, log, fail } = ctx;
  const { connection, iceBed, humidPeriods } = map;
  const stack = (id: string, name: string) => {
    const json =
      ctx.sourceFiles(id).find((p) => p.endsWith(`/${name}.json`)) ?? fail(`${id}: no ${name}`);
    const { header, data } = readExtract(json.replace(/\.json$/, ''));
    return new TimeStack(header, data);
  };
  const iceStack = stack('paleomist-1.0', 'ice_thickness');
  const precipitation = stack('beyer-2020', 'BIO12');
  const seaPoints = meanSeaLevel(stack('paleomist-1.0', 'sea_level'), (lat, lon) => {
    const v = connection.nearest(lat, lon);
    return v !== OCEAN_NEVER && OCEAN_MIN_LEVEL + v <= 0;
  });
  const seaLevel = seaLevelCurve(seaPoints, TIMELINE_START, ctx.cutoffDay);
  const seaLevelAt = (day: number) =>
    seaLevel.metres[
      Math.max(
        0,
        Math.min(
          seaLevel.metres.length - 1,
          Math.round((day - seaLevel.startDay) / seaLevel.stepDays),
        ),
      )
    ]!;
  // One global climate slice per step of the climate data (section 5.2): the
  // ice cover as a smoothed border distance, and the aridity with the humid
  // periods the data misses (section 4.3).
  const climateYears = climateStepYears(precipitation.yearsBP, TIMELINE_START);
  const iceDays = climateYears.map(sliceDay); // ascending, as the years descend
  const climateFiles: string[] = [];
  const slices: ClimateSlice[] = [];
  for (const bp of climateYears) {
    const slice = {
      day: sliceDay(bp),
      ice: iceGrid(
        (lats, lons) =>
          iceThickness(iceStack, lats, lons, bp, { bed: iceBed, weight: polarWeight }),
        (lat, lon) => {
          const v = connection.nearest(lat, lon);
          return v !== OCEAN_NEVER && OCEAN_MIN_LEVEL + v <= seaLevelAt(sliceDay(bp));
        },
      ),
      aridity: aridityGrid(precipitation, humidPeriods, ARID_GRID_W, ARID_GRID_H, bp),
    };
    slices.push(slice);
    climateFiles.push(output.write(`climate/${bp}`, 'bin', encodeClimateSlice(slice)));
  }
  // One foliage slice per climate step (spec foliage.md, section 2): the biome
  // class per 0.5° cell, with the humid periods turning dry land to savanna,
  // and the tree density near the ice sheets and in cold or dry climates.
  const biomeJson =
    ctx.sourceFiles('beyer-2020').find((p) => p.endsWith('/biome.json')) ??
    fail('beyer-2020: no biome');
  const biome = readExtract(biomeJson.replace(/\.json$/, ''));
  const temperature = stack('beyer-2020', 'BIO1');
  const foliageInputs = {
    biome,
    precipitation,
    temperature,
    ice: iceStack,
    periods: humidPeriods,
  };
  const grids: { day: number; grid: ReturnType<typeof foliageGrid> }[] = [];
  const foliageFiles = climateYears.map((bp) => {
    const grid = foliageGrid(foliageInputs, bp);
    grids.push({ day: sliceDay(bp), grid });
    return output.write(
      `foliage/${bp}`,
      'bin',
      encodeFoliageSlice({ day: sliceDay(bp), cells: grid.classes, density: grid.density }),
    );
  });
  log(
    `${climateFiles.length} climate and foliage slices; lowest sea level ${Math.min(...seaLevel.metres)} m`,
  );
  grids.sort((a, b) => a.day - b.day);
  const woodAt = (lat: number, lon: number, day: number) => {
    let k = 0;
    while (k + 1 < grids.length && grids[k + 1]!.day <= day) k++;
    const g = grids[k]!.grid;
    const c = Math.min(
      FOLIAGE_GRID_W - 1,
      Math.max(0, Math.floor(((lon + 180) / 360) * FOLIAGE_GRID_W)),
    );
    const r = Math.min(
      FOLIAGE_GRID_H - 1,
      Math.max(0, Math.floor(((90 - lat) / 180) * FOLIAGE_GRID_H)),
    );
    const i = r * FOLIAGE_GRID_W + c;
    const share = recipeOf(g.classes[i]!).reduce((sum, [, part]) => sum + part, 0);
    return Math.min(1, share * (g.density[i]! / 255));
  };
  // Temperature and precipitation per slice and half-degree cell, sampled when first asked for.
  const sampled = (stackOf: TimeStack) => {
    const W = 720;
    const H = 360;
    const grids = new Map<number, Float32Array>();
    return (lat: number, lon: number, day: number) => {
      let k = 0;
      while (k + 1 < iceDays.length && iceDays[k + 1]! <= day) k++;
      let grid = grids.get(k);
      if (!grid) grids.set(k, (grid = new Float32Array(W * H).fill(NaN)));
      const c = Math.min(W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * W)));
      const r = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
      const i = r * W + c;
      if (Number.isNaN(grid[i]!)) {
        const v = stackOf.sample(90 - (r + 0.5) / 2, -180 + (c + 0.5) / 2, climateYears[k]!);
        grid[i] = v === undefined ? Infinity : v;
      }
      return grid[i] === Infinity ? undefined : grid[i];
    };
  };
  const temperatureAt = sampled(temperature);
  const precipitationAt = sampled(precipitation);
  return {
    seaLevel,
    seaLevelAt,
    iceDays,
    slices,
    climateFiles,
    foliageFiles,
    woodAt,
    temperatureAt,
    precipitationAt,
  };
}
