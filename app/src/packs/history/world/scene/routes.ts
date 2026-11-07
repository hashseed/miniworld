// Routes round a camp's obstacles and legs of a figure's walk (spec humankind.md section 8.1).

import { type Pt, PACE } from './units.ts';
import {
  FIRE_CLEAR_M,
  LODGING_SLOTS,
  slotPoint,
  layoutOf,
  hasRack,
  rackAt,
  towards,
} from './camp.ts';
import type { TreeClip } from './types.ts';

/**
 * The way from a to b within a camp: straight, or round the fire by a point beside it
 * when the straight line would pass through it.
 */
export function route(a: Pt, b: Pt, camp?: number): Pt[] {
  // The same walks are asked for frame after frame: remember them (a pure function).
  const key = `${camp}|${a.x}|${a.z}|${b.x}|${b.z}`;
  const known = routes.get(key);
  if (known) return known;
  if (routes.size >= ROUTES_KEPT) routes.clear();
  const way = routeOf(a, b, camp);
  routes.set(key, way);
  return way;
}

export const routes = new Map<string, Pt[]>();

export const ROUTES_KEPT = 50_000;

export function routeOf(a: Pt, b: Pt, camp?: number): Pt[] {
  const all = camp === undefined ? FIRE_ONLY : campObstacles(camp);
  // Obstacles at either end are where the walk is going, or leaving from: a hut door, a rack.
  const live = all.filter(
    (c) =>
      Math.sqrt((a.x - c.x) ** 2 + (a.z - c.z) ** 2) >= c.r &&
      Math.sqrt((b.x - c.x) ** 2 + (b.z - c.z) ** 2) >= c.r,
  );
  return detour(a, b, live, 4);
}

/** A circle a walk keeps out of, in layout metres. */
export interface Circle {
  x: number;
  z: number;
  r: number;
}

export const FIRE_ONLY: Circle[] = [{ x: 0, z: 0, r: FIRE_CLEAR_M }];

/** Walks keep this far from the middle of a drying rack (section 8.1); from a lodging, its layout's clear. */
export const RACK_CLEAR_M = 4.4;

/** The fire, the lodgings of every slot and their racks: what walks at a camp go round. */
export const obstacles = new Map<number, Circle[]>();

export function campObstacles(camp: number): Circle[] {
  let list = obstacles.get(camp);
  if (!list) {
    list = [...FIRE_ONLY];
    for (let k = 0; k < LODGING_SLOTS; k++) {
      list.push({ ...slotPoint(camp, k), r: layoutOf(camp).clear });
      if (hasRack(camp, k)) list.push({ ...rackAt(camp, k), r: RACK_CLEAR_M });
    }
    obstacles.set(camp, list);
  }
  return list;
}

/**
 * The way from a to b round the first circle the straight line passes through, by a point
 * beside it on the side the line already passes; each part is checked again in turn.
 */
export function detour(a: Pt, b: Pt, circles: Circle[], depth: number): Pt[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9 || depth === 0) return [a, b];
  let hit: { c: Circle; t: number; px: number; pz: number } | undefined;
  for (const c of circles) {
    const t = Math.min(1, Math.max(0, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2));
    if (t <= 0 || t >= 1) continue;
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    if (Math.sqrt((px - c.x) ** 2 + (pz - c.z) ** 2) >= c.r) continue;
    if (!hit || t < hit.t) hit = { c, t, px, pz };
  }
  if (!hit) return [a, b];
  const { c, px, pz } = hit;
  const d = Math.sqrt((px - c.x) ** 2 + (pz - c.z) ** 2);
  const len = Math.sqrt(len2);
  let [sx, sz] = d > 1e-6 ? [(px - c.x) / d, (pz - c.z) / d] : [-dz / len, dx / len];
  // Round a lodging or rack on the fire's side, not away from the hearth, where the land is
  // not checked: an empty lodging place may lie in the sea (sites.md section 2).
  const out = Math.sqrt(c.x * c.x + c.z * c.z);
  if (out > 1e-6 && (sx * c.x + sz * c.z) / out > 0.5) [sx, sz] = [-c.x / out, -c.z / out];
  const w = { x: c.x + sx * c.r * 1.3, z: c.z + sz * c.r * 1.3 };
  return [...detour(a, w, circles, depth - 1), ...detour(w, b, circles, depth - 1).slice(1)];
}

export function routeLength(points: Pt[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++)
    m += Math.sqrt((points[i]!.x - points[i - 1]!.x) ** 2 + (points[i]!.z - points[i - 1]!.z) ** 2);
  return m;
}

/** A stretch of a figure's time at a camp: walking a route, or standing at a point. */
export interface Leg {
  start: number;
  end: number;
  /** A clip, a rest, inside the hut (out of sight), or a camp event's own motion. */
  clip: TreeClip | 'rest' | 'inside' | 'event';
  route: Pt[];
  /** What a standing figure faces. */
  face?: Pt;
  /** A prop shown while the leg lasts: the spit over the fire while cooking. */
  prop?: 'prop-spit' | 'prop-quern' | 'prop-pot-large';
}

/** Builds a figure's legs one after another from a point and a time. */
export class Itinerary {
  legs: Leg[] = [];
  t: number;
  at: Pt;
  /** The camp whose fire, lodgings and racks its walks go round. */
  camp: number | undefined;
  constructor(t: number, at: Pt, camp?: number) {
    this.t = t;
    this.at = at;
    this.camp = camp;
  }
  go(
    to: Pt,
    clip: 'walk' | 'run' | 'carry' | 'pole' | 'crouch' | 'bearBehind' | 'bearAhead' = 'walk',
    /** Straight there, round nothing: a way whose ground was checked as a straight line. */
    direct = false,
  ): this {
    // A carrying pole keeps to its lane, so its two carriers walk in step.
    const way = direct
      ? [this.at, to]
      : route(this.at, to, clip === 'pole' ? undefined : this.camp);
    const m = routeLength(way);
    if (m < 1e-6) return this;
    const end = this.t + Math.ceil(m / PACE[clip]);
    this.legs.push({ start: this.t, end, clip, route: way });
    this.t = end;
    this.at = to;
    return this;
  }
  stay(until: number, clip: Leg['clip'], face?: Pt, prop?: Leg['prop']): this {
    if (until <= this.t) return this;
    this.legs.push({ start: this.t, end: until, clip, route: [this.at], face, prop });
    this.t = until;
    return this;
  }
}

/** The point a fraction of the way along a route, and the direction it goes there. */
export function along(way: Pt[], f: number): Pt & { dirX: number; dirZ: number } {
  if (way.length === 1) return { ...way[0]!, dirX: 0, dirZ: 0 };
  let left = routeLength(way) * f;
  for (let i = 1; i < way.length; i++) {
    const [a, b] = [way[i - 1]!, way[i]!];
    const m = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
    if (left <= m || i === way.length - 1) {
      const t = m < 1e-9 ? 1 : Math.min(1, left / m);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, ...towards(a.x, a.z, b.x, b.z) };
    }
    left -= m;
  }
  return { ...way.at(-1)!, dirX: 0, dirZ: 0 };
}
