// Wildlife (spec wildlife.md): small groups of wild animals, each roaming
// around its home. Where every animal is, which way it faces and what it is
// doing is a pure function of the date and the clock, from seeded hashes,
// using only + − × ÷ and Math.sqrt so every device computes the same animals
// (milestone 2, section 2.3). The wildlife layer places them on the globe.

import groupsFile from '../../../data/curated/wildlife.json' with { type: 'json' };
import { hash01, hashString } from '../core/hash.ts';
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

export const WILD_GROUPS: readonly WildGroup[] = (groupsFile as { groups: WildGroup[] }).groups;

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
const ROAM_KM_CROCODILE = 80;
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
const BIRDS = new Set(['animal-parrot', 'animal-kea', 'animal-haast-eagle']);
/** Sea animals swim at the surface of the open sea (section 4). */
const SWIMMERS = new Set(['animal-whale', 'animal-dolphin', 'animal-sea-cow']);
/** A dolphin's leap, and how high it rises, in seconds and body heights. */
const LEAP_SECONDS = 2.4;
const LEAP_RISE = 0.9;
/** How deep a whale dives, in body heights, and how far it tips. */
const DIVE_DEPTH = 1.4;
const DIVE_PITCH = 0.4;
/** Trees keep this far beyond where a group grazes (section 5). */
const CLEARING_MARGIN_KM = 225;
/** Clearings move on in stretches of this many seconds of the clock (section 5). */
const CLEAR_STEP_S = 20;
/** Cells per side of a group's ground mask (section 4). */
export const WILD_MASK_N = 48;
/** The mask reaches this far beyond the roaming radius, for the animals' places in the group. */
const WILD_MASK_MARGIN_KM = 450;
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
 * Clearings in the trees where the groups shown on a day graze over a stretch
 * of the clock (section 5): around each spot a group visits in the
 * CLEAR_STEP_S seconds that hold the clock time, as km east and north of its
 * home and a radius in drawn km. Each covers the animals' own wander and
 * places in the group, one body length, half the walk to the next or last
 * spot, all as the history lens stretches them there, and a tree crown
 * beyond that. Birds keep one clearing over their whole loop. The clearings
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
): { lat: number; lon: number; eastKm: number; northKm: number; km: number }[] {
  const out: { lat: number; lon: number; eastKm: number; northKm: number; km: number }[] = [];
  groups.forEach((g, gi) => {
    if (groupGrowth(g, day) <= 0) return;
    const len = Math.max(drawnLengthKm(g.model), drawnLengthKm(modelOf(g, 1)));
    const width = widthAt(g);
    const at = (eastKm: number, northKm: number, km: number) =>
      out.push({ lat: g.lat, lon: g.lon, eastKm, northKm, km });
    if (BIRDS.has(g.model)) {
      at(0, 0, width * roamOf(g) + len + CLEARING_MARGIN_KM);
      return;
    }
    // The farthest place in the group, in body lengths (see groupPlaces).
    const place = SWIMMERS.has(g.model) ? 1.0 : 1.8;
    const base = width * MEMBER_JITTER_KM + (place + 1) * len + CLEARING_MARGIN_KM;
    const seed = groupSeed(g, gi);
    const roam = roamOf(g);
    const period = roundSeconds(g, seed);
    const { places } = groupPlaces(g, gi, reachKm);
    const step = Math.floor(seconds / CLEAR_STEP_S) * CLEAR_STEP_S;
    const shift = period * hash01(seed, 5);
    // The last members follow the first by up to two seconds (see wildlifeAt).
    const first = Math.floor((step - 2 + shift) / period);
    const last = Math.floor((step + CLEAR_STEP_S + shift) / period) + 1;
    const spots: P2[] = [];
    for (let k = first; k <= last; k++) {
      const [x, y] = spot(seed, k, roam, masks[gi], places);
      spots.push([x, y]);
    }
    spots.forEach(([x, y], n) => {
      const hop = (q: P2 | undefined) => (q ? Math.sqrt((q[0] - x) ** 2 + (q[1] - y) ** 2) : 0);
      const half = Math.max(hop(spots[n - 1]), hop(spots[n + 1])) / 2;
      at(x, y, base + width * half);
    });
  });
  return out;
}

/** Seconds of one round of grazing and walking for a group. */
function roundSeconds(g: WildGroup, seed: number): number {
  return (g.model === 'animal-crocodile' ? 18 : 10) + 6 * hash01(seed, 4);
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
  const swimmer = SWIMMERS.has(g.model);
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
  if (g.model === 'animal-lion') return 'animal-lioness';
  if (g.model === 'animal-gorilla') return 'animal-gorilla-female';
  return g.model;
}

/** Whether a group flies (birds), over any ground (section 4). */
export function flies(g: WildGroup): boolean {
  return BIRDS.has(g.model);
}

/** Whether a group swims in the open sea (section 4). */
export function swims(g: WildGroup): boolean {
  return SWIMMERS.has(g.model);
}

/** Roaming radius of a group in km (section 4). */
export function roamOf(g: WildGroup): number {
  if (g.roamKm !== undefined) return g.roamKm;
  if (BIRDS.has(g.model)) return FLIGHT_RADIUS_KM + 2 * FLIGHT_LANE_KM;
  return g.model === 'animal-crocodile' ? ROAM_KM_CROCODILE : ROAM_KM;
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
): [number, number, number] {
  const local = Math.min(LOCAL_KM, roam);
  const [mx, my] = roam > LOCAL_KM ? wanderCentre(seed, k, roam, mask) : [0, 0];
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
        places.every(([px, py]) => open(mask, roam, x + px * fit, y + py * fit))
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
 * each animal's place in its group against the mask.
 */
export function wildlifeAt(
  day: number,
  seconds: number,
  groups = WILD_GROUPS,
  masks: readonly WildMask[] = [],
  reachKm: (model: string, g: WildGroup) => number = () => 0,
): WildAnimal[] {
  const out: WildAnimal[] = [];
  groups.forEach((g, gi) => {
    const grow = groupGrowth(g, day);
    if (grow <= 0) return;
    const seed = groupSeed(g, gi);
    const size = groupSize(g, gi);
    const model = (i: number) => modelOf(g, i);

    if (BIRDS.has(g.model)) {
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
    const crocodile = g.model === 'animal-crocodile';
    const swimmer = SWIMMERS.has(g.model);
    const roam = roamOf(g);
    const mask = masks[gi];
    const period = roundSeconds(g, seed);
    const { offsets, places } = groupPlaces(g, gi, reachKm);
    for (let i = 0; i < size; i++) {
      const lag = i === 0 ? 0 : 0.4 + 1.2 * hash01(seed, 40 + i);
      const pace = 0.9 + 0.2 * hash01(seed, 50 + i);
      const t = seconds - lag + period * hash01(seed, 5);
      const k = Math.floor(t / period);
      const inRound = t - k * period;
      // The group closes up on narrow land; fits[j] is how far, at the group's spot j.
      const fits = new Map<number, number>();
      const own = (j: number): P2 => {
        const [sx, sy, fit] = spot(seed, j, roam, mask, places);
        fits.set(j, fit);
        const [c, sn] = cosSinTurn(hash01(seed, j, 60 + i));
        const r = i === 0 ? 0 : fit * MEMBER_JITTER_KM * hash01(seed, j, 70 + i);
        const x = sx + r * c;
        const y = sy + r * sn;
        const [px, py] = places[i]!;
        // Its own spot near the group's, unless that is off the open ground.
        return open(mask, roam, x + px * fit, y + py * fit) ? [x, y] : [sx, sy];
      };
      const p0 = own(k - 1);
      const p1 = own(k);
      const p2 = own(k + 1);
      const p3 = own(k + 2);
      // A walk whose curve would cross closed ground (a lake, a bay) goes
      // round it instead, through open cells (Yang, 2026-10-18: "animals
      // still walk across lakes").
      const curveOpen =
        !mask ||
        (clear(mask, roam, p1, p2) &&
          [0.25, 0.5, 0.75].every((v) => {
            const [cx, cy] = catmullRom(p0, p1, p2, p3, v);
            return open(mask, roam, cx, cy);
          }));
      const path = curveOpen ? undefined : route(mask!, roam, p1, p2);
      const chord = path
        ? alongPath(path, 1).length
        : Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
      const walkS = Math.min(
        period * (crocodile ? 0.4 : 0.75),
        Math.max(3, chord / (WALK_KM_S * pace)),
      );
      const walking = inRound > period - walkS;
      const f = walking ? (inRound - (period - walkS)) / walkS : 0;
      const u = f * f * (3 - 2 * f);
      const along = path && walking ? alongPath(path, u) : undefined;
      const [x, y] = along ? along.at : catmullRom(p0, p1, p2, p3, u);
      const fit = fits.get(k)! + (fits.get(k + 1)! - fits.get(k)!) * u;
      // Facing along its own curve; between walks the tangent there, so it never snaps round.
      let [hx, hy] = along ? along.dir : catmullRomTangent(p0, p1, p2, p3, u);
      // A group that stays put has no curve to face along: it faces a seeded way.
      let hl = Math.sqrt(hx * hx + hy * hy);
      if (hl < 1e-6) {
        [hx, hy] = cosSinTurn(hash01(seed, 90 + i));
        hl = 1;
      }
      out.push({
        key: `${gi}:${i}`,
        model: model(i),
        lat: g.lat,
        lon: g.lon,
        eastKm: x,
        northKm: y,
        heading: [hx / hl, hy / hl],
        offset: [offsets[i]![0] * fit, offsets[i]![1] * fit],
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
        if (g.model === 'animal-dolphin') {
          const [c, sn] = cosSinTurn(seconds / LEAP_SECONDS + hash01(seed, 80 + i));
          a.rise = LEAP_RISE * sn - 0.1;
          a.pitch = 0.6 * c;
        } else if (g.model === 'animal-whale' && !walking) {
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
