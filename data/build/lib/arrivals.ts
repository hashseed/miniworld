// The arrival map (spec peopling.md, section 4): for each cell of a half-degree
// grid, the first day people may camp there. Africa opens behind the prologue
// front from the first person; every route opens the land along the shortest
// way over land, or over a listed crossing, from one dated arrival point to the
// next; and from opened land the rest of the same culture area opens slowly.
// Whole cells and fixed costs only, so the map is the same on every machine.

import {
  astronomicalYear,
  dayOfYearStart,
  DAYS_PER_YEAR,
  type Day,
} from '../../../app/src/time/calendar.ts';
import { distanceKm } from './humankind.ts';

/** Half a degree, as the climate grids (milestone 1, section 4.3). */
export const ARRIVAL_CELL_DEG = 0.5;
const W = 360 / ARRIVAL_CELL_DEG;
const H = 180 / ARRIVAL_CELL_DEG;
/** A cell no route or front ever reaches. */
export const CLOSED = 2 ** 31 - 1;
/** From opened land the rest of the culture area opens at this pace (Proposed). */
export const SIDEWAYS_KM_PER_YEAR = 1;
/** A route's way keeps a point about this often, in km. */
const LEG_KM = 200;
/** Route ends and crossing points snap to land this many cells away at most. */
const SNAP_CELLS = 4;

export interface ArrivalPoint {
  id: string;
  bce: number;
  lat: number;
  lon: number;
  en: string;
  de: string;
  source: string;
  debated?: boolean;
}

export interface Arrivals {
  points: ArrivalPoint[];
  routes: { id: string; en: string; de: string; from: string; points: string[] }[];
}

export interface Crossing {
  id: string;
  en: string;
  de: string;
  bce: number;
  widthKm: number;
  way: [number, number][];
  source: string;
}

export interface ArrivalInputs {
  arrivals: Arrivals;
  crossings: Crossing[];
  /** Whether a point is land at a day: not sea, not a lake. Ice and desert can be crossed. */
  land(lat: number, lon: number, day: Day): boolean;
  /** The day of the lowest sea, when the most land was dry: the land the slow spread goes over. */
  lowDay: Day;
  /** Which culture areas hold a point, by index, at any date (peopling.md section 4: sideways). */
  areasAt(lat: number, lon: number): number[];
  /** The index of the area the prologue front fills, its founder and pace (humankind.md section 4.2). */
  africa: { area: number; lat: number; lon: number; startDay: Day; kmPerYear: number };
}

export interface ArrivalMap {
  /** The first day people may camp at a point; CLOSED where nobody arrives. */
  dayAt(lat: number, lon: number): Day;
  /** The day each arrival point is reached, by id. */
  pointDays: Map<string, Day>;
  /** The route ways, as cells, for the development view and the tests. */
  ways: Map<string, number[]>;
  /** What the build reports without failing. */
  notes: string[];
  /**
   * Each route's way to each of its points, from the point before, as points about every
   * 200 km and at both ends of every crossing (peopling.md section 4: the tree follows it).
   */
  legs: { id: string; day: Day; way: { lat: number; lon: number }[] }[];
}

export const dayOfBce = (bce: number): Day => dayOfYearStart(astronomicalYear(bce, 'BCE'));

const cellOf = (lat: number, lon: number): number => {
  const c = Math.min(W - 1, Math.max(0, Math.floor((lon + 180) / ARRIVAL_CELL_DEG)));
  const r = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / ARRIVAL_CELL_DEG)));
  return r * W + c;
};
const latOf = (cell: number) => 90 - (Math.floor(cell / W) + 0.5) * ARRIVAL_CELL_DEG;
const lonOf = (cell: number) => -180 + ((cell % W) + 0.5) * ARRIVAL_CELL_DEG;

/** The eight neighbours of a cell, wrapping round the date line. */
function neighbours(cell: number): number[] {
  const r = Math.floor(cell / W);
  const c = cell % W;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      if (rr < 0 || rr >= H) continue;
      out.push(rr * W + ((c + dc + W) % W));
    }
  return out;
}

/**
 * Whether any of five points of a cell, its middle and four round it, is land, so a narrow
 * land bridge or a thin island between the middles of cells is not lost.
 */
function anyLand(cell: number, land: (lat: number, lon: number) => boolean): boolean {
  const lat = latOf(cell);
  const lon = lonOf(cell);
  const q = ARRIVAL_CELL_DEG / 4;
  return (
    land(lat, lon) ||
    land(lat + q, lon + q) ||
    land(lat + q, lon - q) ||
    land(lat - q, lon + q) ||
    land(lat - q, lon - q)
  );
}

/** The km between the middles of two cells. */
const stepKm = (a: number, b: number) => distanceKm(latOf(a), lonOf(a), latOf(b), lonOf(b));

/** A binary heap of [cost, cell], smallest cost first; ties go to the lower cell. */
class Heap {
  private items: [number, number][] = [];
  get size(): number {
    return this.items.length;
  }
  push(cost: number, cell: number): void {
    const a = this.items;
    a.push([cost, cell]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(a[i]!, a[p]!)) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && less(a[l]!, a[m]!)) m = l;
        if (r < a.length && less(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}
const less = (x: [number, number], y: [number, number]) =>
  x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);

/** Builds the arrival map; throws with every problem it finds. */
export function arrivalMap(input: ArrivalInputs): ArrivalMap {
  const { arrivals, crossings } = input;
  const problems: string[] = [];
  const notes: string[] = [];
  const arrival = new Int32Array(W * H).fill(CLOSED);
  const areas: number[][] = Array.from({ length: W * H }, (_, cell) =>
    input.areasAt(latOf(cell), lonOf(cell)),
  );
  const lowLand = new Uint8Array(W * H);
  for (let cell = 0; cell < W * H; cell++)
    lowLand[cell] = anyLand(cell, (a, b) => input.land(a, b, input.lowDay)) ? 1 : 0;

  // Africa: behind the prologue front, straight out from the first person.
  const af = input.africa;
  for (let cell = 0; cell < W * H; cell++)
    if (areas[cell]!.includes(af.area) && lowLand[cell])
      arrival[cell] =
        af.startDay +
        Math.round(
          (distanceKm(af.lat, af.lon, latOf(cell), lonOf(cell)) / af.kmPerYear) * DAYS_PER_YEAR,
        );

  // The land along each route, opening from one point to the next at a steady pace.
  const points = new Map(arrivals.points.map((p) => [p.id, p]));
  const pointDays = new Map(arrivals.points.map((p) => [p.id, dayOfBce(p.bce)]));
  const ways = new Map<string, number[]>();
  const legs: ArrivalMap['legs'] = [];
  const fullWays = new Map<string, { lat: number; lon: number }[]>();
  /** A way of cells as points: one about every 200 km, and both ends of each jump across water. */
  const pointsOf = (way: number[]) => {
    const keep = new Set<number>([0, way.length - 1]);
    let since = 0;
    for (let i = 1; i < way.length; i++) {
      const km = stepKm(way[i - 1]!, way[i]!);
      if (km > 2 * ARRIVAL_CELL_DEG * 111.2) {
        keep.add(i - 1);
        keep.add(i);
        since = 0;
      } else if ((since += km) >= LEG_KM) {
        keep.add(i);
        since = 0;
      }
    }
    return [...keep]
      .sort((a, b) => a - b)
      .map((i) => ({ lat: latOf(way[i]!), lon: lonOf(way[i]!) }));
  };
  const snap = (lat: number, lon: number, day: Day, what: string): number | undefined => {
    const home = cellOf(lat, lon);
    let best: number | undefined;
    let bestKm = Infinity;
    const r0 = Math.floor(home / W);
    const c0 = home % W;
    for (let dr = -SNAP_CELLS; dr <= SNAP_CELLS; dr++)
      for (let dc = -SNAP_CELLS; dc <= SNAP_CELLS; dc++) {
        const r = r0 + dr;
        if (r < 0 || r >= H) continue;
        const cell = r * W + ((c0 + dc + W) % W);
        if (!anyLand(cell, (a, b) => input.land(a, b, day))) continue;
        const km = distanceKm(lat, lon, latOf(cell), lonOf(cell));
        if (km < bestKm || (km === bestKm && cell < best!)) [best, bestKm] = [cell, km];
      }
    if (best === undefined) problems.push(`${what} is not near land at its date`);
    return best;
  };
  /** The shortest way over land at a day from one cell to another, crossings included. */
  const shortest = (from: number, to: number, day: Day): number[] | undefined => {
    const extra = new Map<number, number[]>();
    for (const c of crossings) {
      if (dayOfBce(c.bce) > day) continue;
      const cells = c.way.map(([lat, lon]) => snap(lat, lon, day, `crossing ${c.id}`));
      for (let i = 1; i < cells.length; i++) {
        const [a, b] = [cells[i - 1], cells[i]];
        if (a === undefined || b === undefined) continue;
        extra.set(a, [...(extra.get(a) ?? []), b]);
        extra.set(b, [...(extra.get(b) ?? []), a]);
      }
    }
    const cost = new Map<number, number>([[from, 0]]);
    const back = new Map<number, number>();
    const heap = new Heap();
    heap.push(0, from);
    const landNow = new Map<number, boolean>();
    const isLand = (cell: number) => {
      let v = landNow.get(cell);
      if (v === undefined) landNow.set(cell, (v = anyLand(cell, (a, b) => input.land(a, b, day))));
      return v;
    };
    while (heap.size) {
      const [d, cell] = heap.pop();
      if (d > cost.get(cell)!) continue;
      if (cell === to) break;
      for (const n of [...neighbours(cell), ...(extra.get(cell) ?? [])]) {
        if (!isLand(n)) continue;
        const nd = d + stepKm(cell, n);
        if (nd < (cost.get(n) ?? Infinity)) {
          cost.set(n, nd);
          back.set(n, cell);
          heap.push(nd, n);
        }
      }
    }
    if (!cost.has(to)) return undefined;
    const way = [to];
    while (way.at(-1) !== from) way.push(back.get(way.at(-1)!)!);
    return way.reverse();
  };
  const open = (cell: number, day: Day) => {
    if (day < arrival[cell]!) arrival[cell] = day;
  };
  /** The African land nearest a point on a day, where a route out of Africa starts. */
  const africaNear = (lat: number, lon: number, day: Day) => {
    let best: { id: string; lat: number; lon: number; day: Day } | undefined;
    let bestKm = Infinity;
    for (let cell = 0; cell < W * H; cell++) {
      if (!areas[cell]!.includes(af.area)) continue;
      const km = distanceKm(lat, lon, latOf(cell), lonOf(cell));
      if (km >= bestKm || !input.land(latOf(cell), lonOf(cell), day)) continue;
      bestKm = km;
      best = { id: 'africa', lat: latOf(cell), lon: lonOf(cell), day };
    }
    return best;
  };
  for (const r of arrivals.routes) {
    let prev: { id: string; lat: number; lon: number; day: Day } | undefined =
      r.from === 'africa' ? undefined : { ...points.get(r.from)!, day: pointDays.get(r.from)! };
    for (const id of r.points) {
      const q = points.get(id)!;
      const dq = pointDays.get(id)!;
      const qCell = snap(q.lat, q.lon, dq, `arrival point ${id}`);
      if (qCell === undefined) continue;
      prev ??= africaNear(q.lat, q.lon, dq);
      if (!prev) {
        problems.push(`route ${r.id}: no African land near ${id}`);
        continue;
      }
      {
        const dp = prev.day;
        const pCell = snap(prev.lat, prev.lon, dq, `arrival point ${prev.id}`);
        // Where the sea of the date cuts the way (Tasmania in the high sea of about 40,000 BCE),
        // the way runs over the land of the lowest sea: people reach the point once a land
        // bridge stands, and the build's report shows how long they waited.
        let way = pCell === undefined ? undefined : shortest(pCell, qCell, dq);
        if (!way && pCell !== undefined) {
          way = shortest(pCell, qCell, input.lowDay);
          if (way) notes.push(`route ${r.id}: ${prev.id} to ${id} waits for a land bridge`);
        }
        if (!way)
          problems.push(
            `route ${r.id}: no way over land or a listed crossing from ${prev.id} to ${id}`,
          );
        else {
          let total = 0;
          for (let i = 1; i < way.length; i++) total += stepKm(way[i - 1]!, way[i]!);
          let along = 0;
          way.forEach((cell, i) => {
            if (i > 0) along += stepKm(way[i - 1]!, cell);
            open(cell, dp + Math.round(((dq - dp) * along) / Math.max(1, total)));
          });
          ways.set(id, way);
          // The whole way from the route's start, so bands can join it anywhere before the point.
          const full = [
            ...(fullWays.get(prev.id) ?? []),
            ...pointsOf(way),
            { lat: q.lat, lon: q.lon },
          ];
          fullWays.set(id, full);
          legs.push({ id, day: dq, way: full });
        }
      }
      prev = { ...q, day: dq };
    }
  }

  // Sideways: from opened land, the rest of each culture area opens slowly, over the land
  // of the lowest sea, never into another area.
  const areaCount = Math.max(0, ...areas.flat()) + 1;
  const kmDays = DAYS_PER_YEAR / SIDEWAYS_KM_PER_YEAR;
  for (let a = 0; a < areaCount; a++) {
    const heap = new Heap();
    const best = new Map<number, number>();
    for (let cell = 0; cell < W * H; cell++)
      if (arrival[cell] !== CLOSED && areas[cell]!.includes(a)) {
        best.set(cell, arrival[cell]!);
        heap.push(arrival[cell]!, cell);
      }
    while (heap.size) {
      const [d, cell] = heap.pop();
      if (d > best.get(cell)!) continue;
      for (const n of neighbours(cell)) {
        if (!lowLand[n] || !areas[n]!.includes(a)) continue;
        const nd = d + Math.round(stepKm(cell, n) * kmDays);
        if (nd < (best.get(n) ?? CLOSED)) {
          best.set(n, nd);
          heap.push(nd, n);
        }
      }
    }
    for (const [cell, d] of best) open(cell, d);
  }

  if (problems.length) throw new Error(`arrival map:\n${problems.join('\n')}`);
  return { dayAt: (lat, lon) => arrival[cellOf(lat, lon)]!, pointDays, ways, notes, legs };
}
