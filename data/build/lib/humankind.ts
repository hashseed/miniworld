// The tree build (spec humankind.md, sections 4 and 5): grows the tree of
// humankind from the first person at Lake Turkana, step by step through
// time, from the habitable land and the culture areas. Deterministic: whole
// days, the seeded hash and the deterministic trigonometry only, so the same
// inputs give the same tree on every machine.

import { hash32, hash01 } from '../../../app/src/core/hash.ts';
import { detAtan2, detCos, detSin, RAD } from '../../../app/src/core/detmath.ts';
import { EARTH_RADIUS_KM } from '../../../app/src/geo/earth.ts';
import { DAYS_PER_YEAR, type Day } from '../../../app/src/time/calendar.ts';
import { dayAtWatch, watchAtDay } from '../../../app/src/time/rate.ts';
import {
  NEVER,
  aliveOn,
  type MomentKind,
  type Tree,
  type TreeFigure,
  type TreeLodging,
} from '../../../app/src/world/tree.ts';
import {
  BUILD_RING_M,
  CAMP_ROOM_M,
  LODGING_RING_M,
  RACK_R,
  SCRAPE_BACK_M,
  SCRAPE_SIDE_M,
  HEARTH_SPOTS,
  HUT_DOOR_M,
  INNER_SPOTS,
  figureSpot,
  LAYOUT_KM_PER_M,
  LODGING_SLOTS,
  MAX_OUTING_M,
  gapDirection,
  slotPoint,
  type TreeChunk,
} from '../../../app/src/world/treeScene.ts';

export type Density = 'sparse' | 'low' | 'medium';

/** Camp spacing per density (section 4.1, Proposed); every band is 3 to 5 (Yang, 2026-10-18). */
export const DENSITIES: Record<Density, { spacingKm: number; band: [number, number] }> = {
  sparse: { spacingKm: 1350, band: [3, 5] },
  low: { spacingKm: 900, band: [3, 5] },
  medium: { spacingKm: 600, band: [3, 5] },
};

/** Figures a lodging holds, and lodgings a camp may have (section 4.1, Proposed). */
export const LODGING_CAPACITY = 4;
export const MAX_LODGINGS = 5;

// The tree's rhythms are set in watching time, so camps look the same in every era
// (section 4.3; Yang, 2026-10-19), and converted to days by the curve of spec section 2.1.
/** One step of the build, in milliseconds of watching (section 4.3). */
const STEP_MS = 10_000;
/** At most one figure comes out of a lodging in this time (section 4.3). */
const EMERGE_MS = 60_000;
/** A band moves its camp after one to two of these (section 4.4). */
const RESIDENCE_MS = 60_000;
/** A full camp waits this long between sending out groups, */
const BUD_MS = 180_000;
/** Spots a full camp tries for a group budding off (section 4.3). */
const BUD_TRIES = 48;
/** A full camp that found no free land tries again after this long. */
const BUD_RETRY_MS = 180_000;

/** The day a span of watching time after a day, and at least the next day. */
const after = (day: Day, ms: number): Day => Math.max(day + 1, dayAtWatch(watchAtDay(day) + ms));

const KM_PER_DEG = 111.195;
/** Rays across a gap between the lodgings, in radians from its middle, for how far people can go out. */
/**
 * Half the angle round a lodging's direction that its builders' ways cross, in radians: from
 * anywhere on the people's ring (about 11 layout metres) to its builders (up to 22 metres out),
 * the tangents from the ring and the builders' own spread.
 */
const SLOT_WEDGE = 0.95;
const REACH_TURNS = Array.from({ length: 11 }, (_, k) => (k - 5) * 0.05);

/** Where people may live, from the land, sea, ice and desert of a day. */
export interface Habitat {
  habitable(lat: number, lon: number, day: Day): boolean;
  /**
   * Whether a point is land, not sea or a lake, on a day: bands on the move cross desert, ice
   * and high ground they could not camp on (peopling.md section 4). Without it, only
   * habitable land can be crossed.
   */
  land?(lat: number, lon: number, day: Day): boolean;
  /** How good a camp site is, 0 to 1: near water is better, high or dry ground worse. */
  score(lat: number, lon: number, day: Day): number;
  /**
   * Whether no river is drawn at a point. Camps, lodgings and outings stay on dry
   * ground; bands on the move ford rivers. Without it, all land is dry.
   */
  dry?(lat: number, lon: number): boolean;
  /** Tree cover, 0 to 1, on a day: a band fells it before it builds (section 8.1). */
  wood?(lat: number, lon: number, day: Day): number;
}

export interface TreeSettings {
  /** The first person's place, in degrees. */
  founder: { lat: number; lon: number };
  /** The model of the first lodging and every lodging of the prologue. */
  lodgingKind: string;
  startDay: Day;
  endDay: Day;
  /** Until this day camps may only stand behind the front from the founder (section 4.2). */
  prologueEndDay: Day;
  frontKmPerYear: number;
  /** The density of the culture area at a place and day, or undefined outside every area. */
  density(lat: number, lon: number, day: Day): Density | undefined;
  /** The culture of the area at a place and day (peopling.md section 5.1); without it, every camp is the founder's. */
  culture?(lat: number, lon: number, day: Day): string | undefined;
  /** Whether the way of life of the area at a place lets people camp there on a day: cold and height (peopling.md section 5.2). */
  livable?(lat: number, lon: number, day: Day): boolean;
  /** The first day people may camp at a place, from the arrival map (peopling.md section 4). */
  arrival?(lat: number, lon: number): Day;
  /** The lodging model of a culture's camps. */
  lodgingOf?(culture: string): string;
  /** Sea crossings in canoes (peopling.md section 6). */
  voyages?: Voyage[];
  /** Neolithic thresholds, where camps settle and raise a red flag (peopling.md section 3.6). */
  thresholds?: Threshold[];
}

/**
 * A route's way to an arrival point (peopling.md section 4): from its day, if no camp stands
 * near the point, a band from the camp nearest the way follows it there, by canoe where it
 * crosses water.
 */
export interface Voyage {
  id: string;
  day: Day;
  way: { lat: number; lon: number }[];
}

/** A Neolithic threshold (peopling.md section 3.6). */
export interface Threshold {
  id: string;
  day: Day;
  lat: number;
  lon: number;
}

/** The nearest camp to a threshold within this distance raises its flag (peopling.md section 3.6, Proposed). */
export const FLAG_REACH_KM = 1500;
/** Camps this close to a threshold settle from its day: they stop moving and budding. */
export const SETTLE_KM = 800;
/** Walks are checked for water this often, in km, so a lake shore does not slip between the points. */
const WALK_CHECK_KM = 10;
const WALK_SIDE_KM = 8;
/** A band whose land is lost joins a camp at most this many of its spacings away. */
const JOIN_REACH = 6;
/** A stranded band paddles to a camp at most this many of its spacings away. */
const CANOE_JOIN = 2;
/** A band follows a route's way from a camp at most this far from it, in km. */
const VOYAGE_REACH_KM = 2000;
/** A route needs no band once a camp stands this close to its arrival point, in km. */
const VOYAGE_NEAR_KM = 1000;

interface Camp {
  id: number;
  lat: number;
  lon: number;
  spacingKm: number;
  target: number;
  lodgings: number[];
  nextMove: Day;
  nextBud: Day;
  /** Its culture at its place (peopling.md section 5.1). */
  culture: string | undefined;
  /** It has settled at a Neolithic threshold: it no longer moves or buds (peopling.md section 3.6). */
  settled: boolean;
  /** It had room for its people where it stands, so it moves away before the water comes. */
  roomy: boolean;
}

/** Distance in km between two points, on a local flat map (good to a few per cent at camp range). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  else if (dLon < -180) dLon += 360;
  const x = dLon * detCos(((lat1 + lat2) / 2) * RAD);
  const y = lat2 - lat1;
  return Math.sqrt(x * x + y * y) * KM_PER_DEG;
}

const micro = (deg: number): number => Math.round(deg * 1e6);

/**
 * The place a drawn offset east and north of a point falls on, in km along the ground plane
 * there, as the globe draws it (humankind.md section 8.1): a camp's outings reach a thousand
 * kilometres and more at drawn size, where a flat map would miss the shore.
 */
export function onGlobe(lat: number, lon: number, eastKm: number, northKm: number) {
  const [sLat, cLat, sLon, cLon] = [
    detSin(lat * RAD),
    detCos(lat * RAD),
    detSin(lon * RAD),
    detCos(lon * RAD),
  ];
  // Up, north and east at the point, as the globe's frame (geo/earth.ts northEast).
  const x = cLat * sLon * EARTH_RADIUS_KM + cLon * eastKm - sLat * sLon * northKm;
  const y = sLat * EARTH_RADIUS_KM + cLat * northKm;
  const z = cLat * cLon * EARTH_RADIUS_KM - sLon * eastKm - sLat * cLon * northKm;
  return {
    lat: detAtan2(y, Math.sqrt(x * x + z * z)) / RAD,
    lon: detAtan2(x, z) / RAD,
  };
}

/** Grows the tree of humankind from the first person (section 4). */
export function buildTree(s: TreeSettings, habitat: Habitat): Tree {
  const tree: Tree = { figures: [], lodgings: [], branches: [], moments: [] };
  const camps: Camp[] = [];
  /** Residents of each standing lodging, and the day of its last emergence. */
  const residents = new Map<number, number[]>();
  const lastEmerge = new Map<number, Day>();

  const moment = (kind: MomentKind, day: Day, figure: number, camp: Camp, branch = 0) =>
    tree.moments.push({
      day,
      kind,
      figure,
      camp: camp.id,
      branch,
      lat: micro(camp.lat),
      lon: micro(camp.lon),
    });

  const frontOk = (lat: number, lon: number, day: Day) =>
    day >= s.prologueEndDay ||
    distanceKm(s.founder.lat, s.founder.lon, lat, lon) <=
      (s.frontKmPerYear * (day - s.startDay)) / DAYS_PER_YEAR;

  /** Whether people of the area can live at a point on a day: its land, and its way of life. */
  const livable = (lat: number, lon: number, day: Day) =>
    habitat.habitable(lat, lon, day) && (s.livable?.(lat, lon, day) ?? true);

  /** Whether people may set up camp at a point on a day, apart from other camps. */
  const allowed = (lat: number, lon: number, day: Day) =>
    s.density(lat, lon, day) !== undefined &&
    (s.arrival?.(lat, lon) ?? -Infinity) <= day &&
    livable(lat, lon, day) &&
    // Lodgings go up during the step, so the land must last through it.
    livable(lat, lon, after(day, STEP_MS)) &&
    frontOk(lat, lon, day);

  const clearOfCamps = (lat: number, lon: number, spacingKm: number, except: Camp | undefined) =>
    camps.every(
      (c) =>
        c === except ||
        c.lodgings.length === 0 ||
        distanceKm(c.lat, c.lon, lat, lon) >= Math.min(spacingKm, c.spacingKm),
    );

  /**
   * The best free spot on a ring around a point, between `inner` and `outer`
   * spacings away, or undefined. Candidates are spread by hash; the habitat
   * score picks among them.
   */
  const findSpot = (
    from: Camp,
    day: Day,
    inner: number,
    outer: number,
    salt: number,
    /** The camp that will stand there, whose ring of lodging slots must have room. */
    campId = from.id,
    /** Candidate spots to try: more for a group budding off, which may have far to look. */
    tries = 16,
  ): { lat: number; lon: number } | undefined => {
    let best: { lat: number; lon: number; score: number } | undefined;
    for (let k = 0; k < tries; k++) {
      const bearing = hash01(from.id, day, salt, k) * 2 * Math.PI;
      const km = from.spacingKm * (inner + (outer - inner) * hash01(from.id, day, salt, k + 100));
      const lat = from.lat + (km * detCos(bearing)) / KM_PER_DEG;
      if (lat > 89 || lat < -89) continue;
      let lon = from.lon + (km * detSin(bearing)) / (KM_PER_DEG * detCos(from.lat * RAD));
      if (lon > 180) lon -= 360;
      else if (lon < -180) lon += 360;
      if (!allowed(lat, lon, day)) continue;
      const spacing = DENSITIES[s.density(lat, lon, day)!].spacingKm;
      if (!clearOfCamps(lat, lon, spacing, from.lodgings.length ? from : undefined)) continue;
      if (distanceKm(from.lat, from.lon, lat, lon) < Math.min(spacing, from.spacingKm) * inner)
        continue;
      // A camp is drawn far larger than life: it needs room for its people and lodgings on
      // land, even when it flees the sea, ice or desert; without such a spot it stays. The
      // band walks there in a straight line, so it must be land all the way: no sea or lake.
      if (!walkable(from.lat, from.lon, lat, lon, day)) continue;
      if (!roomy(campId, lat, lon, day) || drySlots(campId, lat, lon, day) < MIN_DRY_SLOTS)
        continue;
      const score = habitat.score(lat, lon, day) + 0.1 * hash01(from.id, day, salt, k + 200);
      if (!best || score > best.score) best = { lat, lon, score };
    }
    return best;
  };

  /** The point a drawn offset from a camp in layout metres (east, north) falls on. */
  const offset = (lat: number, lon: number, x: number, z: number) =>
    onGlobe(lat, lon, x * LAYOUT_KM_PER_M, z * LAYOUT_KM_PER_M);
  const landAt = (p: { lat: number; lon: number }, day: Day) =>
    habitat.habitable(p.lat, p.lon, day) && habitat.habitable(p.lat, p.lon, after(day, STEP_MS));
  /**
   * Land with no river on it, for the camp round its hearth: its lodgings, spots and outings.
   * Only water keeps them out; the hearth itself stands on habitable land (peopling.md
   * section 4: a coastal camp's outings may reach into the desert behind it).
   */
  const dryAt = (p: { lat: number; lon: number }, day: Day) =>
    crossable(p, day) &&
    // The sea moves while a camp stands: it must still be land when the band moves on.
    crossable(p, after(day, 2 * RESIDENCE_MS)) &&
    (habitat.dry?.(p.lat, p.lon) ?? true);

  /** Land a band can walk over: any land, or habitable land when the habitat cannot tell. */
  const crossable = (p: { lat: number; lon: number }, day: Day) =>
    habitat.land
      ? habitat.land(p.lat, p.lon, day) && habitat.land(p.lat, p.lon, after(day, STEP_MS))
      : landAt(p, day);

  /**
   * Whether the straight way between two points is land all the way, across the date line
   * too: checked every WALK_CHECK_KM along it and WALK_SIDE_KM either side, since the walkers
   * are drawn a little off the line between the camps' middles.
   */
  const walkable = (lat0: number, lon0: number, lat1: number, lon1: number, day: Day) => {
    const km = distanceKm(lat0, lon0, lat1, lon1);
    const n = Math.ceil(km / WALK_CHECK_KM);
    let dLon = lon1 - lon0;
    if (dLon > 180) dLon -= 360;
    else if (dLon < -180) dLon += 360;
    // A step of WALK_SIDE_KM across the way, in degrees.
    const cos = Math.max(0.05, detCos(((lat0 + lat1) / 2) * RAD));
    const [ex, ny] =
      km > 0 ? [(dLon * cos * KM_PER_DEG) / km, ((lat1 - lat0) * KM_PER_DEG) / km] : [0, 0];
    const side = {
      lat: (ex * WALK_SIDE_KM) / KM_PER_DEG,
      lon: (-ny * WALK_SIDE_KM) / (KM_PER_DEG * cos),
    };
    for (let k = 1; k < n; k++) {
      const lat = lat0 + ((lat1 - lat0) * k) / n;
      let lon = lon0 + (dLon * k) / n;
      if (lon > 180) lon -= 360;
      else if (lon < -180) lon += 360;
      for (const s of [0, 1, -1])
        if (!crossable({ lat: lat + s * side.lat, lon: lon + s * side.lon }, day)) return false;
    }
    return true;
  };

  /** Whether the people's spots round a hearth would all be on land (section 8.1). */
  /** How many lodging slots of a camp at a place have the lodging and its builders on dry land. */
  const drySlots = (campId: number, lat: number, lon: number, day: Day): number =>
    Array.from({ length: LODGING_SLOTS }, (_, k) => k).filter((k) =>
      slotFootprint(campId, k).every((q) => dryAt(offset(lat, lon, q.x, q.z), day)),
    ).length;

  const roomy = (campId: number, lat: number, lon: number, day: Day) => {
    if (!dryAt({ lat, lon }, day)) return false;
    // The people's own spots on the inner ring, exactly, so no inlet slips between the rings.
    for (let k = 0; k < INNER_SPOTS; k++) {
      const p = figureSpot(k, campId);
      if (!dryAt(offset(lat, lon, p.x, p.z), day)) return false;
    }
    // Rings every 1.5 layout metres, 40 points each, close enough that a drawn
    // river (about 2 layout metres wide) cannot slip between their points.
    for (let m = 1.5; m <= CAMP_ROOM_M; m += 1.5)
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * 2 * Math.PI;
        if (!dryAt(offset(lat, lon, m * detCos(a), m * detSin(a)), day)) return false;
      }
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * 2 * Math.PI;
      const m = CAMP_ROOM_M;
      if (!dryAt(offset(lat, lon, m * detCos(a), m * detSin(a)), day)) return false;
    }
    return true;
  };

  /**
   * The lowest place round the hearth that none of the camp's standing lodgings takes, on
   * land with dry ground to cross to it if one is free; else one whose lodging and builders
   * at least are on land; places in the water are used only when nothing else is left.
   */
  const freeSlot = (camp: Camp, day: Day): number => {
    const taken = new Set(camp.lodgings.map((l) => tree.lodgings[l]!.slot));
    const free = Array.from({ length: LODGING_SLOTS }, (_, k) => k).filter((k) => !taken.has(k));
    const at = (q: { x: number; z: number }) => dryAt(offset(camp.lat, camp.lon, q.x, q.z), day);
    // The lodging and the builders round it, a little past where they stand.
    const standsDry = (k: number) => slotFootprint(camp.id, k).every(at);
    // The ground the builders cross to it from the people's ring, which they enter and leave
    // from any side: the wedge from the camp's room out past the builders, a point every
    // layout metre (Yang, 2026-10-19: people walked over Lake Malawi to a hut).
    const reachedDry = (k: number) => {
      const p = slotPoint(camp.id, k);
      const [ux, uz] = [p.x / LODGING_RING_M, p.z / LODGING_RING_M];
      for (let r = CAMP_ROOM_M; r <= LODGING_RING_M + BUILD_RING_M + 1; r += 1)
        for (let s = -SLOT_WEDGE; s <= SLOT_WEDGE; s += 1 / r) {
          const [c, sn] = [detCos(s), detSin(s)];
          if (!at({ x: r * (ux * c - uz * sn), z: r * (ux * sn + uz * c) })) return false;
        }
      return true;
    };
    const dry = free.filter(standsDry);
    return dry.find(reachedDry) ?? dry[0] ?? free[0] ?? taken.size;
  };
  /** Whether a free slot of the camp has its lodging and builders on dry land. */
  const hasDrySlot = (camp: Camp, day: Day): boolean => {
    const taken = new Set(camp.lodgings.map((l) => tree.lodgings[l]!.slot));
    return Array.from({ length: LODGING_SLOTS }, (_, k) => k).some((k) => {
      if (taken.has(k)) return false;
      return slotFootprint(camp.id, k).every((q) =>
        dryAt(offset(camp.lat, camp.lon, q.x, q.z), day),
      );
    });
  };

  /** How far, in layout metres, people can go out through each gap between the lodgings and stay on land. */
  const reachOf = (camp: Camp, day: Day): number[] =>
    Array.from({ length: LODGING_SLOTS }, (_, gap) => {
      const d = gapDirection(camp.id, gap);
      let reach = 0;
      for (let m = 10; m <= MAX_OUTING_M; m += 1) {
        // Across the lanes of the gap (out to 0.15 rad either side) and the walks to them, a
        // ray every 0.05 rad, and a little further than they go, as coasts are drawn smoothed.
        // Three rays let a lake 50 km wide slip between them far out (Yang, 2026-10-19:
        // people gathering in Lake Malawi).
        // Every half metre, as a layout metre is 28 km at drawn size.
        const wet = REACH_TURNS.some((turn) => {
          const [c, sn] = [detCos(turn), detSin(turn)];
          return [m - 0.5, m].some((r) => {
            const x = (d.x * c - d.z * sn) * r * 1.1;
            const z = (d.x * sn + d.z * c) * r * 1.1;
            return !dryAt(offset(camp.lat, camp.lon, x, z), day);
          });
        });
        if (wet) break;
        reach = m;
      }
      return reach;
    });

  /**
   * How far round its hearth a camp has dry land all round, in layout metres, from its
   * room for people out to the catch ring (section 8.1), checked every 1.5 metres.
   */
  const roomOf = (camp: Camp, day: Day): number => {
    let room = CAMP_ROOM_M;
    for (let m = CAMP_ROOM_M + 1.5; m <= ROOM_CHECKED_M; m += 1.5) {
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * 2 * Math.PI;
        if (!dryAt(offset(camp.lat, camp.lon, m * detCos(a), m * detSin(a)), day)) return room;
      }
      room = m;
    }
    return room;
  };

  /** The lowest spot at a camp's hearth that none of its people takes, the mover aside. */
  const freeSpot = (campId: number, mover = NEVER): number => {
    const taken = new Set<number>();
    for (const l of camps[campId]!.lodgings)
      for (const f of residents.get(l) ?? [])
        if (f !== mover) taken.add(tree.figures[f]!.homes.at(-1)![2]);
    let spot = 0;
    while (taken.has(spot)) spot++;
    return spot;
  };

  const newFigure = (parent: number, born: Day, branch: number, lodging: number): TreeFigure => {
    const f: TreeFigure = {
      id: tree.figures.length,
      parent,
      born,
      branch,
      depth: parent === NEVER ? 0 : tree.figures[parent]!.depth + 1,
      homes: [[born, lodging, freeSpot(tree.lodgings[lodging]!.camp)]],
      lost: NEVER,
    };
    tree.figures.push(f);
    residents.get(lodging)!.push(f.id);
    return f;
  };

  const newLodging = (camp: Camp, builder: number, day: Day): TreeLodging => {
    const l: TreeLodging = {
      id: tree.lodgings.length,
      camp: camp.id,
      lat: micro(camp.lat),
      lon: micro(camp.lon),
      built: day,
      gone: NEVER,
      builder,
      slot: freeSlot(camp, day),
      reach: reachOf(camp, day),
      room: roomOf(camp, day),
      kind: (camp.culture && s.lodgingOf?.(camp.culture)) || s.lodgingKind,
      ...(camp.culture ? { culture: camp.culture } : {}),
      ...(habitat.wood
        ? { wood: Math.round(100 * habitat.wood(camp.lat, camp.lon, day)) / 100 }
        : {}),
    };
    tree.lodgings.push(l);
    camp.lodgings.push(l.id);
    residents.set(l.id, []);
    lastEmerge.set(l.id, day);
    return l;
  };

  /** A figure moves to another lodging; the one it leaves is taken down once empty. */
  const moveIn = (figure: number, from: number, to: number, day: Day) => {
    const list = residents.get(from)!;
    list.splice(list.indexOf(figure), 1);
    residents.get(to)!.push(figure);
    tree.figures[figure]!.homes.push([day, to, freeSpot(tree.lodgings[to]!.camp, figure)]);
    if (list.length === 0) {
      const old = tree.lodgings[from]!;
      old.gone = day;
      const camp = camps[old.camp]!;
      camp.lodgings = camp.lodgings.filter((l) => l !== from);
      residents.delete(from);
    }
  };

  const newCamp = (lat: number, lon: number, day: Day): Camp => {
    const density = DENSITIES[s.density(lat, lon, day) ?? 'low'];
    const id = camps.length;
    const [lo, hi] = density.band;
    const camp: Camp = {
      id,
      lat,
      lon,
      spacingKm: density.spacingKm,
      target: lo + (hash32(id, 7) % (hi - lo + 1)),
      lodgings: [],
      // Each band keeps its own rhythm of moving, so camps do not all move at once.
      nextMove: after(day, RESIDENCE_MS + (hash32(id, 11) % RESIDENCE_MS)),
      nextBud: after(day, BUD_MS),
      culture: s.culture?.(lat, lon, day),
      settled: false,
      roomy: roomy(id, lat, lon, day),
    };
    camps.push(camp);
    return camp;
  };

  /** The whole band takes down its lodgings and builds them again at a new spot. */
  const relocate = (camp: Camp, lat: number, lon: number, day: Day) => {
    const old = camp.lodgings;
    camp.lodgings = [];
    camp.lat = lat;
    camp.lon = lon;
    camp.culture = s.culture?.(lat, lon, day) ?? camp.culture;
    camp.roomy = roomy(camp.id, lat, lon, day);
    // As many lodgings as the band needs, four to a lodging, so they all fit its dry places;
    // the last one out of each old lodging takes it down.
    const people = old.flatMap((id) => residents.get(id)!.map((f) => [f, id] as const));
    for (let k = 0; k < people.length; k += LODGING_CAPACITY) {
      const group = people.slice(k, k + LODGING_CAPACITY);
      const fresh = newLodging(camp, group[0]![0], day);
      for (const [f, id] of group) moveIn(f, id, fresh.id, day);
    }
    // A red flag goes with its settled camp, behind one of its new lodgings (peopling.md section 3.6).
    for (const f of tree.flags ?? [])
      if (f.camp === camp.id && f.until === NEVER) {
        f.until = day;
        const slot = Math.min(...camp.lodgings.map((l) => tree.lodgings[l]!.slot));
        tree.flags!.push({ ...f, day, until: NEVER, lat: micro(lat), lon: micro(lon), slot });
        break;
      }
  };

  /**
   * With no free spot to move to before the water comes, the band joins the nearest camp it
   * can walk to, in its lodgings with room or in new ones beside them (peopling.md section 4).
   * The first person never leaves her camp. False when nobody could go.
   */
  const joined = new Set<Camp>();
  const joinNeighbours = (camp: Camp, day: Day): boolean => {
    const people = camp.lodgings.flatMap((l) => residents.get(l)!);
    if (people.includes(0)) return false;
    const near = camps
      .filter(
        (c) =>
          c !== camp &&
          c.lodgings.length > 0 &&
          distanceKm(c.lat, c.lon, camp.lat, camp.lon) <= JOIN_REACH * camp.spacingKm &&
          livable(c.lat, c.lon, day) &&
          livable(c.lat, c.lon, after(day, STEP_MS) - 1) &&
          walkable(camp.lat, camp.lon, c.lat, c.lon, day),
      )
      .sort(
        (a, b) =>
          distanceKm(a.lat, a.lon, camp.lat, camp.lon) -
            distanceKm(b.lat, b.lon, camp.lat, camp.lon) || a.id - b.id,
      );
    // A camp keeps its people on the inner ring round its hearth, for which it has room: the
    // band splits up among the nearest camps with room, as many to each as fit.
    const count = (c: Camp) => c.lodgings.reduce((n, l) => n + residents.get(l)!.length, 0);
    let moved = false;
    const left = people.slice();
    // They arrive at the end of the step, after anyone leaving those camps during it.
    const at = after(day, STEP_MS) - 1;
    for (const to of near) {
      joined.add(to);
      while (left.length && count(to) < INNER_SPOTS) {
        let room = to.lodgings.find((l) => residents.get(l)!.length < LODGING_CAPACITY);
        if (room === undefined && to.lodgings.length < MAX_LODGINGS && hasDrySlot(to, day))
          room = newLodging(to, left[0]!, at).id;
        if (room === undefined) break;
        const f = left.shift()!;
        moveIn(f, tree.figures[f]!.homes.at(-1)![1], room, at);
        moved = true;
      }
      if (!left.length) break;
    }
    // Stranded by the sea, with no camp to walk to: the rest paddle canoes to the nearest
    // camps with room across the water, in new lodgings there (peopling.md section 6).
    if (left.length)
      for (const to of camps) {
        if (to === camp || to.lodgings.length === 0 || joined.has(to)) continue;
        const km = distanceKm(to.lat, to.lon, camp.lat, camp.lon);
        if (km > CANOE_JOIN * camp.spacingKm || !livable(to.lat, to.lon, at)) continue;
        if (count(to) + Math.min(left.length, LODGING_CAPACITY) > INNER_SPOTS) continue;
        if (to.lodgings.length >= MAX_LODGINGS || !hasDrySlot(to, day)) continue;
        const way = shores(camp, to, day);
        if (!way) continue;
        joined.add(to);
        const l = newLodging(to, left[0]!, at);
        const stops = [camp, ...way, to];
        l.voyage = {
          id: 'stranded',
          way: way.map((p) => [micro(p.lat), micro(p.lon)]),
          water: stops.slice(1).map((b, i) => wet(stops[i]!, b, day)),
        };
        for (const f of left.splice(0, LODGING_CAPACITY))
          moveIn(f, tree.figures[f]!.homes.at(-1)![1], l.id, at);
        moved = true;
        if (!left.length) break;
      }
    return moved;
  };

  /**
   * Where a band paddling straight from one camp to another puts in and lands: the last land
   * before the water and the first after it, or undefined when land comes in between.
   */
  const shores = (from: Camp, to: Camp, day: Day) => {
    const n = Math.ceil(distanceKm(from.lat, from.lon, to.lat, to.lon) / WALK_CHECK_KM);
    let dLon = to.lon - from.lon;
    if (dLon > 180) dLon -= 360;
    else if (dLon < -180) dLon += 360;
    const at = (k: number) => {
      let lon = from.lon + (dLon * k) / n;
      if (lon > 180) lon -= 360;
      else if (lon < -180) lon += 360;
      return { lat: from.lat + ((to.lat - from.lat) * k) / n, lon };
    };
    const dry = Array.from({ length: n + 1 }, (_, k) => crossable(at(k), day));
    const first = dry.indexOf(false);
    const last = dry.lastIndexOf(false);
    if (first <= 0 || last >= n) return undefined;
    // One stretch of water, with land on both sides of it.
    for (let k = first; k <= last; k++) if (dry[k]) return undefined;
    return [at(first - 1), at(last + 1)];
  };

  /** Whether the water has come closer to a camp's lodgings, outings or room since they were built. */
  const shoreMoved = (camp: Camp, day: Day): boolean => {
    const reach = reachOf(camp, day);
    const room = roomOf(camp, day);
    return camp.lodgings.some((id) => {
      const l = tree.lodgings[id]!;
      return (
        room < (l.room ?? 0) ||
        reach.some((r, gap) => r < l.reach[gap]!) ||
        !slotFootprint(camp.id, l.slot).every((q) =>
          dryAt(offset(camp.lat, camp.lon, q.x, q.z), day),
        )
      );
    });
  };

  /** Splits a straight way into land and water by its points every WALK_CHECK_KM. */
  const wet = (a: { lat: number; lon: number }, b: { lat: number; lon: number }, day: Day) =>
    !walkable(a.lat, a.lon, b.lat, b.lon, day) || !crossable(a, day) || !crossable(b, day);

  /**
   * A band follows a route to its next arrival point (peopling.md section 4): once the point's
   * day has come and no camp stands near it, two or three people of the camp nearest the way
   * walk to it, follow it, by canoe across water (section 6), and found a camp at the best
   * free spot near the point. False while no camp or no spot is ready; it tries again after
   * a full camp's wait.
   */
  const voyages = (s.voyages ?? []).map((v) => ({ ...v, done: false, next: v.day }));
  const voyage = (v: Voyage & { next: Day }, day: Day): boolean => {
    const far = v.way.at(-1)!;
    // A camp of the point's own culture near it, not one across the water from it.
    const culture = s.culture?.(far.lat, far.lon, day);
    const near = (c: Camp) =>
      c.lodgings.length > 0 &&
      c.culture === culture &&
      distanceKm(c.lat, c.lon, far.lat, far.lon) <= VOYAGE_NEAR_KM;
    if (camps.some(near)) return true;
    if (day < v.next) return false;
    // Camps near the way with people to spare, nearest first; the first that can walk to it goes.
    const options: { camp: Camp; at: number; km: number }[] = [];
    for (const c of camps) {
      if (c.lodgings.length === 0 || c.settled) continue;
      const people = c.lodgings.flatMap((l) => residents.get(l)!).filter((f) => f !== 0);
      if (people.length < 3) continue;
      v.way.forEach((p, at) => {
        const km = distanceKm(c.lat, c.lon, p.lat, p.lon);
        if (km <= VOYAGE_REACH_KM) options.push({ camp: c, at, km });
      });
    }
    options.sort((a, b) => a.km - b.km || a.camp.id - b.camp.id || a.at - b.at);
    const from = options.find((o) =>
      walkable(o.camp.lat, o.camp.lon, v.way[o.at]!.lat, v.way[o.at]!.lon, day),
    );
    if (!from) return false;
    const src = from.camp;
    // The new camp: the best free spot within a spacing of the point, walkable from it.
    const id = camps.length;
    const spacing0 = DENSITIES[s.density(far.lat, far.lon, day) ?? 'low'].spacingKm;
    let spot: { lat: number; lon: number; score: number } | undefined;
    for (let k = 0; k < 64; k++) {
      const bearing = hash01(id, day, 61, k) * 2 * Math.PI;
      const km = spacing0 * hash01(id, day, 62, k);
      const lat = far.lat + (km * detCos(bearing)) / KM_PER_DEG;
      const lon = far.lon + (km * detSin(bearing)) / (KM_PER_DEG * detCos(far.lat * RAD));
      if (!allowed(lat, lon, day)) continue;
      const spacing = DENSITIES[s.density(lat, lon, day)!].spacingKm;
      if (!clearOfCamps(lat, lon, spacing, undefined)) continue;
      if (!roomy(id, lat, lon, day) || drySlots(id, lat, lon, day) < MIN_DRY_SLOTS) continue;
      if (!walkable(far.lat, far.lon, lat, lon, day)) continue;
      const score = habitat.score(lat, lon, day) + 0.1 * hash01(id, day, 63, k);
      if (!spot || score > spot.score) spot = { lat, lon, score };
    }
    // No spot near the point yet: look again after a full camp's wait.
    if (!spot) {
      v.next = after(day, BUD_MS);
      return false;
    }
    const people = src.lodgings.flatMap((l) => residents.get(l)!);
    const candidates = people.filter((f) => f !== 0);
    const size = Math.min(candidates.length, people.length - 1, 2 + (hash32(src.id, day, 64) % 2));
    const group: number[] = [];
    for (let k = 0; k < size; k++)
      group.push(candidates.splice(hash32(src.id, day, 65, k) % candidates.length, 1)[0]!);
    const child = newCamp(spot.lat, spot.lon, day);
    const arrive = day;
    const l = newLodging(child, group[0]!, arrive);
    // The way the band goes: to the route, along it, and on to the new camp.
    const way = v.way.slice(from.at);
    const stops = [{ lat: src.lat, lon: src.lon }, ...way, spot];
    l.voyage = {
      id: v.id,
      way: way.map((p) => [micro(p.lat), micro(p.lon)]),
      water: stops.slice(1).map((b, i) => wet(stops[i]!, b, day)),
    };
    for (const f of group) moveIn(f, tree.figures[f]!.homes.at(-1)![1], l.id, arrive);
    moment('voyage', arrive, group[0]!, child);
    return true;
  };

  /**
   * A Neolithic threshold is reached (peopling.md section 3.6): the camps near it settle,
   * and the nearest camp within reach raises a red flag. False while no camp is near.
   */
  const thresholds = (s.thresholds ?? []).map((t) => ({ ...t, flagged: false }));
  const settle = (t: Threshold, day: Day): boolean => {
    let nearest: Camp | undefined;
    for (const c of camps) {
      if (c.lodgings.length === 0) continue;
      const km = distanceKm(c.lat, c.lon, t.lat, t.lon);
      if (km <= SETTLE_KM) c.settled = true;
      if (
        km <= FLAG_REACH_KM &&
        (!nearest || km < distanceKm(nearest.lat, nearest.lon, t.lat, t.lon))
      )
        nearest = c;
    }
    if (!nearest) return false;
    nearest.settled = true;
    const people = nearest.lodgings.flatMap((l) => residents.get(l)!);
    // The flag stands behind the lodging of the camp's lowest standing slot, out of every lane.
    const slot = Math.min(...nearest.lodgings.map((l) => tree.lodgings[l]!.slot));
    (tree.flags ??= []).push({
      id: t.id,
      camp: nearest.id,
      day,
      until: NEVER,
      lat: micro(nearest.lat),
      lon: micro(nearest.lon),
      slot,
    });
    moment('neolithic-threshold', day, people[0]!, nearest);
    return true;
  };

  // The first person, alone at Lake Turkana (section 4.2).
  const first = newCamp(s.founder.lat, s.founder.lon, s.startDay);
  tree.branches.push({ id: 0, parent: NEVER, figure: 0, day: s.startDay, reason: 'root' });
  const hut = newLodging(first, 0, s.startDay);
  newFigure(NEVER, s.startDay, 0, hut.id);
  moment('root', s.startDay, 0, first);

  // The day the first person's first companion steps out: a minute of watching in.
  const aloneUntil = dayAtWatch(watchAtDay(s.startDay) + FOUNDER_ALONE_MS);
  for (let day = s.startDay; day < s.endDay; day = after(day, STEP_MS)) {
    const step = after(day, STEP_MS) - day;
    // Bands following a route set off first, at the step's start, before anyone is born in it.
    for (const v of voyages) if (!v.done && day >= v.day) v.done = voyage(v, day);
    for (const t of thresholds) if (!t.flagged && day >= t.day) t.flagged = settle(t, day);
    // Camps founded during this step wait for the next one.
    const count = camps.length;
    joined.clear();
    for (let ci = 0; ci < count; ci++) {
      const camp = camps[ci]!;
      // A camp that a band joined this step waits for the next, so nobody has two moves a day.
      if (camp.lodgings.length === 0 || joined.has(camp)) continue;
      // Near a Neolithic threshold that has come, camps settle (peopling.md section 3.6).
      if (
        !camp.settled &&
        thresholds.some(
          (t) => day >= t.day && distanceKm(camp.lat, camp.lon, t.lat, t.lon) <= SETTLE_KM,
        )
      )
        camp.settled = true;
      const people = camp.lodgings.flatMap((l) => residents.get(l)!);

      // The land changes under the camp: move before the sea, ice or desert arrive.
      // ...or before the water reaches its people (peopling.md section 4: camps by the sea).
      if (
        !livable(camp.lat, camp.lon, day + step) ||
        (camp.roomy && !roomy(camp.id, camp.lat, camp.lon, day + step))
      ) {
        const spot = findSpot(camp, day, 0.5, 3, 1, camp.id, BUD_TRIES);
        if (spot) {
          relocate(camp, spot.lat, spot.lon, day);
          moment('camp-moved-away', day, people[0]!, camp);
        } else if (joinNeighbours(camp, day)) moment('camp-moved-away', day, people[0]!, camp);
        continue;
      }
      // The end of a residence window: the band moves a little way, unless it has settled.
      // A band that stays, settled or with nowhere free to go, rebuilds its lodgings where
      // the water has come closer, so its people never stand in it (peopling.md section 4).
      if (day >= camp.nextMove) {
        camp.nextMove = after(day, RESIDENCE_MS + (hash32(camp.id, day, 12) % RESIDENCE_MS));
        const spot = camp.settled ? undefined : findSpot(camp, day, 0.2, 0.6, 2);
        if (spot) relocate(camp, spot.lat, spot.lon, day);
        else if (livable(camp.lat, camp.lon, day) && shoreMoved(camp, day)) {
          // In place where its people and lodgings still fit on dry land, else away.
          const fits =
            roomy(camp.id, camp.lat, camp.lon, day) &&
            drySlots(camp.id, camp.lat, camp.lon, day) >=
              Math.max(MIN_DRY_SLOTS, camp.lodgings.length);
          const away = fits ? undefined : findSpot(camp, day, 0.5, 3, 1, camp.id, BUD_TRIES);
          if (fits) relocate(camp, camp.lat, camp.lon, day);
          else if (away) relocate(camp, away.lat, away.lon, day);
          else joinNeighbours(camp, day);
          // Its people have new homes: nothing else for this band this step.
          continue;
        }
      }

      if (people.length < camp.target) {
        // New people step out of lodgings with room (section 4.3).
        let grown = false;
        for (const l of camp.lodgings) {
          const inside = residents.get(l)!;
          if (inside.length === 0 || inside.length >= LODGING_CAPACITY) continue;
          if (
            watchAtDay(day) - watchAtDay(lastEmerge.get(l)!) < EMERGE_MS &&
            !(l === hut.id && inside.length === 1)
          )
            continue;
          // The first person stays alone for the first minute of watching (section 4.2).
          if (tree.figures.length === 1 && day + step <= aloneUntil) continue;
          const parent = inside[hash32(l, day, 1) % inside.length]!;
          const born = Math.max(day + (hash32(l, day, 2) % step), aloneUntil);
          const f = newFigure(parent, born, tree.figures[parent]!.branch, l);
          lastEmerge.set(l, born);
          if (f.id === 1) moment('first-born', born, f.id, camp);
          grown = true;
          break;
        }
        // Every lodging is full: someone builds another beside the hearth.
        if (!grown && camp.lodgings.length < MAX_LODGINGS) {
          const full = camp.lodgings.every((l) => residents.get(l)!.length >= LODGING_CAPACITY);
          // Another lodging only where one can stand on dry land (section 4).
          if (full && hasDrySlot(camp, day)) {
            const builder = people[hash32(camp.id, day, 3) % people.length]!;
            const l = newLodging(camp, builder, day + (hash32(camp.id, day, 4) % step));
            const from = tree.figures[builder]!.homes.at(-1)![1];
            moveIn(builder, from, l.id, l.built);
          }
        }
      } else if (day >= camp.nextBud && !camp.settled) {
        // A full camp sends out a small group to found a new one (section 4.3).
        const spot = findSpot(camp, day, 1, 2, 3, camps.length, BUD_TRIES);
        if (!spot) {
          camp.nextBud = after(day, BUD_RETRY_MS);
          continue;
        }
        camp.nextBud = after(day, BUD_MS);
        // Two or three walk off; the first person stays at home, and nobody leaves a camp empty.
        const candidates = people.filter((f) => f !== 0);
        const size = Math.min(
          candidates.length,
          people.length - 1,
          2 + (hash32(camp.id, day, 5) % 2),
        );
        if (size < 2) continue;
        const group: number[] = [];
        for (let k = 0; k < size; k++)
          group.push(candidates.splice(hash32(camp.id, day, 6, k) % candidates.length, 1)[0]!);
        const child = newCamp(spot.lat, spot.lon, day);
        const arrive = day + (hash32(camp.id, day, 8) % step);
        const l = newLodging(child, group[0]!, arrive);
        for (const f of group) moveIn(f, tree.figures[f]!.homes.at(-1)![1], l.id, arrive);
        moment('camp-founded', arrive, group[0]!, child);
      }
    }
  }
  return tree;
}

/** The build fails when any of these finds a problem (section 5); returns the problems found. */
export function checkTree(tree: Tree, s: TreeSettings, habitat: Habitat): string[] {
  const problems: string[] = [];
  const homeOn = (f: TreeFigure, day: Day) => {
    let home = NEVER;
    for (const [from, l] of f.homes) if (from <= day) home = l;
    return home;
  };
  const roots = tree.figures.filter((f) => f.parent === NEVER);
  if (roots.length !== 1) problems.push(`expected one root, found ${roots.length}`);
  for (const f of tree.figures) {
    if (f.parent === NEVER) continue;
    const p = tree.figures[f.parent]!;
    if (p.born > f.born) problems.push(`figure ${f.id} is born before its parent ${p.id}`);
    const home = f.homes[0]![1];
    if (homeOn(p, f.born) !== home)
      problems.push(`figure ${f.id} comes out of lodging ${home}, where its parent does not live`);
    for (let i = 1; i < f.homes.length; i++)
      if (f.homes[i]![0] < f.homes[i - 1]![0]) problems.push(`figure ${f.id} moves back in time`);
  }
  // Lodgings and figures each have a place of their own at their camp (section 8.1).
  const spotOn = (f: TreeFigure, day: Day) => {
    let at: [Day, number, number] | undefined;
    for (const h of f.homes) if (h[0] <= day) at = h;
    return at;
  };
  for (const l of tree.lodgings) {
    if (l.slot >= LODGING_SLOTS) problems.push(`lodging ${l.id} has no place round the hearth`);
    const clash = tree.lodgings.find(
      (o) =>
        o.id < l.id &&
        o.camp === l.camp &&
        o.slot === l.slot &&
        o.built <= l.built &&
        (o.gone === NEVER || o.gone > l.built),
    );
    if (clash) problems.push(`lodgings ${clash.id} and ${l.id} stand in the same place`);
  }
  for (const f of tree.figures)
    for (const [day, lodging, spot] of f.homes) {
      if (spot >= HEARTH_SPOTS) problems.push(`figure ${f.id} has no spot at the hearth`);
      const camp = tree.lodgings[lodging]!.camp;
      for (const o of tree.figures) {
        if (o.id === f.id || !aliveOn(o, day) || o.born > day) continue;
        const at = spotOn(o, day);
        if (at && at[2] === spot && tree.lodgings[at[1]]!.camp === camp)
          problems.push(`figures ${o.id} and ${f.id} share a spot on day ${day}`);
      }
    }
  for (const l of tree.lodgings) {
    const lat = l.lat / 1e6;
    const lon = l.lon / 1e6;
    if (!habitat.habitable(lat, lon, l.built))
      problems.push(`lodging ${l.id} stands on uninhabitable land`);
    if (s.density(lat, lon, l.built) === undefined)
      problems.push(`lodging ${l.id} stands outside every culture area`);
  }
  return problems;
}

/**
 * Splits the tree into one chunk per time window (section 8), or undefined
 * for a window after the tree ends. The tree is built only up to its end day,
 * so its figures and lodgings are taken away then.
 */
/**
 * What a lodging slot needs on dry land (section 8.1): the lodging, its builders round it a
 * little past where they stand, and behind it its drying rack, end to end, and the place
 * where its hide is scraped.
 */
function slotFootprint(campId: number, k: number): { x: number; z: number }[] {
  const p = slotPoint(campId, k);
  // The lodging's floor, every layout metre out to its door, which people crouch through.
  const out = [p];
  for (const r of [1, 2, 3, 4, HUT_DOOR_M])
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * 2 * Math.PI;
      out.push({ x: p.x + r * detCos(a), z: p.z + r * detSin(a) });
    }
  for (let j = 0; j < 12; j++) {
    const a = (j / 12) * 2 * Math.PI;
    out.push({ x: p.x + (BUILD_RING_M + 1) * detCos(a), z: p.z + (BUILD_RING_M + 1) * detSin(a) });
  }
  const len = Math.sqrt(p.x * p.x + p.z * p.z);
  const [ux, uz] = [p.x / len, p.z / len];
  for (const [r, across] of [
    [RACK_R, 0],
    [RACK_R, 4],
    [RACK_R, -4],
    [RACK_R + SCRAPE_BACK_M, 0],
    [RACK_R + SCRAPE_BACK_M + 1, 0],
    [RACK_R + SCRAPE_BACK_M + 1, SCRAPE_SIDE_M],
  ] as const)
    out.push({ x: ux * r - uz * across, z: uz * r + ux * across });
  return out;
}

/** The first person is alone for this long of watching (section 4.2). */
const FOUNDER_ALONE_MS = 60_000;
/** A camp's room all round is measured out to this many layout metres, past the catch ring. */
const ROOM_CHECKED_M = 9.5;
/**
 * A camp site has room when at least this many of its lodging slots stand on dry land: a band
 * of three to five, four to a lodging, never needs more (peopling.md section 4: narrow lands).
 */
const MIN_DRY_SLOTS = 2;

/** A time window's chunk carries what happened this long of watching before it (milliseconds). */
const CHUNK_LEAD_MS = 60_000;

export function treeChunks(tree: Tree, windows: Day[], endDay: Day): (TreeChunk | undefined)[] {
  return windows.map((from, w) => {
    if (from >= endDay) return undefined;
    const to = Math.min(windows[w + 1] ?? endDay, endDay);
    const until = (d: Day) => (d === NEVER || d > endDay ? endDay : d);
    // What happened in the minute of watching before the window still shows in it: a
    // lodging taken down, its clearing growing back, a walk to a new camp. A minute is
    // centuries in the deep past and a year in the 20th century (spec section 2.1).
    const earliest = dayAtWatch(Math.max(0, watchAtDay(from) - CHUNK_LEAD_MS));
    const lodgings = new Map<number, TreeLodging>();
    const add = (id: number) => {
      const l = tree.lodgings[id]!;
      if (!lodgings.has(id)) lodgings.set(id, { ...l, gone: until(l.gone) });
    };
    for (const l of tree.lodgings) if (l.built < to && until(l.gone) > earliest) add(l.id);
    const figures: TreeFigure[] = [];
    for (const f of tree.figures) {
      if (f.born >= to || until(f.lost) <= earliest) continue;
      // The home at that minute's start and the one before it (for a walk under way), and later ones.
      let first = 0;
      while (first + 1 < f.homes.length && f.homes[first + 1]![0] <= earliest) first++;
      const homes = f.homes.slice(Math.max(0, first - 1)).filter(([d]) => d < to);
      for (const [, l] of homes) add(l);
      figures.push({ ...f, homes, lost: until(f.lost) });
    }
    const flags = (tree.flags ?? []).filter((f) => f.day < to);
    return {
      fromDay: from,
      toDay: to,
      figures,
      lodgings: [...lodgings.values()],
      ...(flags.length ? { flags } : {}),
    };
  });
}
