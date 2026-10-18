// Wildlife (spec wildlife.md): small groups of wild animals, each roaming
// around its home. Where every animal is, which way it faces and what it is
// doing is a pure function of the date and the clock, from seeded hashes,
// using only + − × ÷ and Math.sqrt so every device computes the same animals
// (milestone 2, section 2.3). The wildlife layer places them on the globe.

import groupsFile from '../../../data/curated/wildlife.json';
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
  source: string;
}

export const WILD_GROUPS: readonly WildGroup[] = (groupsFile as { groups: WildGroup[] }).groups;

export type WildClip = 'idle' | 'walk' | 'fly';

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
}

/** Years over which a group grows in or shrinks away (section 2). */
const GROW_YEARS = 5;
/** Roaming radius around the home, in km of the true globe (section 4). */
const ROAM_KM = 150;
const ROAM_KM_CROCODILE = 80;
/** Walking speed in km of the globe per second of the clock. */
const WALK_KM_S = 55;
/** Each animal's own spots lie up to this far from the group's (section 4). */
const MEMBER_JITTER_KM = 40;
/** Birds fly loops of this radius at this height (section 4). */
const FLIGHT_RADIUS_KM = 160;
const FLIGHT_LIFT_KM = 150;
const FLIGHT_KM_S = 45;
/** Birds of a group fly this far apart along the loop (turns) and across it (km). */
const FLIGHT_GAP_TURNS = 0.15;
const FLIGHT_LANE_KM = 60;
const BIRDS = new Set(['animal-parrot', 'animal-kea']);
/** Trees keep this far beyond a group's roaming area (section 5). */
const CLEARING_MARGIN_KM = 225;

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

/** Number of members of a group: 2 or 3 (section 4). */
export function groupSize(g: WildGroup, index: number): number {
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

/** Clearing in the trees around each group shown on a day: its home and radius in km (section 5). */
export function wildClearings(
  day: number,
  groups = WILD_GROUPS,
): { lat: number; lon: number; km: number }[] {
  return groups.flatMap((g) =>
    groupGrowth(g, day) > 0 ? [{ lat: g.lat, lon: g.lon, km: roamOf(g) + CLEARING_MARGIN_KM }] : [],
  );
}

function roamOf(g: WildGroup): number {
  if (BIRDS.has(g.model)) return FLIGHT_RADIUS_KM + 2 * FLIGHT_LANE_KM;
  return g.model === 'animal-crocodile' ? ROAM_KM_CROCODILE : ROAM_KM;
}

/** The k-th grazing spot of a group, km east and north of its home. */
function spot(seed: number, k: number, roam: number): [number, number] {
  const r = roam * Math.sqrt(hash01(seed, k, 2));
  const [c, s] = cosSinTurn(hash01(seed, k, 3));
  return [r * c, r * s];
}

type P2 = [number, number];

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

/** Every animal shown on a day at a clock time in seconds. */
export function wildlifeAt(day: number, seconds: number, groups = WILD_GROUPS): WildAnimal[] {
  const out: WildAnimal[] = [];
  groups.forEach((g, gi) => {
    const grow = groupGrowth(g, day);
    if (grow <= 0) return;
    const seed = groupSeed(g, gi);
    const size = groupSize(g, gi);
    const model = (i: number) => (g.model === 'animal-lion' && i > 0 ? 'animal-lioness' : g.model);

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
    const roam = roamOf(g);
    const period = (crocodile ? 18 : 10) + 6 * hash01(seed, 4);
    for (let i = 0; i < size; i++) {
      const lag = i === 0 ? 0 : 0.4 + 1.2 * hash01(seed, 40 + i);
      const pace = 0.9 + 0.2 * hash01(seed, 50 + i);
      const t = seconds - lag + period * hash01(seed, 5);
      const k = Math.floor(t / period);
      const inRound = t - k * period;
      const own = (j: number): P2 => {
        const [sx, sy] = spot(seed, j, roam);
        const [c, sn] = cosSinTurn(hash01(seed, j, 60 + i));
        const r = i === 0 ? 0 : MEMBER_JITTER_KM * hash01(seed, j, 70 + i);
        return [sx + r * c, sy + r * sn];
      };
      const p0 = own(k - 1);
      const p1 = own(k);
      const p2 = own(k + 1);
      const p3 = own(k + 2);
      const chord = Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
      const walkS = Math.min(
        period * (crocodile ? 0.4 : 0.75),
        Math.max(3, chord / (WALK_KM_S * pace)),
      );
      const walking = inRound > period - walkS;
      const f = walking ? (inRound - (period - walkS)) / walkS : 0;
      const u = f * f * (3 - 2 * f);
      const [x, y] = catmullRom(p0, p1, p2, p3, u);
      // Facing along its own curve; between walks the tangent there, so it never snaps round.
      const [hx, hy] = catmullRomTangent(p0, p1, p2, p3, u);
      const hl = Math.sqrt(hx * hx + hy * hy) || 1;
      // Its place in the group, fixed on the ground in body lengths, never turned with the group.
      const [c, sn] = cosSinTurn(hash01(seed, 10 + i));
      const dist = i === 0 ? 0 : 1.3 + 0.5 * hash01(seed, 20 + i);
      out.push({
        key: `${gi}:${i}`,
        model: model(i),
        lat: g.lat,
        lon: g.lon,
        eastKm: x,
        northKm: y,
        heading: [hx / hl, hy / hl],
        offset: [dist * c, dist * sn],
        clip: walking ? 'walk' : 'idle',
        seconds: walking ? u * walkS : seconds + hash01(seed, 30 + i) * 0.8,
        walkS: walking ? walkS : 0,
        grow,
        liftKm: 0,
      });
    }
  });
  return out;
}
