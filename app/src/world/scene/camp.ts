// A camp's layout and everyday life (spec humankind.md section 8.1): the ring of lodgings and
// spots round the hearth, timings of the camp's work, outings' lanes and the camp events' places.

import { hash01, hash32 } from '../../core/hash.ts';
import { detAtan2, detCos, detSin } from '../../core/detmath.ts';
import type { FieldJob } from '../fieldWork.ts';
import { fieldToolOf } from '../farmingOnset.ts';
import type { TreeLodging } from '../tree.ts';
import { TEMPO, type Pt, LAYOUT_KM_PER_M, PACE, smoothstep } from './units.ts';
import type { Outing } from './outings.ts';
import type { FigurePose, TreeClip } from './types.ts';
import type { Leg } from './routes.ts';
import { isNeolithicProfile as isProfile, neolithicProfile } from '../neolithicProfiles.ts';
import { maskReach, MASK_R0 } from '../fieldMask.ts';

/**
 * Lodgings stand this far from the hearth, in layout metres; lodgings are drawn at
 * figure size, three times the layout, so the ring keeps them clear of the people.
 */
export const LODGING_RING_M = 12;

/** Places for lodgings round a hearth, evenly spaced so lodgings never overlap. */
export const LODGING_SLOTS = 5;

/** Spots for figures at a hearth: an inner ring and an outer ring, spaced so figures never overlap. */
export const INNER_SPOTS = 8;

export const INNER_M = 5;

export const OUTER_SPOTS = 12;

export const OUTER_M = 8.5;

export const HEARTH_SPOTS = INNER_SPOTS + OUTER_SPOTS;

export const INNER_ORDER = [0, 4, 2, 6, 1, 5, 3, 7];

export const OUTER_ORDER = [0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11];

/** Paths keep this far from the middle of the hearth, in layout metres, so nobody walks through the fire. */
export const FIRE_CLEAR_M = 3;

/** The threshing floor lies 8 m out through a gap: only where the gap has land that far and a little beyond. */
export const THRESH_ROOM_M = 10;

/** Figures leave and enter a camp at this distance from its hearth, between the people and the lodgings. */
export const GATE_M = 7;

/** The farthest out anyone goes, in layout metres; the build measures land this far out. */
export const MAX_OUTING_M = 50;

/**
 * The build needs land all round a camp spot out to this many layout metres, past the inner
 * ring of people's spots, which a band of three to five never outgrows (peopling.md
 * section 4: coastal camps). Catch, on its wider ring, is played only where the land goes
 * further.
 */
export const CAMP_ROOM_M = INNER_M + 2;

/** Figures change between idle and work every 20 to 40 seconds of life, sped up by TEMPO. */
export const ACTIVITY_MIN_MS = 20_000 / TEMPO;

export const ACTIVITY_SPREAD_MS = Math.round(20_000 / TEMPO);

/** Each figure plans its day in turns of this long: an outing, a stroll or a rest. */
export const TURN_MS = 60_000 / TEMPO;

/** Camp life (section 8.1): how long each activity's work at its place lasts. */
export const FIREWOOD_M = 20;

export const BREAK_MS = Math.round(7200 / TEMPO);

export const FILL_MS = Math.round(5400 / TEMPO);

/** Fishing at the water's edge: watching with the spear raised, and each stab down. */
export const FISH_WATCH_MS = Math.round(5400 / TEMPO);

export const FISH_STAB_MS = Math.round(2400 / TEMPO);

export const SCRAPE_MS = Math.round(14_400 / TEMPO);

/** Skinning a kill, hanging its hide on the rack, and taking a dried one down (section 8.1). */
export const FLAY_MS = Math.round(9000 / TEMPO);

export const HANG_HIDE_MS = Math.round(4800 / TEMPO);

export const TAKE_HIDE_MS = Math.round(4800 / TEMPO);

export const CRACK_MS = Math.round(14_400 / TEMPO);

/** The Neolithic village's work (section 8.5): in the field, at the threshing floor, grinding, shaping and spinning. */
export const FIELD_WORK_MS = Math.round(10_800 / TEMPO);

export const THRESH_MS = Math.round(9_000 / TEMPO);

export const MILK_MS = Math.round(9_000 / TEMPO);

export const GRIND_MS = Math.round(12_600 / TEMPO);

export const SPIN_MS = Math.round(12_600 / TEMPO);

/** The share of a profile's grown-ups' turns spent at their role's work, the rest being the usual outings. */
export const FARM_WORK_SHARE = 0.6;

/** What a worker is shown doing in each job of a field's cycle (weeding is hoeing). */
export const JOB_OUTING: Record<FieldJob, Outing> = {
  till: 'till',
  sow: 'sow',
  weed: 'till',
  reap: 'reap',
};

/** A pen is drawn at this share of its model's ten metres; the herd's animals raise their heads this often. */
export const PEN_SCALE = 0.4;

export const HERD_LOOK_MS = 6_000;

/**
 * The village herd is drawn at this share of life size, in step with the storybook houses and
 * pens (Yang, 2026-10-23): a goat or sheep stands knee-high to a person, cattle waist-high.
 */
export const HERD_SCALE = 0.6;

export const KNAP_POINT_MS = Math.round(10_800 / TEMPO);

export const BIND_POINT_MS = Math.round(7200 / TEMPO);

export const BUTCHER_MEAT_MS = Math.round(7200 / TEMPO);

export const ROAST_MS = Math.round(14_400 / TEMPO);

export const INSIDE_MS = Math.round(14_400 / TEMPO);

/**
 * The layout offset of a figure on its way between camps, on leg `n` at `u` of it and `t` of
 * the whole way: from the old camp's edge to the new camp's when there is one leg, else
 * from the old camp's edge to nothing on the first leg and from nothing to the new camp's
 * edge on the last, so the figure keeps to the route's way in between.
 */
export function edgeOffset(
  c: { exit: Pt; entry: Pt; legs: unknown[] },
  n: number,
  u: number,
  t: number,
): Pt {
  if (c.legs.length === 1)
    return { x: c.exit.x + (c.entry.x - c.exit.x) * t, z: c.exit.z + (c.entry.z - c.exit.z) * t };
  if (n === 0) return { x: c.exit.x * (1 - u), z: c.exit.z * (1 - u) };
  if (n === c.legs.length - 1) return { x: c.entry.x * u, z: c.entry.z * u };
  return { x: 0, z: 0 };
}

/**
 * A band on its way walks as a loose group, not on one line (Yang, 2026-10-20: "multiple
 * people bunched together"): by its spot at the new camp, each walker leaves and comes in
 * GROUP_SIDE_M (layout metres) to one side of the camps' gates, in the middle or to the
 * other side, and walks in rows of three GROUP_BACK_M apart, the rows forming over the first
 * GROUP_FADE of the way and closing up over the last.
 */
export const GROUP_SIDE_M = 2.2;

export const GROUP_BACK_M = 3;

export const GROUP_FADE = 0.1;

/** Canoes on a crossing string out along the way by up to this many layout metres, none beyond its ends. */
export const CANOE_GAP_M = 0.5;

/** Walkers keep within this of the way's line in layout metres on the open way, inside the 15 km a link is checked. */
export const GROUP_WAY_SIDE_M = 0.45;

export function groupOffset(
  p: Pt,
  way: { dirX: number; dirZ: number },
  spot: number,
  t: number,
  km: number,
  side = 0,
  water = false,
  /** The furthest behind its point a walker may be, in layout metres: no further back than its leg's start after a landing. */
  maxBack = Infinity,
): Pt {
  // A canoe keeps to the line of its way, where the water was checked, one behind the other.
  const fade = water ? 1 : Math.max(0, Math.min(1, t / GROUP_FADE, (1 - t) / GROUP_FADE));
  const lim = water ? 0 : GROUP_WAY_SIDE_M;
  // Never further behind than a twentieth of the walk: less than the way covered while the
  // rows form, so nobody walks backwards on a short walk.
  const rows = water ? spot : Math.floor(spot / 3);
  const back = Math.min(
    Math.min(rows * (water ? CANOE_GAP_M : GROUP_BACK_M), (0.05 * km) / LAYOUT_KM_PER_M) * fade,
    maxBack,
  );
  // On the open way walkers close in to within GROUP_WAY_SIDE_M of the line, the strip a
  // link is checked for water (sites.md section 3); they spread out again near the camps.
  const across = p.x * -way.dirZ + p.z * way.dirX + side;
  const capped = Math.max(-lim, Math.min(lim, across));
  const shift = across + (capped - across) * fade - (across - side);
  return {
    x: p.x - way.dirX * back - way.dirZ * shift,
    z: p.z - way.dirZ * back + way.dirX * shift,
  };
}

/** Walks reach a lodging's door this far in front of its middle, before crouching in. */
export const HUT_DOOR_M = 4.8;

/**
 * Camp events (section 8.1): catch and dancing last EVENT_MS once everyone is in place.
 * Children run round a ring CATCH_R from the hearth at a little over half a run, "it"
 * catching the next every CHASE_MS; dancers turn slowly on a ring DANCE_R round the fire.
 */
export const EVENT_MS = Math.round(36_000 / TEMPO);

export const CHASE_MS = Math.round(9000 / TEMPO);

export const CATCH_R = 7;

export const DANCE_R = 4.5;

export const CATCH_SHARE = 1 / 3;

export const DANCE_SHARE = 1 / 6;

/**
 * A lodging's drying rack stands behind it, this far from the hearth, out of every lane,
 * and whoever scrapes a hide works from behind it, facing in (Yang, 2026-10-19: a kill
 * carried through a hide hung out to dry).
 */
export const RACK_R = 18;

/** The scraper stands this far behind the rack, and walks round its end this far along it. */
export const SCRAPE_BACK_M = 2;

export const SCRAPE_SIDE_M = 5.6;

/** Clip changes ease over this long (milestone 2, section 5.3). */
export const BLEND_MS = 350;

/** The band takes this long to build a new lodging, about a year of history. */
export const BUILD_MS = Math.round(8000 / TEMPO);

/** And this long to take one down before it leaves. */
export const TAKE_DOWN_MS = Math.round(5000 / TEMPO);

/** Builders stand this far from the middle of the lodging they build, in layout metres. */
export const BUILD_RING_M = 5;

/**
 * The trees of a place wither over THIN_MS before its band arrives, planned from the tree
 * (sites.md section 6), and grow back over REGROW_MS (about five years) after it leaves.
 */
export const THIN_MS = 10_000;

export const REGROW_MS = 12_000;

/** A new camp (section 8.1): the first builder lights the fire with flint stones for FLINT_MS before building. */
export const FLINT_MS = Math.round(9000 / TEMPO);

/** The lighter kneels this far from the middle of the hearth, just outside the paths' clearance. */
export const LIGHT_M = 3.1;

/** Plants keep this far from a hearth while the camp stands, in drawn kilometres. */
export const CAMP_CLEARING_KM = (LODGING_RING_M + 6) * LAYOUT_KM_PER_M;

/**
 * Wild animals keep this far from a hearth while its camp stands, in drawn kilometres
 * (wildlife.md section 4): the lodgings' ring, a lodging's width and a margin.
 */
export const CAMP_KEEP_OUT_KM = (LODGING_RING_M + 8) * LAYOUT_KM_PER_M;

/**
 * The same around a Neolithic village, whose fields, pen and herd reach about 50 layout metres
 * from the hearth (section 8.5); wild animals stay out of that too.
 */
export const VILLAGE_KEEP_OUT_KM = 50 * LAYOUT_KM_PER_M;

/**
 * Sites from this id on have a compact camp, and from MINIMAL_SITE on a minimal one (sites.md
 * section 2): land too small for a full camp where a band must stand, so its huts stand closer
 * to the fire, its people on one ring, with no drying racks and no catch. The camp's own id
 * tells, so the scene needs nothing else.
 */
export const COMPACT_SITE = 1_000_000;

export const MINIMAL_SITE = 2_000_000;

export const isCompact = (camp: number): boolean => camp >= COMPACT_SITE;

/** A camp's layout, in layout metres: hut ring, people's ring, door, core, gate, dancers, builders, and people at most. */
export interface Layout {
  ring: number;
  inner: number;
  door: number;
  core: number;
  gate: number;
  dance: number;
  build: number;
  people: number;
  /** Walks keep this far from a lodging's middle. */
  clear: number;
  /** Rings round a lodging's middle, out to its door, that must be dry, in layout metres. */
  floor: number[];
}

export const FULL: Layout = {
  ring: LODGING_RING_M,
  inner: INNER_M,
  door: HUT_DOOR_M,
  core: OUTER_M + 1,
  gate: GATE_M,
  dance: DANCE_R,
  build: BUILD_RING_M,
  people: INNER_SPOTS + OUTER_SPOTS,
  clear: 4.6,
  floor: [1, 2, 3, 4, HUT_DOOR_M],
};

export const COMPACT: Layout = {
  ring: 9,
  inner: 3.8,
  door: 4.6,
  core: 5,
  gate: 4.5,
  dance: 3.4,
  build: BUILD_RING_M,
  people: INNER_SPOTS,
  clear: 4.6,
  floor: [1, 2, 3, 4, HUT_DOOR_M],
};

/** A minimal camp has one small brush shelter (shelter-small-hut, about 1.7 m across) near its fire. */
export const MINIMAL: Layout = {
  ring: 6.2,
  inner: 3.1,
  door: 3.1,
  core: 3.6,
  gate: 3.4,
  dance: 3.1,
  build: 3.2,
  people: 4,
  clear: 3,
  floor: [0.7, 1.4, 2.1, 2.6, 3.1],
};

/** The lodging of every minimal camp, whatever the culture. */
export const MINIMAL_LODGING = 'shelter-small-hut';

export const layoutOf = (camp: number): Layout =>
  camp >= MINIMAL_SITE ? MINIMAL : camp >= COMPACT_SITE ? COMPACT : FULL;

/** The ring of lodging places round a camp's hearth. */
export const ringOf = (camp: number): number => layoutOf(camp).ring;

export const doorM = (camp: number) => layoutOf(camp).door;

export const gateM = (camp: number) => layoutOf(camp).gate;

/** The turn of a camp's ring of places, by its hash. */
export const campTurn = (camp: number) => hash01(camp, 41);

/** The point of a lodging slot round a camp's hearth, in layout metres: evenly spaced, turned by the camp's hash. */
export function slotPoint(camp: number, slot: number): Pt {
  const a = (campTurn(camp) + slot / LODGING_SLOTS) * 2 * Math.PI;
  return { x: ringOf(camp) * detCos(a), z: ringOf(camp) * detSin(a) };
}

/** Where a lodging stands around its hearth, in layout metres, by its slot. Its door faces the hearth. */
export function lodgingSpot(l: TreeLodging): Pt {
  return villageHouse(l)?.at ?? slotPoint(l.camp, l.slot);
}

/** Every lodging model is drawn at most this many figure metres long (humankind.md section 8.1). */
export const LODGING_MAX_M = 2.7;

/** Layout metres per figure metre: figures are drawn three times larger than the layout. */
const FIGURE_TO_LAYOUT = 3;

/** Half a village house's depth from its middle to its door, in layout metres. */
function houseDepth(l: TreeLodging, lengthM: number): number {
  return (
    (isProfile(l.culture) && neolithicProfile(l.culture).layout === 'rows' ? 0.2 : 0.5) * lengthM
  );
}

/** A village's houses keep this far out from its middle, beyond the people's spots (layout metres): a metre past the outer spots. */
export function greenOf(camp: number): number {
  return isCompact(camp) ? layoutOf(camp).inner + 3 : OUTER_M + 1;
}

/** The space between neighbouring houses of a row or block, in layout metres. */
const HOUSE_GAP_M = 3;

/** A village house's place: its middle, facing, length, long axis and half its depth across it, in layout metres. */
export interface HousePlace {
  at: Pt;
  dir: Pt;
  lengthM: number;
  axis: Pt;
  deep: number;
}

/**
 * A Neolithic village's house laid out as its culture builds them (neolithic/villages.md
 * section 5), or undefined for a camp's lodging, a ring layout (`pits`) or a place whose ground
 * does not take it: then it stands on the ring. Its middle and facing, its door towards the
 * village's green, and how long it is drawn, in layout metres.
 */
function housePlace(
  camp: number,
  culture: string,
  mask: string,
  k: number,
): HousePlace | undefined {
  const profile = neolithicProfile(culture);
  if (profile.layout === 'pits') return undefined;
  const lengthM = (profile.houseM ?? LODGING_MAX_M) * FIGURE_TO_LAYOUT;
  // A tight village's houses stand closer, beyond its smaller ring of people (villages.md
  // section 3.1): its green just outside its outer spots, as a full village's is.
  const green = greenOf(camp);
  const turn = campTurn(camp) * 2 * Math.PI;
  // From the green out towards the houses; the LBK's longhouses run north-west to south-east.
  const out: Pt =
    profile.layout === 'rows'
      ? { x: Math.SQRT1_2, z: Math.SQRT1_2 }
      : { x: detCos(turn), z: detSin(turn) };
  const side: Pt = { x: -out.z, z: out.x };
  let at: Pt;
  let dir: Pt = { x: -out.x, z: -out.z };
  // The house's long axis: the LBK model is long across its door, the others along it.
  let axis: Pt = dir;
  if (profile.layout === 'rows') {
    // The longhouse north-east of the green, its long side to it, its long axis north-west to
    // south-east as excavated (Coudart 1998); a second, while one is rebuilt, behind it.
    const width = lengthM * 0.4;
    const from = green + width / 2 + k * (width + 1);
    at = { x: out.x * from, z: out.z * from };
    axis = side;
  } else if (profile.layout === 'stilts') {
    // Side by side in a row off the green, the long sides together, the doors towards it.
    const width = lengthM * 0.7;
    const from = green + lengthM / 2;
    const n = housePlaces(culture);
    const across = (k - (n - 1) / 2) * (width + HOUSE_GAP_M);
    at = { x: out.x * from + side.x * across, z: out.z * from + side.z * across };
  } else if (profile.layout === 'cluster') {
    // Wall to wall in a block of three by two, entered from the roofs.
    const size = lengthM * 1.02;
    const col = (k % 3) - 1;
    const row = Math.floor(k / 3);
    const from = green + size / 2 + row * size;
    at = { x: out.x * from + side.x * col * size, z: out.z * from + side.z * col * size };
  } else {
    // A hamlet: scattered round its yard, a little off any ring, turned towards the yard.
    // Less turned off its place on a tight village's shorter way round, so no two meet.
    const jitter = isCompact(camp) ? 0.25 : 0.6;
    const a = turn + (k / LODGING_SLOTS) * 2 * Math.PI + (hash01(camp, k, 301) - 0.5) * jitter;
    const r = green + 2.5 + 4 * hash01(camp, k, 303);
    at = { x: r * detCos(a), z: r * detSin(a) };
    dir = { x: -detCos(a), z: -detSin(a) };
  }
  // Its ground: on land its people can walk to, not on a cliff (the land mask; neolithic/villages.md
  // section 6). The fields keep out of the houses' way instead (memo.ts, buildVillage).
  const half = lengthM / 2;
  // Its depth across the long axis: the longhouse is narrow, the others about square.
  const deep = (profile.layout === 'rows' ? 0.2 : 0.25) * lengthM;
  for (const [u, v] of [
    [0, 0],
    [half, 0],
    [-half, 0],
    [0, deep],
    [0, -deep],
  ] as const) {
    const x = at.x + axis.x * u - axis.z * v;
    const z = at.z + axis.z * u + axis.x * v;
    const r = Math.sqrt(x * x + z * z);
    if (r >= MASK_R0 && !maskReach(mask, x, z)) return undefined;
  }
  return { at, dir, lengthM, axis, deep };
}

/** The village layout of each camp, culture and land mask: every house place, or null for the ring. */
const villagePlaces = new Map<string, (HousePlace | undefined)[] | null>();

/**
 * A Neolithic village's house laid out as its culture builds them (neolithic/villages.md
 * section 5): its middle, its facing (the door towards the village's green) and how long it is
 * drawn, in layout metres. Undefined for a camp's lodging, a ring layout (`pits`), or a village
 * where the ground does not take every house of the layout: then all stand on the ring, so the
 * two never mix.
 */
export function villageHouse(l: TreeLodging): HousePlace | undefined {
  if (!isProfile(l.culture) || !l.fieldLand) return undefined;
  const key = `${l.camp}|${l.culture}|${l.fieldLand}`;
  let places = villagePlaces.get(key);
  if (places === undefined) {
    if (villagePlaces.size > 2_000) villagePlaces.clear();
    const all = Array.from({ length: housePlaces(l.culture) }, (_, k) =>
      housePlace(l.camp, l.culture!, l.fieldLand!, k),
    );
    places = neolithicProfile(l.culture).layout === 'pits' || all.some((p) => !p) ? null : all;
    villagePlaces.set(key, places);
  }
  return places?.[l.slot % places.length];
}

/**
 * How many places a village's layout has: one per lodging slot, or two where one house holds the
 * whole village (the longhouse, `houseCapacity`): the house, and its next while it is rebuilt.
 */
export function housePlaces(culture: string): number {
  return neolithicProfile(culture).houseCapacity ? 2 : LODGING_SLOTS;
}

/** The direction out from the hearth through the middle of a gap between the lodging slots. */
export function gapDirection(camp: number, gap: number): Pt {
  const a = (campTurn(camp) + (gap + 0.5) / LODGING_SLOTS) * 2 * Math.PI;
  return { x: detCos(a), z: detSin(a) };
}

/**
 * Whether a layout point lies in one of a camp's outing lanes (the five gaps between its
 * lodgings and the lanes of the people's outings in them, section 8.1): the fields of a
 * village keep clear of them so no outing crosses a crop.
 */
export function inOutingLane(camp: number, x: number, z: number): boolean {
  const r = Math.sqrt(x * x + z * z);
  if (r < 1) return false;
  const half = 0.17 + 2.5 / r;
  const a = detAtan2(z, x) / (2 * Math.PI) - campTurn(camp);
  for (let g = 0; g < LODGING_SLOTS; g++) {
    let d = a - (g + 0.5) / LODGING_SLOTS;
    d -= Math.round(d);
    if (Math.abs(d) * 2 * Math.PI < half) return true;
  }
  return false;
}

/** A figure's own spot at the hearth of a camp, in layout metres: the inner ring first, then the outer. */
export function figureSpot(spot: number, camp: number): Pt {
  const inner = spot < INNER_SPOTS;
  // Spots fill in an order that keeps a small band spread round the fire.
  const k = (inner ? INNER_ORDER : OUTER_ORDER)[inner ? spot : spot - INNER_SPOTS]!;
  const n = inner ? INNER_SPOTS : OUTER_SPOTS;
  const r = isCompact(camp) ? layoutOf(camp).inner + (inner ? 0 : 2) : inner ? INNER_M : OUTER_M;
  const a = (hash01(camp, 43) + (k + (inner ? 0 : 0.5)) / n) * 2 * Math.PI;
  return { x: r * detCos(a), z: r * detSin(a) };
}

/**
 * A point out from the hearth through a gap between the lodgings, for a figure's own
 * outings: the gap and the lane in it come from its spot, which no one else in the camp
 * has, so two figures never head for the same place.
 */
export function outingPoint(spot: number, camp: number, distance: number): Pt {
  const lane = Math.floor(spot / LODGING_SLOTS);
  const a =
    (campTurn(camp) + ((spot % LODGING_SLOTS) + 0.5) / LODGING_SLOTS) * 2 * Math.PI +
    (lane - 1.5) * 0.1;
  const r = distance + 3.5 * lane;
  return { x: r * detCos(a), z: r * detSin(a) };
}

/** The farthest a figure's outings may go from the hearth: the land in its gap, less its lane. */
export function outingRoom(spot: number, home: TreeLodging): number {
  return (home.reach[spot % LODGING_SLOTS] ?? 0) - 3.5 * Math.floor(spot / LODGING_SLOTS);
}

/** Unit vector from (x0, z0) to (x1, z1), or the fallback when they meet. */
export function towards(x0: number, z0: number, x1: number, z1: number, fx = 1, fz = 0) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dz * dz);
  return len < 1e-9 ? { dirX: fx, dirZ: fz } : { dirX: dx / len, dirZ: dz / len };
}

/**
 * What a figure does at its spot by the fire at a clock time, with the clip it eases out of:
 * stands, tends the fire, or (grown-ups) knaps a stone hand axe.
 */
export function activity(
  id: number,
  ms: number,
  knaps: boolean,
  village = false,
): Pick<FigurePose, 'clip' | 'clipMs' | 'from'> {
  const period = ACTIVITY_MIN_MS + (hash32(id, 53) % ACTIVITY_SPREAD_MS);
  const shifted = ms + (hash32(id, 59) % period);
  const k = Math.floor(shifted / period);
  // Standing a quarter of the time, sitting a quarter, tending the fire a fifth, cracking
  // nuts a tenth, telling a story a twelfth and knapping an eighth (humankind.md section 8.1).
  const clipOf = (n: number): TreeClip => {
    const h = hash32(id, n, 61) % 120;
    // A village has no fire to tend and no nuts to crack by it (Yang, 2026-10-24).
    if (village && h >= 60 && h < 96) return h < 78 ? 'idle' : 'sit';
    if (h < 30) return 'idle';
    if (h < 60) return 'sit';
    if (h < 84) return 'work';
    if (h < 96) return 'crack';
    if (h < 106) return 'point';
    // A villager makes tools by grinding and polishing a stone axe, not knapping one
    // (neolithic/villages.md section 8).
    if (village) return knaps ? 'grind' : 'sit';
    return knaps ? 'knap' : 'sit';
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

/**
 * Where a figure stands while the band builds or takes down a lodging: around it on the
 * hearth's side, the `k`-th of `n`, evenly spread so they never overlap.
 */
export function buildSpot(k: number, n: number, lodging: TreeLodging): Pt {
  const house = villageHouse(lodging);
  if (house) {
    // Round the door side of a village's house, clear of its walls.
    const a = n > 1 ? (k / (n - 1) - 0.5) * 0.75 * Math.PI : 0;
    const d = houseDepth(lodging, house.lengthM) + 2;
    const ux = house.dir.x * detCos(a) - house.dir.z * detSin(a);
    const uz = house.dir.z * detCos(a) + house.dir.x * detSin(a);
    return { x: house.at.x + d * ux, z: house.at.z + d * uz };
  }
  const hut = lodgingSpot(lodging);
  const toHearth = Math.sqrt(hut.x * hut.x + hut.z * hut.z);
  const a = n > 1 ? (k / (n - 1) - 0.5) * 0.75 * Math.PI : 0;
  const c = detCos(a);
  const sn = detSin(a);
  // On the hearth's side, or behind the hut at a compact camp, whose people stand close by.
  const side = isCompact(lodging.camp) ? 1 : -1;
  const ux = (side * hut.x) / toHearth;
  const uz = (side * hut.z) / toHearth;
  return {
    x: hut.x + layoutOf(lodging.camp).build * (ux * c - uz * sn),
    z: hut.z + layoutOf(lodging.camp).build * (ux * sn + uz * c),
  };
}

/** The tool each farm clip holds (neolithic/person-clips.md); milking holds none. */
export const CLIP_TOOL: Partial<Record<Leg['clip'], string>> = {
  till: 'hoe',
  sow: 'basket',
  reap: 'sickle',
  thresh: 'crook',
  grind: 'grinding-stone',
  shape: 'pot',
  spin: 'spindle',
  milk: 'milk',
};

/**
 * The tool of the farm work in the trip the leg `n` belongs to (the legs between two rests),
 * found ahead first, so it is in the hand on the walk out and no tool pops in at the field;
 * 'milk' says the hand is empty. Undefined where the trip has no farm work.
 */
export function outingTool(legs: Leg[], n: number, till: string): string | undefined {
  const toolOf = (clip: Leg['clip']) => (clip === 'till' ? till : CLIP_TOOL[clip]);
  for (let i = n; i < legs.length && legs[i]!.clip !== 'rest'; i++) {
    const t = toolOf(legs[i]!.clip);
    if (t) return t;
  }
  for (let i = n - 1; i >= 0 && legs[i]!.clip !== 'rest'; i--) {
    const t = toolOf(legs[i]!.clip);
    if (t) return t;
  }
  return undefined;
}

/** What tilling holds: the digging stick where the profile has no hoe (farmingOnset.ts), else the hoe. */
export function tillTool(culture: string | undefined): string {
  return isProfile(culture) && fieldToolOf(culture, 0) === 'digging-stick'
    ? 'digging-stick'
    : 'hoe';
}

/** A camp event (section 8.1): children's catch or a dance round the fire. */
export interface CampEvent {
  id: string;
  /** Catch and dancing, or a scene's session (section 8.2). */
  kind: 'catch' | 'dance' | 'paint' | 'burial' | 'raise' | 'celebrate' | 'haul';
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
  /** At a scene: where each member stands, and what they face. */
  stands?: Pt[];
  face?: Pt;
  /**
   * A visit: the host camp's place, the visiting camp's offset from it, and for each visitor
   * when it leaves home, reaches the host's gate, leaves the gate again and is home.
   */
  host?: {
    lat: number;
    lon: number;
    off: Pt;
    ramps: Map<number, [number, number, number, number]>;
  };
}

/** Catch is played at this share of a full run. */
export const CATCH_PACE_SHARE = 0.6;

/** Member i's place on the ring at a share of its own turning (radians already run). */
export function ringPoint(ev: CampEvent, i: number, turned: number): Pt {
  const a = ev.a0 + (2 * Math.PI * i) / ev.members.length + turned;
  return { x: ev.r * detCos(a), z: ev.r * detSin(a) };
}

/**
 * Where member i is at a clock time while the event runs: dancers turn slowly round the
 * fire; in catch everyone runs round the ring, and in each chase "it" runs on ahead along
 * the ring to catch the next and drops back into its place, so nobody crosses the fire.
 */
export function eventPoint(ev: CampEvent, i: number, ms: number): Pt {
  if (ev.stands) return ev.stands[i]!;
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
export interface Place {
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
  /** When its last hunter-gatherer lodging goes: the fire burns until then; a village has none (Yang, 2026-10-24). */
  fireTo: number;
}

/** Where walks reach a lodging's door: outside its walls, on the hearth side. */
export function doorOf(l: TreeLodging): Pt {
  // A village's house: in front of its door, whichever way it faces (neolithic/villages.md section 5).
  const house = villageHouse(l);
  if (house) {
    const d = houseDepth(l, house.lengthM) + 1;
    return { x: house.at.x + house.dir.x * d, z: house.at.z + house.dir.z * d };
  }
  const p = lodgingSpot(l);
  const k = 1 - doorM(l.camp) / ringOf(l.camp);
  return { x: p.x * k, z: p.z * k };
}

/** Where the drying rack of a lodging slot stands: behind the lodging, out of the lanes. */
/**
 * Whether a lodging place of a camp has a drying rack behind it: about one in three, by hash,
 * never at a compact camp (section 8.1; Yang, 2026-10-19: "every camp has hides hung up.
 * that's weird. let's only have some").
 */
export function hasRack(camp: number, slot: number): boolean {
  return !isCompact(camp) && hash32(camp, slot, 151) % 3 === 0;
}

/** Whether a lodging's rack and the scraper behind it stand on land: both gaps beside its place reach that far. */
export function rackOnLand(l: TreeLodging): boolean {
  // Farmers no longer hang hides up to dry (neolithic/villages.md section 8).
  if (isProfile(l.culture)) return false;
  const near = Math.min(
    l.reach[l.slot] ?? 0,
    l.reach[(l.slot + LODGING_SLOTS - 1) % LODGING_SLOTS] ?? 0,
  );
  return hasRack(l.camp, l.slot) && near >= RACK_R + SCRAPE_BACK_M + SCRAPE_SIDE_M + 1;
}

export function rackAt(camp: number, slot: number): Pt {
  const p = slotPoint(camp, slot);
  return { x: (p.x * RACK_R) / LODGING_RING_M, z: (p.z * RACK_R) / LODGING_RING_M };
}

/** Where a figure stands behind a lodging's rack, the way round its end to there, and the rack. */
export function rackSides(l: TreeLodging): { side: Pt; behind: Pt; rack: Pt } {
  const rack = rackSpot(l);
  const [ux, uz] = [rack.x / RACK_R, rack.z / RACK_R];
  const behind = { x: rack.x + ux * SCRAPE_BACK_M, z: rack.z + uz * SCRAPE_BACK_M };
  const side = { x: behind.x - uz * SCRAPE_SIDE_M, z: behind.z + ux * SCRAPE_SIDE_M };
  return { side, behind, rack };
}

export function rackSpot(l: TreeLodging): Pt {
  return rackAt(l.camp, l.slot);
}

/** Where a figure kneels to light the fire: beside the hearth, on a side of its own. */
export function lightSpot(id: number): Pt {
  const a = hash01(id, 109) * 2 * Math.PI;
  return { x: LIGHT_M * detCos(a), z: LIGHT_M * detSin(a) };
}
