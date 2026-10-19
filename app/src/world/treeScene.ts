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
const PACE: Record<'walk' | 'run' | 'carry' | 'pole', number> = {
  walk: (WALK_M_PER_S * 3 * TEMPO) / 1000,
  run: (RUN_M_PER_S * 3 * TEMPO) / 1000,
  carry: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
  pole: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
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
const DROP_LINGER_MS = Math.round(9000 / TEMPO);
/** Trees make way this far round points of a hunt's lane, in drawn kilometres. */
const HUNT_CLEARING_KM = 9 * LAYOUT_KM_PER_M;

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
export type TreeClip = 'idle' | 'work' | 'knap' | 'walk' | 'run' | 'carry' | 'throw' | 'pole';

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
}

export type PreyClip = 'idle' | 'run' | 'fall' | 'bound' | 'hung';

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
  go(to: Pt, clip: 'walk' | 'run' | 'carry' | 'pole' = 'walk'): this {
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

  const scene: TreeScene = {
    figures: [],
    prey: [],
    spears: [],
    poles: [],
    lodgings: [],
    hearths: [],
    clearings: [],
  };
  // Stays and hunts worked out this frame, by figure and home, and by hunter and turn.
  const stays = new Map<string, Stay | undefined>();
  const hunts = new Map<string, Hunt | undefined>();
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
    const go = sure === 'stroll' && room < 13 ? 'rest' : sure;
    const camp = st.home.camp;
    const trip = new Itinerary(turnStart, st.spot);
    if (go === 'gather') {
      const far = outingPoint(st.s, camp, GATHER_M);
      trip.go(far).stay(trip.t + GATHER_MS, 'work', { x: far.x * 2, z: far.z * 2 });
      trip.go(st.spot, 'carry');
    } else if (go === 'stroll') {
      const far = outingPoint(st.s, camp, 13);
      trip
        .go(far)
        .stay(trip.t + LOOK_MS, 'idle', { x: far.x * 2, z: far.z * 2 })
        .go(st.spot);
    } else return { go };
    return trip.t <= Math.min(st.busy, turnStart + TURN_MS) ? { go, trip } : { go: 'rest' };
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
      const helpers = chunk.figures
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
    for (const g of chunk.figures) {
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
    for (const g of chunk.figures) {
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
    const hunter = new Itinerary(start, st.spot).go(lane(PREY_GRAZE_M - THROW_GAP_M));
    const aide =
      helper && new Itinerary(start, helper.spot).go(lane(PREY_GRAZE_M - THROW_GAP_M - 3));
    const ready = Math.max(hunter.t, aide?.t ?? 0);
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
    if (ms < h.alert && ms < h.killed)
      // Grazing side on to the camp until the spear comes.
      prey = { ...base, ...h.graze, ...sideOn, clip: 'idle', clipMs: ms - h.start, visibility };
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
    // The trees make way along the hunter's lane while the hunt is on (as for the animals,
    // wildlife.md section 4), so trees beyond the camp's clearing never hide it.
    for (const d of [DROP_M + 4, (DROP_M + PREY_FALL_M) / 2, PREY_FALL_M])
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
    if (ms >= st.busy && st.takes) {
      plan.stay(Math.max(st.free, st.busy), 'rest').go(st.takeSpot).stay(st.leave, 'work', st.hut);
    } else if (ms >= st.free) {
      // Turns of the day: the hunts it takes part in, else its own outing, or a rest.
      const k = turnOf(f.id, ms);
      const turnStart = turnStartOf(f.id, k);
      const joined = huntsOf(st, turnStart, turnStart + TURN_MS).sort((a, b) => a.start - b.start);
      const hunt = joined.find((h) => ms < h.end) ?? joined.at(-1);
      if (hunt) {
        plan.stay(hunt.start, 'rest');
        plan.legs.push(...hunt.legs.get(f.id)!);
        plan.t = hunt.end;
        if (hunt.hunter === f.id)
          unarmed = hunt.flights.some((fl) => ms >= fl.release && ms < fl.pulled);
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
    const motion =
      leg.clip === 'rest'
        ? activity(f.id, ms, look !== 'child')
        : { clip: leg.clip, clipMs: ms - (leg.start === -Infinity ? 0 : leg.start) };
    const pose: FigurePose = { ...base, x: p.x, z: p.z, ...face, ...motion };
    if (unarmed) pose.unarmed = true;
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
