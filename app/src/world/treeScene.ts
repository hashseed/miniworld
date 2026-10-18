// What the tree of humankind shows at a clock time (spec humankind.md,
// section 8.1): the hearths and lodgings of the camps standing, and every
// figure at its spot, coming out of its lodging, building or taking down a
// lodging, off gathering or hunting, or walking to a new home. A pure
// function of the tree chunk and the clock time.

import { hash01, hash32 } from '../core/hash.ts';
import { detCos, detSin, RAD } from '../core/detmath.ts';
import { msAtDay } from '../time/rate.ts';
import type { Day } from '../time/calendar.ts';
import { NEVER, type TreeFigure, type TreeLodging } from './tree.ts';

/** One time window's share of the tree (section 8). */
export interface TreeChunk {
  fromDay: Day;
  toDay: Day;
  figures: TreeFigure[];
  lodgings: TreeLodging[];
}

/** Drawn kilometres per life-size metre of a figure (milestone 2, section 5.1). */
export const FIGURE_KM_PER_M = 50;
/** A figure's walking pace in life-size metres per second, matching the walk clip's stride. */
export const WALK_M_PER_S = 1.2;
/** Running and carrying paces, matching those clips' strides at the same leg length. */
const RUN_M_PER_S = 4.2;
const CARRY_M_PER_S = 0.87;
/** The camp layout is drawn three times smaller than the figures (milestone 2, section 5.1). */
export const LAYOUT_KM_PER_M = FIGURE_KM_PER_M / 3;
/** Drawn kilometres a figure covers per millisecond of watching. */
const WALK_KM_PER_MS = (WALK_M_PER_S * FIGURE_KM_PER_M) / 1000;
/** Layout metres covered per millisecond of watching, by clip. */
const PACE: Record<'walk' | 'run' | 'carry', number> = {
  walk: (WALK_M_PER_S * 3) / 1000,
  run: (RUN_M_PER_S * 3) / 1000,
  carry: (CARRY_M_PER_S * 3) / 1000,
};
/**
 * Lodgings stand this far from the hearth, in layout metres; lodgings are drawn at
 * figure size, three times the layout, so the ring keeps them clear of the people.
 */
const LODGING_RING_M = 20;
/** Places for lodgings round a hearth, evenly spaced so lodgings never overlap. */
export const LODGING_SLOTS = 5;
/** Spots for figures at a hearth: an inner ring and an outer ring, spaced so figures never overlap. */
const INNER_SPOTS = 8;
const INNER_M = 5;
const OUTER_SPOTS = 12;
const OUTER_M = 8.5;
export const HEARTH_SPOTS = INNER_SPOTS + OUTER_SPOTS;
const INNER_ORDER = [0, 4, 2, 6, 1, 5, 3, 7];
const OUTER_ORDER = [0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11];
/** Paths keep this far from the middle of the hearth, in layout metres, so nobody walks through the fire. */
const FIRE_CLEAR_M = 3;
/** Figures change between idle and work every 20 to 40 seconds of watching. */
const ACTIVITY_MIN_MS = 20_000;
const ACTIVITY_SPREAD_MS = 20_000;
/** Each figure plans its day in turns of this long: an outing, a stroll or a rest. */
const TURN_MS = 60_000;
/** How long gatherers pick, hunters butcher and strollers look about at the far end. */
const GATHER_MS = 9000;
const BUTCHER_MS = 4000;
const LOOK_MS = 4000;
/** Clip changes ease over this long (milestone 2, section 5.3). */
export const BLEND_MS = 350;
/** The band takes this long to build a new lodging, about three years of history. */
export const BUILD_MS = 8000;
/** And this long to take one down before it leaves. */
export const TAKE_DOWN_MS = 5000;
/** Builders stand this far from the middle of the lodging they build, in layout metres. */
const BUILD_RING_M = 7;
/**
 * Trees at a camp are felled over this long when the band arrives (half a year), and grow
 * back over this long after it leaves (about five years).
 */
const FELL_MS = 1200;
const REGROW_MS = 12_000;
/** Plants keep this far from a hearth while the camp stands, in drawn kilometres. */
export const CAMP_CLEARING_KM = (LODGING_RING_M + 6) * LAYOUT_KM_PER_M;
/** Moves shorter than this are within the camp and not walked. */
const SAME_PLACE_KM = 1;
const KM_PER_DEG = 111.195;

export type FigureLook = 'founder' | 'woman' | 'man' | 'child';
export type TreeClip = 'idle' | 'work' | 'walk' | 'run' | 'carry';

/** A point of the scene: a place on the globe, and an offset there in layout metres east and north. */
export interface Placed {
  lat: number;
  lon: number;
  x: number;
  z: number;
  /** Facing, east and north. */
  dirX: number;
  dirZ: number;
}

export interface FigurePose extends Placed {
  id: number;
  look: FigureLook;
  clip: TreeClip;
  clipMs: number;
  /** The clip being eased out of, while a change is under way. */
  from?: { clip: TreeClip; clipMs: number; weight: number };
}

export interface LodgingPose extends Placed {
  id: number;
  kind: string;
  /** 0 to 1: how far it is put up, while the band builds it or takes it down. */
  built: number;
}

export interface HearthPose {
  camp: number;
  lat: number;
  lon: number;
}

/** Where the trees make way for a camp: 1 cleared, 0 grown back. */
export interface ClearingPose {
  lat: number;
  lon: number;
  amount: number;
  /** True while the trees are being felled, false while they grow back. */
  felling: boolean;
}

export interface TreeScene {
  figures: FigurePose[];
  lodgings: LodgingPose[];
  hearths: HearthPose[];
  clearings: ClearingPose[];
}

/** The look of a figure: the first person keeps hers; the others are women, men and children. */
export function lookOf(id: number): FigureLook {
  if (id === 0) return 'founder';
  return (['woman', 'man', 'child'] as const)[hash32(id, 31) % 3]!;
}

const deg = (micro: number) => micro / 1e6;

function distanceKm(a: TreeLodging, b: TreeLodging): number {
  const x = (deg(b.lon) - deg(a.lon)) * detCos(((deg(a.lat) + deg(b.lat)) / 2) * RAD);
  const y = deg(b.lat) - deg(a.lat);
  return Math.sqrt(x * x + y * y) * KM_PER_DEG;
}

interface Pt {
  x: number;
  z: number;
}

/** The turn of a camp's ring of places, by its hash. */
const campTurn = (camp: number) => hash01(camp, 41);

/**
 * Where a lodging stands around its hearth, in layout metres, by its slot: the camp's
 * slots are evenly spaced, turned by the camp's hash. Its door faces the hearth.
 */
export function lodgingSpot(l: TreeLodging): Pt {
  const a = (campTurn(l.camp) + l.slot / LODGING_SLOTS) * 2 * Math.PI;
  return { x: LODGING_RING_M * detCos(a), z: LODGING_RING_M * detSin(a) };
}

/** A figure's own spot at the hearth of a camp, in layout metres: the inner ring first, then the outer. */
export function figureSpot(spot: number, camp: number): Pt {
  const inner = spot < INNER_SPOTS;
  // Spots fill in an order that keeps a small band spread round the fire.
  const k = (inner ? INNER_ORDER : OUTER_ORDER)[inner ? spot : spot - INNER_SPOTS]!;
  const n = inner ? INNER_SPOTS : OUTER_SPOTS;
  const r = inner ? INNER_M : OUTER_M;
  const a = (hash01(camp, 43) + (k + (inner ? 0 : 0.5)) / n) * 2 * Math.PI;
  return { x: r * detCos(a), z: r * detSin(a) };
}

/**
 * A point out from the hearth through a gap between the lodgings, for a figure's own
 * outings: the gap and the lane in it come from its spot, which no one else in the camp
 * has, so two figures never head for the same place.
 */
function outingPoint(spot: number, camp: number, distance: number): Pt {
  const gap = spot % LODGING_SLOTS;
  const lane = Math.floor(spot / LODGING_SLOTS);
  const a = (campTurn(camp) + (gap + 0.5) / LODGING_SLOTS) * 2 * Math.PI + (lane - 1.5) * 0.1;
  const r = distance + 3.5 * lane;
  return { x: r * detCos(a), z: r * detSin(a) };
}

/** Unit vector from (x0, z0) to (x1, z1), or the fallback when they meet. */
function towards(x0: number, z0: number, x1: number, z1: number, fx = 1, fz = 0) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dz * dz);
  return len < 1e-9 ? { dirX: fx, dirZ: fz } : { dirX: dx / len, dirZ: dz / len };
}

/** The idle or work clip of a figure at a clock time, with the one it eases out of. */
function activity(id: number, ms: number): Pick<FigurePose, 'clip' | 'clipMs' | 'from'> {
  const period = ACTIVITY_MIN_MS + (hash32(id, 53) % ACTIVITY_SPREAD_MS);
  const shifted = ms + (hash32(id, 59) % period);
  const k = Math.floor(shifted / period);
  const clipOf = (n: number): TreeClip => (hash32(id, n, 61) % 3 === 0 ? 'work' : 'idle');
  const clip = clipOf(k);
  const clipMs = shifted - k * period;
  const prev = clipOf(k - 1);
  if (clipMs < BLEND_MS && prev !== clip)
    return {
      clip,
      clipMs,
      from: { clip: prev, clipMs: period + clipMs, weight: clipMs / BLEND_MS },
    };
  return { clip, clipMs };
}

/** How long a figure takes to walk from one lodging to another, in milliseconds of watching. */
function walkMs(from: TreeLodging, to: TreeLodging): number {
  const km = distanceKm(from, to);
  return km < SAME_PLACE_KM ? 0 : Math.ceil(km / WALK_KM_PER_MS);
}

/**
 * Where a figure stands while the band builds or takes down a lodging: around it on the
 * hearth's side, the `k`-th of `n`, evenly spread so they never overlap.
 */
function buildSpot(k: number, n: number, lodging: TreeLodging): Pt {
  const hut = lodgingSpot(lodging);
  const toHearth = Math.sqrt(hut.x * hut.x + hut.z * hut.z);
  const a = n > 1 ? (k / (n - 1) - 0.5) * 0.75 * Math.PI : 0;
  const c = detCos(a);
  const sn = detSin(a);
  const ux = -hut.x / toHearth;
  const uz = -hut.z / toHearth;
  return {
    x: hut.x + BUILD_RING_M * (ux * c - uz * sn),
    z: hut.z + BUILD_RING_M * (ux * sn + uz * c),
  };
}

/**
 * The way from a to b within a camp: straight, or round the fire by a point beside it
 * when the straight line would pass through it.
 */
function route(a: Pt, b: Pt): Pt[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return [a, b];
  const t = Math.min(1, Math.max(0, -(a.x * dx + a.z * dz) / len2));
  const cx = a.x + dx * t;
  const cz = a.z + dz * t;
  const d = Math.sqrt(cx * cx + cz * cz);
  if (d >= FIRE_CLEAR_M || t <= 0 || t >= 1) return [a, b];
  // Step round on the side the line already passes, or to its left when it hits the middle.
  const len = Math.sqrt(len2);
  const [sx, sz] = d > 1e-6 ? [cx / d, cz / d] : [-dz / len, dx / len];
  const r = FIRE_CLEAR_M * 1.3;
  return [a, { x: sx * r, z: sz * r }, b];
}

function routeLength(points: Pt[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++)
    m += Math.sqrt((points[i]!.x - points[i - 1]!.x) ** 2 + (points[i]!.z - points[i - 1]!.z) ** 2);
  return m;
}

/** A stretch of a figure's time at a camp: walking a route, or standing at a point. */
interface Leg {
  start: number;
  end: number;
  clip: TreeClip | 'rest';
  route: Pt[];
  /** What a standing figure faces. */
  face?: Pt;
}

/** Builds a figure's legs one after another from a point and a time. */
class Itinerary {
  legs: Leg[] = [];
  t: number;
  at: Pt;
  constructor(t: number, at: Pt) {
    this.t = t;
    this.at = at;
  }
  go(to: Pt, clip: 'walk' | 'run' | 'carry' = 'walk'): this {
    const way = route(this.at, to);
    const m = routeLength(way);
    if (m < 1e-6) return this;
    const end = this.t + Math.ceil(m / PACE[clip]);
    this.legs.push({ start: this.t, end, clip, route: way });
    this.t = end;
    this.at = to;
    return this;
  }
  stay(until: number, clip: TreeClip | 'rest', face?: Pt): this {
    if (until <= this.t) return this;
    this.legs.push({ start: this.t, end: until, clip, route: [this.at], face });
    this.t = until;
    return this;
  }
}

/** The point a fraction of the way along a route, and the direction it goes there. */
function along(way: Pt[], f: number): Pt & { dirX: number; dirZ: number } {
  if (way.length === 1) return { ...way[0]!, dirX: 0, dirZ: 0 };
  let left = routeLength(way) * f;
  for (let i = 1; i < way.length; i++) {
    const [a, b] = [way[i - 1]!, way[i]!];
    const m = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
    if (left <= m || i === way.length - 1) {
      const t = m < 1e-9 ? 1 : Math.min(1, left / m);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, ...towards(a.x, a.z, b.x, b.z) };
    }
    left -= m;
  }
  return { ...way.at(-1)!, dirX: 0, dirZ: 0 };
}

type Outing = 'rest' | 'gather' | 'hunt' | 'stroll';

/** What a figure does in one of its turns: men and the first person hunt, everyone gathers and strolls. */
function outingOf(id: number, look: FigureLook, turn: number): Outing {
  const roll = hash01(id, turn, 71);
  const [hunt, gather, stroll] =
    look === 'man'
      ? [0.3, 0.15, 0.15]
      : look === 'founder'
        ? [0.2, 0.25, 0.1]
        : look === 'woman'
          ? [0, 0.4, 0.15]
          : [0, 0.25, 0.3];
  if (roll < hunt) return 'hunt';
  if (roll < hunt + gather) return 'gather';
  if (roll < hunt + gather + stroll) return 'stroll';
  return 'rest';
}

/** Everything the tree shows at a clock time (section 8.1). */
export function treeScene(chunk: TreeChunk, ms: number, startDay: Day): TreeScene {
  const lodgings = new Map(chunk.lodgings.map((l) => [l.id, l]));
  const at = (day: Day) => msAtDay(day, startDay);

  // When each lodging appears: when it is built, or when its builder arrives from far away.
  const appears = new Map<number, number>();
  for (const l of chunk.lodgings) appears.set(l.id, at(l.built));
  for (const f of chunk.figures)
    for (let i = 1; i < f.homes.length; i++) {
      const [day, id] = f.homes[i]!;
      const to = lodgings.get(id);
      const from = lodgings.get(f.homes[i - 1]![1]);
      if (!to || !from || to.builder !== f.id || day !== to.built) continue;
      appears.set(id, at(day) + walkMs(from, to));
    }
  // When each lodging's people start taking it down, so it is gone by the day they leave.
  const takeDown = (l: TreeLodging) =>
    l.gone === NEVER
      ? Infinity
      : Math.max(appears.get(l.id)! + BUILD_MS, at(l.gone) - TAKE_DOWN_MS);

  // The builders of each lodging (moving in on the day it is built) and the figures that
  // take it down (leaving on the day it is gone), by id.
  const builders = new Map<number, number[]>();
  const takers = new Map<number, number[]>();
  for (const f of chunk.figures)
    f.homes.forEach(([day, id], i) => {
      const l = lodgings.get(id);
      if (!l) return;
      if (l.built === day) builders.set(id, [...(builders.get(id) ?? []), f.id]);
      const next = f.homes[i + 1];
      if (next && l.gone === next[0]) takers.set(id, [...(takers.get(id) ?? []), f.id]);
    });

  const scene: TreeScene = { figures: [], lodgings: [], hearths: [], clearings: [] };
  // Each place a camp stands: from the first lodging up to the last one gone.
  const places = new Map<
    string,
    { camp: number; lat: number; lon: number; from: number; to: number }
  >();
  for (const l of chunk.lodgings) {
    const shown = appears.get(l.id)!;
    const gone = l.gone === NEVER ? Infinity : at(l.gone);
    const key = `${l.camp}:${l.lat}:${l.lon}`;
    const p = places.get(key);
    if (p) {
      p.from = Math.min(p.from, shown);
      p.to = Math.max(p.to, gone);
    } else
      places.set(key, { camp: l.camp, lat: deg(l.lat), lon: deg(l.lon), from: shown, to: gone });
    if (ms < shown || ms >= gone) continue;
    const spot = lodgingSpot(l);
    const down = takeDown(l);
    scene.lodgings.push({
      id: l.id,
      kind: l.kind,
      lat: deg(l.lat),
      lon: deg(l.lon),
      ...spot,
      ...towards(spot.x, spot.z, 0, 0),
      // Lodgings standing when the timeline starts are already up; then built, then taken down.
      built:
        ms >= down
          ? Math.max(0, 1 - (ms - down) / (at(l.gone) - down))
          : shown <= 0
            ? 1
            : Math.min(1, (ms - shown) / BUILD_MS),
    });
  }
  for (const p of places.values()) {
    if (ms >= p.from && ms < p.to && !scene.hearths.some((h) => h.camp === p.camp))
      scene.hearths.push({ camp: p.camp, lat: p.lat, lon: p.lon });
    const amount =
      ms < p.from
        ? 0
        : ms < p.to
          ? p.from <= 0
            ? 1
            : Math.min(1, (ms - p.from) / FELL_MS)
          : 1 - (ms - p.to) / REGROW_MS;
    if (amount > 0) scene.clearings.push({ lat: p.lat, lon: p.lon, amount, felling: ms < p.to });
  }

  for (const f of chunk.figures) {
    const born = at(f.born);
    if (ms < born || (f.lost !== NEVER && ms >= at(f.lost))) continue;
    let i = 0;
    while (i + 1 < f.homes.length && at(f.homes[i + 1]![0]) <= ms) i++;
    const pose = poseAt(f, i, ms);
    if (pose) scene.figures.push(pose);
  }
  return scene;

  /** Where a figure stands at the end of its stay in its `i`-th home: at its spot, or where it took the lodging down. */
  function endOfStay(f: TreeFigure, i: number): Pt {
    const home = lodgings.get(f.homes[i]![1])!;
    const crew = takers.get(home.id);
    if (crew?.includes(f.id)) return buildSpot(crew.indexOf(f.id), crew.length, home);
    return figureSpot(f.homes[i]![2], home.camp);
  }

  function poseAt(f: TreeFigure, i: number, ms: number): FigurePose | undefined {
    const home = lodgings.get(f.homes[i]![1]);
    if (!home) return undefined;
    const look = lookOf(f.id);
    const spot = figureSpot(f.homes[i]![2], home.camp);
    const base = { id: f.id, look, lat: deg(home.lat), lon: deg(home.lon) };
    const prev = i > 0 ? lodgings.get(f.homes[i - 1]![1]) : undefined;
    const left = at(f.homes[i]![0]);
    const travel = prev ? walkMs(prev, home) : 0;
    const born = at(f.born);
    // Figures that move in on the day their lodging is built help build it.
    const shown = appears.get(home.id)!;
    const builds = f.homes[i]![0] === home.built && shown > 0;
    const crew = builders.get(home.id) ?? [f.id];
    const work = builds ? buildSpot(crew.indexOf(f.id), crew.length, home) : spot;
    const hut = lodgingSpot(home);

    if (prev && ms < left + travel) {
      // On the way to the new home: across the map, from where it left off to where it arrives.
      const t = (ms - left) / travel;
      const from = endOfStay(f, i - 1);
      const east = (deg(home.lon) - deg(prev.lon)) * detCos(deg(home.lat) * RAD);
      return {
        ...base,
        lat: deg(prev.lat) + (deg(home.lat) - deg(prev.lat)) * t,
        lon: deg(prev.lon) + (deg(home.lon) - deg(prev.lon)) * t,
        x: from.x + (work.x - from.x) * t,
        z: from.z + (work.z - from.z) * t,
        ...towards(0, 0, east, deg(home.lat) - deg(prev.lat)),
        clip: 'walk',
        clipMs: ms - left,
      };
    }

    // The stay, leg by leg: arriving, building, outings and rests, taking down.
    const plan =
      prev && travel > 0
        ? new Itinerary(left + travel, work)
        : prev
          ? new Itinerary(left, endOfStay(f, i - 1))
          : i === 0 && born > 0
            ? new Itinerary(born, hut)
            : new Itinerary(-Infinity, spot);
    if (builds) {
      plan.go(work).stay(shown + BUILD_MS, 'work', hut);
      plan.go(spot);
    } else plan.go(spot);
    const free = plan.t;
    const next = f.homes[i + 1];
    const leave = next ? at(next[0]) : f.lost !== NEVER ? at(f.lost) : Infinity;
    const takeCrew = takers.get(home.id);
    const takes = !!takeCrew?.includes(f.id) && home.gone !== NEVER;
    const takeSpot = takes ? buildSpot(takeCrew!.indexOf(f.id), takeCrew!.length, home) : spot;
    const takeStart = takes ? takeDown(home) : leave;
    const busy = takes
      ? takeStart - Math.ceil(routeLength(route(spot, takeSpot)) / PACE.walk)
      : leave;

    if (ms >= busy && takes) {
      plan.stay(Math.max(free, busy), 'rest').go(takeSpot).stay(leave, 'work', hut);
    } else if (ms >= free) {
      // Turns of the day: an outing that fits before it must be busy again, or a rest.
      const shift = hash32(f.id, 73) % TURN_MS;
      const k = Math.floor((ms + shift) / TURN_MS);
      const turnStart = k * TURN_MS - shift;
      const outing = outingOf(f.id, look, k);
      const trip = new Itinerary(turnStart, spot);
      const s = f.homes[i]![2];
      if (outing === 'gather') {
        const far = outingPoint(s, home.camp, 30);
        trip.go(far).stay(trip.t + GATHER_MS, 'work', { x: far.x * 2, z: far.z * 2 });
        trip.go(spot, 'carry');
      } else if (outing === 'hunt') {
        const near = outingPoint(s, home.camp, 50);
        const far = outingPoint(s, home.camp, 64);
        trip
          .go(near)
          .go(far, 'run')
          .stay(trip.t + BUTCHER_MS, 'work', { x: far.x * 2, z: far.z * 2 });
        trip.go(spot, 'carry');
      } else if (outing === 'stroll') {
        const far = outingPoint(s, home.camp, 13);
        trip
          .go(far)
          .stay(trip.t + LOOK_MS, 'idle', { x: far.x * 2, z: far.z * 2 })
          .go(spot);
      }
      if (outing !== 'rest' && turnStart >= free && trip.t <= Math.min(busy, turnStart + TURN_MS)) {
        plan.stay(turnStart, 'rest');
        plan.legs.push(...trip.legs);
        plan.t = trip.t;
      }
    }
    plan.stay(Infinity, 'rest');

    // The leg under way, eased from the one before.
    const n = plan.legs.findIndex((l) => ms < l.end);
    const leg = plan.legs[n]!;
    const before = plan.legs[n - 1];
    const f01 =
      leg.end === Infinity || leg.end === leg.start ? 0 : (ms - leg.start) / (leg.end - leg.start);
    const p = along(leg.route, f01);
    const face = leg.face
      ? towards(p.x, p.z, leg.face.x, leg.face.z)
      : p.dirX || p.dirZ
        ? { dirX: p.dirX, dirZ: p.dirZ }
        : towards(p.x, p.z, 0, 0);
    const motion =
      leg.clip === 'rest'
        ? activity(f.id, ms)
        : { clip: leg.clip, clipMs: ms - (leg.start === -Infinity ? 0 : leg.start) };
    const pose: FigurePose = { ...base, x: p.x, z: p.z, ...face, ...motion };
    if (before && ms - leg.start < BLEND_MS && before.clip !== leg.clip && before.clip !== 'rest')
      pose.from = {
        clip: before.clip,
        clipMs: ms - before.start,
        weight: (ms - leg.start) / BLEND_MS,
      };
    else if (before?.clip === 'rest' && ms - leg.start < BLEND_MS && leg.clip !== 'rest') {
      const was = activity(f.id, leg.start).clip;
      if (was !== leg.clip)
        pose.from = { clip: was, clipMs: ms - leg.start, weight: (ms - leg.start) / BLEND_MS };
    }
    return pose;
  }
}
