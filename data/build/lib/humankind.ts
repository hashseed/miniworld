// The tree build (spec humankind.md, sections 4 and 5; sites.md): grows the tree of
// humankind from the first person at Lake Turkana, step by step through time. Bands
// camp only at the precomputed sites and travel only along their links, and the rules
// bound to region and time (culture areas, arrival map, thresholds, morphs) decide who
// lives where. Deterministic: whole days, the seeded hash and the deterministic
// trigonometry only, so the same inputs give the same tree on every machine.

import { maskLost } from '../../../app/src/world/fieldMask.ts';
import { BUILD_MS, TAKE_DOWN_MS, TURN_MS } from '../../../app/src/world/scene/camp.ts';
import { hash32, hash01 } from '../../../app/src/core/hash.ts';
import { detCos, detSin } from '../../../app/src/core/detmath.ts';
import { DAYS_PER_YEAR, type Day } from '../../../app/src/time/calendar.ts';
import { FIGURE_KM_PER_M, TEMPO, WALK_M_PER_S } from '../../../app/src/world/treeScene.ts';
import { dayAtMs, dayAtWatch, msAtDay, watchAtDay } from '../../../app/src/time/rate.ts';
import {
  NEVER,
  type MomentKind,
  type Tree,
  type TreeFigure,
  type TreeLodging,
  type TreeStage,
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
  THIN_MS,
  hasRack,
  lookOf,
  slotPoint,
  CAVE_FADE_MS,
  CAVE_LEAD_MS,
  CAVE_LINGER_MS,
  GRAVE_FADE_DAYS,
  GRAVE_SINK_MS,
  stageBeyond,
  burialTimes,
  stageHunts,
  stageSessions,
  stagePoints,
  stageScale,
  CAVE_WATER_CLEAR_M,
  stageSpots,
  type TreeChunk,
} from '../../../app/src/world/treeScene.ts';
import { distanceKm, KM_PER_DEG, onGlobe } from './geo.ts';
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

/**
 * A village of farmers grows to VILLAGE_MIN people plus a hash of its id below VILLAGE_SPREAD:
 * 6 to 10 (Yang, 2026-10-25: "half as many"; 12 to 20 from 2026-10-24).
 */
const VILLAGE_MIN = 6;
const VILLAGE_SPREAD = 5;
/** Figures a lodging holds, and lodgings a camp may have (section 4.1, Proposed). */
export const LODGING_CAPACITY = 4;
export const MAX_LODGINGS = 5;
/** A band of hunter-gatherers holds at most this many people, in at most this many lodgings (Yang, 2026-10-25). */
const BAND_MAX = 7;
const BAND_MAX_LODGINGS = 3;

// The tree's rhythms are set in watching time, so camps look the same in every era
// (section 4.3; Yang, 2026-10-19), and converted to days by the curve of spec section 2.1.
/** One step of the build, in milliseconds of watching (section 4.3). */
const WALK_KM_PER_MS = (TEMPO * WALK_M_PER_S * FIGURE_KM_PER_M) / 1000;
const STEP_MS = 10_000;
/** A band's walk starts this long after it moves in and may run this much longer than the pace says. */
const VOYAGE_SLACK_MS = 10_000;
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
/** A band in farmland walks at most this far to a village site to found its village (villages.md section 2). */
const VILLAGE_WALK_KM = 600;
/** A band fleeing the water looks this many links away for a free site, and this many for bands to join. */
const FLEE_HOPS = 6;
/** A way is split into land and water stretches from samples this far apart (km; sites.md section 3). */
const SHORE_STEP_KM = 2;
const JOIN_HOPS = 6;
/** People of a band that breaks up join others only this near, over land (sites.md section 3). */
const JOIN_KM = 1000;
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
  /** The day each Neolithic threshold's camps settled, and the camp key of the band at its site (peopling.md section 3.6). */
  thresholds: [] as { id: string; day: Day; camp: number }[],
  /** Each occurrence of an encounter (sites.md section 4.3): its day, site and how many came. */
  encounters: [] as { id: string; day: Day; site: number; parties: number; people: number }[],
  crossed: [] as { crossing: string; day: Day; lat: number; lon: number }[],
};

/** A record that needs a band at a place over a span of days (sites.md section 2.1). */
export interface DatedPlace {
  kind: 'arrival' | 'anchor' | 'threshold' | 'encounter';
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
  /** For a planned record (sites.md section 4.2): the start of its claim, the day a band reached its site and how. */
  claim?: Day;
  met?: Day;
  how?: PlanMeans;
}

/** How a plan's band came to its site (sites.md section 4.2). */
export type PlanMeans = 'there' | 'moved' | 'group' | 'band';

/** The dated places of the tree's settings (sites.md section 2.1). */
export function datedPlaces(
  s: Pick<TreeSettings, 'voyages' | 'anchors' | 'thresholds' | 'encounters' | 'endDay'>,
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
    // An anchor's site is laid and chosen where its camp should stand (humankind.md section 8.2).
    ...(s.anchors ?? []).map((a) => ({ kind: 'anchor' as const, ...a, ...(a.camp ?? {}) })),
    ...(s.thresholds ?? []).map((t) => ({ kind: 'threshold' as const, ...t, until: s.endDay })),
    // An encounter on open ground needs its meeting site for all its occurrences (sites.md
    // section 4.3); at a host, the host's anchor has one.
    ...(s.encounters ?? [])
      .filter((e) => !e.host)
      .map((e) => ({
        kind: 'encounter' as const,
        id: e.id,
        day: e.days[0]!,
        until: after(e.days.at(-1)!, e.stayMs),
        lat: e.lat,
        lon: e.lon,
      })),
  ].map(({ kind, id, day, until, lat, lon }) => ({
    kind,
    id,
    day,
    until,
    lat,
    lon,
  }));
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
/** In the last this many days before a plan's day, the nearest band moves there whole (sites.md section 4.2). */
const LAST_RESORT_DAYS = Math.round(100 * 365.2425);
/** Bands change culture at a moment chosen within this many years of a morph (sites.md section 5). */
export const MORPH_YEARS = 100;

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
  /** Like walkFlood, but flooded only where every source agrees: where a canoe may go. */
  waterFlood?(lat: number, lon: number): number;
  /** The height of the ground in metres, for a cave's hill (humankind.md section 8.2). */
  elevation?(lat: number, lon: number): number;
  /** The same for a camp: lakes and rivers are never dry; for the places of scenes (humankind.md section 8.2). */
  campFlood?(lat: number, lon: number): number;
  /** The density of the culture area at a place and day, or undefined outside every area. */
  density(lat: number, lon: number, day: Day): Density | undefined;
  /** A culture area's own camp spacing in km, overriding its density's (humankind.md section 4.1). */
  spacing?(lat: number, lon: number, day: Day): number | undefined;
  /** The culture of the area at a place and day (peopling.md section 5.1); without it, every camp is the founder's. */
  culture?(lat: number, lon: number, day: Day): string | undefined;
  /** Whether a culture's camps are villages of farmers, which grow bigger than a band (humankind.md section 4.1). */
  village?(culture: string): boolean;
  /** Whether the way of life of the area at a place lets people camp there on a day: cold and height (peopling.md section 5.2). */
  livable?(lat: number, lon: number, day: Day): boolean;
  /** The first day people may camp at a place, from the arrival map (peopling.md section 4). */
  arrival?(lat: number, lon: number): Day;
  /** The lodging model of a culture's camps. */
  lodgingOf?(culture: string): string;
  /**
   * For a Neolithic culture's camp: the mask of dry ground the fields may use round a site
   * at a sea level (fieldMask.ts), or undefined for any other culture.
   */
  fieldLand?(
    culture: string,
    lat: number,
    lon: number,
    width: number,
    sea: number,
  ): string | undefined;
  /** Whether herders, not yet farmers, are in a place on a day (humankind.md section 8.5). */
  herding?(culture: string | undefined, lat: number, lon: number, day: Day): boolean;
  /** The arrival points of the routes, from their days (peopling.md section 3). */
  voyages?: Voyage[];
  /** Neolithic thresholds, where camps settle (peopling.md section 3.6). */
  thresholds?: Threshold[];
  /** The farming profile the band at a threshold's site becomes on its day (neolithic/villages.md section 1). */
  thresholdCulture?: (t: Threshold) => string | undefined;
  /**
   * The true place of a point in drawn km east and north of a place, laid out on the drawn
   * globe as the tree layer draws it (history-lens.md section 4.2); without it, true km.
   */
  placeAt?: (
    lat: number,
    lon: number,
    eastKm: number,
    northKm: number,
  ) => { lat: number; lon: number };
  /** How many people a lodging of a culture holds, where not LODGING_CAPACITY (a longhouse). */
  lodgingCapacity?: (culture: string) => number | undefined;
  /** Whether a site is a village site, the place of a future city (neolithic/villages.md section 2). */
  villageSite?: (lat: number, lon: number) => boolean;
  /** The farming profile the farming spread has brought to a place by a day, wherever it is (farming-spread.md section 9.4). */
  farmingAt?: (lat: number, lon: number, day: Day) => string | undefined;
  /** Places that must have a band from a day to a day (sites.md section 4.1). */
  anchors?: Anchor[];
  /** Parties of several bands that meet at a place for a while (sites.md section 4.3). */
  encounters?: Encounter[];
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
  /** A scene its band plays at its camp (humankind.md section 8.2). */
  scene?: { kind: TreeStage['kind']; prop: string };
  /** Where its camp should stand, near the place, for a scene that faces the place from there. */
  camp?: { lat: number; lon: number };
}

/** An encounter (sites.md section 4.3): parties of several bands meeting at a place. */
export interface Encounter {
  id: string;
  kind: string;
  /** The day of each occurrence, in order. */
  days: Day[];
  /** How long the parties stay, in watching time. */
  stayMs: number;
  lat: number;
  lon: number;
  /** The anchor whose band receives the parties; without it they meet on open ground. */
  host?: string;
  roles: { id: string; lat: number; lon: number; km: number; people: number }[];
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
  /** The day its first farming house stood at this site: its fields' founding, kept when it rebuilds (culture-succession.md section 1). */
  farmedSince?: Day;
  /**
   * The layout its lodgings carry (TreeLodging.camp): its site's, or the compact one for a tight
   * village at a full site (neolithic/villages.md section 3.1).
   */
  key: number;
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
  /**
   * The farming profile of the threshold it was settled at, which it takes on that day wherever
   * the farming grid has it (neolithic/villages.md section 1).
   */
  thresholdCulture?: string;
  /** Its home range: the sites it roams among, which no other band buds onto (sites.md section 4). */
  range: Site[];
  /** An anchor holds it at its site, settled, until this day (sites.md section 4.1). */
  holdUntil: Day | undefined;
  /** The camp of an encounter on open ground: it neither roams, buds nor grows (sites.md section 4.3). */
  gathering?: boolean;
}

/**
 * A plan of the planning pass (sites.md section 4.2): a record that needs a band at its site
 * from its day to its end, its claim and the sites of its footprint, kept for it.
 */
interface Plan {
  key: string;
  kind: 'anchor' | 'threshold' | 'encounter';
  id: string;
  day: Day;
  until: Day;
  site: Site;
  /** The claim starts here and ends at `until`. */
  claim: Day;
  footprint: Set<number>;
  /** The band held at its site, and every band that has been. */
  band: Camp | undefined;
  bands: Set<Camp>;
  /** The day its footprint was cleared, at the start of its claim. */
  cleared: Day | undefined;
  met: Day | undefined;
  how: PlanMeans | undefined;
}

/** An occurrence of an encounter (sites.md section 4.3), as the planning pass keeps it. */
interface Meeting {
  encounter: Encounter;
  day: Day;
  /** The day its parties go home. */
  leave: Day;
  site: Site;
  /** The plan keeping its meeting site free; at a host, the host's anchor's. */
  plan: Plan;
  /** The camp of an encounter on open ground, while it stands. */
  camp: Camp | undefined;
  /** Each party: its role, its lodgings there, and the band each of its people came from. */
  parties: {
    role: string;
    culture: string | undefined;
    lodgings: number[];
    from: Map<number, Camp>;
  }[];
  started: boolean;
  ended: boolean;
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
  treeStats.thresholds = [];
  treeStats.encounters = [];
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

  /** The lowest sea between two days, sampled like seaMax. */
  const seaMin = (from: Day, to: Day): number => {
    let m = Math.min(s.seaLevel(from), s.seaLevel(to));
    const n = Math.max(8, Math.ceil((to - from) / (100 * DAYS_PER_YEAR)));
    for (let k = 1; k < n; k++)
      m = Math.min(m, s.seaLevel(from + Math.floor(((to - from) * k) / n)));
    return m;
  };

  const frontOk = (site: Site, day: Day) =>
    day >= s.prologueEndDay ||
    distanceKm(s.founder.lat, s.founder.lon, site.lat, site.lon) <=
      (s.frontKmPerYear * (day - s.startDay)) / DAYS_PER_YEAR;

  /** Whether the people of the site's area can live at its hearth on a day. */
  // Asked of the same sites on the same days many times over a step's searches, and a pure
  // function of the site and the day: kept for the last few days asked.
  const livableOn = new Map<Day, Map<number, boolean>>();
  const livable = (site: Site, day: Day) => {
    let m = livableOn.get(day);
    if (!m) {
      if (livableOn.size >= 16) livableOn.delete(livableOn.keys().next().value!);
      m = new Map();
      livableOn.set(day, m);
    }
    let v = m.get(site.id);
    if (v === undefined) {
      v =
        habitat.habitable(site.lat, site.lon, day) &&
        (s.livable?.(site.lat, site.lon, day) ?? true);
      m.set(site.id, v);
    }
    return v;
  };

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
  /** The plans whose footprint holds each site, filled by the planning pass (sites.md section 4.2). */
  const claimsAt = new Map<number, Plan[]>();
  /** The plan claiming a site on a day, if any. */
  const claimOn = (site: Site, day: Day) =>
    claimsAt.get(site.id)?.find((p) => p.claim <= day && day <= p.until);
  /** Whether a site is kept for a plan on a day, other than the plan's own band's. */
  const claimed = (site: Site, day: Day, camp?: Camp) =>
    (claimsAt.get(site.id) ?? []).some(
      (p) => p.claim <= day && day <= p.until && (!camp || !p.bands.has(camp)),
    );
  /** Whether a site is far enough from every other band (sites.md section 4) and not kept for a plan. */
  const free = (site: Site, day: Day, except?: Camp, key = site.key) => {
    // Nor where a plan's claim begins before the band's next decision: it would have to leave again at once.
    if (claimed(site, day, except) || claimed(site, ahead(day), except)) return false;
    // Farmland feeds more people: at a village site that farming has reached, villages keep
    // only clear of each other's drawn camps, not their density's spacing (villages.md section 3).
    const spacing =
      s.villageSite?.(site.lat, site.lon) && s.farmingAt?.(site.lat, site.lon, day)
        ? 0
        : spacingAt(site, day);
    for (const h of held.values())
      if (distanceKm(h.lat, h.lon, site.lat, site.lon) < spacing) return false;
    // Overlapping sites are mutually exclusive, and bands keep their density's spacing.
    const mine = (footprintM(key) / site.width) * LAYOUT_KM_PER_M;
    return camps.every((c) => {
      if (c === except || c.lodgings.length === 0) return true;
      // The distance is at least the difference in latitude: a camp farther north or south than
      // either rule asks is clear without the distance worked out.
      const theirs = (footprintM(c.key) / c.site.width) * LAYOUT_KM_PER_M;
      const far = Math.max(Math.min(spacing, c.spacingKm), mine + theirs);
      if (Math.abs(c.site.lat - site.lat) * KM_PER_DEG > far + 1) return true;
      const km = distanceKm(c.site.lat, c.site.lon, site.lat, site.lon);
      return (
        km >= Math.min(spacing, c.spacingKm) &&
        km >= (footprintM(key) / site.width + footprintM(c.key) / c.site.width) * LAYOUT_KM_PER_M
      );
    });
  };
  /**
   * The layout a village founded at a site would take: its site's where that is free, else, at a
   * full village site, the compact layout where that is (a tight village, villages.md section
   * 3.1); undefined where neither fits.
   */
  const villageKey = (site: Site, day: Day, except?: Camp): number | undefined => {
    if (free(site, day, except)) return site.key;
    const tight = COMPACT_SITE + site.id;
    const atVillageSite =
      !!s.villageSite?.(site.lat, site.lon) && !!s.farmingAt?.(site.lat, site.lon, day);
    if (site.key >= COMPACT_SITE || !atVillageSite) return undefined;
    return free(site, day, except, tight) ? tight : undefined;
  };

  /** Whether a link can be walked, or paddled at a listed crossing, on a day. */
  // The highest sea of a day is asked for every link of a search, so the last day's is kept.
  let seaDay = NaN;
  let seaOfDay = 0;
  const open = (l: Link, day: Day) => {
    if (l.crossing) return l.crossing.day <= day;
    if (day !== seaDay) [seaDay, seaOfDay] = [day, seaMax(day, after(day, STEP_MS))];
    return l.level > seaOfDay;
  };
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
    // Each stretch is split where it changes between land and water on the day the band
    // goes: the band walks to the water's edge, boards there, paddles only over water and
    // lands at the far shore (peopling.md section 6; Yang, 2026-10-20: "they must not be on
    // boats on land").
    // The sea changes while the band is under way, which takes many seconds of watching on a
    // long route: each stretch is checked against the sea over the time it is walked.
    const way: [number, number][] = [];
    const water: boolean[] = [];
    let walked = 0;
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1]!, points[i]!];
      const km = distanceKm(a.lat, a.lon, b.lat, b.lon);
      const from = after(day, Math.floor(walked / WALK_KM_PER_MS));
      const to = after(day, Math.ceil((walked + km) / WALK_KM_PER_MS) + VOYAGE_SLACK_MS);
      walked += km;
      const part = s.walkFlood
        ? shores(a, b, seaMax(from, to), seaMin(from, to))
        : { way: [], water: [false] };
      water.push(...part.water);
      way.push(...part.way);
      if (i < points.length - 1) way.push([micro(b.lat), micro(b.lon)]);
    }
    return { id: 'path', way, water };
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
  /**
   * The most people and lodgings a camp holds: a band of hunter-gatherers at most BAND_MAX
   * people in BAND_MAX_LODGINGS lodgings (Yang, 2026-10-25: "at most 7 people and 3 huts"),
   * a village as many as its layout has room for.
   */
  const isVillage = (c: Camp) => !!c.culture && !!s.village?.(c.culture);
  /** The people one house of a village holds where it holds the whole village (the longhouse), else undefined. */
  const oneHouse = (c: Camp) => (c.culture && s.lodgingCapacity?.(c.culture)) || undefined;
  const maxPeople = (c: Camp) =>
    isVillage(c)
      ? Math.min(layoutOf(c.key).people, oneHouse(c) ?? Infinity)
      : Math.min(BAND_MAX, layoutOf(c.key).people);
  // A village whose house holds it all never has a second (villages.md section 5).
  const maxLodgings = (c: Camp) =>
    isVillage(c) ? (oneHouse(c) ? 1 : MAX_LODGINGS) : BAND_MAX_LODGINGS;
  /** How many people a lodging of a camp holds: its culture's houseCapacity (the LBK's longhouse holds a whole village), else LODGING_CAPACITY. */
  const capOf = (c: Camp) => (c.culture && s.lodgingCapacity?.(c.culture)) || LODGING_CAPACITY;

  /** The share of a site's trees grown back since its last band left (sites.md section 6). */
  const regrown = (site: Site, day: Day) => {
    const gone = left.get(site.id);
    if (gone === undefined) return 1;
    return Math.min(1, Math.max(0, (watchAtDay(day) - watchAtDay(gone)) / REGROW_MS));
  };

  /** The lowest spot at a camp's hearth that none of its people takes, the mover aside. */
  /** The places of the dying, kept until they are lost (humankind.md section 8.2). */
  const dyingSpots = new Map<Camp, { spot: number; until: Day }[]>();
  const freeSpot = (camp: Camp, mover = NEVER): number => {
    const taken = new Set<number>(dyingSpots.get(camp)?.map((d) => d.spot));
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

  const maskCache = new Map<string, string | undefined>();
  const fieldMaskOf = (culture: string, site: Site, sea: number): string | undefined => {
    if (!s.fieldLand) return undefined;
    const key = `${culture}:${site.id}:${Math.round(sea)}`;
    if (!maskCache.has(key))
      maskCache.set(key, s.fieldLand(culture, site.lat, site.lon, site.width, sea));
    return maskCache.get(key);
  };

  /** A lodging at the camp's site, on its lowest free dry place, its lanes as far as they stay dry. */
  const newLodging = (
    camp: Camp,
    builder: number,
    day: Day,
    way?: TreeLodging['voyage'],
    // A party at an encounter builds its own culture's lodging (sites.md section 4.3).
    culture = camp.culture,
  ) => {
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
    const fieldLand = culture ? fieldMaskOf(culture, site, sea) : undefined;
    const herding = !!s.herding?.(culture, site.lat, site.lon, day);
    const l: TreeLodging = {
      id: tree.lodgings.length,
      camp: camp.key,
      lat: micro(site.lat),
      lon: micro(site.lon),
      built: day,
      gone: NEVER,
      builder,
      slot,
      reach: Array.from({ length: LODGING_SLOTS }, (_, gap) => laneReach(site, gap, sea)),
      room: layoutOf(camp.key).core,
      ...(site.steep ? { steep: true } : {}),
      ...(Math.abs(site.width - 1) >= 0.005 ? { width: Math.round(site.width * 100) / 100 } : {}),
      // A minimal camp's small shelter, else the culture's own (sites.md section 2).
      kind:
        camp.key >= MINIMAL_SITE
          ? MINIMAL_LODGING
          : (culture && s.lodgingOf?.(culture)) || s.lodgingKind,
      ...(culture ? { culture } : {}),
      ...(fieldLand ? { fieldLand } : {}),
      ...(fieldLand && camp.farmedSince !== undefined && camp.farmedSince < day
        ? { farmed: camp.farmedSince }
        : {}),
      ...(herding ? { herding: true } : {}),
      ...(habitat.wood
        ? {
            wood:
              Math.round(100 * habitat.wood(site.lat, site.lon, day) * regrown(site, day)) / 100,
          }
        : {}),
      ...(way ? { voyage: way } : {}),
    };
    if (fieldLand) camp.farmedSince ??= day;
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
                !claimed(x, day, camp) &&
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

  const newCamp = (site: Site, day: Day, key = site.key): Camp => {
    const density = {
      ...DENSITIES[s.density(site.lat, site.lon, day) ?? 'low'],
      spacingKm: spacingOf(site.lat, site.lon, day),
    };
    const id = camps.length;
    const [lo, hi] = density.band;
    const camp: Camp = {
      id,
      site,
      key,
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
  const relocate = (camp: Camp, path: Path, day: Day, key?: number) => {
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
    camp.key = key ?? (from !== to ? to.key : camp.key);
    if (from !== to) camp.farmedSince = undefined;
    if (!camp.range.includes(to)) takeRange(camp, day);
    capDay = NaN;
    camp.lodgings = [];
    camp.culture = camp.thresholdCulture ?? s.culture?.(to.lat, to.lon, day) ?? camp.culture;
    camp.morphAt = undefined;
    const way = wayOf(path, day);
    const cap = capOf(camp);
    for (let k = 0; k < people.length; k += cap) {
      const group = people.slice(k, k + cap);
      const fresh = newLodging(camp, group[0]![0], day, way);
      for (const [f, id] of group) moveIn(f, id, fresh.id, day);
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
  const found = (group: number[], path: Path, day: Day, key?: number): Camp => {
    const child = newCamp(path.at(-1)!, day, key);
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
      reach(
        camp.site,
        day,
        CROWD_HOPS,
        (site) => usable(site, day, n) && !bandAt.has(site.id) && !claimed(site, day, camp),
      ),
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
    }).filter(
      (o) =>
        distanceKm(camp.site.lat, camp.site.lon, o.site.lat, o.site.lon) <= JOIN_KM &&
        o.path.every((x, i) => i === 0 || !crossingOf(o.path[i - 1], x)),
    );
    // They arrive at the end of the step, after anyone leaving those camps during it; their
    // site stays theirs until then.
    const at = after(day, STEP_MS) - 1;
    held.set(camp.site.id, camp.site);
    let moved = false;
    for (const o of options) {
      const to = bandAt.get(o.site.id)!;
      joined.add(to);
      while (people.length && headcount(to) < maxPeople(to)) {
        // A neighbour's lodgings with room are walked to straight; farther ones need a new lodging.
        let room =
          o.hops === 1 && !crossingOf(camp.site, o.site)
            ? to.lodgings.find((l) => residents.get(l)!.length < capOf(to))
            : undefined;
        if (room === undefined && to.lodgings.length < maxLodgings(to) && hasPlace(to, at))
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
      if (crowd && (to || !usable(site, day, n) || claimed(site, day, camp))) continue;
      const roomy = crowd
        ? true
        : to
          ? !joined.has(to) &&
            freePlaces(to, day) >= Math.ceil(n / LODGING_CAPACITY) &&
            dry(site, day, headcount(to) + n) &&
            livable(site, ahead(day)) &&
            headcount(to) + n <= maxPeople(to) &&
            to.lodgings.length + Math.ceil(n / LODGING_CAPACITY) <= maxLodgings(to)
          : usable(site, day, n) && free(site, day, camp);
      if (!roomy) continue;
      const voyage = { id: 'stranded', ...shores(camp.site, site, sea) };
      const people = camp.lodgings.flatMap((id) => residents.get(id)!.map((f) => [f, id] as const));
      const from = camp.site;
      if (to) {
        // Into new lodgings at the band there, as many as they need.
        joined.add(to);
        for (let k = 0; k < people.length; k += capOf(to)) {
          const group = people.slice(k, k + capOf(to));
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
      camp.key = site.key;
      camp.farmedSince = undefined;
      camp.lodgings = [];
      camp.culture = camp.thresholdCulture ?? s.culture?.(site.lat, site.lon, day) ?? camp.culture;
      for (let k = 0; k < people.length; k += capOf(camp)) {
        const group = people.slice(k, k + capOf(camp));
        const fresh = newLodging(camp, group[0]![0], day, voyage);
        for (const [f, id] of group) moveIn(f, id, fresh.id, day);
      }
      return true;
    }
    return false;
  };

  /** The points where the straight way between two sites changes between land and water, and which stretches are water. */
  const shores = (
    a: { lat: number; lon: number },
    b: { lat: number; lon: number },
    sea: number,
    low = sea,
  ) => {
    const km = distanceKm(a.lat, a.lon, b.lat, b.lon);
    // Every SHORE_STEP_KM, so a strait between islands is not stepped over.
    const n = Math.max(1, Math.ceil(km / SHORE_STEP_KM));
    let dLon = b.lon - a.lon;
    if (dLon > 180) dLon -= 360;
    else if (dLon < -180) dLon += 360;
    const at = (k: number) => {
      let lon = a.lon + (dLon * k) / n;
      if (lon > 180) lon -= 360;
      else if (lon < -180) lon += 360;
      return { lat: a.lat + ((b.lat - a.lat) * k) / n, lon };
    };
    const flood = s.waterFlood ?? s.walkFlood!;
    const isWet = (k: number) => {
      const p = at(k);
      // Shallows are water too: they are drawn as sea, and walkers must not cross them.
      return flood(p.lat, p.lon) <= low;
    };
    const wet = Array.from({ length: n + 1 }, (_, k) => isWet(k));
    const way: [number, number][] = [];
    const water: boolean[] = [];
    let state = wet[0]!;
    for (let k = 1; k <= n; k++)
      if (wet[k] !== state) {
        // Narrow the shore down between the two samples: the water stretch ends at a place
        // that is water, the land stretch at one that is land, a few tens of metres apart.
        let [lo, hi] = [k - 1, k];
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          if (isWet(mid) === state) lo = mid;
          else hi = mid;
        }
        const [first, second] = [at(lo), at(hi)];
        water.push(state);
        way.push([micro(first.lat), micro(first.lon)]);
        // The few metres between the two belong to the stretch that ends.
        water.push(state);
        way.push([micro(second.lat), micro(second.lon)]);
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
        l.reach.some((r, gap) => laneReach(camp.site, gap, sea) < r) ||
        // A village's fields: the sea came up over land its fields may use (it stays there
        // for millennia while the sea rises, neolithic/villages.md section 3).
        (l.fieldLand !== undefined &&
          l.culture !== undefined &&
          maskLost(l.fieldLand, fieldMaskOf(l.culture, camp.site, sea)))
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
          (footprintM(site.key) / site.width + footprintM(c.key) / c.site.width) * LAYOUT_KM_PER_M,
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
          .find((y) => !s.walkFlood || wayLevel(y, p, s.walkFlood, false) > sea),
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
  const canSend = (c: Camp | undefined, settledToo = false): c is Camp =>
    !!c && (settledToo || !c.settled) && !joined.has(c) && headcount(c) >= 3;
  /**
   * The band at a site (sites.md section 4.1): the one standing there, else a band whose
   * drawn camp would overlap the site's, moved onto it. Null when such a camp is in the way
   * but cannot move (held at an anchor, or no way there today); undefined when none is near.
   */
  /** A standing camp whose drawn camp would overlap a site's. */
  const overlapping = (site: Site) =>
    camps.find(
      (c) =>
        c.lodgings.length > 0 &&
        distanceKm(c.site.lat, c.site.lon, site.lat, site.lon) <
          (footprintM(site.key) / site.width + footprintM(c.key) / c.site.width) * LAYOUT_KM_PER_M,
    );
  const bandOn = (site: Site, day: Day): Camp | null | undefined => {
    const here = bandAt.get(site.id);
    if (here && here.lodgings.length > 0) return here;
    if (here) return null;
    const near = overlapping(site);
    if (!near) return undefined;
    // A camp held at another anchor's site stays; one that has only settled (near a Neolithic
    // threshold) may still move onto the site, as history needs it there.
    if (near.holdUntil !== undefined && near.holdUntil >= day) return null;
    const way = reach(near.site, day, ROUTE_HOPS, (x) => x === site)[0];
    if (!way || !usable(site, day, headcount(near))) return null;
    relocate(near, way.path, day);
    return near;
  };
  /** A group of the band nearest a site along open links founds a camp there, if any can. */
  const sendTo = (site: Site, day: Day, salt: number, settledToo = false): Camp | undefined => {
    if (overlapped(site)) return undefined;
    const src = reach(site, day, ROUTE_HOPS, (x) => canSend(bandAt.get(x.id), settledToo))[0];
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
    // A target kept for a plan sends the leg to the plan's site (sites.md section 4.2).
    const point = placeSite.get(placeKey('arrival', v.id))!;
    const target = claimOn(point, day)?.site ?? point;
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
   * The planning pass (sites.md section 4.2): each anchor, and each Neolithic threshold, whose
   * band is held as an anchor's to the tree's end (peopling.md section 3.6), gets a plan: its
   * site from the place table, its claim from ANCHOR_LEAD_DAYS before its day to its end, and
   * its footprint, the sites whose drawn camps would overlap its site's. Plans are checked
   * before the tree grows, and during its claim a plan's footprint is kept for it.
   */
  const footprintOf = (site: Site) =>
    new Set(
      sites
        .filter(
          (x) =>
            !x.pass &&
            distanceKm(x.lat, x.lon, site.lat, site.lon) <
              (footprintM(site.key) / site.width + footprintM(x.key) / x.width) * LAYOUT_KM_PER_M,
        )
        .map((x) => x.id),
    );
  const plans: Plan[] = [
    ...(s.anchors ?? []).map((a) => ({ ...a, kind: 'anchor' as const })),
    ...(s.thresholds ?? []).map((t) => ({ ...t, until: s.endDay, kind: 'threshold' as const })),
  ].map((a) => {
    const key = placeKey(a.kind, a.id);
    const site = placeSite.get(key)!;
    return {
      key,
      kind: a.kind,
      id: a.id,
      day: a.day,
      until: a.until,
      site,
      claim: a.day - ANCHOR_LEAD_DAYS,
      footprint: footprintOf(site),
      band: undefined,
      bands: new Set<Camp>(),
      cleared: undefined,
      met: undefined,
      how: undefined,
    };
  });
  // Encounters (sites.md section 4.3): each occurrence is a plan with several roles. On open
  // ground its meeting site is kept free from its day to its parties' leaving; at a host,
  // the host's anchor's plan keeps its site.
  const meetings: Meeting[] = [];
  for (const e of s.encounters ?? []) {
    const host = e.host ? plans.find((p) => p.kind === 'anchor' && p.id === e.host) : undefined;
    if (e.host && !host)
      throw new Error(`tree of humankind: encounter ${e.id} has no anchor ${e.host} for its host`);
    const site = host?.site ?? placeSite.get(placeKey('encounter', e.id))!;
    for (const [k, day] of e.days.entries()) {
      const leave = after(day, e.stayMs);
      const plan: Plan = host ?? {
        key: `${placeKey('encounter', e.id)}:${k}`,
        kind: 'encounter',
        id: e.id,
        day,
        until: leave,
        site,
        claim: day,
        footprint: footprintOf(site),
        band: undefined,
        bands: new Set<Camp>(),
        cleared: undefined,
        met: undefined,
        how: undefined,
      };
      if (!host) plans.push(plan);
      meetings.push({
        encounter: e,
        day,
        leave,
        site,
        plan,
        camp: undefined,
        parties: [],
        started: false,
        ended: false,
      });
    }
  }
  for (const p of plans)
    for (const k of p.footprint) {
      const list = claimsAt.get(k);
      if (list) list.push(p);
      else claimsAt.set(k, [p]);
    }
  const planByKey = new Map(plans.map((p) => [p.key, p]));
  const yearOf = (day: Day) => {
    const y = Math.round(2000 + day / DAYS_PER_YEAR);
    return y <= 0 ? `${1 - y} BCE` : `${y} CE`;
  };
  /** Sites the arrival map has reached by a day, in a culture area: land where bands can be. */
  const peopled = (x: Site, day: Day) =>
    !x.pass &&
    (s.arrival?.(x.lat, x.lon) ?? -Infinity) <= day &&
    s.density(x.lat, x.lon, day) !== undefined;
  const impossible: string[] = [];
  for (const p of plans) {
    const name = `${p.kind} ${p.id}`;
    // Usable for the whole stay: livable at its day and every century to its end (its sea
    // the place table has checked).
    const centuries = Math.ceil((p.until - p.day) / (100 * DAYS_PER_YEAR));
    for (let k = 0; k <= centuries; k++) {
      const d = Math.min(p.until, p.day + Math.round(k * 100 * DAYS_PER_YEAR));
      if (!livable(p.site, d)) {
        impossible.push(
          `${name}: its site is not livable about ${yearOf(d)}, within its stay (ice, desert, cold or height)`,
        );
        break;
      }
    }
    // Reached by people in time.
    const arrives = s.arrival?.(p.site.lat, p.site.lon) ?? -Infinity;
    if (arrives > p.day)
      impossible.push(`${name}: the arrival map reaches its site only about ${yearOf(arrives)}`);
    else if (
      !peopled(p.site, p.claim) &&
      reach(p.site, p.day, ROUTE_HOPS, (x) => peopled(x, p.claim)).length === 0
    )
      impossible.push(
        `${name}: no land the arrival map has reached by ${yearOf(p.claim)} lies within ${ROUTE_HOPS} links of its site on its day`,
      );
  }
  for (const m of meetings) {
    const e = m.encounter;
    const name = `encounter ${e.id} (${yearOf(m.day)})`;
    if (!e.host && e.roles.length < 2)
      impossible.push(`${name}: it needs two roles on open ground`);
    const lodgings = e.roles.reduce((n, r) => n + Math.ceil(r.people / LODGING_CAPACITY), 0);
    const people = e.roles.reduce((n, r) => n + r.people, 0);
    if (lodgings > MAX_LODGINGS || people > layoutOf(m.site.key).people)
      impossible.push(
        `${name}: its parties need ${lodgings} lodgings for ${people} people, more than its site holds`,
      );
    if (e.host && (m.day < m.plan.day || m.leave > m.plan.until))
      impossible.push(`${name}: it falls outside the stay of its host ${e.host}`);
    for (const r of e.roles) {
      const near = (x: Site) => distanceKm(x.lat, x.lon, r.lat, r.lon) <= r.km;
      if (
        !(near(m.site) && peopled(m.site, m.day)) &&
        reach(m.site, m.day, ROUTE_HOPS, (x) => near(x) && peopled(x, m.day)).length === 0
      )
        impossible.push(
          `${name}, role ${r.id}: no land people have reached lies within ${r.km} km of its place and ${ROUTE_HOPS} open links of the site`,
        );
    }
  }
  // No clash: plans claimed at the same time on different sites whose camps overlap.
  for (const [i, a] of plans.entries())
    for (const b of plans.slice(i + 1))
      if (
        a.site !== b.site &&
        a.footprint.has(b.site.id) &&
        a.claim <= b.until &&
        b.claim <= a.until
      )
        impossible.push(
          `${a.kind} ${a.id} and ${b.kind} ${b.id}: their sites' camps overlap while both are claimed; give them one site or move one`,
        );
  if (impossible.length) throw new Error(`tree of humankind: ${impossible.join('; ')}`);

  const hold = (p: Plan, camp: Camp, day: Day, how: PlanMeans) => {
    p.band = camp;
    p.bands.add(camp);
    p.met = day;
    p.how = how;
    // Plans on one site share its band, held to the later end.
    camp.holdUntil = Math.max(camp.holdUntil ?? -Infinity, p.until);
    // The band of an encounter's host stays small, so its guests have lodgings to come to.
    if (p.kind === 'anchor' && (s.encounters ?? []).some((e) => e.host === p.id))
      camp.target = Math.min(camp.target, LODGING_CAPACITY);
    // Any other anchor's band grows to a full band, so its scene has its people (section 8.2).
    else if (p.kind === 'anchor') camp.target = Math.max(camp.target, maxPeople(camp));
    takeRange(camp, day);
  };
  /** A camp leaves a plan's footprint: to the nearest free site it fits, else as from the sea. */
  const makeWay = (camp: Camp, day: Day): void => {
    const n = headcount(camp);
    // The whole band moves out, to a free site, else any empty one it can use (as the water's
    // last resort), and only then as from the water, where it might split up and leave some behind.
    const way =
      reach(camp.site, day, FLEE_HOPS, (x) => usable(x, day, n) && free(x, day, camp))[0] ??
      reach(
        camp.site,
        day,
        CROWD_HOPS,
        (x) => usable(x, day, n) && !bandAt.has(x.id) && !claimed(x, day, camp),
      )[0];
    if (way) relocate(camp, way.path, day);
    else if (!flee(camp, day)) treeStats.stuck++;
  };
  /** The bands standing in a plan's footprint, its own aside. */
  const inFootprint = (p: Plan) =>
    camps.filter((c) => c.lodgings.length > 0 && !p.bands.has(c) && p.footprint.has(c.site.id));
  /**
   * When a plan's claim begins, the bands in its footprint make room: the band on its site,
   * or one overlapping it that fits there, becomes its band; the others make way.
   */
  const clear = (p: Plan, day: Day) => {
    p.cleared = day;
    deliver(p, day, false);
    for (const c of inFootprint(p)) if (!isHeld(c, day)) makeWay(c, day);
  };
  /**
   * Brings a band to a plan's site, by stronger means as its day comes nearer: the band on
   * the site or one overlapping it moves on; a group from the band nearest along open links
   * with people to spare, from halfway through the lead a settled one too; in the last
   * LAST_RESORT_DAYS, the nearest band not held, whole.
   */
  const deliver = (p: Plan, day: Day, send = true) => {
    const site = p.site;
    const here = bandAt.get(site.id);
    if (here && here.lodgings.length > 0) return hold(p, here, day, 'there');
    const on = bandOn(site, day);
    if (on) return hold(p, on, day, 'moved');
    if (!send) return;
    // A camp in the way that cannot move onto the site makes way.
    for (const c of inFootprint(p)) if (!isHeld(c, day)) makeWay(c, day);
    const settledToo = day >= p.claim + Math.round(ANCHOR_LEAD_DAYS / 2);
    const child = sendTo(site, day, 66, settledToo);
    if (child) return hold(p, child, day, 'group');
    if (day < p.day - LAST_RESORT_DAYS) return;
    const src = reach(site, day, ROUTE_HOPS, (x) => {
      const c = bandAt.get(x.id);
      return (
        !!c &&
        c.lodgings.length > 0 &&
        !isHeld(c, day) &&
        !joined.has(c) &&
        usable(site, day, headcount(c))
      );
    })[0];
    if (!src) return;
    const band = bandAt.get(src.site.id)!;
    relocate(band, [...src.path].reverse(), day);
    hold(p, band, day, 'band');
  };
  /** The people of a band who can go on a trip, never the first person, leaving one behind. */
  const spare = (c: Camp) => {
    const people = c.lodgings.flatMap((l) => residents.get(l)!);
    return people.filter((f) => f !== 0).slice(0, Math.max(0, people.length - 1));
  };
  /**
   * An occurrence begins (sites.md section 4.3): each role's party walks from the band nearest
   * the site along open links that stands within the role's place, is not held and has the
   * people to spare, and builds its own lodgings at the host's camp or the encounter's.
   */
  const startMeeting = (m: Meeting, day: Day) => {
    m.started = true;
    const e = m.encounter;
    const name = `encounter ${e.id} (${yearOf(m.day)})`;
    const sending = new Set<Camp>();
    for (const [k, r] of e.roles.entries()) {
      const near = (x: Site) => distanceKm(x.lat, x.lon, r.lat, r.lon) <= r.km;
      // The party comes from the bands nearest the site along open links within the role's
      // place, each sending whom it can spare, nearest first, until it is whole.
      const sources = reach(m.site, day, ROUTE_HOPS, (x) => {
        const c = bandAt.get(x.id);
        return (
          !!c &&
          c.lodgings.length > 0 &&
          near(x) &&
          !isHeld(c, day) &&
          !c.gathering &&
          !joined.has(c) &&
          !sending.has(c) &&
          spare(c).length > 0
        );
      });
      const from = new Map<number, Camp>();
      const ways = new Map<number, Path>();
      for (const src of sources) {
        if (from.size >= r.people) break;
        const band = bandAt.get(src.site.id)!;
        const pool = spare(band);
        for (let i = 0; i < pool.length && from.size < r.people;) {
          const f = pool.splice(hash32(band.id, day, 141 + 16 * k, from.size) % pool.length, 1)[0]!;
          from.set(f, band);
          sending.add(band);
          ways.set(f, [...src.path].reverse());
        }
      }
      if (from.size < r.people)
        throw new Error(
          `tree of humankind: ${name}, role ${r.id}: the bands within ${r.km} km of its place with an open way to the site can spare ${from.size} of its ${r.people} people`,
        );
      const people = [...from.keys()];
      const culture = from.get(people[0]!)!.culture;
      let camp = e.host ? m.plan.band : m.camp;
      if (e.host && (!camp || camp.site !== m.site))
        throw new Error(
          `tree of humankind: ${name}: the band of its host ${e.host} is not at its site`,
        );
      if (!camp) {
        camp = newCamp(m.site, day);
        camp.gathering = true;
        camp.holdUntil = m.leave;
        takeRange(camp, day);
        m.camp = camp;
        m.plan.band = camp;
        m.plan.bands.add(camp);
      }
      const need = Math.ceil(people.length / LODGING_CAPACITY);
      if (
        freePlaces(camp, day) < need ||
        camp.lodgings.length + need > MAX_LODGINGS ||
        headcount(camp) + people.length > layoutOf(camp.key).people
      )
        throw new Error(
          `tree of humankind: ${name}, role ${r.id}: the camp at its site has no room for its party (site ${camp.site.key}, free ${freePlaces(camp, day)}, need ${need}, lodgings ${camp.lodgings.length}, heads ${headcount(camp)}+${people.length})`,
        );
      const lodgings: number[] = [];
      for (let i = 0; i < people.length; i += LODGING_CAPACITY) {
        const group = people.slice(i, i + LODGING_CAPACITY);
        const l = newLodging(camp, group[0]!, day, undefined, culture);
        lodgings.push(l.id);
        for (const f of group) {
          moveIn(f, homeOf(f), l.id, day);
          // Each walks its own way from its own band (humankind.md section 3.1).
          const way = wayOf(ways.get(f)!, day);
          if (way) (tree.figures[f]!.walks ??= []).push([day, l.id, way]);
        }
      }
      m.parties.push({ role: r.id, culture, lodgings, from });
    }
    treeStats.encounters.push({
      id: e.id,
      day,
      site: m.site.id,
      parties: m.parties.length,
      people: e.roles.reduce((n, r) => n + r.people, 0),
    });
  };
  /**
   * People of a party go home after an encounter (sites.md section 4.3): along open links to
   * their band, wherever it stands (else the nearest band of their culture, else any), into
   * lodgings of their own there if dry places are free, else into its lodgings with room, else
   * they found a camp at the nearest free usable site; failing all that, they stay.
   */
  const goHome = (
    m: Meeting,
    from: Camp,
    culture: string | undefined,
    group: number[],
    day: Day,
  ) => {
    const bandHere = (keep: (c: Camp) => boolean) =>
      reach(m.site, day, ROUTE_HOPS, (x) => {
        const c = bandAt.get(x.id);
        return !!c && c.lodgings.length > 0 && !c.gathering && c !== m.plan.band && keep(c);
      })[0];
    let people = group;
    const way =
      (from.lodgings.length > 0 &&
        from.site !== m.site &&
        reach(m.site, day, ROUTE_HOPS, (x) => x === from.site)[0]) ||
      bandHere((c) => c.culture === culture) ||
      bandHere(() => true);
    const home = way ? bandAt.get(way.site.id)! : undefined;
    if (home && way) {
      const route = wayOf(way.path, day);
      const need = Math.ceil(people.length / LODGING_CAPACITY);
      if (
        home.lodgings.length + need <= MAX_LODGINGS &&
        freePlaces(home, day) >= need &&
        dry(home.site, day, headcount(home) + people.length)
      ) {
        for (let i = 0; i < people.length; i += LODGING_CAPACITY) {
          const part = people.slice(i, i + LODGING_CAPACITY);
          const l = newLodging(home, part[0]!, day, route);
          for (const f of part) moveIn(f, homeOf(f), l.id, day);
        }
        people = [];
      } else {
        const left: number[] = [];
        for (const f of people) {
          const room =
            headcount(home) < layoutOf(home.key).people
              ? home.lodgings.find((l) => residents.get(l)!.length < LODGING_CAPACITY)
              : undefined;
          if (room === undefined) {
            left.push(f);
            continue;
          }
          moveIn(f, homeOf(f), room, day);
          // Its own way home, not the lodging's (humankind.md section 3.1).
          if (route) (tree.figures[f]!.walks ??= []).push([day, room, route]);
        }
        people = left;
      }
    }
    if (!people.length) return;
    const n = people.length;
    const site = reach(m.site, day, FLEE_HOPS, (x) => usable(x, day, n) && free(x, day))[0];
    if (site) found(people, site.path, day);
  };
  /**
   * An occurrence ends (sites.md section 4.3): each party's people go home, each to the band
   * it came from (goHome); an encounter's camp that someone could not leave stays a band.
   */
  const endMeeting = (m: Meeting, day: Day) => {
    m.ended = true;
    for (const party of m.parties) {
      const here = party.lodgings.flatMap((l) => residents.get(l) ?? []);
      // Those born there go with the first of the party.
      const bandOf = (f: number) => party.from.get(f) ?? party.from.values().next().value!;
      const groups = new Map<Camp, number[]>();
      for (const f of here) groups.set(bandOf(f), [...(groups.get(bandOf(f)) ?? []), f]);
      for (const [band, group] of groups) goHome(m, band, party.culture, group, day);
    }
    // Whoever could go nowhere stays: the camp becomes an ordinary band.
    if (m.camp && m.camp.lodgings.length > 0) {
      m.camp.gathering = false;
      m.camp.holdUntil = undefined;
      takeRange(m.camp, day);
    }
    if (!m.encounter.host) m.plan.band = undefined;
  };
  /** Why no band reached a plan by its day, for the build's message. */
  const why = (p: Plan, day: Day) => {
    const near = reach(
      p.site,
      day,
      ROUTE_HOPS,
      (x) => (bandAt.get(x.id)?.lodgings.length ?? 0) > 0,
    )[0];
    return near
      ? `the nearest band is ${near.hops} links away`
      : `no band stands within ${ROUTE_HOPS} links open on its day`;
  };
  const thresholds = (s.thresholds ?? []).map((t) => ({ ...t, settled: false }));
  /**
   * A Neolithic threshold is reached (peopling.md section 3.6): the camps near it settle, and
   * the band at its site, brought there if none is, is its key moment. False while none is.
   */
  const settle = (t: Threshold, day: Day): boolean => {
    for (const c of camps)
      if (c.lodgings.length > 0 && distanceKm(c.site.lat, c.site.lon, t.lat, t.lon) <= SETTLE_KM)
        c.settled = true;
    // The band held at the threshold's site.
    const band = planByKey.get(placeKey('threshold', t.id))!.band;
    if (!band || band.lodgings.length === 0) return false;
    band.settled = true;
    // It becomes the centre's village that day: the first fields stand when the sign says
    // (neolithic/villages.md section 1), with no morph delay and whatever the grid says there.
    const culture = s.thresholdCulture?.(t);
    if (culture) {
      band.thresholdCulture = culture;
      band.morphAt = day;
    }
    const people = band.lodgings.flatMap((l) => residents.get(l)!);
    // Its lodgings are keyed by its site (TreeLodging.camp), which it no longer leaves.
    treeStats.thresholds.push({ id: t.id, day, camp: band.key });
    moment('neolithic-threshold', day, people[0]!, band);
    return true;
  };

  // Scenes at anchors (humankind.md section 8.2): each behind the lodging place of its camp
  // that points most nearly towards the anchor's place, of those with no drying rack whose
  // prop, people's places and way there stay dry land for the anchor's whole stay.
  const stages: TreeStage[] = [];
  const placeAt = s.placeAt ?? onGlobe;
  /** Whether a scene of the camp's anchor is in session in the step from `day`, with the time to take down and build round it. */
  const inSession = (camp: Camp, day: Day): boolean => {
    const from = msAtDay(day, s.startDay) - BUILD_MS;
    const to = msAtDay(after(day, STEP_MS), s.startDay) + TAKE_DOWN_MS;
    return stages.some(
      (st) =>
        st.camp === camp.site.key &&
        // A session's people are held from its start for a whole turn (stageEvent's `until`).
        stageSessions(st, s.startDay).some(
          (q) => q.start < to && Math.max(q.stop, q.start + TURN_MS + 2_000) > from,
        ),
    );
  };
  for (const a of s.anchors ?? []) {
    if (!a.scene) continue;
    const p = planByKey.get(placeKey('anchor', a.id))!;
    const site = p.site;
    const sea = seaMax(p.day, p.until);
    const flood = s.campFlood ?? s.walkFlood ?? (() => Infinity);
    const dryAt = (q: { x: number; z: number }) => {
      const g = placeAt(site.lat, site.lon, q.x * LAYOUT_KM_PER_M, q.z * LAYOUT_KM_PER_M);
      return flood(g.lat, g.lon) > sea;
    };
    // Towards the real cave or grave, in layout directions (x east, z north).
    const toward = {
      x:
        distanceKm(site.lat, site.lon, site.lat, a.lon) *
        Math.sign(((a.lon - site.lon + 540) % 360) - 180),
      z: distanceKm(site.lat, site.lon, a.lat, site.lon) * Math.sign(a.lat - site.lat),
    };
    // Towards the real place, and, for a cave, on the hill there is: the ground at the
    // scene above the hearth's, up to 300 m counting as much as facing the right way.
    const tl = Math.max(1e-9, Math.sqrt(toward.x * toward.x + toward.z * toward.z));
    const groundAt = (q: { x: number; z: number }) => {
      const g = placeAt(site.lat, site.lon, q.x * LAYOUT_KM_PER_M, q.z * LAYOUT_KM_PER_M);
      return s.elevation?.(g.lat, g.lon) ?? 0;
    };
    const hearth = s.elevation?.(site.lat, site.lon) ?? 0;
    const facing = (k: number, b = stageBeyond(a.scene!.kind)[0]!) => {
      const q = slotPoint(site.key, k);
      const ql = Math.max(1e-9, Math.sqrt(q.x * q.x + q.z * q.z));
      const towards = (q.x * toward.x + q.z * toward.z) / (ql * tl);
      if (a.scene!.kind !== 'cave-painting') return towards;
      const { prop } = stageSpots(site.key, k, b);
      return towards + 2 * Math.min(1, Math.max(0, (groundAt(prop) - hearth) / 300));
    };
    // A cave keeps its cut and a margin round it clear of rivers, lakes and the sea where its
    // camp allows, so it never looks as if the water would flood it (Yang, 2026-10-21).
    const clearOfWater = (k: number, b: number) => {
      if (a.scene!.kind !== 'cave-painting') return true;
      const { prop } = stageSpots(site.key, k, b);
      const r = CAVE_WATER_CLEAR_M * stageScale(site.key);
      for (const f of [0.5, 1])
        for (let j = 0; j < 24; j++) {
          const t = (j / 24) * 2 * Math.PI;
          if (!dryAt({ x: prop.x + r * f * detCos(t), z: prop.z + r * f * detSin(t) }))
            return false;
        }
      return true;
    };
    const options: { k: number; b: number; clear: boolean; rack: boolean }[] = [];
    for (const b of stageBeyond(a.scene.kind))
      for (let k = 0; k < LODGING_SLOTS; k++)
        if (stagePoints(site.key, k, b, a.scene.kind).every(dryAt))
          options.push({ k, b, clear: clearOfWater(k, b), rack: hasRack(site.key, k) });
    // Behind a lodging place without a drying rack first (one with a rack does not put it up
    // while the scene stands, humankind.md section 8.2), then clear of water, then the farthest
    // out, then facing the real place.
    const order = stageBeyond(a.scene.kind);
    options.sort(
      (x, y) =>
        Number(x.rack) - Number(y.rack) ||
        Number(y.clear) - Number(x.clear) ||
        order.indexOf(x.b) - order.indexOf(y.b) ||
        facing(y.k, y.b) - facing(x.k, x.b) ||
        x.k - y.k,
    );
    const slot = options[0]?.k;
    const beyond = options[0]?.b ?? order[0]!;
    if (slot === undefined)
      throw new Error(
        `tree of humankind: the scene of anchor ${a.id} has no dry land behind a lodging place of its camp`,
      );
    if (a.scene.kind === 'monument') {
      // No other band's camp may overlap the ring: its sites are kept free for the anchor.
      const { prop } = stageSpots(site.key, slot, beyond);
      const at = placeAt(site.lat, site.lon, prop.x * LAYOUT_KM_PER_M, prop.z * LAYOUT_KM_PER_M);
      const ring = (11 * stageScale(site.key)) / site.width;
      for (const x of sites) {
        if (x.pass || p.footprint.has(x.id)) continue;
        if (
          distanceKm(x.lat, x.lon, at.lat, at.lon) <
          (ring + footprintM(x.key) / x.width) * LAYOUT_KM_PER_M
        ) {
          p.footprint.add(x.id);
          const list = claimsAt.get(x.id);
          if (list) list.push(p);
          else claimsAt.set(x.id, [p]);
        }
      }
    }
    stages.push({
      id: a.id,
      kind: a.scene.kind,
      prop: a.scene.prop,
      camp: site.key,
      lat: micro(site.lat),
      lon: micro(site.lon),
      slot,
      beyond,
      shown: Math.min(p.met ?? p.day, p.day),
      from: p.day,
      until: p.until,
      keep: a.scene.kind === 'cave-painting' ? s.endDay : p.until,
    });
  }
  if (stages.length) tree.stages = stages;

  /** The day each burial's dead dies: the start of its session's window (humankind.md section 8.2). */
  const deaths = stages
    .filter((x) => x.kind === 'burial')
    .flatMap((x) => {
      // Lost when the body is laid in the grave; ill and dying from the start of its window.
      const g = burialTimes(x, s.startDay);
      return g ? [{ stage: x, day: Math.floor(dayAtMs(g.body, s.startDay)), done: false }] : [];
    });

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
    for (const t of thresholds) if (!t.settled && day >= t.day) t.settled = settle(t, day);
    // Someone dies before a burial (humankind.md section 8.2): the oldest grown-up of the
    // anchor's band, never the first person, where two others remain to bury them.
    for (const [c, list] of dyingSpots) {
      const kept = list.filter((x) => x.until >= day);
      if (kept.length) dyingSpots.set(c, kept);
      else dyingSpots.delete(c);
    }
    for (const d of deaths) {
      if (d.done || after(day, STEP_MS) <= d.day) continue;
      d.done = true;
      const band = planByKey.get(placeKey('anchor', d.stage.id))!.band;
      if (!band || band.site.key !== d.stage.camp) continue;
      const people = band.lodgings.flatMap((l) => residents.get(l)!).filter((f) => f !== 0);
      if (band.lodgings.flatMap((l) => residents.get(l)!).length < 3) continue;
      const grown = people.filter((f) => lookOf(f) !== 'child');
      const dead = (grown.length ? grown : people).sort(
        (x, y) => tree.figures[x]!.born - tree.figures[y]!.born || x - y,
      )[0];
      if (dead === undefined) continue;
      d.stage.dead = dead;
      const lostDay = Math.max(d.day, tree.figures[dead]!.homes.at(-1)![0] + 1);
      dyingSpots.set(band, [
        ...(dyingSpots.get(band) ?? []),
        { spot: tree.figures[dead]!.homes.at(-1)![2], until: lostDay },
      ]);
      const home = homeOf(dead);
      const list = residents.get(home)!;
      list.splice(list.indexOf(dead), 1);
      tree.figures[dead]!.lost = Math.max(d.day, tree.figures[dead]!.homes.at(-1)![0] + 1);
      if (list.length === 0) {
        tree.lodgings[home]!.gone = tree.figures[dead]!.lost;
        band.lodgings = band.lodgings.filter((l) => l !== home);
        residents.delete(home);
      }
    }
    for (const p of plans) {
      if (day < p.claim || day > p.until) continue;
      // A meeting site is cleared for its encounter, which brings its own parties.
      if (p.kind === 'encounter') {
        if (p.cleared === undefined) {
          p.cleared = day;
          for (const c of inFootprint(p)) if (!isHeld(c, day)) makeWay(c, day);
        }
        continue;
      }
      if (p.cleared === undefined) clear(p, day);
      // The held band must still stand at the site; before the day, it is brought again.
      if (p.band && (p.band.site !== p.site || p.band.lodgings.length === 0)) {
        if (day >= p.day && p.band.site !== p.site)
          throw new Error(`tree of humankind: the band of ${p.key} left its site`);
        const gone = p.band;
        p.band = undefined;
        if (!plans.some((q) => q.band === gone)) gone.holdUntil = undefined;
      }
      if (!p.band) deliver(p, day);
      if (day >= p.day && !p.band)
        throw new Error(
          `tree of humankind: no band could reach ${p.key} by its day (${why(p, day)}); check its date and place`,
        );
    }
    for (const m of meetings) {
      if (!m.started && day >= m.day) startMeeting(m, day);
      if (m.started && !m.ended && day >= m.leave) endMeeting(m, day);
    }
    // Camps founded during this step wait for the next one.
    const count = camps.length;
    for (let ci = 0; ci < count; ci++) {
      const camp = camps[ci]!;
      // A camp that a band joined this step waits for the next, so nobody has two moves a day.
      // An encounter's camp neither roams, buds nor grows (sites.md section 4.3).
      if (camp.lodgings.length === 0 || joined.has(camp) || camp.gathering) continue;
      // Anyone still in a second house of a village whose one house holds it all moves into the
      // first, which stands longest (villages.md section 5).
      const cap = oneHouse(camp);
      if (cap && camp.lodgings.length > 1 && headcount(camp) <= cap) {
        const [first, ...rest] = camp.lodgings;
        for (const l of rest) for (const f of [...residents.get(l)!]) moveIn(f, l, first!, day);
      }
      // A village needs hands for its fields: it grows well past a band's size (humankind.md section 4.1).
      if (camp.culture && s.village?.(camp.culture) && !isHeld(camp, day))
        camp.target = Math.max(camp.target, VILLAGE_MIN + (hash32(camp.id, 13) % VILLAGE_SPREAD));
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
      // ... but not while its anchor's scene is in session: its people paint, dig or dance
      // then, and a rebuild would take them away (humankind.md section 8.2). It waits until after.
      if (stale(camp, day) && !inSession(camp, day)) {
        relocate(camp, [camp.site], day);
        continue;
      }
      // A morph has come to its site: at its moment, it takes on the new culture (sites.md section 5).
      const culture = camp.thresholdCulture ?? s.culture?.(camp.site.lat, camp.site.lon, day);
      if (culture && culture !== camp.culture) {
        camp.morphAt ??= day + (hash32(camp.id, day, 131) % morphDays);
        if (day >= camp.morphAt) {
          relocate(camp, [camp.site], day);
          continue;
        }
      }
      // A village stays where it was founded (neolithic/villages.md section 3).
      const village = !!camp.culture && !!s.village?.(camp.culture);
      // The end of a residence window: the band moves along a link, unless it has settled.
      if (day >= camp.nextMove) {
        camp.nextMove = after(day, RESIDENCE_MS + (hash32(camp.id, day, 12) % RESIDENCE_MS));
        // Farming has come to its land but it stands off a village site: it walks to the
        // nearest free one within a few links and founds its village there (villages.md section 2).
        const farmland =
          !village &&
          !camp.thresholdCulture &&
          !s.villageSite?.(camp.site.lat, camp.site.lon) &&
          !!s.farmingAt?.(camp.site.lat, camp.site.lon, day);
        const toVillage =
          farmland && !camp.settled && !isHeld(camp, day)
            ? best(
                reach(
                  camp.site,
                  day,
                  BUD_HOPS,
                  (site) =>
                    !!s.villageSite?.(site.lat, site.lon) &&
                    distanceKm(site.lat, site.lon, camp.site.lat, camp.site.lon) <=
                      VILLAGE_WALK_KM &&
                    usable(site, day, headcount(camp)) &&
                    villageKey(site, day, camp) !== undefined &&
                    !reserved(site, camp),
                ),
                day,
                2,
              )
            : undefined;
        if (toVillage) relocate(camp, toVillage.path, day, villageKey(toVillage.site, day, camp));
        else if (!camp.settled && !village && !isHeld(camp, day)) {
          const n = headcount(camp);
          // Only among the sites of its home range (sites.md section 4).
          const options = () =>
            reach(
              camp.site,
              day,
              2,
              (site) =>
                camp.range.includes(site) &&
                distanceKm(site.lat, site.lon, camp.site.lat, camp.site.lon) <= MOVE_KM &&
                usable(site, day, n) &&
                free(site, day, camp),
            );
          let choice = options();
          // A range whose other sites the desert, ice or sea have taken is taken anew from the
          // sites usable now, so the band roams again (Yang, 2026-10-20: a camp in Sudan stood
          // from 48,000 to 8000 BCE).
          if (choice.length === 0) {
            takeRange(camp, day);
            choice = options();
          }
          const pick = best(choice, day, 2);
          if (pick) relocate(camp, pick.path, day);
        }
      }

      const people = camp.lodgings.flatMap((l) => residents.get(l)!);
      if (people.length < Math.min(camp.target, maxPeople(camp))) {
        // New people step out of lodgings with room (section 4.3).
        let grown = false;
        for (const l of camp.lodgings) {
          const inside = residents.get(l)!;
          if (inside.length === 0 || inside.length >= capOf(camp)) continue;
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
        if (!grown && camp.lodgings.length < maxLodgings(camp)) {
          const full = camp.lodgings.every((l) => residents.get(l)!.length >= capOf(camp));
          if (full && hasPlace(camp, day)) {
            const builder = people[hash32(camp.id, day, 3) % people.length]!;
            const l = newLodging(camp, builder, day + (hash32(camp.id, day, 4) % step));
            moveIn(builder, homeOf(builder), l.id, l.built);
          }
        }
      } else if (day >= camp.nextBud && (!camp.settled || village) && !isHeld(camp, day)) {
        // A village never moves but founds new ones, also near a threshold (villages.md section 3).
        // A full camp sends out a small group to the best free site within a few links (section 4.3).
        camp.nextBud = after(day, BUD_MS);
        const options = reach(
          camp.site,
          day,
          BUD_HOPS,
          // Not into another band's home range, nor a culture area at its cap (sites.md section 4).
          (site) =>
            usable(site, day) &&
            (village ? villageKey(site, day) !== undefined : free(site, day)) &&
            !reserved(site) &&
            !areaFull(site, day) &&
            // A village founds villages only at village sites (neolithic/villages.md section 2).
            (!village || !!s.villageSite?.(site.lat, site.lon)),
        );
        const pick = best(options, day, 3);
        if (!pick) continue;
        const group = groupOf(camp, day, 5);
        if (!group.length) continue;
        const child = found(
          group,
          pick.path,
          day + (hash32(camp.id, day, 8) % step),
          village ? villageKey(pick.site, day) : undefined,
        );
        moment(
          'camp-founded',
          child.lodgings.length ? tree.lodgings[child.lodgings[0]!]!.built : day,
          group[0]!,
          child,
        );
      }
    }
  }
  // Kept free (sites.md section 7): no band but a plan's own stood in its footprint during
  // its claim, after it was cleared.
  const keyed = new Map(sites.map((x) => [x.key, x.id]));
  const trespass: string[] = [];
  for (const p of plans) {
    if (p.cleared === undefined) continue;
    for (const l of tree.lodgings) {
      const at = keyed.get(l.camp);
      if (at === undefined || !p.footprint.has(at)) continue;
      const band = campOf(l.id);
      // Bands joining others leave at the end of the step (flee, join).
      const left = after(p.cleared, STEP_MS);
      if (p.bands.has(band) || l.built >= p.until || (l.gone !== NEVER && l.gone <= left)) continue;
      trespass.push(`band ${band.id} stands in the footprint of ${p.key} from ${yearOf(l.built)}`);
      break;
    }
  }
  if (trespass.length) throw new Error(`tree of humankind: ${trespass.join('; ')}`);
  // A cave shows around its painting, from a minute before its first session to a little
  // after its last; a grave from its burial until it has faded into the ground (humankind.md
  // section 8.2).
  for (const x of stages) {
    const q = stageSessions(x, s.startDay);
    if (!q.length) continue;
    // A monument shows from its first session, to the anchor's end.
    if (x.kind === 'monument') {
      x.shown = Math.floor(dayAtMs(q[0]!.start, s.startDay));
      continue;
    }
    // A bone hut shows from its first hunt: the herd comes, and the carcass lies there.
    if (x.kind === 'bone-hut') {
      x.shown = Math.floor(dayAtMs(stageHunts(x, s.startDay)[0]?.start ?? q[0]!.start, s.startDay));
      continue;
    }
    const cave = x.kind === 'cave-painting';
    // A burial's window starts with its dead falling ill.
    x.shown = Math.floor(dayAtMs(cave ? q[0]!.begin - CAVE_LEAD_MS : q[0]!.start, s.startDay));
    x.keep = cave
      ? Math.ceil(dayAtMs(q.at(-1)!.stop + CAVE_LINGER_MS + CAVE_FADE_MS, s.startDay)) + 1
      : Math.max(
          Math.ceil(dayAtMs(q[0]!.stop, s.startDay)) + GRAVE_FADE_DAYS,
          Math.ceil(dayAtMs(burialTimes(x, s.startDay)!.grown + GRAVE_SINK_MS, s.startDay)),
        ) + 1;
  }
  // The plans beside their rows of the place table (sites.md section 4.2).
  for (const p of plans) {
    if (p.kind === 'encounter') continue;
    const row = treeStats.places.find((r) => r.kind === p.kind && r.id === p.id);
    if (row) Object.assign(row, { claim: p.claim, met: p.met, how: p.how });
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
  // Indexed by camp and slot: a scan of every lodging per lodging is quadratic in the tree.
  const bySlot = new Map<string, TreeLodging[]>();
  for (const l of tree.lodgings) {
    if (l.slot >= LODGING_SLOTS) problems.push(`lodging ${l.id} has no place round the hearth`);
    const key = `${l.camp}:${l.slot}`;
    const group = bySlot.get(key);
    if (group) group.push(l);
    else bySlot.set(key, [l]);
  }
  for (const l of tree.lodgings) {
    const clash = bySlot
      .get(`${l.camp}:${l.slot}`)!
      .find((o) => o.id < l.id && o.built <= l.built && (o.gone === NEVER || o.gone > l.built));
    if (clash) problems.push(`lodgings ${clash.id} and ${l.id} stand in the same place`);
  }
  // Each figure holds its spot at a camp from the day it moves in until its next move or its
  // death; two of them at one camp and spot at once share it. Swept by camp and spot in order
  // of moving in, rather than every figure against all its campmates.
  const holds = new Map<string, { f: number; from: Day; to: number }[]>();
  for (const f of tree.figures)
    f.homes.forEach(([day, lodging, spot], i) => {
      if (spot >= HEARTH_SPOTS) problems.push(`figure ${f.id} has no spot at the hearth`);
      const next = f.homes[i + 1]?.[0] ?? Infinity;
      const to = Math.min(next, f.lost === NEVER ? Infinity : f.lost);
      if (to <= day) return;
      const key = `${tree.lodgings[lodging]!.camp}:${spot}`;
      const list = holds.get(key);
      const h = { f: f.id, from: Math.max(day, f.born), to };
      if (list) list.push(h);
      else holds.set(key, [h]);
    });
  for (const list of holds.values()) {
    list.sort((a, b) => a.from - b.from || a.f - b.f);
    let last: { f: number; from: Day; to: number } | undefined;
    for (const h of list) {
      if (last && h.from < last.to && h.f !== last.f)
        problems.push(`figures ${last.f} and ${h.f} share a spot on day ${h.from}`);
      if (!last || h.to > last.to) last = h;
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
      problems.push(
        `lodging ${l.id} stands on uninhabitable land (${lat}, ${lon}, built day ${l.built})`,
      );
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
    // And the lodgings built in the THIN_MS after it, whose trees wither in it (sites.md section 6).
    const ahead = dayAtWatch(watchAtDay(to) + THIN_MS);
    for (const l of tree.lodgings) if (l.built < ahead && until(l.gone) > earliest) add(l.id);
    const figures: TreeFigure[] = [];
    for (const f of tree.figures) {
      if (f.born >= to || until(f.lost) <= earliest) continue;
      // The home at that minute's start and the one before it (for a walk under way), later
      // ones, and the first after the window: what a figure does before a move depends on
      // it (taking the lodging down, no dance before leaving), so the next file's lead minute
      // shows the same scene and nobody jumps when the app moves on to it.
      let first = 0;
      while (first + 1 < f.homes.length && f.homes[first + 1]![0] <= earliest) first++;
      const later = f.homes.slice(Math.max(0, first - 1));
      const next = later.findIndex(([d]) => d >= to);
      const homes = next < 0 ? later : later.slice(0, next + 1);
      for (const [, l] of homes) add(l);
      // Only the walks to the homes it keeps.
      const { walks: all, ...rest } = f;
      const walks = all?.filter((w) => homes.some((h) => h[0] === w[0] && h[1] === w[1]));
      figures.push({ ...rest, homes, lost: until(f.lost), ...(walks?.length ? { walks } : {}) });
    }
    const stages = (tree.stages ?? []).filter((x) => x.shown < to && until(x.keep) > earliest);
    return {
      fromDay: from,
      toDay: to,
      figures,
      lodgings: [...lodgings.values()],
      ...(stages.length ? { stages } : {}),
    };
  });
}
