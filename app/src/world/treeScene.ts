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

/**
 * Drawn kilometres per life-size metre of a figure: 1.7 times a vignette's 50 (milestone 2,
 * section 5.1; Yang, 2026-10-18: "make the humans and their buildings/fire places 70% larger").
 */
export const FIGURE_KM_PER_M = 85;
/**
 * Figures act this many times faster than life: their clips play faster and they cover
 * ground faster, so the feet still do not slide (Yang, 2026-10-18: livelier camps).
 */
export const TEMPO = 3;
/** A figure's walking pace in life-size metres per second, matching the walk clip's stride. */
export const WALK_M_PER_S = 1.2;
/** Running and carrying paces, matching those clips' strides at the same leg length. */
const RUN_M_PER_S = 4.2;
const CARRY_M_PER_S = 0.87;
/** The camp layout is drawn three times smaller than the figures (milestone 2, section 5.1). */
export const LAYOUT_KM_PER_M = FIGURE_KM_PER_M / 3;
/** Drawn kilometres a figure covers per millisecond of watching. */
const WALK_KM_PER_MS = (TEMPO * WALK_M_PER_S * FIGURE_KM_PER_M) / 1000;
/** Layout metres covered per millisecond of watching, by clip. */
const PACE: Record<'walk' | 'run' | 'carry', number> = {
  walk: (WALK_M_PER_S * 3 * TEMPO) / 1000,
  run: (RUN_M_PER_S * 3 * TEMPO) / 1000,
  carry: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
};
/**
 * Lodgings stand this far from the hearth, in layout metres; lodgings are drawn at
 * figure size, three times the layout, so the ring keeps them clear of the people.
 */
export const LODGING_RING_M = 16;
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
/** Figures leave and enter a camp at this distance from its hearth, between the people and the lodgings. */
const GATE_M = 11;
/** The farthest out anyone goes, in layout metres; the build measures land this far out. */
export const MAX_OUTING_M = 50;
/** The build prefers camp spots with land all round out to this many layout metres, past the people's spots. */
export const CAMP_ROOM_M = OUTER_M + 2;
/** Figures change between idle and work every 20 to 40 seconds of life, sped up by TEMPO. */
const ACTIVITY_MIN_MS = 20_000 / TEMPO;
const ACTIVITY_SPREAD_MS = Math.round(20_000 / TEMPO);
/** Each figure plans its day in turns of this long: an outing, a stroll or a rest. */
const TURN_MS = 60_000 / TEMPO;
/** How long gatherers pick, hunters butcher and strollers look about at the far end. */
const GATHER_MS = 9000 / TEMPO;
const BUTCHER_MS = Math.round(4000 / TEMPO);
const LOOK_MS = Math.round(4000 / TEMPO);
/**
 * Prey of a hunt grazes this far out in its hunter's lane, flees to this far when the hunter
 * runs at it and falls there; the hunter stops short of it to butcher (layout metres).
 */
const PREY_GRAZE_M = 34;
const PREY_FALL_M = 40;
const PREY_REACH_M = PREY_FALL_M + 4;
/** Gatherers pick this far out, and hunters walk this far before they run (layout metres). */
const GATHER_M = 22;
const STALK_M = 26;
/** Prey fades in when the hunter sets out and out once the meat is carried off. */
const PREY_FADE_MS = 400;
/** The animals the first people hunt (wildlife.md section 6 models). */
const PREY_KINDS = ['animal-zebra', 'animal-eland'] as const;

/** Clip changes ease over this long (milestone 2, section 5.3). */
export const BLEND_MS = 350;
/** The band takes this long to build a new lodging, about a year of history. */
export const BUILD_MS = Math.round(8000 / TEMPO);
/** And this long to take one down before it leaves. */
export const TAKE_DOWN_MS = Math.round(5000 / TEMPO);
/** Builders stand this far from the middle of the lodging they build, in layout metres. */
export const BUILD_RING_M = 5;
/**
 * Trees at a camp are felled over this long when the band arrives (half a year), and grow
 * back over this long after it leaves (about five years).
 */
const FELL_MS = 1200;
const REGROW_MS = 12_000;
/** Plants keep this far from a hearth while the camp stands, in drawn kilometres. */
export const CAMP_CLEARING_KM = (LODGING_RING_M + 6) * LAYOUT_KM_PER_M;
/**
 * Wild animals keep this far from a hearth while its camp stands, in drawn kilometres
 * (wildlife.md section 4): the lodgings' ring, a lodging's width and a margin.
 */
export const CAMP_KEEP_OUT_KM = (LODGING_RING_M + 8) * LAYOUT_KM_PER_M;
/** Moves shorter than this are within the camp and not walked. */
const SAME_PLACE_KM = 1;
const KM_PER_DEG = 111.195;

export type FigureLook = 'founder' | 'woman' | 'man' | 'child';
export type TreeClip = 'idle' | 'work' | 'knap' | 'walk' | 'run' | 'carry';

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

export type PreyClip = 'idle' | 'run' | 'fall';

/** An animal of a hunt: it grazes, flees when the hunter runs at it, falls and is butchered. */
export interface PreyPose extends Placed {
  /** The hunter's id and the turn of the hunt, unique while it is shown. */
  id: string;
  kind: (typeof PREY_KINDS)[number];
  clip: PreyClip;
  clipMs: number;
  /** 0 to 1, fading in and out. */
  visibility: number;
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
  prey: PreyPose[];
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

/** The point of a lodging slot round a camp's hearth, in layout metres: evenly spaced, turned by the camp's hash. */
export function slotPoint(camp: number, slot: number): Pt {
  const a = (campTurn(camp) + slot / LODGING_SLOTS) * 2 * Math.PI;
  return { x: LODGING_RING_M * detCos(a), z: LODGING_RING_M * detSin(a) };
}

/** Where a lodging stands around its hearth, in layout metres, by its slot. Its door faces the hearth. */
export function lodgingSpot(l: TreeLodging): Pt {
  return slotPoint(l.camp, l.slot);
}

/** The direction out from the hearth through the middle of a gap between the lodging slots. */
export function gapDirection(camp: number, gap: number): Pt {
  const a = (campTurn(camp) + (gap + 0.5) / LODGING_SLOTS) * 2 * Math.PI;
  return { x: detCos(a), z: detSin(a) };
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
  const lane = Math.floor(spot / LODGING_SLOTS);
  const a =
    (campTurn(camp) + ((spot % LODGING_SLOTS) + 0.5) / LODGING_SLOTS) * 2 * Math.PI +
    (lane - 1.5) * 0.1;
  const r = distance + 3.5 * lane;
  return { x: r * detCos(a), z: r * detSin(a) };
}

/** The farthest a figure's outings may go from the hearth: the land in its gap, less its lane. */
function outingRoom(spot: number, home: TreeLodging): number {
  return (home.reach[spot % LODGING_SLOTS] ?? 0) - 3.5 * Math.floor(spot / LODGING_SLOTS);
}

/** Unit vector from (x0, z0) to (x1, z1), or the fallback when they meet. */
function towards(x0: number, z0: number, x1: number, z1: number, fx = 1, fz = 0) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dz * dz);
  return len < 1e-9 ? { dirX: fx, dirZ: fz } : { dirX: dx / len, dirZ: dz / len };
}

/**
 * What a figure does at its spot by the fire at a clock time, with the clip it eases out of:
 * stands, tends the fire, or (grown-ups) knaps a stone hand axe.
 */
function activity(
  id: number,
  ms: number,
  knaps: boolean,
): Pick<FigurePose, 'clip' | 'clipMs' | 'from'> {
  const period = ACTIVITY_MIN_MS + (hash32(id, 53) % ACTIVITY_SPREAD_MS);
  const shifted = ms + (hash32(id, 59) % period);
  const k = Math.floor(shifted / period);
  const clipOf = (n: number): TreeClip => {
    const h = hash32(id, n, 61) % 6;
    return h < 2 ? 'work' : h < 4 && knaps ? 'knap' : 'idle';
  };
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
      ? [0.45, 0.1, 0.1]
      : look === 'founder'
        ? [0.3, 0.2, 0.1]
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

  // When each lodging appears: when it is built, or when its builder reaches it from far away.
  const appears = new Map<number, number>();
  for (const l of chunk.lodgings) appears.set(l.id, at(l.built));
  for (const f of chunk.figures)
    for (let i = 1; i < f.homes.length; i++) {
      const [day, id] = f.homes[i]!;
      const to = lodgings.get(id);
      const c = crossing(f, i);
      if (!to || !c || to.builder !== f.id || day !== to.built) continue;
      const crew = builders.get(id)!;
      const work = buildSpot(crew.indexOf(f.id), crew.length, to);
      appears.set(id, c.end + Math.ceil(routeLength(route(c.entry, work)) / PACE.walk));
    }

  const scene: TreeScene = { figures: [], prey: [], lodgings: [], hearths: [], clearings: [] };
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
  // In place order, so a time window's chunk gives the same scene as the whole tree.
  scene.clearings.sort((a, b) => a.lat - b.lat || a.lon - b.lon || a.amount - b.amount);

  for (const f of chunk.figures) {
    const born = at(f.born);
    if (ms < born || (f.lost !== NEVER && ms >= at(f.lost))) continue;
    let i = 0;
    while (i + 1 < f.homes.length && at(f.homes[i + 1]![0]) <= ms) i++;
    const pose = poseAt(f, i, ms, scene.prey);
    if (pose) scene.figures.push(pose);
  }
  return scene;

  /**
   * A figure's walk from its old camp to its `i`-th home, when that is somewhere else: round
   * the old fire to the edge of the old camp facing the new one, across the land, and in at
   * the edge of the new camp facing the old one, so it never walks through a fire.
   */
  function crossing(f: TreeFigure, i: number) {
    const home = lodgings.get(f.homes[i]![1]);
    const prev = i > 0 ? lodgings.get(f.homes[i - 1]![1]) : undefined;
    if (!home || !prev) return undefined;
    const travel = walkMs(prev, home);
    if (travel === 0) return undefined;
    const way = towards(
      0,
      0,
      (deg(home.lon) - deg(prev.lon)) * detCos(deg(home.lat) * RAD),
      deg(home.lat) - deg(prev.lat),
    );
    const exit = { x: way.dirX * GATE_M, z: way.dirZ * GATE_M };
    const entry = { x: -exit.x, z: -exit.z };
    const out = route(endOfStay(f, i - 1), exit);
    const start = at(f.homes[i]![0]);
    const across = start + Math.ceil(routeLength(out) / PACE.walk);
    return { prev, home, way, out, start, across, end: across + travel, exit, entry };
  }

  /** Where a figure stands at the end of its stay in its `i`-th home: at its spot, or where it took the lodging down. */
  function endOfStay(f: TreeFigure, i: number): Pt {
    const home = lodgings.get(f.homes[i]![1])!;
    const crew = takers.get(home.id);
    if (crew?.includes(f.id)) return buildSpot(crew.indexOf(f.id), crew.length, home);
    return figureSpot(f.homes[i]![2], home.camp);
  }

  function poseAt(f: TreeFigure, i: number, ms: number, preys: PreyPose[]): FigurePose | undefined {
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

    const c = crossing(f, i);
    if (c && ms < c.across) {
      // Leaving: round the old fire to the edge of the old camp.
      const p = along(c.out, (ms - c.start) / (c.across - c.start));
      return {
        ...base,
        lat: deg(c.prev.lat),
        lon: deg(c.prev.lon),
        x: p.x,
        z: p.z,
        ...(p.dirX || p.dirZ ? { dirX: p.dirX, dirZ: p.dirZ } : c.way),
        clip: 'walk',
        clipMs: ms - c.start,
      };
    }
    if (c && ms < c.end) {
      // On the way to the new home: across the land, from the edge of one camp to the next.
      const t = (ms - c.across) / travel;
      return {
        ...base,
        lat: deg(c.prev.lat) + (deg(home.lat) - deg(prev!.lat)) * t,
        lon: deg(c.prev.lon) + (deg(home.lon) - deg(prev!.lon)) * t,
        x: c.exit.x + (c.entry.x - c.exit.x) * t,
        z: c.exit.z + (c.entry.z - c.exit.z) * t,
        ...c.way,
        clip: 'walk',
        clipMs: ms - c.start,
      };
    }

    // The stay, leg by leg: arriving, building, outings and rests, taking down.
    const plan = c
      ? new Itinerary(c.end, c.entry)
      : prev
        ? new Itinerary(left, endOfStay(f, i - 1))
        : i === 0 && born > 0
          ? new Itinerary(born, hut)
          : new Itinerary(-Infinity, spot);
    if (builds) {
      plan
        .go(work)
        .stay(shown, 'idle', hut)
        .stay(shown + BUILD_MS, 'work', hut);
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
      let hunt: { chase: number; caught: number; done: number; grazing: Pt; falls: Pt } | undefined;
      const s = f.homes[i]![2];
      // Outings stay on land: each goes only as far as its gap has land, or not at all.
      const room = outingRoom(s, home);
      const kind =
        outing === 'hunt' && room < PREY_REACH_M ? (room >= GATHER_M ? 'gather' : 'rest') : outing;
      const sure = kind === 'gather' && room < GATHER_M ? (room >= 16 ? 'stroll' : 'rest') : kind;
      const go = sure === 'stroll' && room < 13 ? 'rest' : sure;
      if (go === 'gather') {
        const far = outingPoint(s, home.camp, GATHER_M);
        trip.go(far).stay(trip.t + GATHER_MS, 'work', { x: far.x * 2, z: far.z * 2 });
        trip.go(spot, 'carry');
      } else if (go === 'hunt') {
        // Walk out, run at the grazing animal as it flees, butcher it where it falls.
        const grazing = outingPoint(s, home.camp, PREY_GRAZE_M);
        const falls = outingPoint(s, home.camp, PREY_FALL_M);
        trip.go(outingPoint(s, home.camp, STALK_M));
        const chase = trip.t;
        trip.go(outingPoint(s, home.camp, PREY_FALL_M - 3), 'run');
        const caught = trip.t;
        trip.stay(trip.t + BUTCHER_MS, 'work', falls);
        hunt = { chase, caught, done: trip.t, grazing, falls };
        trip.go(spot, 'carry');
      } else if (go === 'stroll') {
        const far = outingPoint(s, home.camp, 13);
        trip
          .go(far)
          .stay(trip.t + LOOK_MS, 'idle', { x: far.x * 2, z: far.z * 2 })
          .go(spot);
      }
      if (go !== 'rest' && turnStart >= free && trip.t <= Math.min(busy, turnStart + TURN_MS)) {
        plan.stay(turnStart, 'rest');
        plan.legs.push(...trip.legs);
        plan.t = trip.t;
        if (hunt && ms < hunt.done + PREY_FADE_MS) {
          const kind = PREY_KINDS[hash32(f.id, k, 79) % PREY_KINDS.length]!;
          const prey = { id: `${f.id}:${k}`, kind, lat: base.lat, lon: base.lon };
          const out = towards(hunt.grazing.x, hunt.grazing.z, hunt.falls.x, hunt.falls.z);
          if (ms < hunt.chase)
            // Grazing side on to the camp until the hunter runs at it.
            preys.push({
              ...prey,
              ...hunt.grazing,
              dirX: -out.dirZ,
              dirZ: out.dirX,
              clip: 'idle',
              clipMs: ms - turnStart,
              visibility: Math.min(1, (ms - turnStart) / PREY_FADE_MS),
            });
          else if (ms < hunt.caught) {
            const t = (ms - hunt.chase) / (hunt.caught - hunt.chase);
            preys.push({
              ...prey,
              x: hunt.grazing.x + (hunt.falls.x - hunt.grazing.x) * t,
              z: hunt.grazing.z + (hunt.falls.z - hunt.grazing.z) * t,
              ...out,
              clip: 'run',
              clipMs: ms - hunt.chase,
              visibility: 1,
            });
          } else
            preys.push({
              ...prey,
              ...hunt.falls,
              ...out,
              clip: 'fall',
              clipMs: ms - hunt.caught,
              visibility: Math.min(1, (hunt.done + PREY_FADE_MS - ms) / PREY_FADE_MS),
            });
        }
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
        ? activity(f.id, ms, look !== 'child')
        : { clip: leg.clip, clipMs: ms - (leg.start === -Infinity ? 0 : leg.start) };
    const pose: FigurePose = { ...base, x: p.x, z: p.z, ...face, ...motion };
    if (before && ms - leg.start < BLEND_MS && before.clip !== leg.clip && before.clip !== 'rest')
      pose.from = {
        clip: before.clip,
        clipMs: ms - before.start,
        weight: (ms - leg.start) / BLEND_MS,
      };
    else if (before?.clip === 'rest' && ms - leg.start < BLEND_MS && leg.clip !== 'rest') {
      const was = activity(f.id, leg.start, look !== 'child').clip;
      if (was !== leg.clip)
        pose.from = { clip: was, clipMs: ms - leg.start, weight: (ms - leg.start) / BLEND_MS };
    }
    return pose;
  }
}
