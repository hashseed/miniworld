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
export const TEMPO = 3.6;
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
const PACE: Record<'walk' | 'run' | 'carry' | 'pole' | 'crouch', number> = {
  walk: (WALK_M_PER_S * 3 * TEMPO) / 1000,
  run: (RUN_M_PER_S * 3 * TEMPO) / 1000,
  carry: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
  pole: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
  crouch: (WALK_M_PER_S * 0.55 * 3 * TEMPO) / 1000,
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
/** Camp life (section 8.1): how long each activity's work at its place lasts. */
const FIREWOOD_M = 20;
const BREAK_MS = Math.round(7200 / TEMPO);
const FILL_MS = Math.round(5400 / TEMPO);
const SCRAPE_MS = Math.round(14_400 / TEMPO);
const CRACK_MS = Math.round(14_400 / TEMPO);
const KNAP_POINT_MS = Math.round(10_800 / TEMPO);
const BIND_POINT_MS = Math.round(7200 / TEMPO);
const BUTCHER_MEAT_MS = Math.round(7200 / TEMPO);
const ROAST_MS = Math.round(14_400 / TEMPO);
const INSIDE_MS = Math.round(14_400 / TEMPO);
/**
 * Camp events (section 8.1): catch and dancing last EVENT_MS once everyone is in place.
 * Children run round a ring CATCH_R from the hearth at a little over half a run, "it"
 * catching the next every CHASE_MS; dancers turn slowly on a ring DANCE_R round the fire.
 */
const EVENT_MS = Math.round(36_000 / TEMPO);
const CHASE_MS = Math.round(9000 / TEMPO);
const CATCH_R = 11.5;
const DANCE_R = 6.5;
const CATCH_SHARE = 1 / 3;
const DANCE_SHARE = 1 / 12;
/** The drying rack stands this far round the ring from its lodging, in radians. */
const RACK_TURN = 0.5;
/** How long gatherers pick, hunters butcher and strollers look about at the far end. */
const GATHER_MS = Math.round(9000 / TEMPO);
const BUTCHER_MS = Math.round(4000 / TEMPO);
const LOOK_MS = Math.round(4000 / TEMPO);
/**
 * Prey of a hunt grazes this far out in its hunter's lane, flees to this far when the hunter
 * runs at it and falls there; the hunter stops short of it to butcher (layout metres).
 */
const PREY_GRAZE_M = 34;
const PREY_FALL_M = 40;
const PREY_REACH_M = PREY_FALL_M + 4;
/** Gatherers pick this far out (layout metres). */
const GATHER_M = 22;
/** Prey fades in when the hunter sets out and out once the meat is carried off. */
const PREY_FADE_MS = 400;
/** The animals the first people hunt (wildlife.md section 6 models). */
const PREY_KINDS = ['animal-zebra', 'animal-eland'] as const;
/**
 * Hunts (section 8.1): the hunter throws from this far short of the animal (layout
 * metres; about 5 life-size metres at the figures' scale, so the flight reads), and a
 * missed spear sticks this far beyond it, a little to the side; the animal bolts this far.
 */
const THROW_GAP_M = 16;
const MISS_BEYOND_M = 5;
const MISS_SIDE_M = 1.6;
/** About one throw in three misses (section 8.1). */
const MISS_SHARE = 0.35;
/** The throw clip runs this long; the spear leaves the hand at THROW_RELEASE (0.55 s of clip). */
const THROW_MS = Math.ceil(1600 / TEMPO);
const RELEASE_MS = Math.round(550 / TEMPO);
/** A spear is in the air this long. */
const FLIGHT_MS = 600;
/** It leaves the hand this high and lands this high in the animal, in life-size metres. */
const HAND_H = 1.7;
const HIT_H = 1.05;
/** The arc of a flight rises by this share of its length at the figures' scale. */
const SPEAR_ARC = 0.18;
/** The animal runs from the missed spear for this long. */
const BOLT_MS = 450;
/** A hunter pulls a missed spear out of the ground over this long. */
const PICK_MS = Math.round(1200 / TEMPO);
/** Hunter and helper kneel this far to either side of the kill, and bind it for BIND_SECONDS. */
const KNEEL_SIDE_M = 3.5;
const BIND_MS = Math.ceil(2400 / TEMPO);
/**
 * Half the length of the carrying pole in layout metres (1.6 life-size metres at the figures'
 * scale), and how long lifting it and laying it down take.
 */
const POLE_HALF_M = 4.5;
const LIFT_MS = Math.round(1200 / TEMPO);
const PUT_MS = Math.round(1200 / TEMPO);
/**
 * Height of the pole on the carriers' shoulders and of its middle lying on the ground, in
 * life-size metres (POLE_HEIGHT in assets/src/clips.ts, POLE_R in assets/src/shelters.ts).
 */
export const POLE_ON_SHOULDERS_M = 1.42;
export const POLE_ON_GROUND_M = 0.045;
/** The kill is carried to here in the hunter's gap, between the people and the lodgings. */
const DROP_M = 14;
/** It lies there this long before it fades away. */
const DROP_LINGER_MS = Math.round(40_000 / TEMPO);
/** Trees make way this far round points of a hunt's lane, in drawn kilometres. */
const HUNT_CLEARING_KM = 8 * LAYOUT_KM_PER_M;
/**
 * The hunted animal and one or two of its herd walk in from the treeline at the far end of
 * the hunter's lane (Yang, 2026-10-19: animals appeared out of thin air), at this pace in
 * layout metres per millisecond, a little apart; they graze this long before the hunter
 * throws, and the companions bolt back to the trees when the spear lands.
 */
const PREY_WALK = (WALK_M_PER_S * 2.4 * TEMPO) / 1000;
const HERD_SIDE_M = 3.5;
const GRAZE_FIRST_MS = Math.round(1500 / TEMPO);

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
/**
 * A new camp (section 8.1): where its place has at least this much tree cover the band
 * fells the trees for FELL_WOOD_MS first, round the ring of lodgings; then the first
 * builder lights the fire with flint stones for FLINT_MS before building.
 */
const WOOD_MIN = 0.15;
const FELL_WOOD_MS = Math.round(14_400 / TEMPO);
const FLINT_MS = Math.round(9000 / TEMPO);
/** The lighter kneels this far from the middle of the hearth, just outside the paths' clearance. */
const LIGHT_M = 3.1;
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
export type TreeClip =
  | 'idle'
  | 'work'
  | 'knap'
  | 'walk'
  | 'run'
  | 'carry'
  | 'throw'
  | 'pole'
  | 'strike'
  | 'crouch'
  | 'dance'
  | 'scrape'
  | 'crack';

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
  /** The hand is empty: the figure's spear is in the air, in the prey or in the grass. */
  unarmed?: boolean;
  /** Inside its hut, out of sight (section 8.1). */
  hidden?: boolean;
}

export type PreyClip = 'idle' | 'walk' | 'run' | 'fall' | 'bound' | 'hung';

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
  /** 0 before the fire is lit at a new camp, rising to 1 as it catches (section 8.1). */
  lit: number;
}

/** A spark from the flint stones of a fire being lit: layout point, height in life-size metres, 0 to 1 of its life. */
export interface SparkPose {
  lat: number;
  lon: number;
  x: number;
  z: number;
  height: number;
  life: number;
}

/** A prop of camp life at a layout point: a drying rack beside a lodging, a spit over the fire. */
export interface CampPropPose extends Placed {
  id: string;
  kind: 'prop-drying-rack' | 'prop-spit';
}

/** Where the trees make way for a camp: 1 cleared, 0 grown back. */
export interface ClearingPose {
  lat: number;
  lon: number;
  amount: number;
  /** True while the trees are being felled, false while they grow back. */
  felling: boolean;
  /** Off the hearth in layout metres, and the radius in drawn kilometres, for a hunt's ground. */
  x?: number;
  z?: number;
  km?: number;
}

/** A hunter's spear away from his hand: its middle, height above the ground in life-size metres, and pitch. */
export interface SpearPose extends Placed {
  id: string;
  height: number;
  /** Rise per unit along (dirX, dirZ), tip first; negative points down. */
  slope: number;
}

/** The carrying pole of a hunt: its middle, and its height above the ground in life-size metres. */
export interface PolePose extends Placed {
  id: string;
  height: number;
}

export interface TreeScene {
  figures: FigurePose[];
  prey: PreyPose[];
  spears: SpearPose[];
  poles: PolePose[];
  sparks: SparkPose[];
  props: CampPropPose[];
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
  /** A clip, a rest, inside the hut (out of sight), or a camp event's own motion. */
  clip: TreeClip | 'rest' | 'inside' | 'event';
  route: Pt[];
  /** What a standing figure faces. */
  face?: Pt;
  /** A prop shown while the leg lasts: the spit over the fire while cooking. */
  prop?: 'prop-spit';
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
  go(to: Pt, clip: 'walk' | 'run' | 'carry' | 'pole' | 'crouch' = 'walk'): this {
    const way = route(this.at, to);
    const m = routeLength(way);
    if (m < 1e-6) return this;
    const end = this.t + Math.ceil(m / PACE[clip]);
    this.legs.push({ start: this.t, end, clip, route: way });
    this.t = end;
    this.at = to;
    return this;
  }
  stay(until: number, clip: Leg['clip'], face?: Pt, prop?: Leg['prop']): this {
    if (until <= this.t) return this;
    this.legs.push({ start: this.t, end: until, clip, route: [this.at], face, prop });
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

type Outing =
  | 'rest'
  | 'gather'
  | 'hunt'
  | 'stroll'
  | 'firewood'
  | 'water'
  | 'scrape'
  | 'crack'
  | 'spear'
  | 'cook'
  | 'hut';

/** Shares of a figure's turns by activity (section 8.1), the rest of its turns rests. */
const OUTING_SHARES: Record<FigureLook, [Outing, number][]> = {
  man: [
    ['hunt', 0.4],
    ['spear', 0.12],
    ['firewood', 0.1],
    ['water', 0.05],
    ['hut', 0.06],
    ['stroll', 0.05],
  ],
  founder: [
    ['hunt', 0.25],
    ['gather', 0.1],
    ['firewood', 0.08],
    ['water', 0.06],
    ['crack', 0.1],
    ['cook', 0.08],
    ['hut', 0.06],
    ['stroll', 0.05],
  ],
  woman: [
    ['gather', 0.18],
    ['scrape', 0.12],
    ['crack', 0.1],
    ['water', 0.1],
    ['firewood', 0.08],
    ['cook', 0.12],
    ['hut', 0.08],
    ['stroll', 0.04],
  ],
  child: [
    ['gather', 0.15],
    ['crack', 0.12],
    ['hut', 0.12],
    ['stroll', 0.15],
  ],
};

/** What a figure does in one of its turns (section 8.1), chosen by hash from its look's shares. */
function outingOf(id: number, look: FigureLook, turn: number): Outing {
  let roll = hash01(id, turn, 71);
  for (const [outing, share] of OUTING_SHARES[look]) {
    if (roll < share) return outing;
    roll -= share;
  }
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

  const scene: TreeScene = {
    figures: [],
    prey: [],
    spears: [],
    poles: [],
    sparks: [],
    props: [],
    lodgings: [],
    hearths: [],
    clearings: [],
  };
  // Stays and hunts worked out this frame, by figure and home, and by hunter and turn.
  const stays = new Map<string, Stay | undefined>();
  const hunts = new Map<string, Hunt | undefined>();
  const events = new Map<string, CampEvent | undefined>();
  // Who ever lives at each camp, so the camp-wide lookups of hunts, helpers, events and
  // kills look only at its people, not everyone.
  const campmates = new Map<number, TreeFigure[]>();
  for (const f of chunk.figures)
    for (const c of new Set(f.homes.map(([, id]) => lodgings.get(id)?.camp))) {
      if (c === undefined) continue;
      const list = campmates.get(c);
      if (list) list.push(f);
      else campmates.set(c, [f]);
    }
  const mates = (camp: number) => campmates.get(camp) ?? [];
  // Each place a camp stands: from the band's arrival up to the last lodging gone, with
  // the felling and the lighting of its fire (section 8.1).
  const places = new Map<string, Place>();
  const placeKey = (l: TreeLodging) => `${l.camp}:${l.lat}:${l.lon}`;
  for (const l of chunk.lodgings) {
    const arrived = appears.get(l.id)!;
    const gone = l.gone === NEVER ? Infinity : at(l.gone);
    const p = places.get(placeKey(l));
    if (!p)
      places.set(placeKey(l), {
        camp: l.camp,
        lat: deg(l.lat),
        lon: deg(l.lon),
        from: arrived,
        to: gone,
        wood: l.wood ?? 0,
        first: l,
        fellEnd: arrived,
        litStart: arrived,
        litEnd: arrived,
      });
    else {
      if (arrived < p.from) [p.from, p.first] = [arrived, l];
      p.to = Math.max(p.to, gone);
      p.wood = Math.max(p.wood, l.wood ?? 0);
    }
  }
  for (const p of places.values()) {
    if (p.from <= 0) continue;
    p.fellEnd = p.from + (p.wood >= WOOD_MIN ? FELL_WOOD_MS : 0);
    p.litStart = p.fellEnd;
    p.litEnd = p.litStart + FLINT_MS;
  }
  // No lodging goes up before the felling is done, nor the lighter's before the fire is lit.
  for (const l of chunk.lodgings) {
    const p = places.get(placeKey(l))!;
    if (p.from <= 0) continue;
    let shown = Math.max(appears.get(l.id)!, p.fellEnd);
    if (l === p.first) {
      const crew = builders.get(l.id) ?? [l.builder];
      const work = buildSpot(Math.max(0, crew.indexOf(l.builder)), crew.length, l);
      shown = Math.max(
        shown,
        p.litEnd + Math.ceil(routeLength(route(lightSpot(l.builder), work)) / PACE.walk),
      );
    }
    appears.set(l.id, shown);
  }
  for (const l of chunk.lodgings) {
    const shown = appears.get(l.id)!;
    const gone = l.gone === NEVER ? Infinity : at(l.gone);
    if (ms < shown || ms >= gone) continue;
    const spot = lodgingSpot(l);
    const down = takeDown(l);
    // A drying rack stands beside every lodging that is up (section 8.1).
    if (ms >= shown + BUILD_MS && ms < down) {
      const rack = rackSpot(l);
      scene.props.push({
        id: `rack:${l.id}`,
        kind: 'prop-drying-rack',
        lat: deg(l.lat),
        lon: deg(l.lon),
        ...rack,
        ...towards(rack.x, rack.z, 0, 0),
      });
    }
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
    if (ms >= p.from && ms < p.to && !scene.hearths.some((h) => h.camp === p.camp)) {
      // The flames rise from nothing as the fire catches.
      const lit = p.from <= 0 ? 1 : Math.min(1, Math.max(0, (ms - p.litStart) / FLINT_MS));
      scene.hearths.push({ camp: p.camp, lat: p.lat, lon: p.lon, lit });
      if (ms >= p.litStart && ms < p.litEnd) sparksAt(p, ms);
    }
    // The trees tip over while the band fells them, or quickly where there were few.
    const felled = Math.max(p.fellEnd - p.from, FELL_MS);
    const amount =
      ms < p.from
        ? 0
        : ms < p.to
          ? p.from <= 0
            ? 1
            : Math.min(1, (ms - p.from) / felled)
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
    const pose = poseAt(f, i, ms);
    if (pose) scene.figures.push(pose);
  }
  // Each hunt's animal, spears and pole, once; an animal lies by the camp after its hunt.
  const shown = new Set<string>();
  for (const f of chunk.figures)
    for (let k = turnOf(f.id, ms) - 2; k <= turnOf(f.id, ms); k++) {
      const st = stayAt(f, turnStartOf(f.id, k));
      const h = st && huntOf(st, k);
      if (!h || shown.has(h.id)) continue;
      shown.add(h.id);
      huntProps(h, ms);
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

  /** The camp event of a camp's window `w`, if any (section 8.1); the same for every member. */
  function eventOf(ref: Stay, w: number): CampEvent | undefined {
    const camp = ref.home.camp;
    const key = `${camp}:${ref.home.lat}:${ref.home.lon}:${w}`;
    if (events.has(key)) return events.get(key);
    events.set(key, undefined);
    const shift = hash32(camp, 113) % TURN_MS;
    const start = w * TURN_MS - shift;
    const roll = hash01(camp, w, 97);
    const kind =
      roll < CATCH_SHARE ? 'catch' : roll < CATCH_SHARE + DANCE_SHARE ? 'dance' : undefined;
    let ev: CampEvent | undefined;
    if (kind) {
      const until = start + TURN_MS;
      const members = mates(camp)
        .filter((g) => kind === 'dance' || lookOf(g.id) === 'child')
        .map((g) => stayAt(g, start))
        .filter(
          (g): g is Stay =>
            !!g &&
            sameCamp(g, ref) &&
            g.free <= start &&
            g.busy >= until &&
            huntsOf(g, start, until).length === 0,
        );
      if (members.length >= (kind === 'catch' ? 2 : 3))
        ev = planEvent(kind, members, w, start, until);
    }
    events.set(key, ev);
    return ev;
  }

  /** Everyone walks to their place on the ring, plays or dances, and walks back. */
  function planEvent(
    kind: 'catch' | 'dance',
    members: Stay[],
    w: number,
    start: number,
    until: number,
  ): CampEvent | undefined {
    const ref = members[0]!;
    const r = kind === 'catch' ? CATCH_R : DANCE_R;
    const a0 = hash01(ref.home.camp, w, 99) * 2 * Math.PI;
    const ev: CampEvent = {
      id: `${ref.home.camp}:${w}`,
      kind,
      camp: ref.home.camp,
      members: members.map((m) => m.f.id),
      a0,
      r,
      start,
      begin: start,
      stop: start,
      end: start,
      legs: new Map(),
    };
    const ring = members.map((_, i) => ringPoint(ev, i, 0));
    const trips = members.map((m, i) => new Itinerary(start, m.spot).go(ring[i]!));
    ev.begin = Math.max(...trips.map((t) => t.t));
    ev.stop = ev.begin + EVENT_MS;
    members.forEach((m, i) => {
      const trip = trips[i]!;
      trip.stay(ev.begin, 'idle', { x: 0, z: 0 });
      trip.legs.push({ start: ev.begin, end: ev.stop, clip: 'event', route: [ring[i]!] });
      trip.t = ev.stop;
      trip.at = eventPoint(ev, i, ev.stop);
      trip.go(m.spot);
      ev.end = Math.max(ev.end, trip.t);
      ev.legs.set(m.f.id, trip.legs);
    });
    if (ev.end > until || members.some((m) => ev.end > m.busy)) return undefined;
    return ev;
  }

  /** The camp events a figure takes part in that overlap a span. */
  function eventsOf(st: Stay, from: number, to: number): CampEvent[] {
    const shift = hash32(st.home.camp, 113) % TURN_MS;
    const out: CampEvent[] = [];
    for (let w = Math.floor((from - TURN_MS + shift) / TURN_MS); w * TURN_MS - shift < to; w++) {
      const ev = eventOf(st, w);
      if (ev && ev.members.includes(st.f.id) && ev.start < to && ev.end > from) out.push(ev);
    }
    return out;
  }

  /** A member's pose in a camp event while it plays or dances. */
  function eventPose(
    ev: CampEvent,
    id: number,
    ms: number,
    base: Pick<FigurePose, 'id' | 'look' | 'lat' | 'lon'>,
  ): FigurePose {
    const i = ev.members.indexOf(id);
    const p = eventPoint(ev, i, ms);
    const tau = ms - ev.begin;
    if (ev.kind === 'dance')
      return { ...base, ...p, ...towards(p.x, p.z, 0, 0), clip: 'dance', clipMs: tau };
    const q = eventPoint(ev, i, ms + 30);
    // A little over half a run, the run clip slowed to match, so the feet do not slide.
    return {
      ...base,
      ...p,
      ...towards(p.x, p.z, q.x, q.z),
      clip: 'run',
      clipMs: Math.round(tau * CATCH_PACE_SHARE),
    };
  }

  /** A few sparks jumping from the flint stones, a pure function of the clock (section 8.1). */
  function sparksAt(p: Place, ms: number): void {
    const at0 = lightSpot(p.first.builder);
    const toward = { x: at0.x * 0.4, z: at0.z * 0.4 };
    for (let k = 0; k < 6; k++) {
      const life = ((ms - p.litStart) / 260 + k / 6) % 1;
      const n = Math.floor((ms - p.litStart) / 260 + k / 6);
      const a = hash01(p.camp, n, k, 101) * 2 * Math.PI;
      const r = 0.6 * life * (0.5 + hash01(p.camp, n, k, 103));
      scene.sparks.push({
        lat: p.lat,
        lon: p.lon,
        x: toward.x + r * detCos(a),
        z: toward.z + r * detSin(a),
        height: 0.15 + 0.5 * life * (1 - 0.6 * life),
        life,
      });
    }
  }

  /** A figure's stay in its `i`-th home: the camp, its spot, its plan up to when it is free, and when it must be busy again. */
  interface Stay {
    f: TreeFigure;
    i: number;
    home: TreeLodging;
    look: FigureLook;
    /** Its spot's number at the hearth, and the spot. */
    s: number;
    spot: Pt;
    hut: Pt;
    plan: Itinerary;
    free: number;
    busy: number;
    leave: number;
    takes: boolean;
    takeSpot: Pt;
  }

  function stayOf(f: TreeFigure, i: number): Stay | undefined {
    const key = `${f.id}:${i}`;
    if (stays.has(key)) return stays.get(key);
    const home = lodgings.get(f.homes[i]![1]);
    let st: Stay | undefined;
    if (home) {
      const s = f.homes[i]![2];
      const spot = figureSpot(s, home.camp);
      const prev = i > 0 ? lodgings.get(f.homes[i - 1]![1]) : undefined;
      const left = at(f.homes[i]![0]);
      const born = at(f.born);
      // Figures that move in on the day their lodging is built help build it.
      const shown = appears.get(home.id)!;
      const builds = f.homes[i]![0] === home.built && shown > 0;
      const crew = builders.get(home.id) ?? [f.id];
      const work = builds ? buildSpot(crew.indexOf(f.id), crew.length, home) : spot;
      const hut = lodgingSpot(home);
      const c = crossing(f, i);
      // The stay, leg by leg: arriving, building, outings and rests, taking down.
      const plan = c
        ? new Itinerary(c.end, c.entry)
        : prev
          ? new Itinerary(left, endOfStay(f, i - 1))
          : i === 0 && born > 0
            ? new Itinerary(born, hut)
            : new Itinerary(-Infinity, spot);
      // At a new camp: fell the trees round the ring of lodgings, facing out, and the first
      // builder lights the fire with flint stones (section 8.1).
      const place = places.get(placeKey(home))!;
      if (builds && plan.t < place.fellEnd && place.fellEnd > place.from) {
        const a = hash01(f.id, place.camp, 107) * 2 * Math.PI;
        const r = LODGING_RING_M + 3;
        const tree = { x: r * detCos(a), z: r * detSin(a) };
        plan.go({ x: tree.x * 0.85, z: tree.z * 0.85 }).stay(place.fellEnd, 'work', tree);
      }
      if (builds && home === place.first && f.id === home.builder && place.from > 0)
        plan
          .go(lightSpot(f.id))
          .stay(place.litStart, 'idle', { x: 0, z: 0 })
          .stay(place.litEnd, 'strike', { x: 0, z: 0 });
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
      st = {
        f,
        i,
        home,
        look: lookOf(f.id),
        s,
        spot,
        hut,
        plan,
        free,
        busy,
        leave,
        takes,
        takeSpot,
      };
    }
    stays.set(key, st);
    return st;
  }

  /** The stay of a figure at a clock time, if it is alive and at a camp then. */
  function stayAt(f: TreeFigure, t: number): Stay | undefined {
    if (t < at(f.born) || (f.lost !== NEVER && t >= at(f.lost))) return undefined;
    let i = 0;
    while (i + 1 < f.homes.length && at(f.homes[i + 1]![0]) <= t) i++;
    return stayOf(f, i);
  }

  /** The start of a figure's `k`-th turn, and the turn a clock time falls in. */
  function turnStartOf(id: number, k: number): number {
    return k * TURN_MS - (hash32(id, 73) % TURN_MS);
  }
  function turnOf(id: number, t: number): number {
    return Math.floor((t + (hash32(id, 73) % TURN_MS)) / TURN_MS);
  }

  /**
   * What a figure goes out to do in its `k`-th turn on its own, as far as its gap has land
   * (section 8.1): a gathering or a stroll with its legs, a hunt (planned as a camp event
   * by huntOf), or nothing.
   */
  function soloTurn(st: Stay, k: number): { go: Outing; trip?: Itinerary } {
    const turnStart = turnStartOf(st.f.id, k);
    if (turnStart < st.free) return { go: 'rest' };
    const outing = outingOf(st.f.id, st.look, k);
    // Outings stay on land: each goes only as far as its gap has land, or not at all.
    const room = outingRoom(st.s, st.home);
    const kind =
      outing === 'hunt' && room < PREY_REACH_M ? (room >= GATHER_M ? 'gather' : 'rest') : outing;
    const sure = kind === 'gather' && room < GATHER_M ? (room >= 16 ? 'stroll' : 'rest') : kind;
    let go: Outing = sure === 'stroll' && room < 13 ? 'rest' : sure;
    if (go === 'firewood' && room < FIREWOOD_M + 1) go = 'rest';
    const camp = st.home.camp;
    const trip = new Itinerary(turnStart, st.spot);
    const out = (p: Pt): Pt => ({ x: p.x * 2, z: p.z * 2 });
    if (go === 'gather') {
      const far = outingPoint(st.s, camp, GATHER_M);
      trip
        .go(far)
        .stay(trip.t + GATHER_MS, 'work', out(far))
        .go(st.spot, 'carry');
    } else if (go === 'stroll') {
      const far = outingPoint(st.s, camp, 13);
      trip
        .go(far)
        .stay(trip.t + LOOK_MS, 'idle', out(far))
        .go(st.spot);
    } else if (go === 'firewood') {
      // Out among the trees, break branches, back with the bundle.
      const far = outingPoint(st.s, camp, FIREWOOD_M);
      trip
        .go(far)
        .stay(trip.t + BREAK_MS, 'work', out(far))
        .go(st.spot, 'carry');
    } else if (go === 'water') {
      // Out through the gap whose land ends nearest, to its last metre, if any is in reach.
      const reach = st.home.reach;
      let gap = 0;
      for (let g = 1; g < reach.length; g++) if (reach[g]! < reach[gap]!) gap = g;
      if (reach[gap]! >= MAX_OUTING_M - 1) return { go: 'rest' };
      const d = gapDirection(camp, gap);
      const edge = Math.max(9, reach[gap]! - 1);
      const far = { x: d.x * edge, z: d.z * edge };
      trip
        .go(far)
        .stay(trip.t + FILL_MS, 'work', out(far))
        .go(st.spot, 'carry');
    } else if (go === 'scrape') {
      // At the drying rack beside its own lodging.
      const rack = rackSpot(st.home);
      const at = { x: rack.x * 0.85, z: rack.z * 0.85 };
      trip
        .go(at)
        .stay(trip.t + SCRAPE_MS, 'scrape', rack)
        .go(st.spot);
    } else if (go === 'crack') {
      trip.stay(trip.t + CRACK_MS, 'crack', { x: 0, z: 0 });
    } else if (go === 'spear') {
      // A stone point knapped, then bound to the shaft.
      trip
        .stay(trip.t + KNAP_POINT_MS, 'knap', { x: 0, z: 0 })
        .stay(trip.t + KNAP_POINT_MS + BIND_POINT_MS, 'work', { x: 0, z: 0 });
    } else if (go === 'hut') {
      // To the door, crouch inside, stay a while out of sight, crouch out.
      const hut = lodgingSpot(st.home);
      const door = { x: hut.x * 0.8, z: hut.z * 0.8 };
      trip
        .go(door)
        .go(hut, 'crouch')
        .stay(trip.t + INSIDE_MS, 'inside')
        .go(door, 'crouch')
        .go(st.spot);
    } else if (go === 'cook') {
      // Only while a kill lies at the camp: butcher it, roast the meat over the fire.
      const meat = killAt(st, turnStart);
      if (!meat) return { go: 'rest' };
      const by = { x: meat.drop.x * 0.88, z: meat.drop.z * 0.88 };
      const fire = lightSpot(st.f.id);
      trip.go(by);
      if (trip.t + BUTCHER_MEAT_MS > meat.gone - PREY_FADE_MS) return { go: 'rest' };
      trip
        .stay(trip.t + BUTCHER_MEAT_MS, 'work', meat.drop)
        .go(fire, 'carry')
        .stay(trip.t + ROAST_MS, 'work', { x: 0, z: 0 }, 'prop-spit')
        .go(st.spot);
    } else return { go };
    return trip.t <= Math.min(st.busy, turnStart + TURN_MS) ? { go, trip } : { go: 'rest' };
  }

  /** The kill of a hunt lying at a figure's camp at a clock time, if any (section 8.1). */
  function killAt(st: Stay, t: number): Hunt | undefined {
    for (const g of mates(st.home.camp)) {
      if (lookOf(g.id) === 'child') continue;
      for (let k = turnOf(g.id, t) - 3; k <= turnOf(g.id, t); k++) {
        const gs = stayAt(g, turnStartOf(g.id, k));
        if (!gs || !sameCamp(gs, st)) continue;
        const h = huntOf(gs, k);
        if (h && h.helper !== undefined && h.laid <= t && t < h.gone - PREY_FADE_MS) return h;
      }
    }
    return undefined;
  }

  /** Whether two stays are at the same camp: the same camp number and place. */
  function sameCamp(a: Stay, b: Stay): boolean {
    return a.home.camp === b.home.camp && a.home.lat === b.home.lat && a.home.lon === b.home.lon;
  }

  /**
   * The hunt a figure leads in its `k`-th turn, if it hunts then and it fits (section 8.1):
   * with a helper from its camp when one is free, else alone. The same for every clock time.
   */
  function huntOf(st: Stay, k: number): Hunt | undefined {
    const key = `${st.f.id}:${k}`;
    if (hunts.has(key)) return hunts.get(key);
    hunts.set(key, undefined);
    let hunt: Hunt | undefined;
    const turnStart = turnStartOf(st.f.id, k);
    if (soloTurn(st, k).go === 'hunt') {
      const until = Math.min(st.busy, turnStart + TURN_MS);
      // Helpers: grown-ups of the camp, free for the whole hunt, not hunting then and not
      // helping a hunter with a lower id, in an order chosen by hash.
      const helpers = mates(st.home.camp)
        .filter((g) => g.id !== st.f.id && lookOf(g.id) !== 'child')
        .map((g) => stayAt(g, turnStart))
        .filter((h): h is Stay => !!h && sameCamp(h, st) && h.free <= turnStart)
        .sort((a, b) => hash01(st.f.id, k, a.f.id, 83) - hash01(st.f.id, k, b.f.id, 83));
      for (const h of helpers) {
        const plan = huntPlan(st, k, h);
        if (plan.end > until || plan.end > h.busy || huntsDuring(h, turnStart, plan.end)) continue;
        if (helpedBefore(st, h, turnStart, plan.end)) continue;
        hunt = plan;
        break;
      }
      if (!hunt) {
        const alone = huntPlan(st, k, undefined);
        if (alone.end <= until) hunt = alone;
      }
    }
    hunts.set(key, hunt);
    return hunt;
  }

  /** Whether a figure leads a hunt of its own that overlaps a span. */
  function huntsDuring(st: Stay, from: number, to: number): boolean {
    for (let k = turnOf(st.f.id, from) - 1; k <= turnOf(st.f.id, to); k++) {
      if (soloTurn(st, k).go !== 'hunt') continue;
      const start = turnStartOf(st.f.id, k);
      if (start < to && start + TURN_MS > from) return true;
    }
    return false;
  }

  /** Whether a hunter of the camp with a lower id than `hunter` already has `helper` in a span. */
  function helpedBefore(hunter: Stay, helper: Stay, from: number, to: number): boolean {
    for (const g of mates(hunter.home.camp)) {
      if (g.id >= hunter.f.id || g.id === helper.f.id) continue;
      for (let k = turnOf(g.id, from - TURN_MS); k <= turnOf(g.id, to); k++) {
        const gs = stayAt(g, turnStartOf(g.id, k));
        if (!gs || !sameCamp(gs, hunter)) continue;
        const h = huntOf(gs, k);
        if (h && h.helper === helper.f.id && h.start < to && h.end > from) return true;
      }
    }
    return false;
  }

  /** The hunts in which a figure takes part, as hunter or helper, that overlap a span. */
  function huntsOf(st: Stay, from: number, to: number): Hunt[] {
    const out: Hunt[] = [];
    for (const g of mates(st.home.camp)) {
      if (lookOf(g.id) === 'child') continue;
      for (let k = turnOf(g.id, from - TURN_MS); k <= turnOf(g.id, to); k++) {
        const gs = g.id === st.f.id ? st : stayAt(g, turnStartOf(g.id, k));
        if (!gs || !sameCamp(gs, st)) continue;
        const h = huntOf(gs, k);
        if (h && (h.hunter === st.f.id || h.helper === st.f.id) && h.start < to && h.end > from)
          out.push(h);
      }
    }
    return out;
  }

  /**
   * A hunt from start to end (section 8.1): both walk out, the hunter throws, perhaps
   * misses, picks the spear up and throws again; then they bind the kill to the pole and
   * carry it back, or a hunter alone butchers it and carries the meat.
   */
  function huntPlan(st: Stay, k: number, helper: Stay | undefined): Hunt {
    const camp = st.home.camp;
    const lane = (d: number) => outingPoint(st.s, camp, d);
    const out = towards(0, 0, lane(PREY_GRAZE_M).x, lane(PREY_GRAZE_M).z);
    const side = { x: -out.dirZ, z: out.dirX };
    const offset = (p: Pt, along: number, across: number): Pt => ({
      x: p.x + out.dirX * along + side.x * across,
      z: p.z + out.dirZ * along + side.z * across,
    });
    const start = turnStartOf(st.f.id, k);
    const graze = lane(PREY_GRAZE_M);
    const miss = hash01(st.f.id, k, 87) < MISS_SHARE;
    const kill = miss ? lane(PREY_FALL_M) : graze;
    // The herd comes out of the trees at the far end of the lane, where its land ends.
    const entry = lane(Math.min(outingRoom(st.s, st.home), MAX_OUTING_M) - 1);
    const arrive =
      start +
      PREY_FADE_MS +
      Math.ceil(Math.sqrt((entry.x - graze.x) ** 2 + (entry.z - graze.z) ** 2) / PREY_WALK);
    const herd = Array.from({ length: 1 + (hash32(st.f.id, k, 89) % 2) }, (_, n) => {
      const across = (n === 0 ? 1 : -1) * HERD_SIDE_M;
      return { entry: offset(entry, 0, across), graze: offset(graze, 1.5 * n, across) };
    });
    const hunter = new Itinerary(start, st.spot).go(lane(PREY_GRAZE_M - THROW_GAP_M));
    const aide =
      helper && new Itinerary(start, helper.spot).go(lane(PREY_GRAZE_M - THROW_GAP_M - 3));
    const ready = Math.max(hunter.t, aide?.t ?? 0, arrive + GRAZE_FIRST_MS);
    hunter.stay(ready, 'idle', graze).stay(ready + THROW_MS, 'throw', graze);
    const flights: Flight[] = [];
    const first = {
      from: lane(PREY_GRAZE_M - THROW_GAP_M),
      to: miss ? offset(graze, MISS_BEYOND_M, MISS_SIDE_M) : graze,
      release: ready + RELEASE_MS,
      hit: !miss,
      pulled: Infinity,
    };
    flights.push(first);
    let killed = first.release + FLIGHT_MS;
    let alert = Infinity;
    if (miss) {
      // Walk to the spear, pull it out of the ground, walk closer and throw again.
      hunter.go(offset(first.to, -1.2, 0)).stay(hunter.t + PICK_MS, 'work', first.to);
      first.pulled = hunter.t - PICK_MS / 2;
      alert = first.release + FLIGHT_MS;
      const from = lane(PREY_FALL_M - THROW_GAP_M);
      hunter.go(from);
      const t2 = hunter.t;
      hunter.stay(t2 + THROW_MS, 'throw', kill);
      flights.push({ from, to: kill, release: t2 + RELEASE_MS, hit: true, pulled: Infinity });
      killed = t2 + RELEASE_MS + FLIGHT_MS;
    }
    const thrown = hunter.t;
    const hit = flights.at(-1)!;
    let bind: number;
    let lift = Infinity;
    let carry = Infinity;
    let put = Infinity;
    let laid = Infinity;
    const drop = lane(DROP_M);
    if (aide) {
      // Kneel on either side of the kill and bind its legs to the pole.
      aide.stay(thrown, 'idle', kill);
      hunter.go(offset(kill, 0, KNEEL_SIDE_M));
      aide.go(offset(kill, 0, -KNEEL_SIDE_M));
      bind = Math.max(hunter.t, aide.t);
      hunter.stay(bind, 'idle', kill).stay(bind + BIND_MS, 'work', kill);
      aide.stay(bind, 'idle', kill).stay(bind + BIND_MS, 'work', kill);
      hit.pulled = bind + BIND_MS / 2;
      // To the ends of the pole, the hunter in front; lift it and carry it home in step.
      hunter.go(offset(kill, -POLE_HALF_M, 0));
      aide.go(offset(kill, POLE_HALF_M, 0));
      lift = Math.max(hunter.t, aide.t);
      hunter.stay(lift, 'idle', kill).stay(lift + LIFT_MS, 'work', drop);
      aide.stay(lift, 'idle', kill).stay(lift + LIFT_MS, 'work', drop);
      carry = lift + LIFT_MS;
      hunter.go(offset(drop, -POLE_HALF_M, 0), 'pole');
      aide.go(offset(drop, POLE_HALF_M, 0), 'pole');
      put = Math.max(hunter.t, aide.t);
      hunter.stay(put + PUT_MS, 'work', drop);
      aide.stay(put + PUT_MS, 'work', drop);
      laid = put + PUT_MS;
      hunter.go(st.spot);
      aide.go(helper!.spot);
    } else {
      // Alone: butcher the kill where it fell and carry the meat home.
      hunter.go(offset(kill, -1.5, 0));
      bind = hunter.t;
      hunter.stay(bind + BUTCHER_MS, 'work', kill);
      hit.pulled = bind;
      hunter.go(st.spot, 'carry');
    }
    const end = Math.max(hunter.t, aide?.t ?? 0);
    const gone = aide ? laid + DROP_LINGER_MS + PREY_FADE_MS : bind + BUTCHER_MS + PREY_FADE_MS;
    return {
      id: `${st.f.id}:${k}`,
      spot: st.s,
      camp: st.home.camp,
      hunter: st.f.id,
      helper: helper?.f.id,
      start,
      end,
      lat: deg(st.home.lat),
      lon: deg(st.home.lon),
      kind: PREY_KINDS[hash32(st.f.id, k, 79) % PREY_KINDS.length]!,
      out,
      entry,
      arrive,
      herd,
      graze,
      kill,
      drop,
      alert,
      killed,
      bind,
      lift,
      carry,
      put,
      laid,
      gone,
      flights,
      legs: new Map([
        [st.f.id, hunter.legs],
        ...(aide ? [[helper!.f.id, aide.legs] as const] : []),
      ]),
    };
  }

  /** The hunted animal, the spears away from the hand and the pole of a hunt at a clock time. */
  function huntProps(h: Hunt, ms: number): void {
    if (ms < h.start || ms >= h.gone) return;
    const base = { id: h.id, kind: h.kind, lat: h.lat, lon: h.lon };
    const inward = { dirX: -h.out.dirX, dirZ: -h.out.dirZ };
    const sideOn = { dirX: -h.out.dirZ, dirZ: h.out.dirX };
    const fadeIn = Math.min(1, (ms - h.start) / PREY_FADE_MS);
    const fadeOut = Math.min(1, (h.gone - ms) / PREY_FADE_MS);
    const visibility = Math.min(fadeIn, fadeOut);
    const t = (from: number, to: number) => Math.min(1, Math.max(0, (ms - from) / (to - from)));
    const lerp = (a: Pt, b: Pt, f: number) => ({
      x: a.x + (b.x - a.x) * f,
      z: a.z + (b.z - a.z) * f,
    });
    let prey: PreyPose;
    if (ms < h.arrive)
      // Out of the trees and in to graze.
      prey = {
        ...base,
        ...lerp(h.entry, h.graze, t(h.start + PREY_FADE_MS, h.arrive)),
        ...inward,
        clip: 'walk',
        clipMs: ms - h.start,
        visibility,
      };
    else if (ms < h.alert && ms < h.killed)
      // Grazing side on to the camp until the spear comes.
      prey = { ...base, ...h.graze, ...sideOn, clip: 'idle', clipMs: ms - h.arrive, visibility };
    else if (h.alert < Infinity && ms < h.alert + BOLT_MS)
      prey = {
        ...base,
        ...lerp(h.graze, h.kill, t(h.alert, h.alert + BOLT_MS)),
        ...h.out,
        clip: 'run',
        clipMs: ms - h.alert,
        visibility,
      };
    else if (ms < h.killed)
      // Bolted from the missed spear; standing alert, looking back.
      prey = { ...base, ...h.kill, ...inward, clip: 'idle', clipMs: ms - h.alert, visibility };
    else if (ms < h.bind || h.helper === undefined)
      prey = { ...base, ...h.kill, ...sideOn, clip: 'fall', clipMs: ms - h.killed, visibility };
    else if (ms < h.carry)
      prey = { ...base, ...h.kill, ...inward, clip: 'bound', clipMs: ms - h.bind, visibility };
    else if (ms < h.put)
      prey = {
        ...base,
        ...lerp(h.kill, h.drop, t(h.carry, h.put)),
        ...inward,
        clip: 'hung',
        clipMs: ms - h.carry,
        visibility,
      };
    else prey = { ...base, ...h.drop, ...inward, clip: 'bound', clipMs: BIND_MS * 10, visibility };
    scene.prey.push(prey);
    // The rest of the herd: in beside it, grazing, then back to the trees once a spear lands.
    const landed = h.flights[0]!.release + FLIGHT_MS;
    h.herd.forEach((c, n) => {
      const id = `${h.id}:${n}`;
      const fled =
        landed +
        Math.ceil(
          Math.sqrt((c.graze.x - c.entry.x) ** 2 + (c.graze.z - c.entry.z) ** 2) / PACE.run,
        );
      if (ms >= fled + PREY_FADE_MS) return;
      const seen = Math.min(fadeIn, Math.min(1, (fled + PREY_FADE_MS - ms) / PREY_FADE_MS));
      const herdBase = { ...base, id };
      if (ms < h.arrive)
        scene.prey.push({
          ...herdBase,
          ...lerp(c.entry, c.graze, t(h.start + PREY_FADE_MS, h.arrive)),
          ...inward,
          clip: 'walk',
          clipMs: ms - h.start + 137 * n,
          visibility: seen,
        });
      else if (ms < landed)
        scene.prey.push({
          ...herdBase,
          ...c.graze,
          ...sideOn,
          clip: 'idle',
          clipMs: ms - h.arrive + 911 * n,
          visibility: seen,
        });
      else
        scene.prey.push({
          ...herdBase,
          ...lerp(c.graze, c.entry, t(landed, fled)),
          ...h.out,
          clip: 'run',
          clipMs: ms - landed,
          visibility: seen,
        });
    });
    // The trees make way along the hunter's lane while the hunt is on (as for the animals,
    // wildlife.md section 4), so trees beyond the camp's clearing never hide it.
    for (const d of [DROP_M + 4, (DROP_M + PREY_FALL_M) / 2, PREY_FALL_M - 2])
      scene.clearings.push({
        lat: h.lat,
        lon: h.lon,
        ...outingPoint(h.spot, h.camp, d),
        km: HUNT_CLEARING_KM,
        amount: visibility,
        felling: ms < h.end,
      });

    // The spears: in the air, stuck in the animal or the ground, or back in the hand.
    h.flights.forEach((fl, n) => {
      const land = fl.release + FLIGHT_MS;
      if (ms < fl.release || ms >= fl.pulled) return;
      const dist = Math.sqrt((fl.to.x - fl.from.x) ** 2 + (fl.to.z - fl.from.z) ** 2);
      const way = towards(fl.from.x, fl.from.z, fl.to.x, fl.to.z);
      const id = `${h.id}:${n}`;
      if (ms < land) {
        // At the figures' scale: three layout metres to a life-size one.
        const life = dist / 3;
        const f = (ms - fl.release) / FLIGHT_MS;
        const end = fl.hit ? HIT_H : 0;
        const arc = SPEAR_ARC * life;
        const height = HAND_H + (end - HAND_H) * f + 4 * f * (1 - f) * arc;
        const climb = end - HAND_H + 4 * arc * (1 - 2 * f);
        scene.spears.push({
          id,
          lat: h.lat,
          lon: h.lon,
          ...lerp(fl.from, fl.to, f),
          ...way,
          height,
          slope: climb / life,
        });
      } else {
        // Stuck: in the grass, slanting down from where it came; or in the animal, sinking
        // with it as it falls.
        const sink = fl.hit ? Math.min(1, (ms - land) / 1000) : 0;
        const back = 0.5;
        scene.spears.push({
          id,
          lat: h.lat,
          lon: h.lon,
          x: fl.to.x - way.dirX * back,
          z: fl.to.z - way.dirZ * back,
          ...way,
          height: fl.hit ? HIT_H - 0.45 * sink : 0.55,
          slope: fl.hit ? -0.5 - 0.3 * sink : -1.3,
        });
      }
    });

    // The pole: laid along the bound legs, lifted onto the shoulders, carried, laid down.
    if (h.helper === undefined || ms < h.bind + BIND_MS / 2) return;
    let height = POLE_ON_GROUND_M;
    let at = h.kill;
    if (ms >= h.lift && ms < h.carry)
      height += (POLE_ON_SHOULDERS_M - POLE_ON_GROUND_M) * smoothstep(t(h.lift, h.carry));
    else if (ms >= h.carry && ms < h.put) {
      height = POLE_ON_SHOULDERS_M;
      at = lerp(h.kill, h.drop, t(h.carry, h.put));
    } else if (ms >= h.put) {
      at = h.drop;
      height += (POLE_ON_SHOULDERS_M - POLE_ON_GROUND_M) * (1 - smoothstep(t(h.put, h.laid)));
    }
    scene.poles.push({ id: h.id, lat: h.lat, lon: h.lon, ...at, ...inward, height });
  }

  function poseAt(f: TreeFigure, i: number, ms: number): FigurePose | undefined {
    const home = lodgings.get(f.homes[i]![1]);
    if (!home) return undefined;
    const look = lookOf(f.id);
    const base = { id: f.id, look, lat: deg(home.lat), lon: deg(home.lon) };
    const prev = i > 0 ? lodgings.get(f.homes[i - 1]![1]) : undefined;
    const travel = prev ? walkMs(prev, home) : 0;

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

    const st = stayOf(f, i)!;
    const plan = new Itinerary(st.plan.t, st.plan.at);
    plan.legs.push(...st.plan.legs);
    let unarmed = false;
    let event: CampEvent | undefined;
    if (ms >= st.busy && st.takes) {
      plan.stay(Math.max(st.free, st.busy), 'rest').go(st.takeSpot).stay(st.leave, 'work', st.hut);
    } else if (ms >= st.free) {
      // Turns of the day: the hunts it takes part in, else its own outing, or a rest.
      const k = turnOf(f.id, ms);
      const turnStart = turnStartOf(f.id, k);
      const joined = huntsOf(st, turnStart, turnStart + TURN_MS).sort((a, b) => a.start - b.start);
      const hunt = joined.find((h) => ms < h.end) ?? joined.at(-1);
      const games = hunt ? [] : eventsOf(st, turnStart, turnStart + TURN_MS);
      const game = games.find((e) => ms < e.end) ?? games.at(-1);
      if (hunt) {
        plan.stay(hunt.start, 'rest');
        plan.legs.push(...hunt.legs.get(f.id)!);
        plan.t = hunt.end;
        if (hunt.hunter === f.id)
          unarmed = hunt.flights.some((fl) => ms >= fl.release && ms < fl.pulled);
      } else if (game) {
        plan.stay(game.start, 'rest');
        plan.legs.push(...game.legs.get(f.id)!);
        plan.t = game.end;
        event = game;
      } else {
        const own = soloTurn(st, k);
        if (own.trip && turnStart >= st.free) {
          plan.stay(turnStart, 'rest');
          plan.legs.push(...own.trip.legs);
          plan.t = own.trip.t;
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
    if (leg.prop === 'prop-spit' && !scene.props.some((q) => q.id === `spit:${home.camp}`))
      scene.props.push({
        id: `spit:${home.camp}`,
        kind: 'prop-spit',
        lat: base.lat,
        lon: base.lon,
        x: 0,
        z: 0,
        ...towards(0, 0, p.x, p.z),
      });
    if (leg.clip === 'event' && event) return eventPose(event, f.id, ms, base);
    const motion =
      leg.clip === 'rest'
        ? activity(f.id, ms, look !== 'child')
        : leg.clip === 'inside' || leg.clip === 'event'
          ? { clip: 'idle' as const, clipMs: 0 }
          : { clip: leg.clip, clipMs: ms - (leg.start === -Infinity ? 0 : leg.start) };
    const pose: FigurePose = { ...base, x: p.x, z: p.z, ...face, ...motion };
    if (leg.clip === 'inside') pose.hidden = true;
    if (unarmed) pose.unarmed = true;
    if (
      before &&
      ms - leg.start < BLEND_MS &&
      before.clip !== leg.clip &&
      before.clip !== 'rest' &&
      before.clip !== 'inside' &&
      before.clip !== 'event' &&
      leg.clip !== 'inside'
    )
      pose.from = {
        clip: before.clip,
        clipMs: ms - before.start,
        weight: (ms - leg.start) / BLEND_MS,
      };
    else if (
      before?.clip === 'rest' &&
      ms - leg.start < BLEND_MS &&
      leg.clip !== 'rest' &&
      leg.clip !== 'inside'
    ) {
      const was = activity(f.id, leg.start, look !== 'child').clip;
      if (was !== leg.clip)
        pose.from = { clip: was, clipMs: ms - leg.start, weight: (ms - leg.start) / BLEND_MS };
    }
    return pose;
  }
}

/** A camp event (section 8.1): children's catch or a dance round the fire. */
interface CampEvent {
  id: string;
  kind: 'catch' | 'dance';
  camp: number;
  /** Figure ids, in their order round the ring. */
  members: number[];
  a0: number;
  r: number;
  /** Everyone sets off at start, is in place at begin, stops at stop and is back by end. */
  start: number;
  begin: number;
  stop: number;
  end: number;
  legs: Map<number, Leg[]>;
}

/** Catch is played at this share of a full run. */
const CATCH_PACE_SHARE = 0.6;

/** Member i's place on the ring at a share of its own turning (radians already run). */
function ringPoint(ev: CampEvent, i: number, turned: number): Pt {
  const a = ev.a0 + (2 * Math.PI * i) / ev.members.length + turned;
  return { x: ev.r * detCos(a), z: ev.r * detSin(a) };
}

/**
 * Where member i is at a clock time while the event runs: dancers turn slowly round the
 * fire; in catch everyone runs round the ring, and in each chase "it" runs on ahead along
 * the ring to catch the next and drops back into its place, so nobody crosses the fire.
 */
function eventPoint(ev: CampEvent, i: number, ms: number): Pt {
  const tau = Math.min(Math.max(0, ms - ev.begin), ev.stop - ev.begin);
  const n = ev.members.length;
  if (ev.kind === 'dance') return ringPoint(ev, i, (tau * PACE.walk * 0.12) / ev.r);
  const turned = (tau * PACE.run * CATCH_PACE_SHARE) / ev.r;
  const j = Math.floor(tau / CHASE_MS);
  const u = (tau - j * CHASE_MS) / CHASE_MS;
  if (j % n !== i) return ringPoint(ev, i, turned);
  const ahead = (2 * Math.PI) / n;
  const s = u < 0.7 ? smoothstep(u / 0.7) : 1 - smoothstep((u - 0.7) / 0.3);
  return ringPoint(ev, i, turned + s * ahead);
}

/** A place a camp stands (section 8.1): its time span, tree cover and the founding times. */
interface Place {
  camp: number;
  lat: number;
  lon: number;
  from: number;
  to: number;
  wood: number;
  /** Its first lodging, whose builder lights the fire. */
  first: TreeLodging;
  fellEnd: number;
  litStart: number;
  litEnd: number;
}

/** Where a lodging's drying rack stands: on the ring of lodgings, a little round from it. */
function rackSpot(l: TreeLodging): Pt {
  const p = lodgingSpot(l);
  const [c, sn] = [detCos(RACK_TURN), detSin(RACK_TURN)];
  return { x: p.x * c - p.z * sn, z: p.x * sn + p.z * c };
}

/** Where a figure kneels to light the fire: beside the hearth, on a side of its own. */
function lightSpot(id: number): Pt {
  const a = hash01(id, 109) * 2 * Math.PI;
  return { x: LIGHT_M * detCos(a), z: LIGHT_M * detSin(a) };
}

/** A spear's flight in a hunt: from the hand to the animal or the grass, and when it is pulled out. */
interface Flight {
  from: Pt;
  to: Pt;
  release: number;
  hit: boolean;
  pulled: number;
}

/** A hunt (section 8.1): who takes part, the places and the moments of its steps. */
interface Hunt {
  id: string;
  /** The hunter's spot at the hearth and the camp, whose lane the hunt follows. */
  spot: number;
  camp: number;
  hunter: number;
  helper: number | undefined;
  start: number;
  end: number;
  lat: number;
  lon: number;
  kind: (typeof PREY_KINDS)[number];
  /** The hunter's lane, out from the hearth. */
  out: { dirX: number; dirZ: number };
  /** Where the hunted animal comes out of the trees, and when it has walked in to graze. */
  entry: Pt;
  arrive: number;
  /** One or two of its herd, which walk in beside it and bolt back when the spear lands. */
  herd: { entry: Pt; graze: Pt }[];
  graze: Pt;
  kill: Pt;
  drop: Pt;
  /** When a missed spear lands and the animal bolts (Infinity without a miss). */
  alert: number;
  killed: number;
  bind: number;
  lift: number;
  carry: number;
  put: number;
  laid: number;
  /** When the animal has faded away. */
  gone: number;
  flights: Flight[];
  legs: Map<number, Leg[]>;
}

const smoothstep = (x: number) => x * x * (3 - 2 * x);
