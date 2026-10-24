// When farming reaches a place (spec docs/spec/neolithic/farming-spread.md, section 9).
// The onset raster is computed by the data build (data/build/lib/farming.ts) and loaded
// once; every query is then a lookup, so the world stays a pure function of the date.

import { astronomicalYear, dayOfYearStart } from '../time/calendar.ts';
import {
  NEOLITHIC_PROFILES,
  neolithicProfile,
  type NeolithicProfileId,
} from './neolithicProfiles.ts';

/** The raster: 0.5 degree cells (about 50 km), row 0 at the north pole, column 0 at 180 W. */
export const FARMING_CELL_DEG = 0.5;
export const FARMING_COLS = 720;
export const FARMING_ROWS = 360;
/** A stored year is the year BCE (negative CE) plus this, so 0 can mean "no onset". */
export const FARMING_YEAR_BIAS = 2001;

/** What the file says about a seed (a centre or a waypoint) that set a cell's onset. */
export interface FarmingSeedInfo {
  id: string;
  /** Year BCE of the seed's own date; negative is CE. */
  bce: number;
  approximate: boolean;
  herdingOnly: boolean;
  en: string;
  de: string;
  package: { en: string; de: string };
}

/** The decoded raster. Layout of the file: u32 header length, JSON `{ seeds }`, then five
 * planes of 720 x 360 bytes: onset high bytes, onset low bytes, crop-delay high and low
 * bytes, seed index + 1. */
export class FarmingGrid {
  readonly seeds: FarmingSeedInfo[];
  private readonly bytes: Uint8Array;
  private readonly base: number;

  constructor(bytes: Uint8Array) {
    const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + len))) as {
      seeds: FarmingSeedInfo[];
    };
    this.seeds = header.seeds;
    this.bytes = bytes;
    this.base = 4 + len;
    if (bytes.length !== this.base + 5 * FARMING_COLS * FARMING_ROWS)
      throw new Error('farming raster: wrong size');
  }

  /** Year BCE (negative CE) farming or herding reaches a cell, or null. */
  onsetYear(cell: number): number | null {
    const N = FARMING_COLS * FARMING_ROWS;
    const v = (this.bytes[this.base + cell]! << 8) | this.bytes[this.base + N + cell]!;
    return v === 0 ? null : v - FARMING_YEAR_BIAS;
  }

  /** Year BCE crop farming reaches a cell: later than the onset where herders came first. */
  farmingYear(cell: number): number | null {
    const on = this.onsetYear(cell);
    if (on === null) return null;
    const N = FARMING_COLS * FARMING_ROWS;
    const d = (this.bytes[this.base + 2 * N + cell]! << 8) | this.bytes[this.base + 3 * N + cell]!;
    return d === 0xffff ? null : on - d;
  }

  /** The seed that set a cell's onset. */
  seedOf(cell: number): FarmingSeedInfo | null {
    const k = this.bytes[this.base + 4 * FARMING_COLS * FARMING_ROWS + cell]!;
    return k === 0 ? null : (this.seeds[k - 1] ?? null);
  }
}

/** The cell containing a point. */
export function farmingCellOf(lat: number, lon: number): number {
  const c = Math.min(FARMING_COLS - 1, Math.max(0, Math.floor(((lon + 180) / 360) * FARMING_COLS)));
  const r = Math.min(FARMING_ROWS - 1, Math.max(0, Math.floor(((90 - lat) / 180) * FARMING_ROWS)));
  return r * FARMING_COLS + c;
}

let grid: FarmingGrid | undefined;

/** Loads the raster (the manifest's `farming` file); the queries need it. */
export function setFarmingGrid(g: FarmingGrid | undefined): void {
  grid = g;
}

export const farmingGrid = (): FarmingGrid | undefined => grid;

/** The first day of a year given as years BCE (negative: CE, so -1000 is 1000 CE). */
export function dayOfFarmingYear(bce: number): number {
  return dayOfYearStart(bce > 0 ? astronomicalYear(bce, 'BCE') : astronomicalYear(-bce, 'CE'));
}

/**
 * The day farming (or herding) reaches a place, or null where it never does: sea, ice,
 * desert, high ground, mainland Australia and the cells the farming plan never reaches.
 */
export function farmingOnsetDay(lat: number, lon: number): number | null {
  const year = grid?.onsetYear(farmingCellOf(lat, lon)) ?? null;
  return year === null ? null : dayOfFarmingYear(year);
}

/** The day crop farming reaches a place; later than the onset where herders came first. */
export function cropFarmingDay(lat: number, lon: number): number | null {
  const year = grid?.farmingYear(farmingCellOf(lat, lon)) ?? null;
  return year === null ? null : dayOfFarmingYear(year);
}

export type SettlementStage = 'none' | 'herding' | 'farming';
export type FieldTool = 'hoe' | 'digging-stick' | 'ard';

/**
 * The stage of a place on a day: `none` before the onset or where there is none; `herding`
 * between the onset and the first crops, where herders came first (the Sahara, the steppe,
 * East Africa); `farming` from the first crops.
 */
export function settlementStage(lat: number, lon: number, day: number): SettlementStage {
  const on = farmingOnsetDay(lat, lon);
  if (on === null || day < on) return 'none';
  const crops = cropFarmingDay(lat, lon);
  return crops !== null && day >= crops ? 'farming' : 'herding';
}

/** A box of a profile's area: [south, north, west, east]. */
type Area = [number, number, number, number];

/**
 * Where each Neolithic profile applies (people-profiles.md section 1), as the boxes of
 * the culture table until the polygons are drawn into culture-areas.json. Where boxes
 * overlap, the profile of the lower rank wins, so the narrower areas come first.
 */
export const PROFILE_AREAS: { profile: NeolithicProfileId; area: Area }[] = Object.entries(
  NEOLITHIC_PROFILES,
)
  .flatMap(([profile, p]) => p.areas.map((area) => ({ profile, area, rank: p.areaRank })))
  .sort((a, b) => a.rank - b.rank)
  .map(({ profile, area }) => ({ profile, area }));

/** The profile that applies at a place, or null where farmers keep no profile of their own. */
export function farmingProfileAt(lat: number, lon: number): NeolithicProfileId | null {
  for (const { profile, area } of PROFILE_AREAS) {
    const [s, n, w, e] = area;
    if (lat >= s && lat <= n && lon >= w && lon <= e) return profile;
  }
  return null;
}

/** The field tool of a profile on a day: the ard from its date, else its own (hoe or digging stick). */
export function fieldToolOf(profile: NeolithicProfileId, day: number): FieldTool {
  const p = neolithicProfile(profile);
  if (p.ardFromBce !== undefined && day >= dayOfFarmingYear(p.ardFromBce)) return 'ard';
  return p.fieldTool;
}

export interface FarmingState {
  /** Herding or farming has reached the place by the day. */
  farming: boolean;
  stage: SettlementStage;
  /** Whole days since the onset; 0 before it. */
  sinceDays: number;
  /** The Neolithic profile of the people there, null before crops and where none applies. */
  profile: NeolithicProfileId | null;
  /** The farmer's field tool, null before crops or without a profile. */
  fieldTool: FieldTool | null;
  /** What arrived, from the seed that set the onset. */
  package: { en: string; de: string } | null;
}

export function farmingStateAt(lat: number, lon: number, day: number): FarmingState {
  const none: FarmingState = {
    farming: false,
    stage: 'none',
    sinceDays: 0,
    profile: null,
    fieldTool: null,
    package: null,
  };
  const on = farmingOnsetDay(lat, lon);
  if (on === null || day < on) return none;
  const stage = settlementStage(lat, lon, day);
  const profile = stage === 'farming' ? farmingProfileAt(lat, lon) : null;
  return {
    farming: true,
    stage,
    sinceDays: day - on,
    profile,
    fieldTool: profile ? fieldToolOf(profile, day) : null,
    package: grid?.seedOf(farmingCellOf(lat, lon))?.package ?? null,
  };
}
