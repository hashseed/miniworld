// What does not change with the clock, worked out once per chunk (spec humankind.md section 8):
// each figure's stays, the camps' places and the Neolithic villages' fields and herds.

import { hash01 } from '../../core/hash.ts';
import { detAtan2 } from '../../core/detmath.ts';
import type { Day } from '../../time/calendar.ts';
import type { Field } from '../fieldShapes.ts';
import { farmingProfileAt } from '../farmingOnset.ts';
import { maskLand, maskReach } from '../fieldMask.ts';
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
  /** Where it keeps its grain (villages.md section 8): the store's kind, its middle and its facing. */
  store?: { kind: 'granary' | 'silo-pit' | 'pots'; at: Pt; dir: Pt };
  /** The village keeps a dog, which follows one of its people about, never penned (villages.md section 7). */
  dog?: boolean;
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

/** The grain store stands this far out from the village's middle, on the land mask's first ring, and fields keep STORE_CLEAR_M from it (layout metres). */
export const STORE_R_M = 15;
/** Its sides, which must be land as its middle is. */
const STORE_SIDE_M = 2;
export const STORE_CLEAR_M = 4;

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
  const all = neolithicProfile(
    profile ?? farmingProfileAt(deg(first.lat), deg(first.lon)) ?? 'pre-pottery-neolithic-levant',
  ).herd;
  // The dog is no herd animal: it keeps to its people, not the pen (Yang, 2026-10-25).
  const dog = all.includes('animal-dog');
  const kinds = all.filter((k) => k !== 'animal-dog');
  // Its houses where its culture builds them (villages.md section 5): no field or pen under one,
  // nor behind one from the green, where the walk out would pass through it (section 6).
  const houses = own.flatMap((l) => {
    const h = villageHouse(l);
    return h ? [h] : [];
  });
  /** Whether a point is on a house's footprint, HOUSE_CLEAR_M round it. */
  const onHouse = (x: number, z: number) =>
    houses.some((h) => {
      const [dx, dz] = [x - h.at.x, z - h.at.z];
      const u = dx * h.axis.x + dz * h.axis.z;
      const v = -dx * h.axis.z + dz * h.axis.x;
      return Math.abs(u) < h.lengthM / 2 + HOUSE_CLEAR_M && Math.abs(v) < h.deep + HOUSE_CLEAR_M;
    });
  // On a house, or behind one on the way out from the green.
  const underHouse = (x: number, z: number) => {
    for (let k = 1; k <= 16; k++) if (onHouse((x * k) / 16, (z * k) / 16)) return true;
    return false;
  };
  // Its own land: not on a neighbouring village's side of the line between them (villages.md section 3.1).
  const ownLand = (x: number, z: number) => !farm?.fieldShare || maskLand(farm.fieldShare, x, z);
  const free = (x: number, z: number) =>
    !farm ||
    (maskReach(farm.fieldLand!, x, z) &&
      ownLand(x, z) &&
      !inOutingLane(camp, x, z) &&
      !underHouse(x, z));
  // The herd is placed first, on land and out of the lanes; the fields then keep clear of its pen and animals.
  const a0 = hash01(camp, 235) * 2 * Math.PI;
  let herd: Village['herd'];
  for (let i = 0; i < 24 && !herd && kinds.length; i++) {
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
  // The grain store, just past the green in the first outing lane clear of the houses and the
  // pen (villages.md section 8): the lanes stay free of fields, and its way in is a straight one.
  let store: Village['store'];
  const kind = profile ? neolithicProfile(profile).store : undefined;
  for (let gap = 0; kind && !store && gap < LODGING_SLOTS; gap++) {
    const d = gapDirection(camp, gap);
    const at = { x: d.x * STORE_R_M, z: d.z * STORE_R_M };
    const clearOfPen =
      !herd ||
      (at.x - herd.pen.x) ** 2 + (at.z - herd.pen.z) ** 2 > (PEN_CLEAR_M + STORE_CLEAR_M) ** 2;
    // On land the way out to it is land too (the mask's maskReach), and to either side of it.
    const side = (k: number) => maskReach(farm!.fieldLand!, at.x - d.z * k, at.z + d.x * k);
    if (
      clearOfPen &&
      ownLand(at.x, at.z) &&
      !underHouse(at.x, at.z) &&
      side(0) &&
      side(STORE_SIDE_M) &&
      side(-STORE_SIDE_M)
    )
      store = { kind, at, dir: { x: -d.x, z: -d.z } };
  }
  const nearStore = (x: number, z: number) =>
    !!store && (x - store.at.x) ** 2 + (z - store.at.z) ** 2 < STORE_CLEAR_M ** 2;
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
        (x, z) => inOutingLane(camp, x, z) || nearHerd(x, z) || nearStore(x, z) || underHouse(x, z),
      )
    : [];
  if (!fields.length && !herd && !dog) return null;
  const founded = Math.min(
    ...own.filter((l) => isProfile(l.culture) && l.fieldLand).map((l) => l.built),
    first.built,
  );
  return {
    profile,
    founded,
    fields,
    ...(herd ? { herd } : {}),
    ...(dog ? { dog } : {}),
    ...(store && fields.length ? { store } : {}),
  };
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
