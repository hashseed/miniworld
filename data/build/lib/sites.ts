// Camp sites (spec sites.md): a fixed lattice of places where a camp can stand, each with
// the sea level above which any part of its layout (hearth and people, lodging places,
// outing lanes) would be under water, and the links between them, on foot over land or by
// canoe at a listed crossing. Whole cells, fixed points and the deterministic maths only,
// so the sites are the same on every machine.

import { detAtan2, detCos, detSin, RAD } from '../../../app/src/core/detmath.ts';
import type { Day } from '../../../app/src/time/calendar.ts';
import {
  LAYOUT_KM_PER_M,
  LODGING_SLOTS,
  MAX_OUTING_M,
  RACK_R,
  SCRAPE_BACK_M,
  SCRAPE_SIDE_M,
  COMPACT_SITE,
  MINIMAL_SITE,
  gapDirection,
  isCompact,
  layoutOf,
  slotPoint,
} from '../../../app/src/world/treeScene.ts';
import { distanceKm, onGlobe } from './geo.ts';

/** Rows of sites lie this far apart, and the sites of a row too (sites.md section 2, Proposed). */
export const SITE_STEP_KM = 225;
/**
 * Sites at most this far apart are linked on foot when the way is land (section 3), so a
 * band can pass along land too narrow for a site, such as the Malay peninsula; a band
 * moving its camp goes at most MOVE_KM.
 */
export const LINK_KM = 2500;
export const NEAR_LINK_KM = 3 * SITE_STEP_KM;
/** Beyond NEAR_LINK_KM, each site is linked to its nearest site in each of this many directions. */
const FAR_SECTORS = 8;
export const MOVE_KM = 400;
/** Waypoints lie this far apart, on land farther than WAYPOINT_GAP_KM from every site, and link this far (section 3). */
const WAYPOINT_KM = 100;
const WAYPOINT_GAP_KM = 300;
const WAYPOINT_LINK_KM = 600;
/** A listed crossing links sites at most this far from its shores (section 3). */
const SHORE_KM = 900;
/**
 * A camp stands only where its ground rises and falls at most this much between the hearth
 * and the lodging places, in metres (section 2): at a drawn metre to many km, a camp on a
 * mountain front would have its fire on the plain and its huts on the peaks.
 */
export const RELIEF_M = 1500;
/** Every key place gets a site at most this far from it (section 2). */
export const KEY_PLACE_KM = 300;
export const KEY_PLACE_FAR_KM = 450;
/** How far round its hearth a camp's drawing reaches, in layout metres, by layout: full, compact, minimal. */
export const footprintM = (key: number): number =>
  key >= MINIMAL_SITE ? 12.4 : key >= COMPACT_SITE ? 13.6 : 18;
/** The core of a site, where people stand, work, dance and play, in layout metres. */
export const CORE_M = 9.5;
/** Outing lanes are measured from here out, in layout metres. */
export const LANE_FROM_M = 10;
/** Walks are checked for water this often along the way, and this far either side, in km. */
export const WALK_CHECK_KM = 10;
export const WALK_SIDE_KM = 15;
/** Rays across a gap between the lodgings, in radians from its middle, for how far people can go out. */
const LANE_TURNS = Array.from({ length: 21 }, (_, k) => (k - 10) * 0.025);

export interface Site {
  id: number;
  /** The id its camps carry, which tells the scene its layout: COMPACT_SITE on for a compact camp. */
  key: number;
  /** A compact camp: land too small for a full one (section 2.1). */
  compact: boolean;
  /** A waypoint, which bands pass through but never camp at (section 3). */
  pass?: boolean;
  /** Drawn km per true km at it, from the history lens: its camp covers less true land where it is more. */
  width: number;
  lat: number;
  lon: number;
  /** The sea level above which some point of its core is under water, in metres. */
  core: number;
  /** The same for each of its five lodging places. */
  places: number[];
  /**
   * For each of its five outing lanes, at each whole layout metre from LANE_FROM_M out to
   * MAX_OUTING_M, the sea level above which the lane up to there is under water somewhere.
   */
  lanes: number[][];
  /** Its ground rises steeply round the hearth, out to the ring of children's catch (humankind.md section 8.1). */
  steep?: boolean;
  /** How far its ground rises and falls between the hearth and the lodging places, in metres (section 2). */
  relief: number;
}

export interface Link {
  a: number;
  b: number;
  km: number;
  /** The sea level above which the way is under water somewhere, on foot; -Infinity by canoe only. */
  level: number;
  /** A listed crossing (peopling.md section 6): its id, its first day and its way from a's side to b's. */
  crossing?: { id: string; day: Day; way: { lat: number; lon: number }[] };
}

export interface SiteMap {
  sites: Site[];
  links: Link[];
  /** The links of each site, by site id. */
  linksOf: Link[][];
  /** Key places where not even a minimal camp fits (section 2). */
  unplaced: string[];
}

export interface SiteInputs {
  /** The sea level above which a point is sea, for a camp: -Infinity in a lake or on a river. */
  campFlood(lat: number, lon: number): number;
  /** The same for walkers: rivers are forded, lakes are not. */
  walkFlood(lat: number, lon: number): number;
  /** The lowest sea level of the timeline: a site's hearth must be land then at least. */
  lowestSea: number;
  /** The highest: a key place's site must stay dry then too (section 2). */
  highestSea: number;
  /** The listed crossings, from their days (peopling.md section 6). */
  crossings: { id: string; day: Day; way: { lat: number; lon: number }[] }[];
  /** Drawn km per true km at a place, from the history lens at its fixed strength; 1 without it. */
  widthAt?(lat: number, lon: number): number;
  /**
   * Places that need a site near them; `km` asks for one nearer than KEY_PLACE_KM (an anchor's),
   * `sea` for one dry only up to that sea level, not the highest (a dated place, section 2.1).
   */
  keyPlaces?: { id: string; lat: number; lon: number; km?: number; sea?: number }[];
  /** The height of the ground at a point, in metres, for a site's relief; flat without it. */
  elevation?(lat: number, lon: number): number;
  /** Rows of latitude to lay sites on, south to north. */
  fromLat?: number;
  toLat?: number;
  /** How many lattice steps apart the sites are at a point, from the culture areas; 1 when not given. */
  stepAt?(lat: number, lon: number): number;
}

/** A point of a site's layout, in layout metres east and north of its hearth. */
/**
 * A point of a site's layout, in layout metres east and north of its hearth, as the globe
 * draws it through the history lens: drawn km are fewer true km where the lens draws the
 * land bigger (sites.md section 2).
 */
const at = (s: { lat: number; lon: number; w: number }, x: number, z: number) =>
  onGlobe(s.lat, s.lon, (x * LAYOUT_KM_PER_M) / s.w, (z * LAYOUT_KM_PER_M) / s.w);
/** Drawn km per true km at a place, set from the inputs while the sites are built. */
let lensWidth: (lat: number, lon: number) => number = () => 1;
/** The height of the ground, set from the inputs while the sites are built. */
let groundAt: (lat: number, lon: number) => number = () => 0;

/**
 * How far the ground rises and falls across a camp, in metres: between its hearth, the ring
 * of its core and its lodging places, as the layout stands at one drawn metre to many km
 * (section 2).
 */
function reliefAt(key: number, s: { lat: number; lon: number; w: number }): number {
  let lo = groundAt(s.lat, s.lon);
  let hi = lo;
  const take = (x: number, z: number) => {
    const p = at(s, x, z);
    const h = groundAt(p.lat, p.lon);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  };
  const r = layoutOf(key).core;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * 2 * Math.PI;
    take(r * detCos(a), r * detSin(a));
  }
  for (let k = 0; k < LODGING_SLOTS; k++) {
    const q = slotPoint(key, k);
    take(q.x, q.z);
  }
  return hi - lo;
}

/** The points a lodging place needs dry: its floor to the door, its builders, its rack and scrapers. */
export function placePoints(siteId: number, k: number): { x: number; z: number }[] {
  const p = slotPoint(siteId, k);
  const compact = isCompact(siteId);
  const out = [p];
  // Rings every metre or less out past the builders, 24 points each, so no lake slips between.
  const { floor, build, clear } = layoutOf(siteId);
  // Out past the builders and the ways round the lodging, which bend out 1.3 times its clear.
  const b = Math.max(build + 1, clear * 1.3 + 0.5);
  for (const r of [...floor, (floor.at(-1)! + b) / 2, b])
    for (let j = 0; j < 24; j++) {
      const a = (j / 24) * 2 * Math.PI;
      out.push({ x: p.x + r * detCos(a), z: p.z + r * detSin(a) });
    }
  if (compact) return out;
  const len = Math.sqrt(p.x * p.x + p.z * p.z);
  const [ux, uz] = [p.x / len, p.z / len];
  for (const [r, across] of [
    [RACK_R, 0],
    [RACK_R, 4],
    [RACK_R, -4],
    [RACK_R + SCRAPE_BACK_M, 0],
    [RACK_R + SCRAPE_BACK_M + 1, 0],
    [RACK_R + SCRAPE_BACK_M + 1, SCRAPE_SIDE_M],
    [RACK_R + SCRAPE_BACK_M + 1, -SCRAPE_SIDE_M],
  ] as const)
    out.push({ x: ux * r - uz * across, z: uz * r + ux * across });
  return out;
}

/** The flood levels of a site at a place (section 2). */
function siteAt(
  id: number,
  key: number,
  lat: number,
  lon: number,
  flood: (lat: number, lon: number) => number,
): Site {
  const s = { lat, lon, w: lensWidth(lat, lon) };
  const compact = isCompact(key);
  let core = flood(lat, lon);
  for (let r = 0.75; r <= layoutOf(key).core + 1e-9; r += 0.75)
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * 2 * Math.PI;
      const p = at(s, r * detCos(a), r * detSin(a));
      core = Math.min(core, flood(p.lat, p.lon));
    }
  // A lodging place far above or below the hearth is no place (RELIEF_M).
  const hearth = groundAt(lat, lon);
  const places = Array.from({ length: LODGING_SLOTS }, (_, k) =>
    placePoints(key, k).reduce((m, q) => {
      const p = at(s, q.x, q.z);
      if (Math.abs(groundAt(p.lat, p.lon) - hearth) > RELIEF_M) return -Infinity;
      return Math.min(m, flood(p.lat, p.lon));
    }, Infinity),
  );
  const lanes = Array.from({ length: LODGING_SLOTS }, (_, gap) => {
    const d = gapDirection(key, gap);
    const out: number[] = [];
    let level = core;
    // From the edge of the core out to where the lanes are measured, as compact camps' cores are small.
    for (let r = layoutOf(key).core; r < LANE_FROM_M; r += 0.5)
      for (const turn of LANE_TURNS) {
        const [c, sn] = [detCos(turn), detSin(turn)];
        const p = at(s, (d.x * c - d.z * sn) * r * 1.1, (d.x * sn + d.z * c) * r * 1.1);
        level = Math.min(level, flood(p.lat, p.lon));
      }
    for (let m = LANE_FROM_M; m <= MAX_OUTING_M; m++) {
      // Across the lane, a little further out than people go, as coasts are drawn smoothed.
      for (const r of [m - 0.5, m])
        for (const turn of LANE_TURNS) {
          const [c, sn] = [detCos(turn), detSin(turn)];
          const p = at(s, (d.x * c - d.z * sn) * r * 1.1, (d.x * sn + d.z * c) * r * 1.1);
          level = Math.min(level, flood(p.lat, p.lon));
        }
      out.push(level);
    }
    return out;
  });
  return { id, key, compact, lat, lon, width: s.w, core, places, lanes, relief: reliefAt(key, s) };
}

/** How far a lane of a site reaches at a sea level, in layout metres; 0 when not past LANE_FROM_M. */
export function laneReach(site: Site, gap: number, sea: number): number {
  const levels = site.lanes[gap]!;
  let reach = 0;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i]! <= sea) break;
    reach = LANE_FROM_M + i;
  }
  return reach;
}

/** The sea level above which the straight way between two points is under water somewhere. */
/** How far off its drawn coast a crossing's shore point may lie, in km. */
const SHORE_SLACK_KM = 25;
/** Whether the straight way between two points is land, at points every WALK_CHECK_KM, at a sea level. */
function landAlong(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  flood: (lat: number, lon: number) => number,
  sea: number,
): boolean {
  const km = distanceKm(a.lat, a.lon, b.lat, b.lon);
  const n = Math.max(1, Math.ceil(km / WALK_CHECK_KM));
  let dLon = b.lon - a.lon;
  if (dLon > 180) dLon -= 360;
  else if (dLon < -180) dLon += 360;
  // The shore point itself may lie just off the drawn coast: its last SHORE_SLACK_KM are not checked.
  const last = Math.floor(n * Math.max(0, 1 - SHORE_SLACK_KM / Math.max(km, 1e-6)));
  for (let k = 0; k <= last; k++) {
    let lon = a.lon + (dLon * k) / n;
    if (lon > 180) lon -= 360;
    else if (lon < -180) lon += 360;
    if (flood(a.lat + ((b.lat - a.lat) * k) / n, lon) <= sea) return false;
  }
  return true;
}

export function wayLevel(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  flood: (lat: number, lon: number) => number,
): number {
  const km = distanceKm(a.lat, a.lon, b.lat, b.lon);
  const n = Math.max(1, Math.ceil(km / WALK_CHECK_KM));
  let dLon = b.lon - a.lon;
  if (dLon > 180) dLon -= 360;
  else if (dLon < -180) dLon += 360;
  const cos = Math.max(0.05, detCos(((a.lat + b.lat) / 2) * RAD));
  const KM = 111.195;
  const [ex, ny] = km > 0 ? [(dLon * cos * KM) / km, ((b.lat - a.lat) * KM) / km] : [0, 0];
  const side = { lat: (ex * WALK_SIDE_KM) / KM, lon: (-ny * WALK_SIDE_KM) / (KM * cos) };
  let level = Infinity;
  for (let k = 0; k <= n; k++) {
    const lat = a.lat + ((b.lat - a.lat) * k) / n;
    let lon = a.lon + (dLon * k) / n;
    if (lon > 180) lon -= 360;
    else if (lon < -180) lon += 360;
    for (const sgn of [0, 1, -1])
      level = Math.min(level, flood(lat + sgn * side.lat, lon + sgn * side.lon));
  }
  return level;
}

/** How well a camp fits at a place, roughly: the lowest flood level of its core and of its second best lodging place. */
function roughFit(
  key: number,
  lat: number,
  lon: number,
  flood: (lat: number, lon: number) => number,
): number {
  const s = { lat, lon, w: lensWidth(lat, lon) };
  const compact = isCompact(key);
  const hearth = groundAt(lat, lon);
  let core = flood(lat, lon);
  for (const r of compact ? [2, layoutOf(key).core] : [3, 6, CORE_M])
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 2 * Math.PI;
      const p = at(s, r * detCos(a), r * detSin(a));
      core = Math.min(core, flood(p.lat, p.lon));
    }
  const places = Array.from({ length: LODGING_SLOTS }, (_, k) => {
    const q = slotPoint(key, k);
    const len = Math.sqrt(q.x * q.x + q.z * q.z);
    let m = Infinity;
    for (const r of compact
      ? [len, len + layoutOf(key).build]
      : [len, RACK_R + SCRAPE_BACK_M + 1]) {
      const p = at(s, (q.x / len) * r, (q.z / len) * r);
      // As in siteAt: a place far above or below the hearth is no place.
      if (Math.abs(groundAt(p.lat, p.lon) - hearth) > RELIEF_M) return -Infinity;
      m = Math.min(m, flood(p.lat, p.lon));
    }
    return m;
  }).sort((a, b) => b - a);
  return Math.min(core, places[compact ? 0 : 1]!);
}

/** How well a site fits: the lowest of its core and of the lodging places it needs. */
const fitOf = (site: Site) =>
  Math.min(site.core, [...site.places].sort((a, b) => b - a)[site.compact ? 0 : 1]!);

/**
 * The best place for a site within its cell of the lattice (sites.md section 2): of a 5 by 5
 * grid of places across the cell, the one where a camp fits best, worked out in full for the
 * two best by a rough look; undefined where none fits even at the lowest sea.
 */
function bestInCell(id: number, lat: number, lon: number, lonStep: number, input: SiteInputs) {
  const dLat = SITE_STEP_KM / 111.195;
  const points: { lat: number; lon: number }[] = [];
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      const la = lat + (i * dLat) / 3;
      if (la < -89 || la > 89) continue;
      let lo = lon + (j * lonStep) / 3;
      if (lo >= 180) lo -= 360;
      else if (lo < -180) lo += 360;
      if (input.campFlood(la, lo) > input.lowestSea) points.push({ lat: la, lon: lo });
    }
  // A full camp where one fits, else a compact one (section 2.1); on even ground where one
  // fits there as well as on uneven, often a compact camp with its shorter reach; else on
  // the evenest ground that does, not the highest.
  // Each place is looked at once per layout, and worked out in full once.
  const rough = new Map<number, { lat: number; lon: number; fit: number; relief: number }[]>();
  const roughOf = (key: number) => {
    let list = rough.get(key);
    if (!list) {
      list = points.map((p) => ({
        ...p,
        fit: roughFit(key, p.lat, p.lon, input.campFlood),
        relief: reliefAt(key, { ...p, w: lensWidth(p.lat, p.lon) }),
      }));
      rough.set(key, list);
    }
    return list;
  };
  const full = new Map<string, Site>();
  const siteOf = (key: number, lat: number, lon: number) => {
    const k = `${key}|${lat}|${lon}`;
    let site = full.get(k);
    if (!site) full.set(k, (site = siteAt(id, key, lat, lon, input.campFlood)));
    return site;
  };
  const pick = (key: number, ground: 'any' | 'even' | 'evenest') => {
    const options = roughOf(key)
      .filter((o) => ground !== 'even' || o.relief <= RELIEF_M)
      .filter((o) => ground !== 'evenest' || o.fit > input.lowestSea)
      .sort((a, b) =>
        ground === 'evenest'
          ? a.relief - b.relief || a.lat - b.lat || a.lon - b.lon
          : b.fit - a.fit || a.lat - b.lat || a.lon - b.lon,
      );
    let best: Site | undefined;
    for (const o of options.slice(0, 2)) {
      const site = siteOf(key, o.lat, o.lon);
      if (fitOf(site) <= input.lowestSea) continue;
      if (!best || (ground === 'evenest' ? site.relief < best.relief : fitOf(site) > fitOf(best)))
        best = site;
    }
    return best;
  };
  const anywhere = pick(id, 'any') ?? pick(COMPACT_SITE + id, 'any');
  if (!anywhere) return undefined;
  const need = Math.min(fitOf(anywhere), input.highestSea);
  for (const ground of ['even', 'evenest'] as const)
    for (const key of [id, COMPACT_SITE + id]) {
      const site = pick(key, ground);
      if (site && fitOf(site) >= need) return site;
    }
  return anywhere;
}

/**
 * The best site for a key place (section 2): of places on rings round it out to KEY_PLACE_KM,
 * where a full camp fits best, else a compact one, else a minimal one.
 */
function keySite(
  id: number,
  place: { lat: number; lon: number },
  input: SiteInputs,
  radiusKm = KEY_PLACE_KM,
  sea = input.highestSea,
): Site | undefined {
  // Rings every 25 km out to KEY_PLACE_KM, 24 places each.
  const points = [{ lat: place.lat, lon: place.lon }];
  for (let r = 25; r <= radiusKm; r += 25)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 2 * Math.PI;
      points.push(onGlobe(place.lat, place.lon, r * detCos(a), r * detSin(a)));
    }
  const land = points.filter((p) => input.campFlood(p.lat, p.lon) > sea);
  // The largest layout whose camp stays dry even at the highest sea of the timeline (or of
  // the place's span).
  // On even ground first, in the smaller layouts too, then on the evenest that fits.
  const rough = new Map<number, { lat: number; lon: number; fit: number; relief: number }[]>();
  const roughOf = (key: number) => {
    let list = rough.get(key);
    if (!list) {
      list = land.map((p) => ({
        ...p,
        fit: roughFit(key, p.lat, p.lon, input.campFlood),
        relief: reliefAt(key, { ...p, w: lensWidth(p.lat, p.lon) }),
      }));
      rough.set(key, list);
    }
    return list;
  };
  for (const ground of ['even', 'evenest'] as const)
    for (const key of [id, COMPACT_SITE + id, MINIMAL_SITE + id]) {
      const options = roughOf(key)
        .filter((o) => (ground === 'even' ? o.relief <= RELIEF_M : o.fit > sea))
        .sort((a, b) =>
          ground === 'even'
            ? b.fit - a.fit || a.lat - b.lat || a.lon - b.lon
            : a.relief - b.relief || a.lat - b.lat || a.lon - b.lon,
        );
      let best: Site | undefined;
      for (const o of options.slice(0, 6)) {
        const site = siteAt(id, key, o.lat, o.lon, input.campFlood);
        if (fitOf(site) <= sea) continue;
        if (!best || (ground === 'even' ? fitOf(site) > fitOf(best) : site.relief < best.relief))
          best = site;
      }
      if (best) return best;
    }
  return undefined;
}

/** Lays the sites and links them (sites.md sections 2 and 3). */
export function buildSites(input: SiteInputs): SiteMap {
  lensWidth = input.widthAt ?? (() => 1);
  groundAt = input.elevation ?? (() => 0);
  const KM = 111.195;
  const sites: Site[] = [];
  const dLat = SITE_STEP_KM / KM;
  const from = input.fromLat ?? -60;
  const to = input.toLat ?? 80;
  let row = 0;
  for (let lat = from; lat <= to + 1e-9; lat += dLat, row++) {
    const cos = Math.max(0.05, detCos(lat * RAD));
    const n = Math.max(1, Math.floor((360 * cos * KM) / SITE_STEP_KM));
    const step = 360 / n;
    for (let k = 0; k < n; k++) {
      let lon = -180 + step * (k + (row % 2 ? 0.5 : 0));
      if (lon >= 180) lon -= 360;
      // A coarser lattice keeps every n-th row and every n-th point along it.
      const every = input.stepAt?.(lat, lon) ?? 1;
      if (every > 1 && (row % every !== 0 || k % every !== 0)) continue;
      const site = bestInCell(sites.length, lat, lon, step, input);
      if (site) sites.push(site);
    }
  }
  // Every key place gets a site near it, of whatever layout fits there (section 2).
  const unplaced: string[] = [];
  for (const place of input.keyPlaces ?? []) {
    // A site near it that stays dry at the highest sea, so it can be used in every age.
    const radius = place.km ?? KEY_PLACE_KM;
    const sea = place.sea ?? input.highestSea;
    const near = sites.some(
      (x) => fitOf(x) > sea && distanceKm(x.lat, x.lon, place.lat, place.lon) <= radius,
    );
    if (near) continue;
    // Within its radius, or farther where nothing fits nearer.
    const site =
      keySite(sites.length, place, input, radius, sea) ??
      (radius < KEY_PLACE_KM
        ? keySite(sites.length, place, input, KEY_PLACE_KM, sea)
        : undefined) ??
      keySite(sites.length, place, input, KEY_PLACE_FAR_KM, sea);
    if (site) sites.push(site);
    else unplaced.push(place.id);
  }
  // Waypoints (section 3) on land far from every site, about every WAYPOINT_KM, which bands pass
  // through but never camp at: never dry for a camp.
  const cellOf = (lat: number, lon: number) =>
    `${Math.floor(lat / 4)}:${Math.floor((lon + 180) / 4)}`;
  const nearSites = new Map<string, Site[]>();
  for (const x of sites)
    nearSites.set(cellOf(x.lat, x.lon), [...(nearSites.get(cellOf(x.lat, x.lon)) ?? []), x]);
  const farFromSites = (lat: number, lon: number) => {
    const r = Math.floor(lat / 4);
    const c = Math.floor((lon + 180) / 4);
    const span = Math.ceil(1 / Math.max(0.1, detCos(Math.min(85, Math.abs(lat) + 4) * RAD)));
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -span; dc <= span; dc++)
        for (const x of nearSites.get(`${r + dr}:${(((c + dc) % 90) + 90) % 90}`) ?? [])
          if (distanceKm(x.lat, x.lon, lat, lon) <= WAYPOINT_GAP_KM) return false;
    return true;
  };
  const wLat = WAYPOINT_KM / KM;
  for (let lat = from, row = 0; lat <= to + 1e-9; lat += wLat, row++) {
    const cos = Math.max(0.05, detCos(lat * RAD));
    const n = Math.max(1, Math.floor((360 * cos * KM) / WAYPOINT_KM));
    for (let k = 0; k < n; k++) {
      let lon = -180 + (360 / n) * (k + (row % 2 ? 0.5 : 0));
      if (lon >= 180) lon -= 360;
      if (input.walkFlood(lat, lon) <= input.lowestSea || !farFromSites(lat, lon)) continue;
      const lanes = Array.from({ length: LODGING_SLOTS }, () => [-Infinity]);
      sites.push({
        id: sites.length,
        key: sites.length,
        compact: false,
        pass: true,
        width: 1,
        lat,
        lon,
        core: -Infinity,
        places: Array(LODGING_SLOTS).fill(-Infinity),
        relief: 0,
        lanes,
      });
    }
  }
  // Links on foot (section 3): to every site within NEAR_LINK_KM, and to the FAR_LINKS nearest
  // beyond that up to LINK_KM, found through a coarse grid of cells.
  const links: Link[] = [];
  const seen = new Set<string>();
  const cell = (s: Site) => `${Math.floor(s.lat / 8)}:${Math.floor((s.lon + 180) / 8)}`;
  const byCell = new Map<string, Site[]>();
  for (const s of sites) byCell.set(cell(s), [...(byCell.get(cell(s)) ?? []), s]);
  const link = (a: Site, b: Site, km: number) => {
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const level = wayLevel(a, b, input.walkFlood);
    if (level > input.lowestSea)
      links.push(a.id < b.id ? { a: a.id, b: b.id, km, level } : { a: b.id, b: a.id, km, level });
  };
  for (const a of sites) {
    const r = Math.floor(a.lat / 8);
    const c = Math.floor((a.lon + 180) / 8);
    const cells = Math.ceil(3 / Math.max(0.1, detCos(Math.min(85, Math.abs(a.lat) + 24) * RAD)));
    const far: { b: Site; km: number }[] = [];
    for (let dr = -3; dr <= 3; dr++)
      for (let dc = -cells; dc <= cells; dc++)
        for (const b of byCell.get(`${r + dr}:${(((c + dc) % 45) + 45) % 45}`) ?? []) {
          if (b === a) continue;
          const km = distanceKm(a.lat, a.lon, b.lat, b.lon);
          // Waypoints link only to what is near them, and only on land.
          if (a.pass || b.pass) {
            if (km <= WAYPOINT_LINK_KM) link(a, b, km);
          } else if (km <= NEAR_LINK_KM) link(a, b, km);
          else if (km <= LINK_KM) far.push({ b, km });
        }
    if (a.pass) continue;
    far.sort((p, q) => p.km - q.km || p.b.id - q.b.id);
    const sectors = new Set<number>();
    for (const { b, km } of far) {
      let dLon = b.lon - a.lon;
      if (dLon > 180) dLon -= 360;
      else if (dLon < -180) dLon += 360;
      const sector = Math.floor(
        ((detAtan2(b.lat - a.lat, dLon * detCos(a.lat * RAD)) / (2 * Math.PI) + 1) * FAR_SECTORS) %
          FAR_SECTORS,
      );
      if (sectors.has(sector)) continue;
      sectors.add(sector);
      link(a, b, km);
    }
  }
  // Links by canoe at the listed crossings: from the sites of each shore's own land; the band
  // paddles whatever stretch of the way is not dry on the day it goes.
  const foot = new Map<number, number[]>();
  for (const l of links) {
    foot.set(l.a, [...(foot.get(l.a) ?? []), l.b]);
    foot.set(l.b, [...(foot.get(l.b) ?? []), l.a]);
  }
  for (const x of input.crossings) {
    // The three sites that stay dry the longest within SHORE_KM of each shore, on that shore's
    // own land: they walk, at the lowest sea, to the shore's home, the camp site nearest it
    // whose straight way to it is land. Until 2026-10-20 any site nearer one shore than the
    // other would do, and with no site on Sulawesi the Wallace Line's far end lay in Borneo.
    type P = { lat: number; lon: number };
    const shore = (p: P): Site[] => {
      const km = (s: Site) => distanceKm(s.lat, s.lon, p.lat, p.lon);
      const home = sites
        .filter((s) => !s.pass && km(s) <= SHORE_KM)
        .sort((a, b) => km(a) - km(b) || a.id - b.id)
        // Along the line itself, not its sides: the shore lies at the water's edge.
        .find((s) => landAlong(s, p, input.walkFlood, input.lowestSea));
      if (!home) return [];
      const seen = new Set<number>([home.id]);
      let ring = [home.id];
      while (ring.length) {
        const next: number[] = [];
        for (const i of ring)
          for (const j of foot.get(i) ?? [])
            if (!seen.has(j) && km(sites[j]!) <= SHORE_KM) {
              seen.add(j);
              next.push(j);
            }
        ring = next;
      }
      return [...seen]
        .map((i) => sites[i]!)
        .filter((s) => !s.pass)
        .sort((a, b) => fitOf(b) - fitOf(a) || a.id - b.id)
        .slice(0, 3);
    };
    const [from, to] = [x.way[0]!, x.way.at(-1)!];
    const [here, there] = [shore(from), shore(to)];
    // A crossing to land too small for any camp (New Ireland) links nothing; it is reported.
    if (!here.length || !there.length) {
      unplaced.push(`crossing ${x.id} (${here.length ? 'far' : 'first'} shore)`);
      continue;
    }
    for (const a of here)
      for (const b of there) {
        if (a === b) continue;
        const km = distanceKm(a.lat, a.lon, b.lat, b.lon);
        links.push({ a: a.id, b: b.id, km, level: -Infinity, crossing: x });
      }
  }
  links.sort((p, q) => p.a - q.a || p.b - q.b);
  const linksOf: Link[][] = sites.map(() => []);
  for (const l of links) {
    linksOf[l.a]!.push(l);
    linksOf[l.b]!.push(l);
  }
  return { sites, links, linksOf, unplaced };
}
