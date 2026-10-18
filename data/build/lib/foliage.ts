// Foliage slices (spec foliage.md, section 2): per climate step, the BIOME4
// class of every 0.5° cell, with the Green Sahara and other humid periods
// turning dry classes into savanna, and a tree density that thins trees near
// the ice sheets and in cold or dry climates.

import { EARTH_RADIUS_KM } from '../../../app/src/geo/earth.ts';
import { FOLIAGE_GRID_H, FOLIAGE_GRID_W } from '../../../app/src/content/formats.ts';
import { BUSH, DRY_CLASSES, HUMID_SAVANNA, recipeOf } from '../../../app/src/globe/foliageKinds.ts';
import { humidMinimum, type HumidPeriod, type TimeStack } from './climate.ts';
import type { ExtractData, ExtractHeader } from './extract.ts';

/** Precipitation (mm) a humid period must add before a dry cell counts as savanna, and at full strength. */
const SAVANNA_FROM_MM = 150;
const SAVANNA_FULL_MM = 600;
/** Passes that spread land classes into cells without data. */
const FILL_PASSES = 3;
/** Distance (km) from the ice border at which trees are back to full density. */
const ICE_FULL_KM = 600;
/** Ice thickness (m) above which a cell counts as ice sheet. */
const ICE_MIN_M = 10;
/** Cooling (°C below today) at which trees start to thin, and at which none are left. */
const COOLING_FROM = 4;
const COOLING_NONE = 12;
/** Annual mean temperature (°C) at which trees start to thin, and at which none are left. */
const COLD_FROM = -12;
const COLD_NONE = -20;
/** Annual precipitation (mm) at which trees start to thin, and at which none are left. */
const DRY_FROM = 250;
const DRY_NONE = 100;
/** Steps the stored tree density is rounded to. */
const DENSITY_STEPS = 8;
const CELL_KM = EARTH_RADIUS_KM * ((0.5 * Math.PI) / 180);

export interface FoliageInputs {
  biome: { header: ExtractHeader; data: ExtractData };
  precipitation: TimeStack;
  temperature: TimeStack;
  ice: TimeStack;
  periods: HumidPeriod[];
}

export interface FoliageGrid {
  /** Foliage class per cell (globe/foliageKinds.ts). */
  classes: Uint8Array;
  /** Tree density per cell, 0..255 for 0..1. */
  density: Uint8Array;
}

/** 1 at or beyond `full`, 0 at or beyond `none`, linear between. */
const fade = (v: number, full: number, none: number) =>
  Math.max(0, Math.min(1, (v - none) / (full - none)));

export function foliageGrid(inputs: FoliageInputs, yearsBP: number): FoliageGrid {
  const { biome, precipitation, temperature, periods } = inputs;
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

  const iceKm = iceDistance(inputs.ice, h.north, h.west, yearsBP);
  const out = new Uint8Array(W * H);
  const density = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) {
    const lat = h.north - (r + 0.5) * 0.5;
    for (let c = 0; c < W; c++) {
      const lon = h.west + (c + 0.5) * 0.5;
      const i = r * W + c;
      const v = cls[i]!;
      const code = v === none ? 0 : v;
      const raw = precipitation.sample(lat, lon, yearsBP);
      const humid = humidMinimum(periods, lat, lon, yearsBP);
      out[i] = code;
      if (code === 0 || DRY_CLASSES.has(code)) {
        const s =
          humid > (raw ?? 0) ? (humid - SAVANNA_FROM_MM) / (SAVANNA_FULL_MM - SAVANNA_FROM_MM) : 0;
        if (s > 0) out[i] = HUMID_SAVANNA + Math.max(1, Math.round(Math.min(1, s) * 127));
      }
      // Cells without trees keep full density, which compresses best.
      if (!recipeOf(out[i]!).some(([kind]) => kind !== BUSH)) {
        density[i] = 255;
        continue;
      }
      // Missing climate values (cells filled from the land beside them) leave trees as they are.
      let d = Math.min(1, iceKm[i]! / ICE_FULL_KM);
      const now = temperature.sample(lat, lon, 0);
      const then = temperature.sample(lat, lon, yearsBP);
      if (now !== undefined && then !== undefined)
        d *= fade(then - now, -COOLING_FROM, -COOLING_NONE) * fade(then, COLD_FROM, COLD_NONE);
      if (raw !== undefined) d *= fade(Math.max(raw, humid), DRY_FROM, DRY_NONE);
      // Eighths are enough for thinning and keep the slices small.
      density[i] = Math.round(Math.round(d * DENSITY_STEPS) * (255 / DENSITY_STEPS));
    }
  }
  return { classes: out, density };
}

/**
 * Distance (km) of every cell of the foliage grid from the nearest ice sheet
 * cell, capped at ICE_FULL_KM: a chamfer distance with the east-west step
 * shrinking towards the poles, wrapping around in longitude.
 */
function iceDistance(ice: TimeStack, north: number, west: number, yearsBP: number): Float32Array {
  const W = FOLIAGE_GRID_W;
  const H = FOLIAGE_GRID_H;
  const d = new Float32Array(W * H);
  const dx = new Float32Array(H);
  for (let r = 0; r < H; r++) {
    const lat = north - (r + 0.5) * 0.5;
    dx[r] = CELL_KM * Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    for (let c = 0; c < W; c++) {
      const thick = ice.sample(lat, west + (c + 0.5) * 0.5, yearsBP) ?? 0;
      d[r * W + c] = thick > ICE_MIN_M ? 0 : ICE_FULL_KM;
    }
  }
  const relax = (r: number, c: number, rr: number, cc: number, step: number) => {
    if (rr < 0 || rr >= H) return;
    const i = r * W + c;
    const v = d[rr * W + ((cc + W) % W)]! + step;
    if (v < d[i]!) d[i] = v;
  };
  // Two rounds of forward and backward passes, so distances also wrap around the date line.
  for (let round = 0; round < 2; round++) {
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const diag = Math.hypot(CELL_KM, (dx[r]! + dx[Math.max(0, r - 1)]!) / 2);
        relax(r, c, r, c - 1, dx[r]!);
        relax(r, c, r - 1, c, CELL_KM);
        relax(r, c, r - 1, c - 1, diag);
        relax(r, c, r - 1, c + 1, diag);
      }
    for (let r = H - 1; r >= 0; r--)
      for (let c = W - 1; c >= 0; c--) {
        const diag = Math.hypot(CELL_KM, (dx[r]! + dx[Math.min(H - 1, r + 1)]!) / 2);
        relax(r, c, r, c + 1, dx[r]!);
        relax(r, c, r + 1, c, CELL_KM);
        relax(r, c, r + 1, c + 1, diag);
        relax(r, c, r + 1, c - 1, diag);
      }
  }
  return d;
}
