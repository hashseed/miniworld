// Lakes and rivers from Natural Earth (spec milestone 1, section 4.3).

import { readFileSync } from 'node:fs';
import type { Grid, GridData } from './grid.ts';
import {
  featureLines,
  featurePolygons,
  rasterizePolygon,
  type GeoJsonFeature,
} from './rasterize.ts';

export interface WaterLayers {
  /** Surface level in metres for lake cells, or NO_LAKE. */
  lakeLevel: Int16Array;
  /** River strength 0..255 per cell. */
  rivers: Uint8Array;
}

export const NO_LAKE = -32768;

function readFeatures(path: string): GeoJsonFeature[] {
  return (JSON.parse(readFileSync(path, 'utf8')) as { features: GeoJsonFeature[] }).features;
}

/**
 * Rasterises lakes onto the grid. Natural Earth has no lake levels, so each
 * lake's surface is taken as the 20th percentile of the heights of the cells
 * just outside its shore.
 */
export function rasterizeLakes(
  heights: Grid<GridData>,
  lakesPath: string,
  out: Int16Array,
  maxRank = Infinity,
  minAreaKm2 = 0,
): number {
  const { width: w, height: h } = heights;
  let count = 0;
  const inside = new Uint8Array(w * h);
  for (const f of readFeatures(lakesPath)) {
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
      const level = Math.round(shore[Math.floor(shore.length * 0.2)] ?? 0);
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

const KM_PER_DEG = 111.32;

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

/**
 * Rasterises rivers as a smooth field: 255 inside a river's core, falling
 * linearly to 0 over RIVER_FALLOFF_KM beyond it. The renderer draws water
 * where the interpolated field passes one half, so banks come out as smooth
 * curves at any grid resolution (spec milestone 1, section 4.3).
 */
export function rasterizeRivers(
  target: { width: number; height: number },
  riversPath: string,
  out: Uint8Array,
  maxRank = Infinity,
  alsoNamed: ReadonlySet<string> = new Set(),
): number {
  const { width: w, height: h } = target;
  const cellDeg = 360 / w;
  let count = 0;
  for (const f of readFeatures(riversPath)) {
    const rank = Number(f.properties['scalerank'] ?? 10);
    if (rank > maxRank && !alsoNamed.has(String(f.properties['name'] ?? ''))) continue;
    const core = riverCoreKm(rank);
    const reach = core + RIVER_FALLOFF_KM;
    for (const raw of featureLines(f)) {
      const line = smoothLine(raw);
      for (let i = 1; i < line.length; i++) {
        stampSegment(line[i - 1]!, line[i]!);
      }
      count++;
    }

    function stampSegment(a: number[], b: number[]): void {
      const midLat = (a[1]! + b[1]!) / 2;
      const kx = KM_PER_DEG * Math.max(0.05, Math.cos((midLat * Math.PI) / 180));
      // Work in km relative to a, unwrapping longitude across the date line.
      let dLon = b[0]! - a[0]!;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      const bx = dLon * kx;
      const by = (b[1]! - a[1]!) * KM_PER_DEG;
      const len2 = bx * bx + by * by;
      const padLon = reach / kx;
      const padLat = reach / KM_PER_DEG;
      const lon0 = Math.min(a[0]!, a[0]! + dLon) - padLon;
      const lon1 = Math.max(a[0]!, a[0]! + dLon) + padLon;
      const lat0 = Math.min(a[1]!, b[1]!) - padLat;
      const lat1 = Math.max(a[1]!, b[1]!) + padLat;
      const c0 = Math.floor((lon0 + 180) / cellDeg - 0.5);
      const c1 = Math.ceil((lon1 + 180) / cellDeg - 0.5);
      const r0 = Math.max(0, Math.floor((90 - lat1) / cellDeg - 0.5));
      const r1 = Math.min(h - 1, Math.ceil((90 - lat0) / cellDeg - 0.5));
      for (let r = r0; r <= r1; r++) {
        const py = (90 - (r + 0.5) * cellDeg - a[1]!) * KM_PER_DEG;
        for (let c = c0; c <= c1; c++) {
          const px = (-180 + (c + 0.5) * cellDeg - a[0]!) * kx;
          const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
          const dx = px - t * bx;
          const dy = py - t * by;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d >= reach) continue;
          const value = Math.round(255 * Math.min(1, (reach - d) / RIVER_FALLOFF_KM));
          const k = r * w + (((c % w) + w) % w);
          if (out[k]! < value) out[k] = value;
        }
      }
    }
  }
  return count;
}

/** Area of one grid cell in km² at the row of a cell index. */
function cellAreaKm2(g: { width: number; height: number }, i: number): number {
  const r = Math.floor(i / g.width);
  const lat = 90 - ((r + 0.5) * 180) / g.height;
  const side = (180 / g.height) * 111.32;
  return side * side * Math.cos((lat * Math.PI) / 180);
}
