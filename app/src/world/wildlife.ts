// Wildlife (spec wildlife.md): small groups of wild animals, each roaming
// around its home. Where every animal is, which way it faces and what it is
// doing is a pure function of the date and the clock, from seeded hashes,
// using only + − × ÷ and Math.sqrt so every device computes the same animals
// (milestone 2, section 2.3). The wildlife layer places them on the globe.

import type { Table } from '../../../data/schema/tables.ts';
import { onWorldTables } from './tables.ts';
import { detCos, detSin, RAD } from '../core/detmath.ts';
import { hash01, hashString } from '../core/hash.ts';
import { EARTH_RADIUS_KM } from '../geo/earth.ts';
import { astronomicalYear, dayOfYearStart, DAYS_PER_YEAR } from '../time/calendar.ts';

export interface WildSpan {
  /** First year shown; negative years are BCE. Absent: from the start of the timeline. */
  from?: number;
  /** Last year shown. Absent: to the end of the timeline. */
  to?: number;
}

export interface WildGroup {
  species: string;
  model: string;
  home: string;
  lat: number;
  lon: number;
  spans?: WildSpan[];
  /** Roaming radius in km where the default does not fit, such as on a small island (section 4). */
  roamKm?: number;
  /** Number of animals where the default of 2 or 3 does not fit, such as one alone on a small island (section 4). */
  size?: number;
  source: string;
}

const groups: WildGroup[] = [];
/** The wildlife groups, in the order of the wildlife table, once the world has its tables (tables.ts). */
export const WILD_GROUPS: readonly WildGroup[] = groups;

/** How a model moves and is drawn where it differs from the defaults: its row of `models` in the data file. */
export type WildModelTraits = Table<'wildlife.json'>['models'][string];

let MODEL_TRAITS: Readonly<Record<string, WildModelTraits>> = {};
onWorldTables((t) => {
  groups.splice(0, groups.length, ...(t.wildlife.groups as WildGroup[]));
  MODEL_TRAITS = t.wildlife.models;
});

/** A model's traits; none for a model the data file does not list. */
export function traitsOf(model: string): WildModelTraits {
  return Object.hasOwn(MODEL_TRAITS, model) ? MODEL_TRAITS[model]! : {};
}

export type WildClip = 'idle' | 'walk' | 'fly' | 'swim';

/** One animal at one moment. */
export interface WildAnimal {
  /** Stable key: group index and member index. */
  key: string;
  model: string;
  /** Home of its group in degrees. */
  lat: number;
  lon: number;
  /** The animal's spot before its formation offset, in km east and north of the home on the true globe. */
  eastKm: number;
  northKm: number;
  /** Facing as a unit vector (east, north) on the ground. */
  heading: [number, number];
  /** Formation offset from the group's spot in body lengths (east, north); the layer scales it. */
  offset: [number, number];
  clip: WildClip;
  /** Seconds into the clip; for a walk, the eased time into it, so steps slow as the walk eases. */
  seconds: number;
  /** Length of the current walk in seconds, so the layer can end it on a whole stride; 0 otherwise. */
  walkS: number;
  /** 0 to 1 while the group grows in or shrinks away at the ends of its spans (section 2). */
  grow: number;
  /** Height above the ground in drawn km, for birds in flight. */
  liftKm: number;
  /** Height of a sea animal's middle above the sea surface, in body heights; below 0 it is under water. */
  rise: number;
  /** Nose up from level in radians, for sea animals diving and leaping. */
  pitch: number;
}

/** Years over which a group grows in or shrinks away (section 2). */
const GROW_YEARS = 5;
/**
 * Roaming radius around the home, in km of the true globe (section 4; Yang,
 * 2026-10-18: "like the radius of 1000km").
 */
const ROAM_KM = 1000;
/** A round's seconds before its hashed extra, and the most of it a walk takes, unless a model's traits say. */
const ROUND_SECONDS = 10;
const WALK_SHARE = 0.9;
/** Walking speed in km of the globe per second of the clock. */
const WALK_KM_S = 55;
/**
 * A group grazes its spots up to this far around a centre that wanders
 * slowly over its open ground, a few rounds at a time (section 4).
 */
const LOCAL_KM = 120;
/** Rounds for the wandering centre to swing once east-west and north-south. */
const WANDER_ROUNDS: P2 = [41, 29];
/** Each animal's own spots lie up to this far from the group's (section 4). */
const MEMBER_JITTER_KM = 40;
/** Birds fly loops of this radius at this height (section 4). */
const FLIGHT_RADIUS_KM = 160;
const FLIGHT_LIFT_KM = 150;
const FLIGHT_KM_S = 45;
/** Birds of a group fly this far apart along the loop (turns) and across it (km). */
const FLIGHT_GAP_TURNS = 0.15;
const FLIGHT_LANE_KM = 60;
/** Birds fly over anything; sea animals swim at the surface of the open sea (section 4). */
const isBird = (model: string) => traitsOf(model).moves === 'fly';
const isSwimmer = (model: string) => traitsOf(model).moves === 'swim';
/** A dolphin's leap, and how high it rises, in seconds and body heights. */
const LEAP_SECONDS = 2.4;
const LEAP_RISE = 0.9;
/** How deep a whale dives, in body heights, and how far it tips. */
const DIVE_DEPTH = 1.4;
const DIVE_PITCH = 0.4;
/** Trees keep this far beyond an animal's half length, in drawn km: a big tree's crown (section 5). */
const CLEARING_MARGIN_KM = 200;
/** Clearings move on in stretches of this many seconds of the clock (section 5). */
export const CLEAR_STEP_S = 20;
/** Each animal is followed over a stretch at this step of the clock, in seconds (section 5). */
const CLEAR_SAMPLE_S = 1;
/** A new clearing goes round an animal once it has moved on this far, in drawn km (section 5). */
const CLEAR_SPACING_KM = 100;
/** An animal turns along a keep-out circle from this share of its radius outside it. */
const KEEP_OUT_TURN = 0.3;
/** A camp's keep-out circle stands from this many clock seconds before its first lodging (section 4). */
const CAMP_LEAD_S = 30;
/** And grows in over this many seconds from then, so no animal jumps. */
const CAMP_GROW_S = 15;
/** Cells per side of a group's ground mask (section 4). */
export const WILD_MASK_N = 48;
/** The mask reaches this far beyond the roaming radius, for the animals' places in the group. */
const WILD_MASK_MARGIN_KM = 450;
/** Pieces of ground cut off by camps smaller than this many cells are ignored. */
const PIECE_SLIVER_CELLS = 3;
/** A chain of held rounds restarts at every round that is a multiple of this. */
const HOLD_ROOT_ROUNDS = 24;
/** Tries to find a spot on open ground before an animal stays at home. */
const SPOT_TRIES = 16;
/** How far a group closes up on narrow land: shares of its places in the group (section 4). */
const PLACE_FITS = [1, 0.75, 0.55];

/**
 * Where each group may stand, built from the terrain by the data build:
 * one byte per cell, row by row from the south-west, 1 where the ground is
 * open lowland (section 4). Undefined for birds, which fly over anything.
 */
export type WildMask = Uint8Array | undefined;

/**
 * A camp of the tree of humankind that a group keeps clear of (section 4): its
 * hearth in km east and north of the group's home on the true globe, the
 * radius of its keep-out circle there in km, and when it stands, in seconds
 * of the clock (its circle stands from CAMP_LEAD_S before `from`).
 */
export interface KeepOut {
  x: number;
  y: number;
  r: number;
  from: number;
  to: number;
}

/**
 * The keep-outs of a group from the camp places of the startup index, each
 * [lat, lon] in whole microdegrees with the clock seconds it stands: the
 * hearth laid on the plane touching the globe at the home, as the app places
 * the animals, with a keep-out radius of rKm on the true globe. Camps on the
 * far side of the globe from the home are left out.
 */
export function keepOutsOf(
  g: WildGroup,
  camps: readonly { lat: number; lon: number; from: number; to: number }[],
  rKm: number,
): KeepOut[] {
  if (isBird(g.model) || isSwimmer(g.model)) return [];
  const unit = (lat: number, lon: number): P3 => [
    detCos(lat * RAD) * detSin(lon * RAD),
    detSin(lat * RAD),
    detCos(lat * RAD) * detCos(lon * RAD),
  ];
  const up = unit(g.lat, g.lon);
  // North and east on the plane, as geo/earth.ts northEast sets them.
  let north: P3 = [-up[0] * up[1], 1 - up[1] * up[1], -up[2] * up[1]];
  const len = Math.sqrt(north[0] ** 2 + north[1] ** 2 + north[2] ** 2);
  north = len > 1e-3 ? [north[0] / len, north[1] / len, north[2] / len] : [0, 0, 1];
  const east: P3 = [
    north[1] * up[2] - north[2] * up[1],
    north[2] * up[0] - north[0] * up[2],
    north[0] * up[1] - north[1] * up[0],
  ];
  const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const out: KeepOut[] = [];
  for (const c of camps) {
    const d = unit(c.lat / 1e6, c.lon / 1e6);
    const h = dot(d, up);
    if (h < 0.5) continue;
    const x = (EARTH_RADIUS_KM * dot(d, east)) / h;
    const y = (EARTH_RADIUS_KM * dot(d, north)) / h;
    const far = roamOf(g) + WILD_MASK_MARGIN_KM + 2 * rKm;
    if (x * x + y * y > far * far) continue;
    out.push({ x, y, r: rKm, from: c.from, to: c.to });
  }
  return out;
}

type P3 = [number, number, number];

/** How far a keep-out circle has grown at a clock time: 0 before it stands, 1 once grown, shrinking away over 15 s after it ends. */
function keepOutGrowth(k: KeepOut, seconds: number): number {
  const grown = Math.min(1, Math.max(0, (seconds - (k.from - CAMP_LEAD_S)) / CAMP_GROW_S));
  return Math.min(grown, Math.max(0, 1 - (seconds - k.to) / CAMP_GROW_S));
}

/** The keep-outs standing at any time from a to b, in clock seconds. */
function standing(keepOuts: readonly KeepOut[], a: number, b: number): KeepOut[] {
  return keepOuts.filter((k) => k.from - CAMP_LEAD_S < b && k.to > a);
}

/** A mask from the hex string the startup index carries, one bit per cell, row by row. */
export function decodeWildMask(hex: string): Uint8Array {
  const out = new Uint8Array(WILD_MASK_N * WILD_MASK_N);
  for (let i = 0; i < out.length; i++)
    out[i] = (parseInt(hex[i >> 2] ?? '0', 16) >> (3 - (i & 3))) & 1;
  return out;
}

/** The hex string of a mask (data build). */
export function encodeWildMask(mask: ArrayLike<number>): string {
  let hex = '';
  for (let i = 0; i < mask.length; i += 4) {
    let d = 0;
    for (let b = 0; b < 4; b++) d = (d << 1) | (mask[i + b] ? 1 : 0);
    hex += d.toString(16);
  }
  return hex;
}

/** The centre of mask cell (i east, j north) in km east and north of the home. */
export function wildMaskCell(g: WildGroup, i: number, j: number): [number, number] {
  const half = roamOf(g) + WILD_MASK_MARGIN_KM;
  const cell = (2 * half) / WILD_MASK_N;
  return [-half + (i + 0.5) * cell, -half + (j + 0.5) * cell];
}

/** Whether a point km east and north of the home lies on open ground in the mask. */
function open(mask: WildMask, roam: number, x: number, y: number): boolean {
  if (!mask) return true;
  const half = roam + WILD_MASK_MARGIN_KM;
  const i = Math.floor(((x + half) / (2 * half)) * WILD_MASK_N);
  const j = Math.floor(((y + half) / (2 * half)) * WILD_MASK_N);
  if (i < 0 || j < 0 || i >= WILD_MASK_N || j >= WILD_MASK_N) return false;
  return mask[j * WILD_MASK_N + i] === 1;
}

const groupSeed = (g: WildGroup, index: number) => hashString(`${g.species}:${index}`);

/** Day number at the start of a year where negative years are BCE. */
function yearDay(year: number): number {
  return dayOfYearStart(year < 0 ? astronomicalYear(-year, 'BCE') : year);
}

/** How far a group is grown in on a day: 1 inside a span, 0 outside, ramps over GROW_YEARS at its ends. */
export function groupGrowth(g: WildGroup, day: number): number {
  const ramp = GROW_YEARS * DAYS_PER_YEAR;
  let best = 0;
  for (const s of g.spans ?? [{}]) {
    const a = s.from === undefined ? 1 : Math.min(1, Math.max(0, (day - yearDay(s.from)) / ramp));
    const b = s.to === undefined ? 1 : Math.min(1, Math.max(0, (yearDay(s.to) - day) / ramp));
    best = Math.max(best, Math.min(a, b));
  }
  return best;
}

/**
 * The span of a group shown on a day, for its card (section 8): the first
 * day of its first and of its last year, each only where the span has that
 * end. Undefined for a group shown at every date.
 */
export function groupSpanAt(
  g: WildGroup,
  day: number,
): { from?: { day: number; year: number }; to?: { day: number; year: number } } | undefined {
  if (!g.spans) return undefined;
  const ramp = GROW_YEARS * DAYS_PER_YEAR;
  const span =
    g.spans.find(
      (s) =>
        (s.from === undefined || day >= yearDay(s.from) - ramp) &&
        (s.to === undefined || day <= yearDay(s.to) + ramp),
    ) ?? g.spans[0]!;
  return {
    from: span.from === undefined ? undefined : { day: yearDay(span.from), year: span.from },
    to: span.to === undefined ? undefined : { day: yearDay(span.to), year: span.to },
  };
}

/** Number of members of a group: 2 or 3, unless the data file sets it (section 4). */
export function groupSize(g: WildGroup, index: number): number {
  if (g.size !== undefined) return g.size;
  return hash01(groupSeed(g, index), 1) < 0.5 ? 2 : 3;
}

/** Cosine and sine of a turn (1 = a full circle) from a polynomial, the same on every engine. */
export function cosSinTurn(turns: number): [number, number] {
  // Reduce to [-0.5, 0.5) turns, then x in [-π, π); Taylor series to x^23 and x^22.
  const r = turns - Math.floor(turns + 0.5);
  const x = r * 2 * Math.PI;
  const x2 = x * x;
  let sin = 0;
  let cos = 0;
  let termS = x;
  let termC = 1;
  for (let n = 1; n <= 23; n += 2) {
    sin += termS;
    cos += termC;
    termS *= -x2 / ((n + 1) * (n + 2));
    termC *= -x2 / (n * (n + 1));
  }
  return [cos, sin];
}

/**
 * Clearings in the trees where the animals shown on a day walk and graze over
 * a stretch of the clock (section 5): each walking or swimming animal is
 * followed through the CLEAR_STEP_S seconds that hold the clock time, a point
 * every CLEAR_SAMPLE_S, and a clearing goes round each point where it has
 * moved on by CLEAR_SPACING_KM on the drawn globe since the last, as km east
 * and north of its home and a radius in drawn km: half its body length and a
 * tree crown. Birds keep one clearing over their whole loop. The clearings
 * change only once per stretch, so the trees are not re-placed every frame.
 * drawnLengthKm gives a model's drawn body length, widthAt the lens's
 * stretch at a group's home.
 */
export function wildClearings(
  day: number,
  seconds: number,
  groups = WILD_GROUPS,
  masks: readonly WildMask[] = [],
  reachKm: (model: string, g: WildGroup) => number = () => 0,
  drawnLengthKm: (model: string) => number = () => 0,
  widthAt: (g: WildGroup) => number = () => 1,
  keepOuts: readonly (readonly KeepOut[])[] = [],
): { lat: number; lon: number; eastKm: number; northKm: number; km: number }[] {
  const out: { lat: number; lon: number; eastKm: number; northKm: number; km: number }[] = [];
  groups.forEach((g) => {
    if (!isBird(g.model) || groupGrowth(g, day) <= 0) return;
    const len = Math.max(drawnLengthKm(g.model), drawnLengthKm(modelOf(g, 1)));
    out.push({
      lat: g.lat,
      lon: g.lon,
      eastKm: 0,
      northKm: 0,
      km: widthAt(g) * roamOf(g) + len + CLEARING_MARGIN_KM,
    });
  });
  const step = Math.floor(seconds / CLEAR_STEP_S) * CLEAR_STEP_S;
  const last = new Map<string, P2>();
  for (let t = 0; t <= CLEAR_STEP_S; t += CLEAR_SAMPLE_S)
    for (const a of wildlifeAt(day, step + t, groups, masks, reachKm, keepOuts)) {
      const g = groups[Number(a.key.split(':')[0])]!;
      if (isBird(g.model)) continue;
      const reach = reachKm(a.model, g);
      const x = a.eastKm + a.offset[0] * reach;
      const y = a.northKm + a.offset[1] * reach;
      const width = widthAt(g);
      const before = last.get(a.key);
      if (
        before &&
        ((x - before[0]) ** 2 + (y - before[1]) ** 2) * width * width < CLEAR_SPACING_KM ** 2
      )
        continue;
      last.set(a.key, [x, y]);
      out.push({
        lat: a.lat,
        lon: a.lon,
        eastKm: x,
        northKm: y,
        km: drawnLengthKm(a.model) / 2 + CLEARING_MARGIN_KM,
      });
    }
  return out;
}

/** Seconds of one round of grazing and walking for a group. */
function roundSeconds(g: WildGroup, seed: number): number {
  return (traitsOf(g.model).roundSeconds ?? ROUND_SECONDS) + 6 * hash01(seed, 4);
}

/**
 * Each animal's place in its group, fixed on the ground and never turned with
 * the group: in body lengths (offsets) and in km of the true globe (places).
 */
function groupPlaces(
  g: WildGroup,
  gi: number,
  reachKm: (model: string, g: WildGroup) => number,
): { offsets: P2[]; places: P2[] } {
  const seed = groupSeed(g, gi);
  const swimmer = isSwimmer(g.model);
  const offsets: P2[] = [];
  const places: P2[] = [];
  for (let i = 0; i < groupSize(g, gi); i++) {
    const [c, sn] = cosSinTurn(hash01(seed, 10 + i));
    // Sea animals swim close together, as a pod.
    const dist = i === 0 ? 0 : (swimmer ? 0.7 : 1.3) + (swimmer ? 0.3 : 0.5) * hash01(seed, 20 + i);
    const reach = reachKm(modelOf(g, i), g);
    offsets.push([dist * c, dist * sn]);
    places.push([dist * c * reach, dist * sn * reach]);
  }
  return { offsets, places };
}

/** The model of the i-th animal of a group: a lion's pride has lionesses, a silverback leads females. */
function modelOf(g: WildGroup, i: number): string {
  if (i === 0) return g.model;
  return traitsOf(g.model).others ?? g.model;
}

/** Whether a group flies (birds), over any ground (section 4). */
export function flies(g: WildGroup): boolean {
  return isBird(g.model);
}

/** Whether a group swims in the open sea (section 4). */
export function swims(g: WildGroup): boolean {
  return isSwimmer(g.model);
}

/** Roaming radius of a group in km (section 4). */
export function roamOf(g: WildGroup): number {
  if (g.roamKm !== undefined) return g.roamKm;
  if (isBird(g.model)) return FLIGHT_RADIUS_KM + 2 * FLIGHT_LANE_KM;
  return traitsOf(g.model).roamKm ?? ROAM_KM;
}

/** Middle and spread (km east and north of the home) of a group's open cells within its roaming radius. */
interface Range {
  mid: P2;
  spread: P2;
}
const ranges = new WeakMap<Uint8Array, Map<number, Range>>();

function rangeOf(mask: WildMask, roam: number): Range {
  const free = { mid: [0, 0] as P2, spread: [roam * 0.6, roam * 0.6] as P2 };
  if (!mask) return free;
  let cache = ranges.get(mask);
  if (!cache) ranges.set(mask, (cache = new Map()));
  const hit = cache.get(roam);
  if (hit) return hit;
  const half = roam + WILD_MASK_MARGIN_KM;
  const cell = (2 * half) / WILD_MASK_N;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  for (let j = 0; j < WILD_MASK_N; j++)
    for (let i = 0; i < WILD_MASK_N; i++) {
      const x = -half + (i + 0.5) * cell;
      const y = -half + (j + 0.5) * cell;
      if (x * x + y * y > roam * roam || mask[j * WILD_MASK_N + i] !== 1) continue;
      n++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
    }
  const range: Range =
    n === 0
      ? { mid: [0, 0], spread: [0, 0] }
      : {
          mid: [sx / n, sy / n],
          spread: [
            Math.sqrt(Math.max(0, sxx / n - (sx / n) ** 2)),
            Math.sqrt(Math.max(0, syy / n - (sy / n) ** 2)),
          ],
        };
  cache.set(roam, range);
  return range;
}

/**
 * Where a group's grazing wanders around in round k: a slow loop over the
 * middle of its open ground, as wide as that ground (section 4).
 */
function wanderCentre(seed: number, k: number, roam: number, mask: WildMask): P2 {
  const { mid, spread } = rangeOf(mask, roam);
  const [cx] = cosSinTurn(k / WANDER_ROUNDS[0] + hash01(seed, 8));
  const [, sy] = cosSinTurn(k / WANDER_ROUNDS[1] + hash01(seed, 9));
  return [mid[0] + 1.2 * spread[0] * cx, mid[1] + 1.2 * spread[1] * sy];
}

/**
 * The k-th grazing spot of a group, km east and north of its home: the first
 * of a few seeded tries near the group's wandering centre that lands on open
 * ground, else the open ground nearest that centre, so animals never climb
 * into the mountains or walk into the sea (section 4).
 */
function spot(
  seed: number,
  k: number,
  roam: number,
  mask: WildMask,
  places: readonly P2[],
  avoid: readonly KeepOut[] = [],
  half = 0,
): [number, number, number] {
  const local = Math.min(LOCAL_KM, roam);
  let [mx, my] = roam > LOCAL_KM ? wanderCentre(seed, k, roam, mask) : [0, 0];
  // Out of the camps' keep-out circles, far enough that the tries land outside them.
  const spread = local + Math.sqrt(Math.max(0, ...places.map(([x, y]) => x * x + y * y)));
  for (const c of avoid) [mx, my] = outOf(c, mx, my, c.r + half + spread);
  // On narrow land the group closes up: its places shrink until all fit.
  for (const fit of PLACE_FITS) {
    for (let a = 0; a < SPOT_TRIES; a++) {
      const h = a === 0 ? 2 : 100 + 10 * a;
      const r = local * Math.sqrt(hash01(seed, k, h));
      const [c, s] = cosSinTurn(hash01(seed, k, h + 1));
      const x = mx + r * c;
      const y = my + r * s;
      // Every animal of the group, at its place in the group, must stand on open ground.
      if (
        x * x + y * y <= roam * roam &&
        places.every(
          ([px, py]) =>
            open(mask, roam, x + px * fit, y + py * fit) &&
            clearOf(avoid, x + px * fit, y + py * fit, half),
        )
      )
        return [x, y, fit];
    }
    const at = fallbackSpot(
      mask,
      roam,
      places.map(([px, py]) => [px * fit, py * fit]),
      [mx, my],
      true,
    );
    if (at) return [at[0], at[1], fit];
  }
  const at = fallbackSpot(mask, roam, places, [mx, my], false)!;
  return [at[0], at[1], PLACE_FITS[PLACE_FITS.length - 1]!];
}

const pieces = new WeakMap<Uint8Array, Map<string, Uint8Array>>();

/**
 * The part of a mask a group can keep to while circles stand: its open cells cut by the circles
 * fall into pieces joined without crossing one, and only the largest piece is kept, so no spot
 * lies where no walk can reach (section 4). The mask itself if the circles cut nothing off.
 */
function pieceOf(mask: WildMask, roam: number, circles: readonly Circle[]): WildMask {
  if (!mask || circles.length === 0) return mask;
  const key = circles
    .map((c) => `${Math.round(c.x)},${Math.round(c.y)},${Math.round(c.r)}`)
    .join(';');
  let cache = pieces.get(mask);
  if (!cache) pieces.set(mask, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit === mask ? mask : hit;
  const n = WILD_MASK_N;
  const half = roam + WILD_MASK_MARGIN_KM;
  const cell = (2 * half) / n;
  const label = new Int16Array(n * n);
  const sizes: number[] = [0];
  for (let c = 0; c < n * n; c++) {
    if (mask[c] !== 1 || label[c] !== 0) continue;
    const [cx, cy] = [-half + ((c % n) + 0.5) * cell, -half + (Math.floor(c / n) + 0.5) * cell];
    if (circles.some((k) => len2d(cx - k.x, cy - k.y) < k.r)) continue;
    const id = sizes.length;
    sizes.push(0);
    const stack = [c];
    label[c] = id;
    while (stack.length > 0) {
      const at = stack.pop()!;
      sizes[id]!++;
      const i = at % n;
      const j = Math.floor(at / n);
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const to = b * n + a;
        if (mask[to] !== 1 || label[to] !== 0) continue;
        const [x, y] = [-half + (a + 0.5) * cell, -half + (b + 0.5) * cell];
        if (circles.some((k) => len2d(x - k.x, y - k.y) < k.r)) continue;
        label[to] = id;
        stack.push(to);
      }
    }
  }
  let best = 0;
  for (let id = 1; id < sizes.length; id++) if (sizes[id]! > sizes[best]!) best = id;
  const cut = sizes.reduce((sum, v, id) => (id === 0 || id === best ? sum : sum + v), 0);
  let out: Uint8Array = mask;
  if (cut >= PIECE_SLIVER_CELLS) {
    out = Uint8Array.from(mask);
    for (let c = 0; c < n * n; c++) if (label[c] !== 0 && label[c] !== best) out[c] = 0;
  }
  cache.set(key, out);
  return out;
}

/** Whether a point stands outside every keep-out circle, for an animal of half length `half`. */
function clearOf(avoid: readonly KeepOut[], x: number, y: number, half: number): boolean {
  return avoid.every((c) => (x - c.x) ** 2 + (y - c.y) ** 2 >= (c.r + half) ** 2);
}

/** A point moved out to `need` from a keep-out's hearth, away from it, if it is closer. */
function outOf(c: KeepOut, x: number, y: number, need: number): P2 {
  const dx = x - c.x;
  const dy = y - c.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= need) return [x, y];
  if (d < 1e-9) return [c.x + need, c.y];
  return [c.x + (dx / d) * need, c.y + (dy / d) * need];
}

const fallbacks = new WeakMap<Uint8Array, Map<string, P2 | undefined>>();

/**
 * Where a group grazes when no try finds open ground for all its animals:
 * the open cell nearest the wandering centre where they all fit, else the
 * open cell nearest it, else the home itself (section 4).
 */
function fallbackSpot(
  mask: WildMask,
  roam: number,
  places: readonly P2[],
  near: P2,
  allOnly: boolean,
): P2 | undefined {
  if (!mask) return near;
  const half = roam + WILD_MASK_MARGIN_KM;
  const cell = (2 * half) / WILD_MASK_N;
  // Cached by the cell of the centre, so the search runs once per cell.
  const ci = Math.floor((near[0] + half) / cell);
  const cj = Math.floor((near[1] + half) / cell);
  const key = `${roam}:${allOnly}:${ci},${cj}:${places.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(';')}`;
  let cache = fallbacks.get(mask);
  if (!cache) fallbacks.set(mask, (cache = new Map()));
  if (cache.has(key)) return cache.get(key);
  const nx = -half + (ci + 0.5) * cell;
  const ny = -half + (cj + 0.5) * cell;
  let best: P2 | undefined = allOnly ? undefined : [0, 0];
  let bestD = Infinity;
  for (const all of allOnly ? [true] : [true, false]) {
    for (let j = 0; j < WILD_MASK_N; j++)
      for (let i = 0; i < WILD_MASK_N; i++) {
        const x = -half + (i + 0.5) * cell;
        const y = -half + (j + 0.5) * cell;
        const d = (x - nx) ** 2 + (y - ny) ** 2;
        if (d >= bestD || x * x + y * y > roam * roam) continue;
        const fits = all
          ? places.every(([px, py]) => open(mask, roam, x + px, y + py))
          : open(mask, roam, x, y);
        if (fits) {
          best = [x, y];
          bestD = d;
        }
      }
    if (bestD < Infinity) break;
  }
  cache.set(key, best);
  return best;
}

type P2 = [number, number];

/** Whether the ground between a and b (ends excluded) is open, sampled at a third of a cell. */
function clear(mask: WildMask, roam: number, a: P2, b: P2): boolean {
  if (!mask) return true;
  const cell = (2 * (roam + WILD_MASK_MARGIN_KM)) / WILD_MASK_N;
  const d = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
  const n = Math.ceil(d / (cell / 3));
  for (let k = 1; k < n; k++) {
    const f = k / n;
    if (!open(mask, roam, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)) return false;
  }
  return true;
}

const routes = new WeakMap<Uint8Array, Map<string, P2[]>>();

/**
 * A walk from a to b around closed ground (lakes, sea, mountains) through
 * the open cells of the mask, as a polyline from a to b with as few corners
 * as stay on open ground (section 4). The straight line when there is no way round.
 */
function route(mask: Uint8Array, roam: number, a: P2, b: P2): P2[] {
  const key = `${roam}:${a[0].toFixed(3)},${a[1].toFixed(3)}:${b[0].toFixed(3)},${b[1].toFixed(3)}`;
  let cache = routes.get(mask);
  if (!cache) routes.set(mask, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 2000) cache.clear();
  const N = WILD_MASK_N;
  const half = roam + WILD_MASK_MARGIN_KM;
  const cell = (2 * half) / N;
  const cellOf = (p: P2) => {
    const i = Math.min(N - 1, Math.max(0, Math.floor((p[0] + half) / cell)));
    const j = Math.min(N - 1, Math.max(0, Math.floor((p[1] + half) / cell)));
    return j * N + i;
  };
  const from = cellOf(a);
  const to = cellOf(b);
  const free = (q: number) => q === from || q === to || mask[q] === 1;
  // Breadth-first over the cells, diagonals only where both sides are open.
  const prev = new Int32Array(N * N).fill(-1);
  prev[from] = from;
  const queue = [from];
  for (let h = 0; h < queue.length && prev[to]! < 0; h++) {
    const q = queue[h]!;
    const i = q % N;
    const j = (q - i) / N;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const x = i + di;
        const y = j + dj;
        if ((di === 0 && dj === 0) || x < 0 || y < 0 || x >= N || y >= N) continue;
        const r = y * N + x;
        if (prev[r]! >= 0 || !free(r)) continue;
        if (di !== 0 && dj !== 0 && !(free(j * N + x) && free(y * N + i))) continue;
        prev[r] = q;
        queue.push(r);
      }
  }
  let path: P2[] = [a, b];
  if (prev[to]! >= 0) {
    const cells: P2[] = [];
    for (let q = prev[to]!; q !== from; q = prev[q]!) {
      const i = q % N;
      cells.push([-half + (i + 0.5) * cell, -half + ((q - i) / N + 0.5) * cell]);
    }
    const pts: P2[] = [a, ...cells.reverse(), b];
    // Pull the string tight: from each corner, straight to the farthest one in clear sight.
    path = [a];
    for (let k = 0; k < pts.length - 1;) {
      let m = pts.length - 1;
      while (m > k + 1 && !clear(mask, roam, pts[k]!, pts[m]!)) m--;
      path.push(pts[m]!);
      k = m;
    }
  }
  cache.set(key, path);
  return path;
}

/** A keep-out circle as an animal's walk sees it: where the group's path must stay out of, and how far. */
interface Circle {
  x: number;
  y: number;
  r: number;
}

function len2d(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Whether the segment from a to b cuts into a circle. */
function cuts(a: P2, b: P2, c: Circle): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((c.x - a[0]) * dx + (c.y - a[1]) * dy) / len2));
  return len2d(a[0] + dx * t - c.x, a[1] + dy * t - c.y) < c.r * 0.98;
}

/**
 * The shortest walk from a to b round the circles in its way (section 4): a straight line where
 * none cuts it, else the shortest path over corners just outside the circles, each edge of
 * it clear of every circle and passing `fits`. Undefined when no such way exists.
 */
function aroundCircles(
  a: P2,
  b: P2,
  circles: readonly Circle[],
  fits: (p: P2, q: P2) => boolean,
): P2[] | undefined {
  if (!circles.some((c) => cuts(a, b, c))) return [b];
  const nodes: P2[] = [a, b];
  for (const c of circles)
    for (let m = 0; m < 16; m++) {
      const [cs, sn] = cosSinTurn(m / 16);
      const q: P2 = [c.x + cs * c.r * 1.04, c.y + sn * c.r * 1.04];
      if (!circles.some((x) => len2d(q[0] - x.x, q[1] - x.y) < x.r * 0.98)) nodes.push(q);
    }
  const dist = new Float64Array(nodes.length).fill(Infinity);
  const prev = new Int32Array(nodes.length).fill(-1);
  const done = new Uint8Array(nodes.length);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let m = 0; m < nodes.length; m++)
      if (!done[m] && dist[m]! < Infinity && (u < 0 || dist[m]! < dist[u]!)) u = m;
    if (u < 0) return undefined;
    if (u === 1) break;
    done[u] = 1;
    for (let v = 0; v < nodes.length; v++) {
      if (done[v]) continue;
      const d = dist[u]! + len2d(nodes[v]![0] - nodes[u]![0], nodes[v]![1] - nodes[u]![1]);
      if (d >= dist[v]!) continue;
      if (circles.some((c) => cuts(nodes[u]!, nodes[v]!, c)) || !fits(nodes[u]!, nodes[v]!))
        continue;
      dist[v] = d;
      prev[v] = u;
    }
  }
  const out: P2[] = [];
  for (let m = 1; m >= 0 && m !== 0; m = prev[m]!) out.push(nodes[m]!);
  return out.reverse();
}

/** The corners of a polyline cut off twice (Chaikin), its ends kept. */
function rounded(pts: readonly P2[]): P2[] {
  let out = [...pts];
  for (let pass = 0; pass < 2; pass++) {
    const next: P2[] = [out[0]!];
    for (let k = 0; k < out.length - 1; k++) {
      const p = out[k]!;
      const q = out[k + 1]!;
      next.push(
        [0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]],
        [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]],
      );
    }
    next.push(out[out.length - 1]!);
    out = next;
  }
  return out;
}

/** The point and direction at a share u of the way along a polyline, and its length. */
function alongPath(path: readonly P2[], u: number): { at: P2; dir: P2; length: number } {
  let length = 0;
  for (let k = 1; k < path.length; k++)
    length += Math.sqrt(
      (path[k]![0] - path[k - 1]![0]) ** 2 + (path[k]![1] - path[k - 1]![1]) ** 2,
    );
  let left = u * length;
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1]!;
    const b = path[k]!;
    const d = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
    if (left <= d || k === path.length - 1) {
      const f = d > 0 ? Math.min(1, left / d) : 1;
      return {
        at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
        dir: [b[0] - a[0], b[1] - a[1]],
        length,
      };
    }
    left -= d;
  }
  return { at: path[path.length - 1]!, dir: [0, 0], length };
}

/** A point on the Catmull-Rom curve from p1 to p2 at u in [0, 1]. */
function catmullRom(p0: P2, p1: P2, p2: P2, p3: P2, u: number): P2 {
  const at = (i: 0 | 1) =>
    0.5 *
    (2 * p1[i] +
      (p2[i] - p0[i]) * u +
      (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u * u +
      (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u * u * u);
  return [at(0), at(1)];
}

/** The direction of the Catmull-Rom curve at u; continuous from one segment to the next. */
function catmullRomTangent(p0: P2, p1: P2, p2: P2, p3: P2, u: number): P2 {
  const at = (i: 0 | 1) =>
    0.5 *
    (p2[i] -
      p0[i] +
      2 * (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u +
      3 * (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u * u);
  return [at(0), at(1)];
}

/**
 * Every animal shown on a day at a clock time in seconds. masks holds each
 * group's ground mask by index; a group without one roams freely. reachKm
 * gives the km on the ground of one body length of a model, for checking
 * each animal's place in its group against the mask. keepOuts holds the
 * camps each group keeps clear of, by index (section 4).
 */
interface WildMemo {
  spots: Map<string, [number, number, number]>;
  paths: Map<string, P2[] | null>;
}
/** The memo for one set of groups, masks and keep-outs; a new set starts afresh. */
const memos = new WeakMap<object, { masks: object; keepOuts: object; memo: WildMemo }>();
/** Rounds kept per memo before it is cleared, so a long run does not grow it without end. */
const MEMO_MAX = 20_000;
function memoOf(
  groups: readonly WildGroup[],
  masks: readonly WildMask[],
  keepOuts: readonly (readonly KeepOut[])[],
): WildMemo {
  let m = memos.get(groups);
  if (!m || m.masks !== masks || m.keepOuts !== keepOuts) {
    m = { masks, keepOuts, memo: { spots: new Map(), paths: new Map() } };
    memos.set(groups, m);
  }
  if (m.memo.spots.size > MEMO_MAX) m.memo.spots.clear();
  if (m.memo.paths.size > MEMO_MAX) m.memo.paths.clear();
  return m.memo;
}

export function wildlifeAt(
  day: number,
  seconds: number,
  groups = WILD_GROUPS,
  masks: readonly WildMask[] = [],
  reachKm: (model: string, g: WildGroup) => number = () => 0,
  keepOuts: readonly (readonly KeepOut[])[] = [],
): WildAnimal[] {
  const out: WildAnimal[] = [];
  // Each member's spot of each round and each walk's route only change with the round, so
  // they are worked out once and kept (the app asks every frame; the results are the same).
  const memo = memoOf(groups, masks, keepOuts);
  groups.forEach((g, gi) => {
    const grow = groupGrowth(g, day);
    if (grow <= 0) return;
    const seed = groupSeed(g, gi);
    const size = groupSize(g, gi);
    const model = (i: number) => modelOf(g, i);

    if (isBird(g.model)) {
      // Loops around the home, each bird well behind the one before and on a
      // wider loop, so they never crowd (Yang, 2026-10-18).
      const turnsPerS = FLIGHT_KM_S / (2 * Math.PI * FLIGHT_RADIUS_KM);
      for (let i = 0; i < size; i++) {
        const [c, s] = cosSinTurn(turnsPerS * seconds + hash01(seed, 7) - i * FLIGHT_GAP_TURNS);
        const bob = cosSinTurn(seconds * 0.11 + i * 0.16)[1];
        const radius = FLIGHT_RADIUS_KM + i * FLIGHT_LANE_KM;
        out.push({
          key: `${gi}:${i}`,
          model: model(i),
          lat: g.lat,
          lon: g.lon,
          eastKm: radius * c,
          northKm: radius * s,
          heading: [-s, c],
          offset: [0, 0],
          clip: 'fly',
          seconds: seconds + i * 0.13,
          walkS: 0,
          grow,
          liftKm: FLIGHT_LIFT_KM * (1 + 0.15 * bob),
          rise: 0,
          pitch: 0,
        });
      }
      return;
    }

    // Rounds of grazing, then a smooth walk to the next spot along a curve
    // through the spots, easing in and out (section 4). Every animal walks
    // its own path near the group's spots, starts a beat apart from the
    // others and faces along its own curve, so the group stays together
    // without moving as one rigid shape (Yang, 2026-10-18).
    const walkShare = traitsOf(g.model).walkShare ?? WALK_SHARE;
    const swimStyle = traitsOf(g.model).swim;
    const swimmer = isSwimmer(g.model);
    const roam = roamOf(g);
    const mask = masks[gi];
    const period = roundSeconds(g, seed);
    const { offsets, places } = groupPlaces(g, gi, reachKm);
    const camps = keepOuts[gi] ?? [];
    let half = 0;
    for (let i = 0; i < size; i++) half = Math.max(half, reachKm(model(i), g) / 2);
    const shift = period * hash01(seed, 5);
    // The camps standing from the walk to the group's spot j until the walk away from it.
    const avoidAt = (j: number) =>
      camps.length === 0
        ? camps
        : standing(camps, (j - 1) * period - shift, (j + 1) * period - shift + 2);
    for (let i = 0; i < size; i++) {
      const lag = i === 0 ? 0 : 0.4 + 1.2 * hash01(seed, 40 + i);
      const pace = 0.9 + 0.2 * hash01(seed, 50 + i);
      const t = seconds - lag + shift;
      const k = Math.floor(t / period);
      const inRound = t - k * period;
      // The group closes up on narrow land; fits[j] is how far, at the group's spot j.
      const fits = new Map<number, number>();
      // The camps standing from the walk into the group's spot j until the end of the round.
      const walkCircles = (j: number) =>
        camps.length === 0
          ? camps
          : standing(camps, (j - 1) * period - shift, j * period - shift + 2);
      // Whether the animal can walk from a to its candidate spot b of round j round the circles.
      const reachable = (j: number, a: P2, b: P2, fit: number): boolean => {
        const near = walkCircles(j);
        const piece = pieceOf(
          mask,
          roam,
          near.map((c) => ({ x: c.x, y: c.y, r: c.r + half })),
        );
        const [qx, qy] = places[i]!;
        const circles = near.map((c) => ({ x: c.x - qx * fit, y: c.y - qy * fit, r: c.r + half }));
        if (circles.some((c) => len2d(a[0] - c.x, a[1] - c.y) < c.r * 0.98)) return false;
        const fitsAt = (q: P2, r: P2) =>
          clear(
            piece,
            roam,
            [q[0] + qx * fit, q[1] + qy * fit],
            [r[0] + qx * fit, r[1] + qy * fit],
          );
        return aroundCircles(a, b, circles, fitsAt) !== undefined;
      };
      // Round j's spot: the animal stays at its last spot where camps leave no way to the new
      // one (section 4), so it never plans a walk it cannot make. Chains of held rounds start
      // from a round with no camps in the way, or from every 512th round.
      const own = (j: number): P2 => {
        let r = j;
        while (
          r % HOLD_ROOT_ROUNDS !== 0 &&
          !memo.spots.has(`${gi}:${i}:${r}`) &&
          walkCircles(r).length > 0
        )
          r--;
        let rec: [number, number, number] | undefined;
        for (let m = r; m <= j; m++) {
          const key = `${gi}:${i}:${m}`;
          let hit = memo.spots.get(key);
          if (!hit) {
            const c = ownSpot(m);
            const cf = fits.get(m)!;
            hit =
              !rec || walkCircles(m).length === 0 || reachable(m, [rec[0], rec[1]], c, cf)
                ? [c[0], c[1], cf]
                : rec;
            memo.spots.set(key, hit);
          }
          rec = hit;
        }
        fits.set(j, rec![2]);
        return [rec![0], rec![1]];
      };
      const ownSpot = (j: number): P2 => {
        const avoid = avoidAt(j);
        const mask = pieceOf(
          masks[gi],
          roam,
          avoid.map((c) => ({ x: c.x, y: c.y, r: c.r + half })),
        );
        const [sx, sy, fit] = spot(seed, j, roam, mask, places, avoid, half);
        fits.set(j, fit);
        const [c, sn] = cosSinTurn(hash01(seed, j, 60 + i));
        const r = i === 0 ? 0 : fit * MEMBER_JITTER_KM * hash01(seed, j, 70 + i);
        const x = sx + r * c;
        const y = sy + r * sn;
        const [px, py] = places[i]!;
        // Its own spot near the group's, unless that is off the open ground.
        return open(mask, roam, x + px * fit, y + py * fit) &&
          clearOf(avoid, x + px * fit, y + py * fit, half)
          ? [x, y]
          : [sx, sy];
      };
      const p0 = own(k - 1);
      const p1 = own(k);
      const p2 = own(k + 1);
      const p3 = own(k + 2);
      // A walk whose curve would cross closed ground (a lake, a bay) goes
      // round it instead, through open cells (Yang, 2026-10-18: "animals
      // still walk across lakes").
      const walkKey = `${gi}:${i}:${k}`;
      let path = memo.paths.get(walkKey);
      if (path === undefined) {
        const ownHalf = reachKm(model(i), g) / 2;
        const standingNow = standing(camps, k * period - shift, (k + 1) * period - shift + 2);
        const wmask = pieceOf(
          mask,
          roam,
          standingNow.map((c) => ({ x: c.x, y: c.y, r: c.r + half })),
        );
        const curveOpen =
          !wmask ||
          (clear(wmask, roam, p1, p2) &&
            [0.25, 0.5, 0.75].every((v) => {
              const [cx, cy] = catmullRom(p0, p1, p2, p3, v);
              return open(wmask, roam, cx, cy);
            }));
        path = curveOpen ? null : route(wmask!, roam, p1, p2);
        // Round the camps standing during the walk, planned before it is walked (section 4).
        const [qx, qy] = places[i]!;
        const f0 = ((fits.get(k) ?? 1) + (fits.get(k + 1) ?? 1)) / 2;
        const sx = qx * f0;
        const sy = qy * f0;
        const circles = standingNow.map((c) => ({ x: c.x - sx, y: c.y - sy, r: c.r + ownHalf }));
        if (circles.length > 0) {
          const inside = (q: P2) => circles.some((c) => len2d(q[0] - c.x, q[1] - c.y) < c.r * 0.98);
          // The route's corners inside a circle are dropped: the detour finds its own way past.
          const base: P2[] = (path ?? [p1, p2]).filter(
            (q, m, all) => m === 0 || m === all.length - 1 || !inside(q),
          );
          const samples: P2[] = path
            ? path
            : [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((v) =>
                catmullRom(p0, p1, p2, p3, v),
              );
          const base0 = path;
          if (samples.some((q, m) => m > 0 && circles.some((c) => cuts(samples[m - 1]!, q, c)))) {
            const fitsAt = (q: P2, r: P2) =>
              clear(wmask, roam, [q[0] + sx, q[1] + sy], [r[0] + sx, r[1] + sy]);
            // Round the full circles if open ground allows; where it does not (a narrow
            // land between camps), closer in, the push-out below sliding it the rest of
            // the way along the edge.
            for (const scale of [1, 0.75, 0.5, 0.25]) {
              if (path !== base0) break;
              const near = circles.map((c) => ({ ...c, r: c.r * scale }));
              let way: P2[] = [base[0]!];
              let found = true;
              for (let m = 1; m < base.length && found; m++) {
                const part = aroundCircles(base[m - 1]!, base[m]!, near, fitsAt);
                if (part) way.push(...part);
                else found = false;
              }
              if (!found) continue;
              const smooth = rounded(way);
              const tidy = (pts: readonly P2[]) =>
                pts.every(
                  (q, m) =>
                    m === 0 ||
                    (fitsAt(pts[m - 1]!, q) && !near.some((c) => cuts(pts[m - 1]!, q, c))),
                );
              way = tidy(smooth) ? smooth : way;
              if (tidy(way)) path = way;
            }
          }
        }
        memo.paths.set(walkKey, path);
      }
      const chord = path
        ? alongPath(path, 1).length
        : Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
      const walkS =
        chord < 1 ? 0 : Math.min(period * walkShare, Math.max(3, chord / (WALK_KM_S * pace)));
      const walking = inRound > period - walkS;
      const f = walking ? (inRound - (period - walkS)) / walkS : 0;
      const u = f * f * (3 - 2 * f);
      const along = path && walking ? alongPath(path, u) : undefined;
      let [x, y] = along ? along.at : catmullRom(p0, p1, p2, p3, u);
      const fit = fits.get(k)! + (fits.get(k + 1)! - fits.get(k)!) * u;
      // Facing along its own curve; between walks the tangent there, so it never snaps round.
      let [hx, hy] = along ? along.dir : catmullRomTangent(p0, p1, p2, p3, u);
      // Round a camp its walk comes near: out to the edge of the keep-out circle, turning
      // along it as it nears the edge (section 4).
      const ownHalf = reachKm(model(i), g) / 2;
      for (const c of camps) {
        const grown = keepOutGrowth(c, seconds);
        if (grown <= 0) continue;
        const need = (c.r + ownHalf) * grown;
        const px = x + places[i]![0] * fit;
        const py = y + places[i]![1] * fit;
        const dx = px - c.x;
        const dy = py - c.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= need * (1 + KEEP_OUT_TURN) || d < 1e-9) continue;
        const nx = dx / d;
        const ny = dy / d;
        if (d < need) {
          x += nx * (need - d);
          y += ny * (need - d);
        }
        // Heading towards the hearth bends along the edge, fully at the edge.
        const towards = hx * nx + hy * ny;
        if (towards < 0) {
          const w = Math.min(1, (need * (1 + KEEP_OUT_TURN) - d) / (need * KEEP_OUT_TURN));
          hx -= w * towards * nx;
          hy -= w * towards * ny;
        }
      }
      // A group that stays put has no curve to face along: it faces a seeded way.
      let hl = Math.sqrt(hx * hx + hy * hy);
      if (hl < 1e-6) {
        [hx, hy] = cosSinTurn(hash01(seed, 90 + i));
        hl = 1;
      }
      // Its own place keeps to open ground too, on a walk as at rest: where it would be
      // closed (the sea along a coast, a lake, mountains), the animal closes in towards
      // the group's path, which always is open (Yang, 2026-10-19: zebras and elephants
      // off the coast).
      let close = fit;
      if (mask && !swimmer) {
        const [px, py] = places[i]!;
        for (let k = 8; k >= 0; k--) {
          close = (fit * k) / 8;
          if (open(mask, roam, x + px * close, y + py * close)) break;
        }
      }
      out.push({
        key: `${gi}:${i}`,
        model: model(i),
        lat: g.lat,
        lon: g.lon,
        eastKm: x,
        northKm: y,
        heading: [hx / hl, hy / hl],
        offset: [offsets[i]![0] * close, offsets[i]![1] * close],
        clip: walking ? 'walk' : 'idle',
        seconds: walking ? u * walkS : seconds + hash01(seed, 30 + i) * 0.8,
        walkS: walking ? walkS : 0,
        grow,
        liftKm: 0,
        rise: 0,
        pitch: 0,
      });
      if (swimmer) {
        // Sea animals swim the whole time. Dolphins leap in arcs out of the
        // water and back; whales cruise awash, then dive between journeys,
        // tipping nose down so the flukes rise, and come up again; sea cows
        // float (section 4).
        const a = out[out.length - 1]!;
        a.clip = 'swim';
        a.seconds = seconds + hash01(seed, 30 + i) * 1.6;
        a.walkS = 0;
        if (swimStyle === 'leap') {
          const [c, sn] = cosSinTurn(seconds / LEAP_SECONDS + hash01(seed, 80 + i));
          a.rise = LEAP_RISE * sn - 0.1;
          a.pitch = 0.6 * c;
        } else if (swimStyle === 'dive' && !walking) {
          const dive = inRound / (period - walkS);
          const [c, sn] = cosSinTurn(Math.min(1, Math.max(0, dive)));
          a.rise = -0.15 - DIVE_DEPTH * 0.5 * (1 - c);
          a.pitch = -DIVE_PITCH * sn;
        } else a.rise = -0.15;
      }
    }
  });
  return out;
}
