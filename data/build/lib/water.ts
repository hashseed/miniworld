// Lakes and rivers from Natural Earth (spec milestone 1, section 4.3).

import { KM_PER_DEG } from '../../../app/src/geo/earth.ts';
import { OCEAN_RANGE } from '../../../app/src/content/formats.ts';
import { forCellsNearLine } from './coast.ts';
import type { Grid, GridData } from './grid.ts';
import {
  featureLines,
  featurePolygons,
  rasterizePolygon,
  type GeoJsonFeature,
} from './rasterize.ts';

export const NO_LAKE = -32768;

/**
 * Rasterises lakes onto the grid. Natural Earth has no lake levels, so each
 * lake's surface is taken as the median of the heights of the cells just outside
 * its shore, so the water stands nearly as high as its coast (section 4.3).
 */
export function rasterizeLakes(
  heights: Grid<GridData>,
  lakeFeatures: GeoJsonFeature[],
  out: Int16Array,
  maxRank = Infinity,
  minAreaKm2 = 0,
): number {
  const { width: w, height: h } = heights;
  let count = 0;
  const inside = new Uint8Array(w * h);
  for (const f of lakeFeatures) {
    if (Number(f.properties['scalerank'] ?? 10) > maxRank) continue;
    for (const poly of featurePolygons(f)) {
      const cells: number[] = [];
      rasterizePolygon(heights, poly, (c, r) => {
        const i = r * w + c;
        if (!inside[i]) {
          inside[i] = 1;
          cells.push(i);
        }
      });
      if (cells.length === 0) continue;
      if (cells.length * cellAreaKm2(heights, cells[0]!) < minAreaKm2) {
        for (const i of cells) inside[i] = 0;
        continue;
      }
      const shore: number[] = [];
      for (const i of cells) {
        const r = (i / w) | 0;
        const c = i - r * w;
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const r2 = r + dr;
          if (r2 < 0 || r2 >= h) continue;
          const j = r2 * w + ((c + dc + w) % w);
          if (!inside[j]) shore.push(heights.data[j]!);
        }
      }
      shore.sort((a, b) => a - b);
      const level = Math.round(shore[Math.floor(shore.length * 0.5)] ?? 0);
      for (const i of cells) {
        out[i] = level;
        inside[i] = 0;
      }
      count++;
    }
  }
  return count;
}

/** Half-width in km of the solid core of a river of a scalerank. */
export function riverCoreKm(rank: number): number {
  return rank <= 2 ? 12 : 9;
}

/** Width in km over which a river's field falls from 1 to 0 at its banks. */
export const RIVER_FALLOFF_KM = 30;

/** Two rounds of Chaikin corner cutting, so river lines come out as smooth curves. */
export function smoothLine(line: number[][], rounds = 2): number[][] {
  let pts = line;
  for (let k = 0; k < rounds && pts.length > 2; k++) {
    const next: number[][] = [pts[0]!];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      next.push([0.75 * a[0]! + 0.25 * b[0]!, 0.75 * a[1]! + 0.25 * b[1]!]);
      next.push([0.25 * a[0]! + 0.75 * b[0]!, 0.25 * a[1]! + 0.75 * b[1]!]);
    }
    next.push(pts[pts.length - 1]!);
    pts = next;
  }
  return pts;
}

/** A curated river (data/curated/rivers.json): the Natural Earth names of its lines. */
export interface CuratedRiver {
  id: string;
  names: string[];
  box?: [number, number, number, number];
}

/** Checks the curated rivers. */
export function validateRivers(rivers: CuratedRiver[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const r of rivers) {
    if (ids.has(r.id)) errors.push(`river ${r.id}: duplicate id`);
    ids.add(r.id);
    if (!r.names?.length) errors.push(`river ${r.id}: no names`);
    const b = r.box;
    if (b && !(b.length === 4 && b[0] < b[2] && b[1] < b[3]))
      errors.push(`river ${r.id}: box must be [west, south, east, north]`);
  }
  return errors;
}

/** The line picks of the rivers, in their order. */
export function riverPicks(rivers: CuratedRiver[]): RiverPick[] {
  return rivers.flatMap((r) => r.names.map((name) => (r.box ? { name, box: r.box } : { name })));
}

export interface RiverPick {
  /** Natural Earth name of a river line. */
  name: string;
  /** Only lines starting inside [west, south, east, north], for names used twice. */
  box?: [number, number, number, number];
}

export interface RiverContext {
  /** Raw flood fill level per cell (0 = sea at every date, OCEAN_NEVER inland). */
  ocean: Uint8Array;
  /** The neighbour the flood fill reached each cell from, or -1. */
  parents: Int32Array;
  /** Smoothed elevation per cell. */
  heights: GridData;
  /** Smooth lake field per cell, a lake from 128. */
  lakes: Uint8Array;
}

/** Pulse spacing along rivers in km (section 4.3). */
export const FLOW_PERIOD_KM = 150;
/** How near (km) a river end must come to the sea at some date to be continued downhill. */
const MOUTH_SEARCH_KM = 80;
/**
 * Cells a river runs on into the water past its mouth, so the smoothed shore, which can lie
 * well out from the mask's (the Nile's western delta arm at 19,100 BCE), never cuts it off;
 * under the water it is not drawn.
 */
const MOUTH_OVERRUN_CELLS = 16;
/** A river end this close to another drawn line, in km, is a joint, not a mouth. */
const JOINT_KM = 15;

/**
 * Rasterises the picked rivers as a smooth field: 255 inside a river's core,
 * falling linearly to 0 over RIVER_FALLOFF_KM beyond it, so banks come out
 * as smooth curves. Each river end near the sea is continued downhill to sea
 * that is sea at every date, or to a lake (section 4.3). Returns the number
 * of lines and continuations drawn.
 */
export function rasterizeRivers(
  target: { width: number; height: number },
  riverFeatures: GeoJsonFeature[],
  out: Uint8Array,
  picks: RiverPick[],
  context?: RiverContext,
): number {
  const { width: w, height: h } = target;
  const cellDeg = 360 / w;
  let count = 0;
  const stamp = (line: number[][], core: number) => {
    const reach = core + RIVER_FALLOFF_KM;
    forCellsNearLine(target, line, reach, (k, d) => {
      const value = Math.round(255 * Math.min(1, (reach - d) / RIVER_FALLOFF_KM));
      if (out[k]! < value) out[k] = value;
    });
  };
  const cellOf = (p: number[]) => {
    const c = Math.round((p[0]! + 180) / cellDeg - 0.5);
    const r = Math.min(h - 1, Math.max(0, Math.round((90 - p[1]!) / cellDeg - 0.5)));
    return r * w + (((c % w) + w) % w);
  };
  const centre = (i: number): number[] => {
    const r = (i / w) | 0;
    return [-180 + (i - r * w + 0.5) * cellDeg, 90 - (r + 0.5) * cellDeg];
  };
  const isMouth = (i: number) =>
    context !== undefined && (context.ocean[i] === 0 || context.lakes[i]! >= 128);
  /** The nearest water cell within MOUTH_SEARCH_KM, or -1. */
  const nearestWater = (i: number): number => {
    if (!context) return -1;
    const r = (i / w) | 0;
    const c = i - r * w;
    const dr = Math.ceil(MOUTH_SEARCH_KM / (cellDeg * KM_PER_DEG));
    let best = -1;
    let bestD = Infinity;
    for (let y = Math.max(0, r - dr); y <= Math.min(h - 1, r + dr); y++)
      for (let x = c - dr * 2; x <= c + dr * 2; x++) {
        const j = y * w + (((x % w) + w) % w);
        if (!(context.ocean[j]! <= OCEAN_RANGE || context.lakes[j]! >= 128)) continue;
        const kx = (x - c) * Math.cos((rowLatDeg(y) * Math.PI) / 180);
        const d = kx * kx + (y - r) * (y - r);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
    return best;
  };
  const rowLatDeg = (y: number) => 90 - (y + 0.5) * cellDeg;
  /**
   * The way down to the sea: inland of the flood, the steepest way down the
   * ground; then the path the flood fill came along, which leads to the ocean.
   */
  const continueDownhill = (end: number[]): number[][] | undefined => {
    if (!context) return undefined;
    let cur = cellOf(end);
    const near = nearestWater(cur);
    if (isMouth(cur) || near < 0) return undefined;
    // Into a lake or an inland sea such as the Caspian straight: the flood fill's way leads
    // off to the ocean (the Volga once ran from its delta across Iran to the upper Indus).
    if (context.lakes[near]! >= 128) return [end, centre(near)];
    const path: number[][] = [end];
    for (let step = 0; step < 2000 && !isMouth(cur); step++) {
      let next = context.parents[cur]!;
      if (next < 0) {
        const r = (cur / w) | 0;
        const c = cur - r * w;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            if ((dr === 0 && dc === 0) || rr < 0 || rr >= h) continue;
            const j = rr * w + ((((c + dc) % w) + w) % w);
            if (context.heights[j]! < context.heights[next < 0 ? cur : next]!) next = j;
          }
      }
      if (next < 0) {
        // A flat basin with no way down: head straight for the nearest water.
        const j = nearestWater(cur);
        if (j < 0 || j === cur) break;
        next = j;
      }
      cur = next;
      path.push(centre(cur));
    }
    // Run on a little into the water, so the smoothed shore never cuts the river off.
    if (path.length > 1 && isMouth(cur)) {
      const a = path[path.length - 2]!;
      const b = path[path.length - 1]!;
      for (let k = 1; k <= MOUTH_OVERRUN_CELLS; k++)
        path.push([b[0]! + (b[0]! - a[0]!) * k, b[1]! + (b[1]! - a[1]!) * k]);
    }
    return path.length > 1 ? path : undefined;
  };

  const picked = riverFeatures.map((f) => {
    const name = String(f.properties['name'] ?? '');
    return featureLines(f).filter((line) =>
      picks.some((p) => {
        if (p.name !== name) return false;
        if (!p.box) return true;
        const [lon, lat] = line[0]!;
        const [west, south, east, north] = p.box;
        return lon! >= west && lon! <= east && lat! >= south && lat! <= north;
      }),
    );
  });
  // Only a river's free ends, its mouths and sources, are led on to the water: an end within
  // JOINT_KM of another line is a joint, such as Cairo, where the Nile's delta branches part.
  const all = picked.flat();
  const isJoint = (end: number[], own: number[][]) =>
    all.some(
      (line) =>
        line !== own &&
        line.some((p) => {
          const dy = (p[1]! - end[1]!) * KM_PER_DEG;
          if (Math.abs(dy) > JOINT_KM) return false;
          const dx = (p[0]! - end[0]!) * KM_PER_DEG * Math.cos((end[1]! * Math.PI) / 180);
          return dx * dx + dy * dy <= JOINT_KM * JOINT_KM;
        }),
    );
  for (const [i, f] of riverFeatures.entries()) {
    const rank = Number(f.properties['scalerank'] ?? 10);
    const lines = picked[i]!;
    const core = riverCoreKm(rank);
    for (const raw of lines) {
      stamp(smoothLine(raw), core);
      count++;
      for (const end of [raw[0]!, raw[raw.length - 1]!]) {
        if (isJoint(end, raw)) continue;
        const more = continueDownhill(end);
        if (more) {
          stamp(smoothLine(more), core);
          count++;
        }
      }
    }
  }
  return count;
}

/**
 * River flow phase (section 4.3): the distance along the river network to the
 * mouth, as cosine and sine of one turn per FLOW_PERIOD_KM, 128 ± 127. Cells
 * outside the rivers stay at 128.
 */
export function riverFlow(
  target: { width: number; height: number },
  rivers: Uint8Array,
  context: RiverContext,
): { cos: Uint8Array; sin: Uint8Array } {
  const { width: w, height: h } = target;
  const n = w * h;
  const cellKm = (360 / w) * KM_PER_DEG;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = new MinHeap();
  const inRiver = (i: number) => rivers[i]! >= 128;
  for (let i = 0; i < n; i++) {
    if (inRiver(i) && (context.ocean[i] === 0 || context.lakes[i]! >= 128)) {
      dist[i] = 0;
      heap.push(0, i);
    }
  }
  const relax = () => {
    while (heap.size) {
      const [d, i] = heap.pop();
      if (d > dist[i]!) continue;
      const r = (i / w) | 0;
      const c = i - r * w;
      const kx = cellKm * Math.cos(((90 - (r + 0.5) * (180 / h)) * Math.PI) / 180);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          if ((dr === 0 && dc === 0) || rr < 0 || rr >= h) continue;
          const j = rr * w + ((((c + dc) % w) + w) % w);
          if (!inRiver(j)) continue;
          const nd = d + Math.hypot(dc * kx, dr * cellKm);
          if (nd < dist[j]!) {
            dist[j] = nd;
            heap.push(nd, j);
          }
        }
    }
  };
  relax();
  // Rivers that reach no sea or lake (for example, ending in a desert) flow
  // towards their lowest cell.
  for (let i = 0; i < n; i++) {
    if (!inRiver(i) || dist[i] !== Infinity) continue;
    let low = i;
    const stack = [i];
    const seen = new Set([i]);
    while (stack.length) {
      const k = stack.pop()!;
      if (context.heights[k]! < context.heights[low]!) low = k;
      const r = (k / w) | 0;
      const c = k - r * w;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          if (rr < 0 || rr >= h) continue;
          const j = rr * w + ((((c + dc) % w) + w) % w);
          if (inRiver(j) && !seen.has(j) && dist[j] === Infinity) {
            seen.add(j);
            stack.push(j);
          }
        }
    }
    dist[low] = 0;
    heap.push(0, low);
    relax();
  }
  const cos = new Uint8Array(n).fill(128);
  const sin = new Uint8Array(n).fill(128);
  for (let i = 0; i < n; i++) {
    if (dist[i] === Infinity) continue;
    const a = (2 * Math.PI * dist[i]!) / FLOW_PERIOD_KM;
    cos[i] = Math.round(128 + 127 * Math.cos(a));
    sin[i] = Math.round(128 + 127 * Math.sin(a));
  }
  return { cos, sin };
}

class MinHeap {
  private keys: number[] = [];
  private values: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, value: number): void {
    const k = this.keys;
    const v = this.values;
    let i = k.length;
    k.push(key);
    v.push(value);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      k[i] = k[p]!;
      v[i] = v[p]!;
      i = p;
    }
    k[i] = key;
    v[i] = value;
  }
  pop(): [number, number] {
    const k = this.keys;
    const v = this.values;
    const top: [number, number] = [k[0]!, v[0]!];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= k.length) break;
        const r = l + 1;
        const m = r < k.length && k[r]! < k[l]! ? r : l;
        if (k[m]! >= lastK) break;
        k[i] = k[m]!;
        v[i] = v[m]!;
        i = m;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

/** Area of one grid cell in km² at the row of a cell index. */
function cellAreaKm2(g: { width: number; height: number }, i: number): number {
  const r = Math.floor(i / g.width);
  const lat = 90 - ((r + 0.5) * 180) / g.height;
  const side = (180 / g.height) * KM_PER_DEG;
  return side * side * Math.cos((lat * Math.PI) / 180);
}
