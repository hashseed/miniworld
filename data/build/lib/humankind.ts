// The tree build (spec humankind.md, sections 4 and 5): grows the tree of
// humankind from the first person at Lake Turkana, step by step through
// time, from the habitable land and the culture areas. Deterministic: whole
// days, the seeded hash and the deterministic trigonometry only, so the same
// inputs give the same tree on every machine.

import { hash32, hash01 } from '../../../app/src/core/hash.ts';
import { detCos, detSin, RAD } from '../../../app/src/core/detmath.ts';
import { DAYS_PER_YEAR, type Day } from '../../../app/src/time/calendar.ts';
import {
  NEVER,
  type MomentKind,
  type Tree,
  type TreeFigure,
  type TreeLodging,
} from '../../../app/src/world/tree.ts';

export type Density = 'sparse' | 'low' | 'medium';

/** Camp spacing and band sizes per density (section 4.1, Proposed). */
export const DENSITIES: Record<Density, { spacingKm: number; band: [number, number] }> = {
  sparse: { spacingKm: 900, band: [6, 10] },
  low: { spacingKm: 600, band: [8, 14] },
  medium: { spacingKm: 400, band: [10, 18] },
};

/** Figures a lodging holds, and lodgings a camp may have (section 4.1, Proposed). */
export const LODGING_CAPACITY = 4;
export const MAX_LODGINGS = 5;

const years = (y: number): number => Math.round(y * DAYS_PER_YEAR);
/** One step of the build: 25 years of history, a minute of watching (section 4.3). */
export const STEP_DAYS = years(25);
/** At most one figure comes out of a lodging in this time (section 4.3). */
export const EMERGE_DAYS = years(50);
/** A band moves its camp at the end of each residence window (section 4.4). */
export const RESIDENCE_DAYS = years(1000);
/** A full camp waits this long between sending out groups. */
export const BUD_DAYS = years(100);
/** ...and this long after finding no free land. */
const BUD_RETRY_DAYS = years(500);

const KM_PER_DEG = 111.195;

/** Where people may live, from the land, sea, ice and desert of a day. */
export interface Habitat {
  habitable(lat: number, lon: number, day: Day): boolean;
  /** How good a camp site is, 0 to 1: near water is better, high or dry ground worse. */
  score(lat: number, lon: number, day: Day): number;
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
      const score = habitat.score(lat, lon, day) + 0.1 * hash01(from.id, day, salt, k + 200);
      if (!best || score > best.score) best = { lat, lon, score };
    }
    return best;
  };

  const newFigure = (parent: number, born: Day, branch: number, lodging: number): TreeFigure => {
    const f: TreeFigure = {
      id: tree.figures.length,
      parent,
      born,
      branch,
      depth: parent === NEVER ? 0 : tree.figures[parent]!.depth + 1,
      homes: [[born, lodging]],
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
      kind: s.lodgingKind,
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
    tree.figures[figure]!.homes.push([day, to]);
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
      nextMove: day + RESIDENCE_DAYS + (hash32(id, 11) % RESIDENCE_DAYS),
      nextBud: day + BUD_DAYS,
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

  for (let day = s.startDay; day < s.endDay; day += STEP_DAYS) {
    // Camps founded during this step wait for the next one.
    const count = camps.length;
    for (let ci = 0; ci < count; ci++) {
      const camp = camps[ci]!;
      if (camp.lodgings.length === 0) continue;
      const people = camp.lodgings.flatMap((l) => residents.get(l)!);

      // The land changes under the camp: move before the sea, ice or desert arrive.
      if (!habitat.habitable(camp.lat, camp.lon, day + STEP_DAYS)) {
        const spot = findSpot(camp, day, 0.5, 3, 1);
        if (spot) {
          relocate(camp, spot.lat, spot.lon, day);
          moment('camp-moved-away', day, people[0]!, camp);
        }
        continue;
      }
      // The end of a residence window: the band moves a little way.
      if (day >= camp.nextMove) {
        camp.nextMove += RESIDENCE_DAYS;
        const spot = findSpot(camp, day, 0.2, 0.6, 2);
        if (spot) relocate(camp, spot.lat, spot.lon, day);
      }

      if (people.length < camp.target) {
        // New people step out of lodgings with room (section 4.3).
        let grown = false;
        for (const l of camp.lodgings) {
          const inside = residents.get(l)!;
          if (inside.length === 0 || inside.length >= LODGING_CAPACITY) continue;
          if (day - lastEmerge.get(l)! < EMERGE_DAYS && !(l === hut.id && inside.length === 1))
            continue;
          const parent = inside[hash32(l, day, 1) % inside.length]!;
          const born = day + (hash32(l, day, 2) % STEP_DAYS);
          const f = newFigure(parent, born, tree.figures[parent]!.branch, l);
          lastEmerge.set(l, born);
          if (f.id === 1) moment('first-born', born, f.id, camp);
          grown = true;
          break;
        }
        // Every lodging is full: someone builds another beside the hearth.
        if (!grown && camp.lodgings.length < MAX_LODGINGS) {
          const full = camp.lodgings.every((l) => residents.get(l)!.length >= LODGING_CAPACITY);
          if (full) {
            const builder = people[hash32(camp.id, day, 3) % people.length]!;
            const l = newLodging(camp, builder, day + (hash32(camp.id, day, 4) % STEP_DAYS));
            const from = tree.figures[builder]!.homes.at(-1)![1];
            moveIn(builder, from, l.id, l.built);
          }
        }
      } else if (day >= camp.nextBud) {
        // A full camp sends out a small group to found a new one (section 4.3).
        const spot = findSpot(camp, day, 1, 2, 3);
        if (!spot) {
          camp.nextBud = day + BUD_RETRY_DAYS;
          continue;
        }
        camp.nextBud = day + BUD_DAYS;
        // The first person stays at home, and the camp keeps most of its band.
        const candidates = people.filter((f) => f !== 0);
        const size = Math.min(candidates.length - 2, 2 + (hash32(camp.id, day, 5) % 3));
        if (size < 2) continue;
        const group: number[] = [];
        for (let k = 0; k < size; k++) {
          const pick = candidates.splice(hash32(camp.id, day, 6, k) % candidates.length, 1)[0]!;
          group.push(pick);
        }
        const child = newCamp(spot.lat, spot.lon, day);
        const arrive = day + (hash32(camp.id, day, 8) % STEP_DAYS);
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
