// What the tree of humankind shows at a clock time (spec humankind.md,
// section 8.1): the hearths and lodgings of the camps standing, and every
// figure at its spot, coming out of its lodging, or walking to a new home.
// A pure function of the tree chunk and the clock time.

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
/** Drawn kilometres a figure covers per millisecond of watching. */
const WALK_KM_PER_MS = (WALK_M_PER_S * FIGURE_KM_PER_M) / 1000;
/**
 * Lodgings stand this far from the hearth, figures between these distances, in layout
 * metres; lodgings are drawn at figure size, three times the layout, so the ring keeps
 * them clear of the people at the hearth.
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
/** The camp layout is drawn three times smaller than the figures (milestone 2, section 5.1). */
export const LAYOUT_KM_PER_M = FIGURE_KM_PER_M / 3;
/** Figures change between idle and work every 20 to 40 seconds of watching. */
const ACTIVITY_MIN_MS = 20_000;
const ACTIVITY_SPREAD_MS = 20_000;
/** Clip changes ease over this long (milestone 2, section 5.3). */
export const BLEND_MS = 350;
/** Lodgings fade out over this long when taken down. */
const FADE_MS = 1500;
/** The band takes this long to build a new lodging, about three years of history. */
export const BUILD_MS = 8000;
/** Builders stand this far from the middle of the lodging they build, in layout metres. */
const BUILD_RING_M = 7;
/** Moves shorter than this are within the camp and not walked. */
const SAME_PLACE_KM = 1;
const KM_PER_DEG = 111.195;

export type FigureLook = 'founder' | 'woman' | 'man' | 'child';
export type TreeClip = 'idle' | 'work' | 'walk';

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
  /** 0 to 1 while it is taken down. */
  fade: number;
  /** 0 to 1 while the band builds it: how far it has risen from the ground. */
  built: number;
}

export interface HearthPose {
  camp: number;
  lat: number;
  lon: number;
}

export interface TreeScene {
  figures: FigurePose[];
  lodgings: LodgingPose[];
  hearths: HearthPose[];
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

/**
 * Where a lodging stands around its hearth, in layout metres, by its slot: the camp's
 * slots are evenly spaced, turned by the camp's hash. Its door faces the hearth.
 */
export function lodgingSpot(l: TreeLodging): { x: number; z: number } {
  const a = (hash01(l.camp, 41) + l.slot / LODGING_SLOTS) * 2 * Math.PI;
  return { x: LODGING_RING_M * detCos(a), z: LODGING_RING_M * detSin(a) };
}

/** A figure's own spot at the hearth of a camp, in layout metres: the inner ring first, then the outer. */
export function figureSpot(spot: number, camp: number): { x: number; z: number } {
  const inner = spot < INNER_SPOTS;
  // Spots fill in an order that keeps a small band spread round the fire.
  const k = (inner ? INNER_ORDER : OUTER_ORDER)[inner ? spot : spot - INNER_SPOTS]!;
  const n = inner ? INNER_SPOTS : OUTER_SPOTS;
  const r = inner ? INNER_M : OUTER_M;
  const a = (hash01(camp, 43) + (k + (inner ? 0 : 0.5)) / n) * 2 * Math.PI;
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
 * Where a builder stands while the band builds a lodging: around it on the hearth's
 * side, the `k`-th of `n` builders, evenly spread so they never overlap.
 */
function buildSpot(k: number, n: number, lodging: TreeLodging): { x: number; z: number } {
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

/** Milliseconds to walk between two points of a camp, in layout metres. */
function strollMs(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const m = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
  return Math.ceil((m * LAYOUT_KM_PER_M) / WALK_KM_PER_MS);
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

  // The builders of each lodging: the figures moving in on the day it is built, by id.
  const builders = new Map<number, number[]>();
  for (const f of chunk.figures)
    for (const [day, id] of f.homes)
      if (lodgings.get(id)?.built === day) builders.set(id, [...(builders.get(id) ?? []), f.id]);

  const scene: TreeScene = { figures: [], lodgings: [], hearths: [] };
  const camps = new Map<number, HearthPose>();
  for (const l of chunk.lodgings) {
    const shown = appears.get(l.id)!;
    const gone = l.gone === NEVER ? Infinity : at(l.gone);
    if (ms < shown || ms >= gone + FADE_MS) continue;
    const spot = lodgingSpot(l);
    const fade = Math.min(1, ms < gone ? 1 : 1 - (ms - gone) / FADE_MS);
    scene.lodgings.push({
      id: l.id,
      kind: l.kind,
      lat: deg(l.lat),
      lon: deg(l.lon),
      ...spot,
      ...towards(spot.x, spot.z, 0, 0),
      fade,
      // Lodgings standing when the timeline starts are already up.
      built: shown <= 0 ? 1 : Math.min(1, (ms - shown) / BUILD_MS),
    });
    if (ms < gone && !camps.has(l.camp))
      camps.set(l.camp, { camp: l.camp, lat: deg(l.lat), lon: deg(l.lon) });
  }
  scene.hearths = [...camps.values()];

  for (const f of chunk.figures) {
    const born = at(f.born);
    if (ms < born || (f.lost !== NEVER && ms >= at(f.lost))) continue;
    let i = 0;
    while (i + 1 < f.homes.length && at(f.homes[i + 1]![0]) <= ms) i++;
    const home = lodgings.get(f.homes[i]![1]);
    if (!home) continue;
    const spot = figureSpot(f.homes[i]![2], home.camp);
    const pose: FigurePose = {
      id: f.id,
      look: lookOf(f.id),
      lat: deg(home.lat),
      lon: deg(home.lon),
      ...spot,
      ...towards(spot.x, spot.z, 0, 0),
      clip: 'idle',
      clipMs: 0,
    };
    const prev = i > 0 ? lodgings.get(f.homes[i - 1]![1]) : undefined;
    const left = at(f.homes[i]![0]);
    const travel = prev ? walkMs(prev, home) : 0;
    // Figures that move in on the day their lodging is built help build it.
    const shown = appears.get(home.id)!;
    const builds = f.homes[i]![0] === home.built && shown > 0;
    const crew = builders.get(home.id) ?? [f.id];
    const work = builds ? buildSpot(crew.indexOf(f.id), crew.length, home) : spot;
    const door = lodgingSpot(home);
    const comeOut = strollMs(door, spot);
    const buildEnd = shown + BUILD_MS;
    const back = builds ? strollMs(work, spot) : 0;
    if (prev && ms < left + travel) {
      // On the way to the new home: across the map, from the old spot to the new one.
      const t = (ms - left) / travel;
      pose.lat = deg(prev.lat) + (deg(home.lat) - deg(prev.lat)) * t;
      pose.lon = deg(prev.lon) + (deg(home.lon) - deg(prev.lon)) * t;
      pose.x = spot.x + (work.x - spot.x) * t;
      pose.z = spot.z + (work.z - spot.z) * t;
      const east = (deg(home.lon) - deg(prev.lon)) * detCos(deg(home.lat) * RAD);
      Object.assign(pose, towards(0, 0, east, deg(home.lat) - deg(prev.lat)));
      pose.clip = 'walk';
      pose.clipMs = ms - left;
    } else if (i === 0 && born > 0 && ms < born + comeOut) {
      // Coming out of the door of its lodging and walking to its spot.
      const t = (ms - born) / comeOut;
      pose.x = door.x + (spot.x - door.x) * t;
      pose.z = door.z + (spot.z - door.z) * t;
      Object.assign(pose, towards(door.x, door.z, spot.x, spot.z));
      pose.clip = 'walk';
      pose.clipMs = ms - born;
    } else if (builds && ms < buildEnd) {
      // Building: at the lodging, facing it, at work; a builder from nearby first walks over.
      const from = prev ? { x: work.x, z: work.z } : spot;
      const reach = prev ? left + travel : left + strollMs(spot, work);
      const hut = door;
      if (ms < reach) {
        const t = (ms - left) / (reach - left);
        pose.x = from.x + (work.x - from.x) * t;
        pose.z = from.z + (work.z - from.z) * t;
        Object.assign(pose, towards(from.x, from.z, work.x, work.z));
        pose.clip = 'walk';
        pose.clipMs = ms - left;
      } else {
        pose.x = work.x;
        pose.z = work.z;
        Object.assign(pose, towards(work.x, work.z, hut.x, hut.z));
        pose.clip = 'work';
        pose.clipMs = ms - reach;
        if (ms - reach < BLEND_MS)
          pose.from = { clip: 'walk', clipMs: ms - left, weight: (ms - reach) / BLEND_MS };
      }
    } else if (builds && ms < buildEnd + back) {
      // The lodging is up: back from it to its own spot by the hearth.
      const t = (ms - buildEnd) / back;
      pose.x = work.x + (spot.x - work.x) * t;
      pose.z = work.z + (spot.z - work.z) * t;
      Object.assign(pose, towards(work.x, work.z, spot.x, spot.z));
      pose.clip = 'walk';
      pose.clipMs = ms - buildEnd;
      if (ms - buildEnd < BLEND_MS)
        pose.from = { clip: 'work', clipMs: ms - shown, weight: (ms - buildEnd) / BLEND_MS };
    } else {
      // Figures there when the timeline starts are already at their spots.
      const arrived = builds
        ? buildEnd + back
        : prev
          ? left + travel
          : born > 0
            ? born + comeOut
            : -BLEND_MS;
      Object.assign(pose, activity(f.id, ms));
      // Ease from walking into standing on arrival.
      if (ms - arrived < BLEND_MS)
        pose.from = {
          clip: 'walk',
          clipMs: ms - (builds ? buildEnd : prev ? left : born),
          weight: (ms - arrived) / BLEND_MS,
        };
    }
    scene.figures.push(pose);
  }
  return scene;
}
