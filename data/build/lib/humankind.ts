// The tree build (spec humankind.md, sections 4 and 5; sites.md): grows the tree of
// humankind from the first person at Lake Turkana, step by step through time. Bands
// camp only at the precomputed sites and travel only along their links, and the rules
// bound to region and time (culture areas, arrival map, thresholds, morphs) decide who
// lives where. Deterministic: whole days, the seeded hash and the deterministic
// trigonometry only, so the same inputs give the same tree on every machine.

import { hash32, hash01 } from '../../../app/src/core/hash.ts';
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
  COMPACT_SITE,
  LAYOUT_KM_PER_M,
  MINIMAL_LODGING,
  MINIMAL_SITE,
  layoutOf,
  HEARTH_SPOTS,
  LODGING_SLOTS,
  REGROW_MS,
  type TreeChunk,
} from '../../../app/src/world/treeScene.ts';
import { distanceKm } from './geo.ts';
import {
  footprintM,
  laneReach,
  MOVE_KM,
  KEY_PLACE_FAR_KM,
  SITE_STEP_KM,
  wayLevel,
  type Link,
  type Site,
  type SiteMap,
} from './sites.ts';

export { distanceKm, onGlobe } from './geo.ts';

export type Density = 'remote' | 'sparse' | 'low' | 'medium';

/** Camp spacing per density (section 4.1, Proposed); every band is 3 to 5 (Yang, 2026-10-18). */
export const DENSITIES: Record<Density, { spacingKm: number; band: [number, number] }> = {
  remote: { spacingKm: 2800, band: [3, 5] },
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
/** A full camp waits this long between sending out groups, and as long after finding no free site. */
const BUD_MS = 180_000;
/** The first person is alone for this long of watching (section 4.2). */
const FOUNDER_ALONE_MS = 60_000;

/** A band needs at least this many dry lodging places at its site: three to five, four to a lodging (sites.md section 2). */
const MIN_PLACES = 2;
/** Groups budding off go at most this many links (sites.md section 4, Proposed). */
const BUD_HOPS = 5;
/** A band fleeing the water looks this many links away for a free site, and this many for bands to join. */
const FLEE_HOPS = 6;
const JOIN_HOPS = 6;
/** ...and as a last resort this many for any empty site, however near another band. */
const CROWD_HOPS = 12;

/** What the build tells about the tree without failing: bands that had to crowd a neighbour. */
export const treeStats = {
  crowded: 0,
  stuck: 0,
  /** The place table (sites.md section 2.1). */
  places: [] as PlaceRow[],
  /**
   * For the events dialog (milestone-1 section 8.3), not shipped with the tree: the day each
   * route leg was reached and the band's site, and the first landing after each listed sea
   * crossing. Positions in degrees.
   */
  reached: [] as { leg: string; day: Day; lat: number; lon: number }[],
  crossed: [] as { crossing: string; day: Day; lat: number; lon: number }[],
};

/** A record that needs a band at a place over a span of days (sites.md section 2.1). */
export interface DatedPlace {
  kind: 'arrival' | 'anchor' | 'threshold';
  id: string;
  day: Day;
  until: Day;
  lat: number;
  lon: number;
}

/** A row of the place table: a dated place and its site. */
export interface PlaceRow extends DatedPlace {
  site: number;
  siteLat: number;
  siteLon: number;
  km: number;
}

/** The dated places of the tree's settings (sites.md section 2.1). */
export function datedPlaces(
  s: Pick<TreeSettings, 'voyages' | 'anchors' | 'thresholds' | 'endDay'>,
): DatedPlace[] {
  return [
    ...(s.voyages ?? [])
      .filter((v) => !v.passage)
      .map((v) => ({
        kind: 'arrival' as const,
        id: v.id,
        day: v.day,
        until: v.day + ARRIVAL_SPAN_DAYS,
        ...v.way.at(-1)!,
      })),
    ...(s.anchors ?? []).map((a) => ({ kind: 'anchor' as const, ...a })),
    ...(s.thresholds ?? []).map((t) => ({ kind: 'threshold' as const, ...t, until: s.endDay })),
  ].map(({ kind, id, day, until, lat, lon }) => ({ kind, id, day, until, lat, lon }));
}
/** A site is on a place's own land when it walks to the site nearest the place in this many links. */
const OWN_LAND_HOPS = 24;
/** A stranded band paddles to a site at most this far away, in km (sites.md section 3). */
const STRANDED_KM = 16 * SITE_STEP_KM;
/** A route's band comes from at most this many links away. */
const ROUTE_HOPS = 80;
/** A band roams among its site and up to this many more (sites.md section 4). */
const RANGE_MORE = 3;
/** An arrival point's site must stay usable this long after its date (sites.md section 2.1). */
const ARRIVAL_SPAN_DAYS = Math.round(500 * 365.2425);
/** An anchor's band sets off up to 500 years ahead (section 4.1). */
const ANCHOR_LEAD_DAYS = Math.round(500 * 365.2425);
/** Bands change culture at a moment chosen within this many years of a morph (sites.md section 5). */
const MORPH_YEARS = 100;

/** Camps this close to a threshold settle from its day: they stop moving and budding. */
export const SETTLE_KM = 800;

/** The day a span of watching time after a day, and at least the next day. */
const after = (day: Day, ms: number): Day => Math.max(day + 1, dayAtWatch(watchAtDay(day) + ms));
/** A band decides again at the latest this long after it chose where to stand. */
const ahead = (day: Day): Day => after(day, 2 * RESIDENCE_MS);

/** Where people may live, from the land, sea, ice and desert of a day. */
export interface Habitat {
  /** Whether a camp's hearth may stand at a point on a day: land, no ice, no desert, not too high. */
  habitable(lat: number, lon: number, day: Day): boolean;
  /** How good a camp site is, 0 to 1: near water is better, high or dry ground worse. */
  score(lat: number, lon: number, day: Day): number;
  /** Tree cover, 0 to 1, on a day: a band fells it before it builds (section 8.1). */
  wood?(lat: number, lon: number, day: Day): number;
}

export interface TreeSettings {
  /** The first person's place, in degrees: she camps at the site nearest it. */
  founder: { lat: number; lon: number };
  /** The model of the first lodging and every lodging of the prologue. */
  lodgingKind: string;
  startDay: Day;
  endDay: Day;
  /** Until this day camps may only stand behind the front from the founder (section 4.2). */
  prologueEndDay: Day;
  frontKmPerYear: number;
  /** The camp sites and their links (sites.md). */
  sites: SiteMap;
  /** Mean sea level in metres on a day. */
  seaLevel(day: Day): number;
  /** The sea level above which a point is sea for walkers, for stranded bands paddling away (sites.md section 3). */
  walkFlood?(lat: number, lon: number): number;
  /** The density of the culture area at a place and day, or undefined outside every area. */
  density(lat: number, lon: number, day: Day): Density | undefined;
  /** A culture area's own camp spacing in km, overriding its density's (humankind.md section 4.1). */
  spacing?(lat: number, lon: number, day: Day): number | undefined;
  /** The culture of the area at a place and day (peopling.md section 5.1); without it, every camp is the founder's. */
  culture?(lat: number, lon: number, day: Day): string | undefined;
  /** Whether the way of life of the area at a place lets people camp there on a day: cold and height (peopling.md section 5.2). */
  livable?(lat: number, lon: number, day: Day): boolean;
  /** The first day people may camp at a place, from the arrival map (peopling.md section 4). */
  arrival?(lat: number, lon: number): Day;
  /** The lodging model of a culture's camps. */
  lodgingOf?(culture: string): string;
  /** The arrival points of the routes, from their days (peopling.md section 3). */
  voyages?: Voyage[];
  /** Neolithic thresholds, where camps settle and raise a red flag (peopling.md section 3.6). */
  thresholds?: Threshold[];
  /** Places that must have a band from a day to a day (sites.md section 4.1). */
  anchors?: Anchor[];
  /** The culture area holding a place on a day, as an index, for the band caps (sites.md section 4). */
  areaOf?(lat: number, lon: number, day: Day): number | undefined;
  /** At most this many bands in that area on that day, or no cap. */
  maxBands?(lat: number, lon: number, day: Day): number | undefined;
}

/** A route's arrival point (peopling.md section 4): its way's last point and its day. */
export interface Voyage {
  id: string;
  /** The route's previous point, whose leg's target is this leg's origin (sites.md section 4). */
  from?: string;
  /** A way through, not a place to camp: nobody is sent to found a camp near it. */
  passage?: boolean;
  day: Day;
  way: { lat: number; lon: number }[];
}

/** A place that must have a band from a day until a day (sites.md section 4.1). */
export interface Anchor {
  id: string;
  day: Day;
  until: Day;
  lat: number;
  lon: number;
}

/** A Neolithic threshold (peopling.md section 3.6). */
export interface Threshold {
  id: string;
  day: Day;
  lat: number;
  lon: number;
}

/** A band of the tree: the people of one camp, at one site at a time. */
interface Camp {
  id: number;
  site: Site;
  spacingKm: number;
  target: number;
  lodgings: number[];
  nextMove: Day;
  nextBud: Day;
  /** Its culture (peopling.md section 5.1). */
  culture: string | undefined;
  /** It has settled at a Neolithic threshold: it no longer moves or buds (peopling.md section 3.6). */
  settled: boolean;
  /** The day it takes on its site's new culture, once a morph has come (sites.md section 5). */
  morphAt: Day | undefined;
  /** Its home range: the sites it roams among, which no other band buds onto (sites.md section 4). */
  range: Site[];
  /** An anchor holds it at its site, settled, until this day (sites.md section 4.1). */
  holdUntil: Day | undefined;
}

/** A path of sites along links, from the first to the last. */
type Path = Site[];

const micro = (deg: number): number => Math.round(deg * 1e6);

/** Grows the tree of humankind from the first person (section 4). */
export function buildTree(s: TreeSettings, habitat: Habitat): Tree {
  const tree: Tree = { figures: [], lodgings: [], branches: [], moments: [] };
  treeStats.crowded = 0;
  treeStats.stuck = 0;
  treeStats.places = [];
  treeStats.reached = [];
  treeStats.crossed = [];
  const { sites, linksOf } = s.sites;
  const camps: Camp[] = [];
  /** Residents of each standing lodging, and the day of its last emergence. */
  const residents = new Map<number, number[]>();
  const lastEmerge = new Map<number, Day>();
  /** When the last band left each site, for the trees growing back (sites.md section 6). */
  const left = new Map<number, Day>();
  /** Camps that people joined this step, which wait for the next. */
  const joined = new Set<Camp>();
  /** Sites whose band is leaving to join others at the end of this step, kept until the next. */
  const held = new Map<number, Site>();

  const moment = (kind: MomentKind, day: Day, figure: number, camp: Camp, branch = 0) =>
    tree.moments.push({
      day,
      kind,
      figure,
      camp: camp.id,
      branch,
      lat: micro(camp.site.lat),
      lon: micro(camp.site.lon),
    });

  /** The highest sea between two days, from a few days along the way (more for a long span). */
  const seaMax = (from: Day, to: Day): number => {
    let m = Math.max(s.seaLevel(from), s.seaLevel(to));
    // At least every century of a long span.
    const n = Math.max(8, Math.ceil((to - from) / (100 * DAYS_PER_YEAR)));
    for (let k = 1; k < n; k++)
      m = Math.max(m, s.seaLevel(from + Math.floor(((to - from) * k) / n)));
    return m;
  };

  const frontOk = (site: Site, day: Day) =>
    day >= s.prologueEndDay ||
    distanceKm(s.founder.lat, s.founder.lon, site.lat, site.lon) <=
      (s.frontKmPerYear * (day - s.startDay)) / DAYS_PER_YEAR;

  /** Whether the people of the site's area can live at its hearth on a day. */
  const livable = (site: Site, day: Day) =>
    habitat.habitable(site.lat, site.lon, day) && (s.livable?.(site.lat, site.lon, day) ?? true);

  /** Whether the rules let a band camp at a site from a day: area, arrival, front and way of life. */
  const allowed = (site: Site, day: Day) =>
    s.density(site.lat, site.lon, day) !== undefined &&
    (s.arrival?.(site.lat, site.lon) ?? -Infinity) <= day &&
    frontOk(site, day) &&
    livable(site, day) &&
    livable(site, ahead(day));

  /** Whether a site has room for all of a camp's activities from a day to the band's next decision (sites.md section 2). */
  const dry = (site: Site, day: Day, people = 0) => {
    // A compact camp holds one ring of people, eight at most (sites.md section 2.1).
    if (people > layoutOf(site.key).people) return false;
    const sea = seaMax(day, ahead(day));
    const need = Math.max(site.compact ? 1 : MIN_PLACES, Math.ceil(people / LODGING_CAPACITY));
    return site.core > sea && site.places.filter((p) => p > sea).length >= need;
  };
  const usable = (site: Site, day: Day, people = 0) => dry(site, day, people) && allowed(site, day);
  const headcount = (c: Camp) => c.lodgings.reduce((n, l) => n + residents.get(l)!.length, 0);

  /** The band at a site, if any. */
  // The band at each site, kept to the rule of one band a site (sites.md section 4).
  const bandAtReal = new Map<number, Camp>();
  const bandAt = {
    get: (k: number) => bandAtReal.get(k),
    has: (k: number) => bandAtReal.has(k),
    set: (k: number, c: Camp) => {
      if (bandAtReal.has(k) && bandAtReal.get(k) !== c)
        throw new Error(
          `tree of humankind: band ${c.id} takes site ${k}, held by band ${bandAtReal.get(k)!.id}`,
        );
      bandAtReal.set(k, c);
    },
    delete: (k: number, c?: Camp) => {
      if (c && bandAtReal.get(k) !== c)
        throw new Error(
          `tree of humankind: band ${c.id} leaves site ${k}, held by band ${bandAtReal.get(k)?.id}`,
        );
      bandAtReal.delete(k);
    },
  };
  /** The camp spacing at a place: its culture area's own, else its density's. */
  const spacingOf = (lat: number, lon: number, day: Day) =>
    s.spacing?.(lat, lon, day) ?? DENSITIES[s.density(lat, lon, day) ?? 'low'].spacingKm;
  const spacingAt = (site: Site, day: Day) => spacingOf(site.lat, site.lon, day);
  /** Whether a site is far enough from every other band (sites.md section 4). */
  const free = (site: Site, day: Day, except?: Camp) => {
    const spacing = spacingAt(site, day);
    if ([...held.values()].some((h) => distanceKm(h.lat, h.lon, site.lat, site.lon) < spacing))
      return false;
    // Overlapping sites are mutually exclusive, and bands keep their density's spacing.
    return camps.every((c) => {
      if (c === except || c.lodgings.length === 0) return true;
      const km = distanceKm(c.site.lat, c.site.lon, site.lat, site.lon);
      return (
        km >= Math.min(spacing, c.spacingKm) &&
        km >=
          (footprintM(site.key) / site.width + footprintM(c.site.key) / c.site.width) *
            LAYOUT_KM_PER_M
      );
    });
  };

  /** Whether a link can be walked, or paddled at a listed crossing, on a day. */
  const open = (l: Link, day: Day) =>
    l.crossing ? l.crossing.day <= day : l.level > seaMax(day, after(day, STEP_MS));
  const other = (l: Link, site: Site) => sites[l.a === site.id ? l.b : l.a]!;

  /**
   * The sites reachable from a site along open links on a day, nearest first by links, each
   * with the path to it, up to a number of links; `keep` picks the ones to return.
   */
  const reach = (from: Site, day: Day, hops: number, keep: (site: Site, n: number) => boolean) => {
    const back = new Map<number, Site | undefined>([[from.id, undefined]]);
    const found: { site: Site; hops: number; path: Path }[] = [];
    let ring: Site[] = [from];
    for (let n = 1; n <= hops && ring.length; n++) {
      const next: Site[] = [];
      for (const site of ring)
        for (const l of linksOf[site.id]!) {
          const to = other(l, site);
          if (back.has(to.id) || !open(l, day)) continue;
          back.set(to.id, site);
          next.push(to);
        }
      next.sort((a, b) => a.id - b.id);
      for (const site of next)
        if (keep(site, n)) {
          const path: Path = [site];
          for (let p = back.get(site.id); p; p = back.get(p.id)) path.unshift(p);
          found.push({ site, hops: n, path });
        }
      ring = next;
    }
    return found;
  };

  /** The best of some sites by the habitat score, with a little hash. */
  const best = <T extends { site: Site }>(options: T[], day: Day, salt: number): T | undefined => {
    let top: T | undefined;
    let topScore = -Infinity;
    for (const o of options) {
      // Bands take a compact camp only where no full one is free.
      const score =
        habitat.score(o.site.lat, o.site.lon, day) +
        0.1 * hash01(o.site.id, day, salt) -
        (o.site.compact ? 2 : 0);
      if (score > topScore) [top, topScore] = [o, score];
    }
    return top;
  };

  /**
   * The way a band walks along a path of sites, for its new lodgings: the points between its
   * old and new site, and for each stretch whether it is paddled (a listed crossing).
   */
  const crossedYet = new Set<string>();
  const wayOf = (path: Path, day: Day): TreeLodging['voyage'] => {
    if (path.length <= 2 && !crossingOf(path[0], path[1])) return undefined;
    const points: { lat: number; lon: number }[] = [path[0]!];
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1]!, path[i]!];
      const x = crossingOf(a, b);
      // On foot to the shore, by canoe along the crossing, on foot from the far shore.
      if (x) points.push(...(x.forward ? x.way : [...x.way].reverse()));
      if (x && !crossedYet.has(x.id)) {
        crossedYet.add(x.id);
        treeStats.crossed.push({ crossing: x.id, day, lat: b.lat, lon: b.lon });
      }
      points.push(b);
    }
    // Each stretch is paddled where it is not dry on the day the band goes.
    const sea = seaMax(day, after(day, STEP_MS));
    const water = points
      .slice(1)
      .map((b, i) => !!s.walkFlood && wayLevel(points[i]!, b, s.walkFlood) <= sea);
    return {
      id: 'path',
      way: points.slice(1, -1).map((p) => [micro(p.lat), micro(p.lon)]),
      water,
    };
  };
  const crossingOf = (a: Site | undefined, b: Site | undefined) => {
    if (!a || !b) return undefined;
    const l = linksOf[a.id]!.find((x) => other(x, a) === b && x.crossing);
    return l?.crossing && { id: l.crossing.id, way: l.crossing.way, forward: l.a === a.id };
  };

  /** The lodging places of a site that stay dry from a day to the band's next decision, lowest first. */
  const dryPlaces = (site: Site, day: Day) => {
    const sea = seaMax(day, ahead(day));
    return site.places.flatMap((p, k) => (p > sea ? [k] : []));
  };
  /** How many of a band's site's dry places no lodging of the band takes. */
  const freePlaces = (camp: Camp, day: Day) => {
    const taken = new Set(camp.lodgings.map((l) => tree.lodgings[l]!.slot));
    return dryPlaces(camp.site, day).filter((k) => !taken.has(k)).length;
  };
  const hasPlace = (camp: Camp, day: Day) => freePlaces(camp, day) > 0;

  /** The share of a site's trees grown back since its last band left (sites.md section 6). */
  const regrown = (site: Site, day: Day) => {
    const gone = left.get(site.id);
    if (gone === undefined) return 1;
    return Math.min(1, Math.max(0, (watchAtDay(day) - watchAtDay(gone)) / REGROW_MS));
  };

  /** The lowest spot at a camp's hearth that none of its people takes, the mover aside. */
  const freeSpot = (camp: Camp, mover = NEVER): number => {
    const taken = new Set<number>();
    for (const l of camp.lodgings)
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
      homes: [[born, lodging, freeSpot(campOf(lodging))]],
      lost: NEVER,
    };
    tree.figures.push(f);
    residents.get(lodging)!.push(f.id);
    return f;
  };
  const campOfLodging = new Map<number, Camp>();
  const campOf = (lodging: number) => campOfLodging.get(lodging)!;

  /** A lodging at the camp's site, on its lowest free dry place, its lanes as far as they stay dry. */
  const newLodging = (camp: Camp, builder: number, day: Day, way?: TreeLodging['voyage']) => {
    const site = camp.site;
    if (bandAt.get(site.id) !== camp)
      throw new Error(
        `tree of humankind: band ${camp.id} builds at site ${site.id}, held by band ${bandAt.get(site.id)?.id}`,
      );
    const taken = new Set(camp.lodgings.map((l) => tree.lodgings[l]!.slot));
    const places = dryPlaces(site, day).filter((k) => !taken.has(k));
    const slot = places[0];
    if (slot === undefined)
      throw new Error(
        `tree of humankind: band ${camp.id} has no dry place at site ${site.id} on day ${day}`,
      );
    const sea = seaMax(day, ahead(day));
    const l: TreeLodging = {
      id: tree.lodgings.length,
      camp: site.key,
      lat: micro(site.lat),
      lon: micro(site.lon),
      built: day,
      gone: NEVER,
      builder,
      slot,
      reach: Array.from({ length: LODGING_SLOTS }, (_, gap) => laneReach(site, gap, sea)),
      room: layoutOf(site.key).core,
      // A minimal camp's small shelter, else the culture's own (sites.md section 2).
      kind:
        site.key >= MINIMAL_SITE
          ? MINIMAL_LODGING
          : (camp.culture && s.lodgingOf?.(camp.culture)) || s.lodgingKind,
      ...(camp.culture ? { culture: camp.culture } : {}),
      ...(habitat.wood
        ? {
            wood:
              Math.round(100 * habitat.wood(site.lat, site.lon, day) * regrown(site, day)) / 100,
          }
        : {}),
      ...(way ? { voyage: way } : {}),
    };
    tree.lodgings.push(l);
    camp.lodgings.push(l.id);
    campOfLodging.set(l.id, camp);
    residents.set(l.id, []);
    lastEmerge.set(l.id, day);
    return l;
  };

  /** A figure moves to another lodging; the one it leaves is taken down once empty. */
  const moveIn = (figure: number, from: number, to: number, day: Day) => {
    const list = residents.get(from)!;
    list.splice(list.indexOf(figure), 1);
    residents.get(to)!.push(figure);
    tree.figures[figure]!.homes.push([day, to, freeSpot(campOf(to), figure)]);
    if (list.length === 0) {
      const old = tree.lodgings[from]!;
      old.gone = day;
      const camp = campOf(from);
      camp.lodgings = camp.lodgings.filter((l) => l !== from);
      residents.delete(from);
      if (camp.lodgings.length === 0) {
        bandAt.delete(camp.site.id, camp);
        left.set(camp.site.id, day);
      }
    }
  };
  const homeOf = (f: number) => tree.figures[f]!.homes.at(-1)![1];

  /** Which band holds each site in its home range (sites.md section 4). */
  const ownerOf = new Map<number, Camp>();
  /** Whether a site is in another standing band's home range. */
  const reserved = (site: Site, camp?: Camp) => {
    const o = ownerOf.get(site.id);
    return !!o && o !== camp && o.lodgings.length > 0;
  };
  /**
   * A band's home range: its site and up to RANGE_MORE usable sites linked to it within the
   * roaming distance that no other band holds, nearest first; an anchored band's is its site.
   */
  const takeRange = (camp: Camp, day: Day) => {
    for (const x of camp.range) if (ownerOf.get(x.id) === camp) ownerOf.delete(x.id);
    const here = camp.site;
    const more =
      camp.holdUntil !== undefined && camp.holdUntil >= day
        ? []
        : linksOf[here.id]!.filter((l) => !l.crossing && open(l, day))
            .map((l) => other(l, here))
            .filter(
              (x) =>
                !x.pass &&
                distanceKm(x.lat, x.lon, here.lat, here.lon) <= MOVE_KM &&
                !reserved(x, camp) &&
                usable(x, day),
            )
            .sort(
              (a, b) =>
                distanceKm(a.lat, a.lon, here.lat, here.lon) -
                  distanceKm(b.lat, b.lon, here.lat, here.lon) || a.id - b.id,
            )
            .slice(0, RANGE_MORE);
    camp.range = [here, ...more];
    for (const x of camp.range) ownerOf.set(x.id, camp);
  };
  /** Bands standing per culture area on a day, for the caps (sites.md section 4). */
  let capDay = NaN;
  const perArea = new Map<number, number>();
  /** Whether a site's area is full for a band moving into it from elsewhere. */
  const areaFullFor = (site: Site, day: Day, mover: Camp) => {
    const k = s.areaOf?.(site.lat, site.lon, day);
    if (k !== undefined && k === s.areaOf?.(mover.site.lat, mover.site.lon, day)) return false;
    return areaFull(site, day);
  };
  const areaFull = (site: Site, day: Day) => {
    const cap = s.maxBands?.(site.lat, site.lon, day);
    if (cap === undefined || !s.areaOf) return false;
    if (capDay !== day) {
      capDay = day;
      perArea.clear();
      for (const c of camps) {
        if (c.lodgings.length === 0) continue;
        const k = s.areaOf(c.site.lat, c.site.lon, day);
        if (k !== undefined) perArea.set(k, (perArea.get(k) ?? 0) + 1);
      }
    }
    return (perArea.get(s.areaOf(site.lat, site.lon, day) ?? -1) ?? 0) >= cap;
  };
  const isHeld = (c: Camp, day: Day) => c.holdUntil !== undefined && c.holdUntil >= day;

  const newCamp = (site: Site, day: Day): Camp => {
    const density = {
      ...DENSITIES[s.density(site.lat, site.lon, day) ?? 'low'],
      spacingKm: spacingOf(site.lat, site.lon, day),
    };
    const id = camps.length;
    const [lo, hi] = density.band;
    const camp: Camp = {
      id,
      site,
      spacingKm: density.spacingKm,
      target: lo + (hash32(id, 7) % (hi - lo + 1)),
      lodgings: [],
      // Each band keeps its own rhythm of moving, so camps do not all move at once.
      nextMove: after(day, RESIDENCE_MS + (hash32(id, 11) % RESIDENCE_MS)),
      nextBud: after(day, BUD_MS),
      culture: s.culture?.(site.lat, site.lon, day),
      settled: false,
      morphAt: undefined,
      range: [],
      holdUntil: undefined,
    };
    camps.push(camp);
    bandAt.set(site.id, camp);
    takeRange(camp, day);
    capDay = NaN;
    return camp;
  };

  /**
   * The whole band takes down its lodgings and builds them again at the end of a path of
   * sites, or where it stands for a path of one; as many lodgings as it needs, four to a
   * lodging, so they fit the dry places. It takes on the culture of its new site.
   */
  const relocate = (camp: Camp, path: Path, day: Day) => {
    const old = camp.lodgings;
    const people = old.flatMap((id) => residents.get(id)!.map((f) => [f, id] as const));
    const from = camp.site;
    const to = path.at(-1)!;
    if (from !== to) {
      bandAt.delete(from.id, camp);
      left.set(from.id, day);
      bandAt.set(to.id, camp);
    }
    camp.site = to;
    if (!camp.range.includes(to)) takeRange(camp, day);
    capDay = NaN;
    camp.lodgings = [];
    camp.culture = s.culture?.(to.lat, to.lon, day) ?? camp.culture;
    camp.morphAt = undefined;
    const way = wayOf(path, day);
    for (let k = 0; k < people.length; k += LODGING_CAPACITY) {
      const group = people.slice(k, k + LODGING_CAPACITY);
      const fresh = newLodging(camp, group[0]![0], day, way);
      for (const [f, id] of group) moveIn(f, id, fresh.id, day);
    }
    // A red flag goes with its settled camp, behind one of its new lodgings (peopling.md section 3.6).
    for (const f of tree.flags ?? [])
      if (f.camp === from.key && f.until === NEVER && camp.settled) {
        f.until = day;
        const slot = Math.min(...camp.lodgings.map((l) => tree.lodgings[l]!.slot));
        tree.flags!.push({
          ...f,
          camp: to.key,
          day,
          until: NEVER,
          lat: micro(to.lat),
          lon: micro(to.lon),
          slot,
        });
        break;
      }
  };

  /** Two or three people of a band, never the first person, leaving at least one behind. */
  const groupOf = (camp: Camp, day: Day, salt: number): number[] => {
    const people = camp.lodgings.flatMap((l) => residents.get(l)!);
    const candidates = people.filter((f) => f !== 0);
    const size = Math.min(
      candidates.length,
      people.length - 1,
      2 + (hash32(camp.id, day, salt) % 2),
    );
    if (size < 2) return [];
    const group: number[] = [];
    for (let k = 0; k < size; k++)
      group.push(candidates.splice(hash32(camp.id, day, salt, k) % candidates.length, 1)[0]!);
    return group;
  };

  /** A group founds a new camp at the end of a path of sites. */
  const found = (group: number[], path: Path, day: Day): Camp => {
    const child = newCamp(path.at(-1)!, day);
    const l = newLodging(child, group[0]!, day, wayOf(path, day));
    for (const f of group) moveIn(f, homeOf(f), l.id, day);
    return child;
  };

  /** The water is coming: the band leaves for the nearest free site it can use (sites.md section 4). */
  const flee = (camp: Camp, day: Day): boolean => {
    const n = headcount(camp);
    const nearestOf = <T extends { hops: number; site: Site }>(options: T[], salt: number) =>
      best(
        options.filter((o) => o.hops === (options[0]?.hops ?? 0)),
        day,
        salt,
      );
    // Into a culture area with room under its cap if it can (sites.md section 4), else any.
    const fits = (site: Site) => usable(site, day, n) && free(site, day, camp);
    const pick = nearestOf(
      reach(camp.site, day, FLEE_HOPS, (site) => fits(site) && !areaFullFor(site, day, camp)),
      21,
    );
    if (pick) {
      relocate(camp, pick.path, day);
      return true;
    }
    // Joining a band nearby comes before moving into an area at its cap.
    if (join(camp, day)) return true;
    const intoFull = nearestOf(reach(camp.site, day, FLEE_HOPS, fits), 21);
    if (intoFull) {
      relocate(camp, intoFull.path, day);
      return true;
    }
    if (paddle(camp, day)) return true;
    // Last of all, any empty site it can use, even closer to a neighbour than its spacing.
    const crowd = nearestOf(
      reach(camp.site, day, CROWD_HOPS, (site) => usable(site, day, n) && !bandAt.has(site.id)),
      22,
    );
    if (!crowd) return false;
    relocate(camp, crowd.path, day);
    treeStats.crowded++;
    return true;
  };

  /** ...else its people join nearby bands with room, as many to each as fit. */
  const join = (camp: Camp, day: Day): boolean => {
    const people = camp.lodgings.flatMap((l) => residents.get(l)!);
    if (people.includes(0)) return false;
    const options = reach(camp.site, day, JOIN_HOPS, (site) => {
      const c = bandAt.get(site.id);
      return !!c && c !== camp && !joined.has(c) && dry(site, day) && livable(site, ahead(day));
    });
    // They arrive at the end of the step, after anyone leaving those camps during it; their
    // site stays theirs until then.
    const at = after(day, STEP_MS) - 1;
    held.set(camp.site.id, camp.site);
    let moved = false;
    for (const o of options) {
      const to = bandAt.get(o.site.id)!;
      joined.add(to);
      while (people.length && headcount(to) < layoutOf(to.site.key).people) {
        // A neighbour's lodgings with room are walked to straight; farther ones need a new lodging.
        let room =
          o.hops === 1 && !crossingOf(camp.site, o.site)
            ? to.lodgings.find((l) => residents.get(l)!.length < LODGING_CAPACITY)
            : undefined;
        if (room === undefined && to.lodgings.length < MAX_LODGINGS && hasPlace(to, at))
          room = newLodging(to, people[0]!, at, wayOf(o.path, at)).id;
        if (room === undefined) break;
        const f = people.shift()!;
        moveIn(f, homeOf(f), room, at);
        moved = true;
      }
      if (!people.length) break;
    }
    return moved;
  };

  /**
   * ...else, stranded, it paddles straight across the water to the nearest free site near by,
   * or to a band there with room (sites.md section 3), putting in and landing wherever the
   * way changes between land and water.
   */
  const paddle = (camp: Camp, day: Day): boolean => {
    if (!s.walkFlood) return false;
    const sea = seaMax(day, after(day, STEP_MS));
    const n = headcount(camp);
    const near = sites
      .filter(
        (site) =>
          site !== camp.site &&
          distanceKm(site.lat, site.lon, camp.site.lat, camp.site.lon) <= STRANDED_KM,
      )
      .sort(
        (a, b) =>
          distanceKm(a.lat, a.lon, camp.site.lat, camp.site.lon) -
            distanceKm(b.lat, b.lon, camp.site.lat, camp.site.lon) || a.id - b.id,
      );
    // Free sites and bands with room first; then, crowded, any empty site it can use.
    const options = [
      ...near.map((site) => ({ site, crowd: false })),
      ...near.map((site) => ({ site, crowd: true })),
    ];
    for (const { site, crowd } of options) {
      const to = bandAt.get(site.id);
      if (crowd && (to || !usable(site, day, n))) continue;
      const roomy = crowd
        ? true
        : to
          ? !joined.has(to) &&
            freePlaces(to, day) >= Math.ceil(n / LODGING_CAPACITY) &&
            dry(site, day, headcount(to) + n) &&
            livable(site, ahead(day)) &&
            headcount(to) + n <= layoutOf(site.key).people
          : usable(site, day, n) && free(site, day, camp);
      if (!roomy) continue;
      const voyage = { id: 'stranded', ...shores(camp.site, site, sea) };
      const people = camp.lodgings.flatMap((id) => residents.get(id)!.map((f) => [f, id] as const));
      const from = camp.site;
      if (to) {
        // Into new lodgings at the band there, as many as they need.
        joined.add(to);
        for (let k = 0; k < people.length; k += LODGING_CAPACITY) {
          const group = people.slice(k, k + LODGING_CAPACITY);
          const fresh = newLodging(to, group[0]![0], day, voyage);
          for (const [f, id] of group) moveIn(f, id, fresh.id, day);
        }
        return true;
      }
      if (crowd) treeStats.crowded++;
      bandAt.delete(from.id, camp);
      left.set(from.id, day);
      bandAt.set(site.id, camp);
      camp.site = site;
      camp.lodgings = [];
      camp.culture = s.culture?.(site.lat, site.lon, day) ?? camp.culture;
      for (let k = 0; k < people.length; k += LODGING_CAPACITY) {
        const group = people.slice(k, k + LODGING_CAPACITY);
        const fresh = newLodging(camp, group[0]![0], day, voyage);
        for (const [f, id] of group) moveIn(f, id, fresh.id, day);
      }
      return true;
    }
    return false;
  };

  /** The points where the straight way between two sites changes between land and water, and which stretches are water. */
  const shores = (a: Site, b: Site, sea: number) => {
    const km = distanceKm(a.lat, a.lon, b.lat, b.lon);
    const n = Math.max(1, Math.ceil(km / 10));
    let dLon = b.lon - a.lon;
    if (dLon > 180) dLon -= 360;
    else if (dLon < -180) dLon += 360;
    const at = (k: number) => {
      let lon = a.lon + (dLon * k) / n;
      if (lon > 180) lon -= 360;
      else if (lon < -180) lon += 360;
      return { lat: a.lat + ((b.lat - a.lat) * k) / n, lon };
    };
    const wet = Array.from({ length: n + 1 }, (_, k) => {
      const p = at(k);
      return s.walkFlood!(p.lat, p.lon) <= sea;
    });
    const way: [number, number][] = [];
    const water: boolean[] = [];
    let state = wet[0]!;
    for (let k = 1; k <= n; k++)
      if (wet[k] !== state) {
        // The stretch up to here is water when either end of it is.
        const p = at(wet[k] ? k - 1 : k);
        water.push(state || !!wet[k]);
        way.push([micro(p.lat), micro(p.lon)]);
        state = wet[k]!;
      }
    water.push(state);
    return { way, water };
  };

  /** Whether the sea has come up to a band's lodging places or lanes since they were built. */
  const stale = (camp: Camp, day: Day) => {
    const sea = seaMax(day, ahead(day));
    return camp.lodgings.some((id) => {
      const l = tree.lodgings[id]!;
      return (
        camp.site.places[l.slot]! <= sea ||
        l.reach.some((r, gap) => laneReach(camp.site, gap, sea) < r)
      );
    });
  };

  /**
   * A band follows a route to its next arrival point (sites.md section 4): from the point's
   * day, until a band stands at the point's site (section 2.1).
   */
  const voyages = (s.voyages ?? []).map((v) => ({ ...v, done: false, next: v.day }));
  const legById = new Map(voyages.map((v) => [v.id, v]));
  /** The band each leg founded: the route's own band for its next leg (sites.md section 4). */
  const legBand = new Map<string, Camp>();
  /** Whether a standing or claimed camp overlaps a site (sites.md section 2). */
  const overlapped = (site: Site) =>
    [...held.values()].some(
      (h) => distanceKm(h.lat, h.lon, site.lat, site.lon) < footprintM(site.key) * LAYOUT_KM_PER_M,
    ) ||
    camps.some(
      (c) =>
        c.lodgings.length > 0 &&
        distanceKm(c.site.lat, c.site.lon, site.lat, site.lon) <
          (footprintM(site.key) / site.width + footprintM(c.site.key) / c.site.width) *
            LAYOUT_KM_PER_M,
    );
  /**
   * The place table (sites.md section 2.1): each dated place's own site, chosen once from the
   * geography and its date: the nearest within KEY_PLACE_FAR_KM that a camp can use on its
   * day, dry for its span and on the place's own land. The build fails, naming the place,
   * when none does.
   */
  const placeSite = new Map<string, Site>();
  const placeKey = (kind: DatedPlace['kind'], id: string) => `${kind}:${id}`;
  /**
   * Whether a site is on a place's own land on a day: it walks, over links open that day that
   * are not canoe crossings, to the place's home, the site or waypoint nearest the place whose
   * straight way to it is land that day; so a site in Korea never stands for Japan.
   */
  const homes = new Map<string, Site | undefined>();
  const placeHome = (p: { lat: number; lon: number }, day: Day) => {
    const key = `${p.lat}:${p.lon}:${day}`;
    if (!homes.has(key)) {
      const km = (y: Site) => distanceKm(y.lat, y.lon, p.lat, p.lon);
      const sea = s.seaLevel(day);
      homes.set(
        key,
        sites
          .filter((y) => km(y) <= KEY_PLACE_FAR_KM)
          .sort((a, b) => km(a) - km(b) || a.id - b.id)
          .find((y) => !s.walkFlood || wayLevel(y, p, s.walkFlood) > sea),
      );
    }
    return homes.get(key);
  };
  const ownLand = (x: Site, p: { lat: number; lon: number }, day: Day) => {
    const home = placeHome(p, day);
    if (!home) return false;
    if (x === home) return true;
    const seen = new Set<number>([x.id]);
    let ring: Site[] = [x];
    for (let n = 1; n <= OWN_LAND_HOPS && ring.length; n++) {
      const next: Site[] = [];
      for (const site of ring)
        for (const l of linksOf[site.id]!) {
          const to = other(l, site);
          if (seen.has(to.id) || l.crossing || !open(l, day)) continue;
          if (to === home) return true;
          seen.add(to.id);
          next.push(to);
        }
      ring = next;
    }
    return false;
  };
  const unplaced: string[] = [];
  for (const p of datedPlaces(s)) {
    const sea = seaMax(p.day, p.until);
    const km = (x: Site) => distanceKm(x.lat, x.lon, p.lat, p.lon);
    const why = (x: Site): string | undefined => {
      // An arrival point's site from the day the arrival map reaches it, within the span.
      const day = Math.max(p.day, s.arrival?.(x.lat, x.lon) ?? -Infinity);
      if (day > p.until) return 'not reached by the arrival map within its span';
      if (s.density(x.lat, x.lon, day) === undefined) return 'outside every culture area';
      if (!frontOk(x, day)) return 'beyond the front';
      if (!dry(x, day)) return 'flooded on its day';
      if (!allowed(x, day)) return 'not habitable on its day';
      if (!(x.core > sea && x.places.filter((q) => q > sea).length >= (x.compact ? 1 : MIN_PLACES)))
        return 'flooded within its span';
      if (!ownLand(x, p, day)) return 'across water';
      return undefined;
    };
    const near = sites
      .filter((x) => !x.pass && km(x) <= KEY_PLACE_FAR_KM)
      .sort((a, b) => km(a) - km(b) || a.id - b.id);
    const site = near.find((x) => !why(x));
    if (!site) {
      const x = near[0];
      unplaced.push(
        `${p.kind} ${p.id} has no camp site within ${KEY_PLACE_FAR_KM} km` +
          (x ? `; the nearest, ${Math.round(km(x))} km away, is ${why(x)}` : '') +
          ` (sea ${Math.round(s.seaLevel(p.day))} m on its day)`,
      );
      continue;
    }
    placeSite.set(placeKey(p.kind, p.id), site);
    treeStats.places.push({
      ...p,
      site: site.id,
      siteLat: site.lat,
      siteLon: site.lon,
      km: Math.round(km(site)),
    });
  }
  if (unplaced.length) throw new Error(`tree of humankind: ${unplaced.join('; ')}`);
  /** A leg's target, the next leg's origin: its point's site, or for a passage the site nearest it usable on its day. */
  const planned = new Map<string, Site | undefined>();
  const plannedTarget = (v: Voyage): Site | undefined => {
    const own = placeSite.get(placeKey('arrival', v.id));
    if (own) return own;
    if (!planned.has(v.id)) {
      const p = v.way.at(-1)!;
      const km = (x: Site) => distanceKm(x.lat, x.lon, p.lat, p.lon);
      planned.set(
        v.id,
        sites
          .filter((x) => !x.pass && usable(x, v.day))
          .sort((a, b) => km(a) - km(b) || a.id - b.id)[0],
      );
    }
    return planned.get(v.id);
  };
  /** A band that can send a group along a route: not settled, not just joined, three or more. */
  const canSend = (c: Camp | undefined): c is Camp =>
    !!c && !c.settled && !joined.has(c) && headcount(c) >= 3;
  /**
   * The band at a site (sites.md section 4.1): the one standing there, else a free band whose
   * drawn camp would overlap the site's, moved onto it. Null when such a camp is in the way
   * but cannot move (held, settled, or no way there today); undefined when none is near.
   */
  /** A standing camp whose drawn camp would overlap a site's. */
  const overlapping = (site: Site) =>
    camps.find(
      (c) =>
        c.lodgings.length > 0 &&
        distanceKm(c.site.lat, c.site.lon, site.lat, site.lon) <
          (footprintM(site.key) / site.width + footprintM(c.site.key) / c.site.width) *
            LAYOUT_KM_PER_M,
    );
  const bandOn = (site: Site, day: Day): Camp | null | undefined => {
    const here = bandAt.get(site.id);
    if (here && here.lodgings.length > 0) return here;
    if (here) return null;
    const near = overlapping(site);
    if (!near) return undefined;
    if (near.settled || (near.holdUntil !== undefined && near.holdUntil >= day)) return null;
    const way = reach(near.site, day, ROUTE_HOPS, (x) => x === site)[0];
    if (!way || !usable(site, day, headcount(near))) return null;
    relocate(near, way.path, day);
    return near;
  };
  /** A group of the band nearest a site along open links founds a camp there, if any can. */
  const sendTo = (site: Site, day: Day, salt: number): Camp | undefined => {
    if (overlapped(site)) return undefined;
    const src = reach(site, day, ROUTE_HOPS, (x) => canSend(bandAt.get(x.id)))[0];
    if (!src) return undefined;
    const group = groupOf(bandAt.get(src.site.id)!, day, salt);
    if (!group.length) return undefined;
    const child = found(group, [...src.path].reverse(), day);
    moment('voyage', day, group[0]!, child);
    return child;
  };
  /** A leg counts as reached on a day, by the band at its site (treeStats.reached). */
  const reached = (v: Voyage, day: Day, c: Camp): true => {
    treeStats.reached.push({ leg: v.id, day, lat: c.site.lat, lon: c.site.lon });
    return true;
  };
  /**
   * A planned leg (sites.md section 4): the leg is reached once a band stands at its point's
   * site. Until then the route's own band, the band at the origin or the band nearest it
   * sends a group from the origin along open links to the site; without an origin or a way
   * from it today, the band nearest the site goes. False while it waits.
   */
  const voyage = (v: Voyage & { next: Day }, day: Day): boolean => {
    // A passage only opens the way (peopling.md section 4); the next leg walks across it.
    if (v.passage) return true;
    const target = placeSite.get(placeKey('arrival', v.id))!;
    const there = bandOn(target, day);
    if (there) return reached(v, day, there);
    // A camp overlapping the site that cannot move onto it (held, settled, or too many for
    // the site) stands for it: the point is reached.
    const near = there === null && overlapping(target);
    if (near) return reached(v, day, near);
    if (there === null || day < v.next || !usable(target, day)) return false;
    v.next = after(day, BUD_MS);
    const from = v.from ? legById.get(v.from) : undefined;
    const origin = from && plannedTarget(from);
    const leg = origin && reach(origin, day, ROUTE_HOPS, (x) => x === target)[0];
    if (!origin || !leg || overlapped(target)) {
      const child = sendTo(target, day, 65);
      if (!child) return false;
      legBand.set(v.id, child);
      return reached(v, day, child);
    }
    let toOrigin: Path = [origin];
    // The route keeps its own band: the one the previous leg founded, wherever it roams now.
    const own = v.from ? legBand.get(v.from) : undefined;
    const ownWay =
      canSend(own) && own.site !== origin
        ? reach(own.site, day, ROUTE_HOPS, (x) => x === origin)[0]
        : undefined;
    if (canSend(own) && own.site === origin) toOrigin = [origin];
    else if (ownWay) toOrigin = ownWay.path;
    else if (!canSend(bandAt.get(origin.id))) {
      const src = reach(origin, day, ROUTE_HOPS, (x) => canSend(bandAt.get(x.id)))[0];
      if (!src) return false;
      toOrigin = [...src.path].reverse();
    }
    const band = bandAt.get(toOrigin[0]!.id)!;
    const group = groupOf(band, day, 64);
    if (!group.length) return false;
    const child = found(group, [...toOrigin, ...leg.path.slice(1)], day);
    moment('voyage', day, group[0]!, child);
    legBand.set(v.id, child);
    return reached(v, day, child);
  };

  /**
   * Anchors (sites.md section 4.1): from ANCHOR_LEAD_DAYS before its day, a band is brought
   * to the anchor's site and held there, settled, until its end; the build fails when none
   * stands there on the day.
   */
  // A threshold's band is brought and held as an anchor's, to the tree's end (peopling.md
  // section 3.6).
  const anchorList = [
    ...(s.anchors ?? []).map((a) => ({ ...a, key: placeKey('anchor', a.id) })),
    ...(s.thresholds ?? []).map((t) => ({
      ...t,
      until: s.endDay,
      key: placeKey('threshold', t.id),
    })),
  ].map((a) => ({ ...a, band: undefined as Camp | undefined }));
  const anchorByKey = new Map(anchorList.map((a) => [a.key, a]));
  const anchorSite = (a: { key: string }) => placeSite.get(a.key)!;
  const hold = (a: (typeof anchorList)[number], camp: Camp, day: Day) => {
    a.band = camp;
    camp.holdUntil = a.until;
    takeRange(camp, day);
  };
  const anchor = (a: (typeof anchorList)[number], day: Day) => {
    const site = anchorSite(a);
    const c = bandOn(site, day);
    if (c) return hold(a, c, day);
    if (c === null) return;
    const child = sendTo(site, day, 66);
    if (child) hold(a, child, day);
  };
  const thresholds = (s.thresholds ?? []).map((t) => ({ ...t, flagged: false }));
  /**
   * A Neolithic threshold is reached (peopling.md section 3.6): the camps near it settle, and
   * the band at its site, brought there if none is, raises a red flag. False while none is.
   */
  const settle = (t: Threshold, day: Day): boolean => {
    for (const c of camps)
      if (c.lodgings.length > 0 && distanceKm(c.site.lat, c.site.lon, t.lat, t.lon) <= SETTLE_KM)
        c.settled = true;
    // The band held at the threshold's site raises the flag.
    const band = anchorByKey.get(placeKey('threshold', t.id))!.band;
    if (!band || band.lodgings.length === 0) return false;
    band.settled = true;
    const people = band.lodgings.flatMap((l) => residents.get(l)!);
    // The flag stands behind the lodging of the camp's lowest standing place, out of every lane.
    const slot = Math.min(...band.lodgings.map((l) => tree.lodgings[l]!.slot));
    (tree.flags ??= []).push({
      id: t.id,
      camp: band.site.key,
      day,
      until: NEVER,
      lat: micro(band.site.lat),
      lon: micro(band.site.lon),
      slot,
    });
    moment('neolithic-threshold', day, people[0]!, band);
    return true;
  };

  // The first person, alone by Lake Turkana (section 4.2), at the site nearest her place.
  const home = [...sites]
    .filter((site) => dry(site, s.startDay) && livable(site, s.startDay))
    .sort(
      (a, b) =>
        distanceKm(a.lat, a.lon, s.founder.lat, s.founder.lon) -
        distanceKm(b.lat, b.lon, s.founder.lat, s.founder.lon),
    )[0];
  if (!home) throw new Error('tree of humankind: no site for the first person');
  const first = newCamp(home, s.startDay);
  tree.branches.push({ id: 0, parent: NEVER, figure: 0, day: s.startDay, reason: 'root' });
  const hut = newLodging(first, 0, s.startDay);
  newFigure(NEVER, s.startDay, 0, hut.id);
  moment('root', s.startDay, 0, first);

  // The day the first person's first companion steps out: a minute of watching in.
  const aloneUntil = dayAtWatch(watchAtDay(s.startDay) + FOUNDER_ALONE_MS);
  const morphDays = Math.round(MORPH_YEARS * DAYS_PER_YEAR);
  for (let day = s.startDay; day < s.endDay; day = after(day, STEP_MS)) {
    const step = after(day, STEP_MS) - day;
    joined.clear();
    held.clear();
    // Bands following a route set off first, at the step's start, before anyone is born in it.
    for (const v of voyages) if (!v.done && day >= v.day) v.done = voyage(v, day);
    for (const t of thresholds) if (!t.flagged && day >= t.day) t.flagged = settle(t, day);
    for (const a of anchorList) {
      if (day < a.day - ANCHOR_LEAD_DAYS || day > a.until) continue;
      // The held band must still stand at the site: fleeing the sea breaks the anchor.
      if (a.band && a.band.site !== anchorSite(a) && day >= a.day)
        throw new Error(`tree of humankind: the band of ${a.key} left its site`);
      if (!a.band || a.band.lodgings.length === 0) anchor(a, day);
      if (day >= a.day && !a.band)
        throw new Error(
          `tree of humankind: no band could reach ${a.key} by its day; check its date and place`,
        );
    }
    // Camps founded during this step wait for the next one.
    const count = camps.length;
    for (let ci = 0; ci < count; ci++) {
      const camp = camps[ci]!;
      // A camp that a band joined this step waits for the next, so nobody has two moves a day.
      if (camp.lodgings.length === 0 || joined.has(camp)) continue;
      // Near a Neolithic threshold that has come, camps settle (peopling.md section 3.6).
      if (
        !camp.settled &&
        thresholds.some(
          (t) =>
            day >= t.day && distanceKm(camp.site.lat, camp.site.lon, t.lat, t.lon) <= SETTLE_KM,
        )
      )
        camp.settled = true;

      // The land changes under the camp: leave before the sea, ice or desert arrive.
      if (
        !dry(camp.site, day, headcount(camp)) ||
        !livable(camp.site, day) ||
        !livable(camp.site, ahead(day))
      ) {
        const people = camp.lodgings.flatMap((l) => residents.get(l)!);
        if (flee(camp, day)) moment('camp-moved-away', day, people[0]!, camp);
        else {
          treeStats.stuck++;
        }
        continue;
      }
      // The sea came up to its lodgings or lanes: it builds them again where they stay dry.
      if (stale(camp, day)) {
        relocate(camp, [camp.site], day);
        continue;
      }
      // A morph has come to its site: at its moment, it takes on the new culture (sites.md section 5).
      const culture = s.culture?.(camp.site.lat, camp.site.lon, day);
      if (culture && culture !== camp.culture) {
        camp.morphAt ??= day + (hash32(camp.id, day, 131) % morphDays);
        if (day >= camp.morphAt) {
          relocate(camp, [camp.site], day);
          continue;
        }
      }
      // The end of a residence window: the band moves along a link, unless it has settled.
      if (day >= camp.nextMove) {
        camp.nextMove = after(day, RESIDENCE_MS + (hash32(camp.id, day, 12) % RESIDENCE_MS));
        if (!camp.settled && !isHeld(camp, day)) {
          const n = headcount(camp);
          // Only among the sites of its home range (sites.md section 4).
          const options = reach(
            camp.site,
            day,
            2,
            (site) =>
              camp.range.includes(site) &&
              distanceKm(site.lat, site.lon, camp.site.lat, camp.site.lon) <= MOVE_KM &&
              usable(site, day, n) &&
              free(site, day, camp),
          );
          const pick = best(options, day, 2);
          if (pick) relocate(camp, pick.path, day);
        }
      }

      const people = camp.lodgings.flatMap((l) => residents.get(l)!);
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
        // Every lodging is full: someone builds another beside the hearth, on a dry place.
        if (!grown && camp.lodgings.length < MAX_LODGINGS) {
          const full = camp.lodgings.every((l) => residents.get(l)!.length >= LODGING_CAPACITY);
          if (full && hasPlace(camp, day)) {
            const builder = people[hash32(camp.id, day, 3) % people.length]!;
            const l = newLodging(camp, builder, day + (hash32(camp.id, day, 4) % step));
            moveIn(builder, homeOf(builder), l.id, l.built);
          }
        }
      } else if (day >= camp.nextBud && !camp.settled && !isHeld(camp, day)) {
        // A full camp sends out a small group to the best free site within a few links (section 4.3).
        camp.nextBud = after(day, BUD_MS);
        const options = reach(
          camp.site,
          day,
          BUD_HOPS,
          // Not into another band's home range, nor a culture area at its cap (sites.md section 4).
          (site) => usable(site, day) && free(site, day) && !reserved(site) && !areaFull(site, day),
        );
        const pick = best(options, day, 3);
        if (!pick) continue;
        const group = groupOf(camp, day, 5);
        if (!group.length) continue;
        const child = found(group, pick.path, day + (hash32(camp.id, day, 8) % step));
        moment(
          'camp-founded',
          child.lodgings.length ? tree.lodgings[child.lodgings[0]!]!.built : day,
          group[0]!,
          child,
        );
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
  // Every lodging stands at a site with room for all activities, on a place that stays dry
  // while it stands (sites.md section 7).
  const seaMax = (from: Day, to: Day) => {
    let m = -Infinity;
    for (let k = 0; k <= 16; k++)
      m = Math.max(m, s.seaLevel(from + Math.floor(((to - from) * k) / 16)));
    return m;
  };
  for (const l of tree.lodgings) {
    const site = s.sites.sites[l.camp % COMPACT_SITE];
    if (!site) {
      problems.push(`lodging ${l.id} stands at no site`);
      continue;
    }
    const sea = seaMax(l.built, l.gone === NEVER ? s.endDay : l.gone);
    if (site.core <= sea) problems.push(`lodging ${l.id}: its site's people stand in the water`);
    if (site.places[l.slot]! <= sea) problems.push(`lodging ${l.id} stands in the water`);
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
