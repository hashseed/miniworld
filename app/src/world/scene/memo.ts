// What does not change with the clock, worked out once per chunk (spec humankind.md section 8):
// each figure's stays, the camps' places and the Neolithic villages' fields and herds.

import { hash01 } from '../../core/hash.ts';
import { detAtan2 } from '../../core/detmath.ts';
import type { Day } from '../../time/calendar.ts';
import type { Field } from '../fieldShapes.ts';
import { farmingProfileAt } from '../farmingOnset.ts';
import { maskReach } from '../fieldMask.ts';
import {
  isNeolithicProfile,
  neolithicProfile,
  type NeolithicProfileId,
} from '../neolithicProfiles.ts';
import { fieldsOf, herdOf, type HerdAnimal } from '../village.ts';
import type { TreeFigure, TreeLodging, TreeStage } from '../tree.ts';
import type { FigureLook, TreeChunk } from './types.ts';
import { type Pt, deg } from './units.ts';
import { Itinerary } from './routes.ts';
import {
  type Place,
  type CampEvent,
  inOutingLane,
  LODGING_SLOTS,
  gapDirection,
  villageHouse,
} from './camp.ts';
import type { Hunt } from './hunt.ts';
import { stageSessions } from './stages.ts';
import { treeScene } from '../treeScene.ts';

/** A figure's stay at one of its homes (section 8.1). */
export interface Stay {
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
  /** The clothes it came in, while they differ from its new camp's, and when it changes them. */
  wore: string | undefined;
  changeAt: number;
}

/**
 * What the scene of a chunk works out that does not change with the clock: lodgings by id,
 * builders and takers, when each lodging appears, who lives at each camp, the places camps
 * stand, and the stays, hunts, events and walks between camps worked out so far. Kept per
 * chunk, so each frame only works out what is new; the scene is a pure function of the
 * clock either way.
 */
/** A bone hut's mammoth hunt: who leads it, in which of their turns, and when the carcass is picked clean. */
export interface ForcedHunt {
  stage: TreeStage;
  round: number;
  hunter: Stay;
  turn: number;
  /** The end of the session that takes the bones out: the carcass stays until then. */
  stop: number;
}

export interface Memo {
  startDay: Day;
  ready: boolean;
  lodgings: Map<number, TreeLodging>;
  builders: Map<number, number[]>;
  takers: Map<number, number[]>;
  appears: Map<number, number>;
  /** When and where the group that founded a lodging's camp starts its crossing (departureOf). */
  departs: Map<number, { ms: number; lat: number; lon: number }>;
  campmates: Map<number, TreeFigure[]>;
  places: Map<string, Place>;
  stays: Map<string, Stay | undefined>;
  hunts: Map<string, Hunt | undefined>;
  forced: Map<string, ForcedHunt | undefined>;
  events: Map<string, CampEvent | undefined>;
  crossings: Map<string, unknown>;
  sessions: Map<TreeStage, ReturnType<typeof stageSessions>>;
  visits: Map<string, CampEvent[]>;
  /** The stay at its site each lodging belongs to (setPlaces). */
  stayOf: Map<number, string>;
  /** Who does the field job of each camp's slot (`camp:slot`). */
  workers: Map<string, number | undefined>;
  /** The fields and herd of each Neolithic camp (section 8.5), by camp. */
  villages: Map<number, Village | null>;
}

export const memos = new WeakMap<TreeChunk, Memo>();

/**
 * When a lodging first shows in the scene, in watching ms: not the day it is built, but when
 * its builder has walked there, the trees are felled and the fire lit (the events dialog
 * travels there then, milestone-1 section 8.3). Undefined for a lodging not in the chunk.
 */
export function shownAtMs(chunk: TreeChunk, startDay: Day, id: number): number | undefined {
  if (!memoOf(chunk, startDay).ready) treeScene(chunk, 0, startDay);
  return memoOf(chunk, startDay).appears.get(id);
}

/**
 * When and where the group that founded the camp of a lodging starts its crossing, in watching
 * ms: the first stretch by water, or for a route on land its setting out from the old camp
 * (milestone-1 section 8.3). Undefined where its builder made no walk.
 */
export function departureOf(
  chunk: TreeChunk,
  startDay: Day,
  id: number,
): { ms: number; lat: number; lon: number } | undefined {
  if (!memoOf(chunk, startDay).ready) treeScene(chunk, 0, startDay);
  return memoOf(chunk, startDay).departs.get(id);
}

/** The fields and herd of a Neolithic camp (section 8.5). */
export interface Village {
  profile: NeolithicProfileId | undefined;
  /** The day its first farming house was built: its fields are ploughed in turn from then on. */
  founded: Day;
  fields: Field[];
  herd?: { pen: Pt; penDir: Pt; animals: HerdAnimal[] };
}

export const isProfile = isNeolithicProfile;

/** Herd animals that are milked. */
export const MILKED = new Set([
  'animal-goat',
  'animal-sheep',
  'animal-cattle',
  'animal-zebu',
  'animal-water-buffalo',
]);

export const HERD_FIELD_CLEAR_M = 2.5;

/** Fields keep this far from a pen's middle: the pen is drawn about 12 layout metres across. */
export const PEN_CLEAR_M = 8;

/** Fields and the pen keep this far from a house's footprint (layout metres). */
export const HOUSE_CLEAR_M = 2;

/** The trees keep this far off a field's farthest corner (layout metres). */
export const FIELD_TREE_MARGIN_M = 2.5;

/** The camp's fields and herd, from its lodgings (section 8.5); null where it has neither. */
export function buildVillage(chunk: TreeChunk, camp: number): Village | null {
  const own = chunk.lodgings.filter((l) => l.camp === camp);
  const farm = own.find((l) => isProfile(l.culture) && l.fieldLand);
  const herding = own.find((l) => l.herding);
  const first = farm ?? herding;
  if (!first) return null;
  const profile = farm && isProfile(farm.culture) ? farm.culture : undefined;
  const lodgings = own.filter((l) => isProfile(l.culture) && l.fieldLand).length;
  const kinds = neolithicProfile(
    profile ?? farmingProfileAt(deg(first.lat), deg(first.lon)) ?? 'pre-pottery-neolithic-levant',
  ).herd;
  // Its houses where its culture builds them (villages.md section 5): no field or pen under one,
  // nor behind one from the green, where the walk out would pass through it (section 6).
  const houses = own.flatMap((l) => {
    const h = villageHouse(l);
    return h ? [{ x: h.at.x, z: h.at.z, r: h.lengthM / 2 + HOUSE_CLEAR_M }] : [];
  });
  const underHouse = (x: number, z: number) => {
    const d = Math.sqrt(x * x + z * z);
    return houses.some((h) => {
      // The nearest point to the house on the way from the green out to (x, z).
      const t = d < 1e-9 ? 0 : Math.max(0, Math.min(1, (h.x * x + h.z * z) / (d * d)));
      return (x * t - h.x) ** 2 + (z * t - h.z) ** 2 < h.r * h.r;
    });
  };
  const free = (x: number, z: number) =>
    !farm || (maskReach(farm.fieldLand!, x, z) && !inOutingLane(camp, x, z) && !underHouse(x, z));
  // The herd is placed first, on land and out of the lanes; the fields then keep clear of its pen and animals.
  const a0 = hash01(camp, 235) * 2 * Math.PI;
  let herd: Village['herd'];
  for (let i = 0; i < 24 && !herd; i++) {
    // The animals stand 8 to 12 metres round the pen, so the mask (13 to 38 metres out) holds them all only about here.
    for (const dist of farm ? [25.5, 24, 27, 22] : [17]) {
      const angle = farm ? a0 + (i * 2 * Math.PI) / 24 : 0;
      let at = angle;
      if (!farm) {
        const gap = i % LODGING_SLOTS;
        if ((first.reach[gap] ?? 0) < dist + 13) continue;
        const d = gapDirection(camp, gap);
        at = detAtan2(d.z, d.x);
      }
      const h = herdOf(camp, kinds, at, dist);
      if (h.animals.every((a) => free(a.x, a.z)) && free(h.pen.x, h.pen.z)) {
        herd = h;
        break;
      }
    }
  }
  const nearHerd = (x: number, z: number) =>
    !!herd &&
    ((x - herd.pen.x) ** 2 + (z - herd.pen.z) ** 2 < PEN_CLEAR_M ** 2 ||
      herd.animals.some((a) => (x - a.x) ** 2 + (z - a.z) ** 2 < HERD_FIELD_CLEAR_M ** 2));
  const fields = farm
    ? fieldsOf(
        camp,
        first.lat,
        lodgings,
        neolithicProfile(profile!).crops,
        farm.fieldLand!,
        (x, z) => inOutingLane(camp, x, z) || nearHerd(x, z) || underHouse(x, z),
      )
    : [];
  if (!fields.length && !herd) return null;
  const founded = Math.min(
    ...own.filter((l) => isProfile(l.culture) && l.fieldLand).map((l) => l.built),
    first.built,
  );
  return { profile, founded, fields, ...(herd ? { herd } : {}) };
}

export function memoOf(chunk: TreeChunk, startDay: Day): Memo {
  let m = memos.get(chunk);
  if (!m || m.startDay !== startDay) {
    m = {
      startDay,
      ready: false,
      lodgings: new Map(chunk.lodgings.map((l) => [l.id, l])),
      builders: new Map(),
      takers: new Map(),
      appears: new Map(),
      departs: new Map(),
      campmates: new Map(),
      places: new Map(),
      stays: new Map(),
      hunts: new Map(),
      forced: new Map(),
      events: new Map(),
      crossings: new Map(),
      sessions: new Map(),
      visits: new Map(),
      stayOf: new Map(),
      workers: new Map(),
      villages: new Map(),
    };
    memos.set(chunk, m);
  }
  return m;
}
