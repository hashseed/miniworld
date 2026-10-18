// Foliage slices (spec foliage.md, section 2): per climate step, the BIOME4
// class of every 0.5° cell, with the Green Sahara and other humid periods
// turning dry classes into savanna.

import { FOLIAGE_GRID_H, FOLIAGE_GRID_W } from '../../../app/src/content/formats.ts';
import { DRY_CLASSES, HUMID_SAVANNA } from '../../../app/src/globe/foliageKinds.ts';
import { humidMinimum, type HumidPeriod, type TimeStack } from './climate.ts';
import type { ExtractData, ExtractHeader } from './extract.ts';

/** Precipitation (mm) a humid period must add before a dry cell counts as savanna, and at full strength. */
const SAVANNA_FROM_MM = 150;
const SAVANNA_FULL_MM = 600;
/** Passes that spread land classes into cells without data. */
const FILL_PASSES = 3;

export function foliageGrid(
  biome: { header: ExtractHeader; data: ExtractData },
  precipitation: TimeStack,
  periods: HumidPeriod[],
  yearsBP: number,
): Uint8Array {
  const h = biome.header;
  if (h.width !== FOLIAGE_GRID_W || h.height !== FOLIAGE_GRID_H || h.cellDegrees !== 0.5)
    throw new Error('biome: unexpected grid');
  const years = h.yearsBP ?? [0];
  let k = 0;
  for (let i = 1; i < years.length; i++)
    if (Math.abs(years[i]! - yearsBP) < Math.abs(years[k]! - yearsBP)) k = i;
  const W = FOLIAGE_GRID_W;
  const H = FOLIAGE_GRID_H;
  const none = h.nodata ?? 255;
  const cls = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) cls[i] = Number(biome.data[k * W * H + i]);

  // Cells without data (the sea of the time) take a neighbouring land class,
  // so coasts the simplified map draws further out still get plants.
  for (let pass = 0; pass < FILL_PASSES; pass++) {
    const next = cls.slice();
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const i = r * W + c;
        if (cls[i] !== none) continue;
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const rr = r + dr;
          if (rr < 0 || rr >= H) continue;
          const v = cls[rr * W + ((c + dc + W) % W)]!;
          if (v !== none) {
            next[i] = v;
            break;
          }
        }
      }
    cls.set(next);
  }

  const out = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) {
    const lat = h.north - (r + 0.5) * 0.5;
    for (let c = 0; c < W; c++) {
      const lon = h.west + (c + 0.5) * 0.5;
      const i = r * W + c;
      const v = cls[i]!;
      const code = v === none ? 0 : v;
      if (code === 0 || DRY_CLASSES.has(code)) {
        const raw = precipitation.sample(lat, lon, yearsBP) ?? 0;
        const humid = humidMinimum(periods, lat, lon, yearsBP);
        const s = humid > raw ? (humid - SAVANNA_FROM_MM) / (SAVANNA_FULL_MM - SAVANNA_FROM_MM) : 0;
        if (s > 0) {
          out[i] = HUMID_SAVANNA + Math.max(1, Math.round(Math.min(1, s) * 127));
          continue;
        }
      }
      out[i] = code;
    }
  }
  return out;
}
