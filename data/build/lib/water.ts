// Lakes and rivers from Natural Earth (spec milestone 1, section 4.3).

import { readFileSync } from 'node:fs';
import type { Grid, GridData } from './grid.ts';
import {
  featureLines,
  featurePolygons,
  rasterizeLine,
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
): number {
  const { width: w, height: h } = heights;
  let count = 0;
  const inside = new Uint8Array(w * h);
  for (const f of readFeatures(lakesPath)) {
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

/** Rasterises rivers; larger rivers (lower scalerank) are stronger. */
export function rasterizeRivers(
  target: { width: number; height: number },
  riversPath: string,
  out: Uint8Array,
): number {
  let count = 0;
  for (const f of readFeatures(riversPath)) {
    const rank = Number(f.properties['scalerank'] ?? 10);
    const strength = Math.max(40, Math.min(255, Math.round(255 - rank * 20)));
    for (const line of featureLines(f)) {
      rasterizeLine(target, line, (c, r) => {
        const i = r * target.width + c;
        if (out[i]! < strength) out[i] = strength;
      });
      count++;
    }
  }
  return count;
}
