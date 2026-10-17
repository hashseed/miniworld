// Synthetic test fixture (spec milestone 1, section 2.4). It stands in for
// the real elevation and ice data in CI and before the real data is in the
// repository. Its continents come from Natural Earth land polygons, but its
// heights, shelves and ice are invented, so a build from it is marked as a
// fixture and is never shipped.

import { readFileSync } from 'node:fs';
import { valueNoise } from '../../../app/src/core/hash.ts';
import { Grid } from './grid.ts';
import type { IceSlice } from './ice.ts';
import { featurePolygons, rasterizePolygon, type GeoJsonFeature } from './rasterize.ts';

export const FIXTURE_WIDTH = 2160; // 10 arc-minutes
export const FIXTURE_HEIGHT = 1080;

export function fixtureElevation(
  landPath: string,
  width = FIXTURE_WIDTH,
  height = FIXTURE_HEIGHT,
): Grid {
  const land = new Uint8Array(width * height);
  const target = { width, height };
  const features = (JSON.parse(readFileSync(landPath, 'utf8')) as { features: GeoJsonFeature[] })
    .features;
  for (const f of features)
    for (const poly of featurePolygons(f))
      rasterizePolygon(target, poly, (c, r) => (land[r * width + c] = 1));

  // Chamfer distance (in cells) from the coast, on both sides.
  const dist = new Float32Array(width * height).fill(1e9);
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) {
      const i = r * width + c;
      const l = land[i]!;
      const right = land[r * width + ((c + 1) % width)]!;
      const down = r + 1 < height ? land[i + width]! : l;
      if (l !== right || l !== down) dist[i] = 0;
    }
  const passes: [number, number][][] = [
    [
      [-1, 0],
      [0, -1],
      [-1, -1],
      [1, -1],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
    ],
  ];
  for (let p = 0; p < 2; p++) {
    const forward = p === 0;
    for (let rr = 0; rr < height; rr++) {
      const r = forward ? rr : height - 1 - rr;
      for (let cc = 0; cc < width; cc++) {
        const c = forward ? cc : width - 1 - cc;
        const i = r * width + c;
        for (const [dc, dr] of passes[p]!) {
          const r2 = r + dr;
          if (r2 < 0 || r2 >= height) continue;
          const j = r2 * width + ((c + dc + width) % width);
          const d = dist[j]! + (dc !== 0 && dr !== 0 ? 1.414 : 1);
          if (d < dist[i]!) dist[i] = d;
        }
      }
    }
  }

  const out = new Int16Array(width * height);
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) {
      const i = r * width + c;
      const n = valueNoise(c / 40, r / 40, 11) * 0.7 + valueNoise(c / 9, r / 9, 12) * 0.3;
      if (land[i]) {
        out[i] = Math.round(20 + Math.min(dist[i]! * 15, 600) + Math.pow(n, 3) * 3500);
      } else {
        const d = dist[i]!;
        out[i] =
          d < 25
            ? Math.round(-8 - d * 4.5 - n * 20)
            : Math.round(-120 - Math.min(1, (d - 25) / 6) * 3900);
      }
    }
  return new Grid(width, height, out);
}

/** Fixture glacial index from 0 (today) to 1 (glacial maximum) by years before 1950. */
export function fixtureGlacialIndex(yearsBP: number): number {
  const pts: [number, number][] = [
    [0, 0],
    [7500, 0.02],
    [10000, 0.3],
    [12500, 0.65],
    [15000, 0.85],
    [20000, 1],
    [25000, 0.97],
    [30000, 0.7],
    [45000, 0.6],
    [60000, 0.68],
    [72000, 0.55],
    [80000, 0.45],
  ];
  for (let k = 1; k < pts.length; k++) {
    const [x1, y1] = pts[k]!;
    const [x0, y0] = pts[k - 1]!;
    if (yearsBP <= x1) return y0 + ((yearsBP - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1]![1];
}

/** Fixture ice: permanent Antarctic and Greenland ice plus northern sheets scaled by the glacial index. */
export function fixtureIce(): IceSlice[] {
  const w = 1440;
  const h = 720;
  const slices: IceSlice[] = [];
  for (let bp = 0; bp <= 80000; bp += 2500) {
    const g = fixtureGlacialIndex(bp);
    const data = new Float32Array(w * h);
    for (let r = 0; r < h; r++) {
      const lat = 90 - (r + 0.5) * 0.25;
      for (let c = 0; c < w; c++) {
        const lon = -180 + (c + 0.5) * 0.25;
        let t = 0;
        if (lat < -65) t = 2500;
        if (lat > 62 && lon > -55 && lon < -20) t = Math.max(t, 2000);
        const laurentide = Math.max(
          0,
          1 - Math.hypot((lat - 60) / (22 * g + 1), (lon + 90) / (40 * g + 1)),
        );
        const fenno = Math.max(
          0,
          1 - Math.hypot((lat - 64) / (12 * g + 1), (lon - 20) / (22 * g + 1)),
        );
        if (g > 0.05)
          t = Math.max(t, Math.sqrt(laurentide) * 3200 * g, Math.sqrt(fenno) * 2400 * g);
        data[r * w + c] = t;
      }
    }
    slices.push({ yearsBP: bp, thickness: new Grid(w, h, data) });
  }
  return slices;
}
