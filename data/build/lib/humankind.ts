// The tree build (spec humankind.md, sections 4 and 5): grows the tree of
// humankind from the first person at Lake Turkana, step by step through
// time, from the habitable land and the culture areas. Deterministic: whole
// days, the seeded hash and the deterministic trigonometry only, so the same
// inputs give the same tree on every machine.

import { hash32, hash01 } from '../../../app/src/core/hash.ts';
import { detCos, detSin, RAD } from '../../../app/src/core/detmath.ts';
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
  HEARTH_SPOTS,
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
/** ...and this long after finding no free land. */
const BUD_RETRY_MS = 600_000;

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
}

interface Camp {
  id: number;
  lat: number;
  lon: number;
  spacingKm: number;
  target: number;
  lodgings: number[];
  nextMove: Day;
  nextBud: Day;
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

  /** Whether people may set up camp at a point on a day, apart from other camps. */
  const allowed = (lat: number, lon: number, day: Day) =>
    s.density(lat, lon, day) !== undefined &&
    habitat.habitable(lat, lon, day) &&
    // Lodgings go up during the step, so the land must last through it.
    habitat.habitable(lat, lon, after(day, STEP_MS)) &&
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
    fleeing = false,
    /** The camp that will stand there, whose ring of lodging slots must have room. */
    campId = from.id,
  ): { lat: number; lon: number } | undefined => {
    let best: { lat: number; lon: number; score: number } | undefined;
    for (let k = 0; k < 16; k++) {
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
      // A camp is drawn far larger than life: it needs room for its people on land, unless
      // it is fleeing the sea, ice or desert, when any safe spot will do but room is better.
      // The band walks there in a straight line, so it must be land all the way: no sea or lake.
      const room =
        roomy(lat, lon, day) &&
        drySlots(campId, lat, lon, day) >= MIN_DRY_SLOTS &&
        walkable(from.lat, from.lon, lat, lon, day);
      if (!room && !fleeing) continue;
      const score =
        habitat.score(lat, lon, day) + (room ? 1 : 0) + 0.1 * hash01(from.id, day, salt, k + 200);
      if (!best || score > best.score) best = { lat, lon, score };
    }
    return best;
  };

  /** The point a drawn offset from a camp in layout metres (east, north) falls on. */
  const offset = (lat: number, lon: number, x: number, z: number) => ({
    lat: lat + (z * LAYOUT_KM_PER_M) / KM_PER_DEG,
    lon: lon + (x * LAYOUT_KM_PER_M) / (KM_PER_DEG * detCos(lat * RAD)),
  });
  const landAt = (p: { lat: number; lon: number }, day: Day) =>
    habitat.habitable(p.lat, p.lon, day) && habitat.habitable(p.lat, p.lon, after(day, STEP_MS));
  /** Land with no river on it, for the camp itself: its lodgings, spots and outings. */
  const dryAt = (p: { lat: number; lon: number }, day: Day) =>
    landAt(p, day) && (habitat.dry?.(p.lat, p.lon) ?? true);

  /** Whether the straight way between two points is land all the way, checked every 25 km. */
  const walkable = (lat0: number, lon0: number, lat1: number, lon1: number, day: Day) => {
    const n = Math.ceil(distanceKm(lat0, lon0, lat1, lon1) / 25);
    for (let k = 1; k < n; k++)
      if (
        !landAt({ lat: lat0 + ((lat1 - lat0) * k) / n, lon: lon0 + ((lon1 - lon0) * k) / n }, day)
      )
        return false;
    return true;
  };

  /** Whether the people's spots round a hearth would all be on land (section 8.1). */
  /** How many lodging slots of a camp at a place have the lodging and its builders on dry land. */
  const drySlots = (campId: number, lat: number, lon: number, day: Day): number =>
    Array.from({ length: LODGING_SLOTS }, (_, k) => slotPoint(campId, k)).filter((p) =>
      [
        p,
        ...Array.from({ length: 12 }, (_, j) => {
          const a = (j / 12) * 2 * Math.PI;
          return {
            x: p.x + (BUILD_RING_M + 1) * detCos(a),
            z: p.z + (BUILD_RING_M + 1) * detSin(a),
          };
        }),
      ].every((q) => dryAt(offset(lat, lon, q.x, q.z), day)),
    ).length;

  const roomy = (lat: number, lon: number, day: Day) => {
    if (!dryAt({ lat, lon }, day)) return false;
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
    const standsDry = (k: number) => {
      const p = slotPoint(camp.id, k);
      const round = Array.from({ length: 12 }, (_, j) => {
        const a = (j / 12) * 2 * Math.PI;
        return { x: p.x + (BUILD_RING_M + 1) * detCos(a), z: p.z + (BUILD_RING_M + 1) * detSin(a) };
      });
      return [p, ...round].every(at);
    };
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
      const p = slotPoint(camp.id, k);
      return [
        p,
        ...Array.from({ length: 12 }, (_, j) => {
          const a = (j / 12) * 2 * Math.PI;
          return {
            x: p.x + (BUILD_RING_M + 1) * detCos(a),
            z: p.z + (BUILD_RING_M + 1) * detSin(a),
          };
        }),
      ].every((q) => dryAt(offset(camp.lat, camp.lon, q.x, q.z), day));
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
        const wet = REACH_TURNS.some((turn) => {
          const [c, sn] = [detCos(turn), detSin(turn)];
          const x = (d.x * c - d.z * sn) * m * 1.1;
          const z = (d.x * sn + d.z * c) * m * 1.1;
          return !dryAt(offset(camp.lat, camp.lon, x, z), day);
        });
        if (wet) break;
        reach = m;
      }
      return reach;
    });

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
      kind: s.lodgingKind,
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
    for (const id of old) {
      const people = residents.get(id)!.slice();
      const fresh = newLodging(camp, people[0]!, day);
      // The last one out takes the old lodging down.
      for (const f of people) moveIn(f, id, fresh.id, day);
    }
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
    // Camps founded during this step wait for the next one.
    const count = camps.length;
    for (let ci = 0; ci < count; ci++) {
      const camp = camps[ci]!;
      if (camp.lodgings.length === 0) continue;
      const people = camp.lodgings.flatMap((l) => residents.get(l)!);

      // The land changes under the camp: move before the sea, ice or desert arrive.
      if (!habitat.habitable(camp.lat, camp.lon, day + step)) {
        const spot = findSpot(camp, day, 0.5, 3, 1, true);
        if (spot) {
          relocate(camp, spot.lat, spot.lon, day);
          moment('camp-moved-away', day, people[0]!, camp);
        }
        continue;
      }
      // The end of a residence window: the band moves a little way.
      if (day >= camp.nextMove) {
        camp.nextMove = after(day, RESIDENCE_MS + (hash32(camp.id, day, 12) % RESIDENCE_MS));
        const spot = findSpot(camp, day, 0.2, 0.6, 2);
        if (spot) relocate(camp, spot.lat, spot.lon, day);
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
      } else if (day >= camp.nextBud) {
        // A full camp sends out a small group to found a new one (section 4.3).
        const spot = findSpot(camp, day, 1, 2, 3, false, camps.length);
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
/** The first person is alone for this long of watching (section 4.2). */
const FOUNDER_ALONE_MS = 60_000;
/** A camp site has room when at least this many of its lodging slots stand on dry land. */
const MIN_DRY_SLOTS = 3;

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
    return { fromDay: from, toDay: to, figures, lodgings: [...lodgings.values()] };
  });
}
