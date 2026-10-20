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
  const places = Array.from({ length: LODGING_SLOTS }, (_, k) =>
    placePoints(key, k).reduce((m, q) => {
      const p = at(s, q.x, q.z);
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
  return { id, key, compact, lat, lon, width: s.w, core, places, lanes };
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
  // A full camp where one fits, else a compact one (section 2.1).
  for (const key of [id, COMPACT_SITE + id]) {
    const options = points
      .map((p) => ({ ...p, fit: roughFit(key, p.lat, p.lon, input.campFlood) }))
      .sort((a, b) => b.fit - a.fit || a.lat - b.lat || a.lon - b.lon);
    let best: Site | undefined;
    for (const o of options.slice(0, 2)) {
      const site = siteAt(id, key, o.lat, o.lon, input.campFlood);
      if (!best || fitOf(site) > fitOf(best)) best = site;
    }
    if (best && fitOf(best) > input.lowestSea) return best;
  }
  return undefined;
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
  for (const key of [id, COMPACT_SITE + id, MINIMAL_SITE + id]) {
    const options = land
      .map((p) => ({ ...p, fit: roughFit(key, p.lat, p.lon, input.campFlood) }))
      .sort((a, b) => b.fit - a.fit || a.lat - b.lat || a.lon - b.lon);
    let best: Site | undefined;
    for (const o of options.slice(0, 6)) {
      const site = siteAt(id, key, o.lat, o.lon, input.campFlood);
      if (!best || fitOf(site) > fitOf(best)) best = site;
    }
    if (best && fitOf(best) > sea) return best;
  }
  return undefined;
}

/** Lays the sites and links them (sites.md sections 2 and 3). */
export function buildSites(input: SiteInputs): SiteMap {
  lensWidth = input.widthAt ?? (() => 1);
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
  // Links by canoe at the listed crossings: from the site nearest each shore; the band paddles
  // whatever stretch of the way is not dry on the day it goes.
  for (const x of input.crossings) {
    // The three sites near each shore that stay dry the longest, each on its own side: nearer
    // its shore than the far one, so both ends of the Korea-Japan crossing are not in Korea.
    type P = { lat: number; lon: number };
    const shore = (p: P, far: P) =>
      sites
        .filter(
          (s) =>
            !s.pass &&
            distanceKm(s.lat, s.lon, p.lat, p.lon) <= SHORE_KM &&
            distanceKm(s.lat, s.lon, p.lat, p.lon) < distanceKm(s.lat, s.lon, far.lat, far.lon),
        )
        .sort((a, b) => fitOf(b) - fitOf(a) || a.id - b.id)
        .slice(0, 3);
    const [from, to] = [x.way[0]!, x.way.at(-1)!];
    for (const a of shore(from, to))
      for (const b of shore(to, from)) {
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
