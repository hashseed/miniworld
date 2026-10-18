// Synthetic test fixture (spec milestone 1, section 2.4). It stands in for
// the real elevation and ice data in CI and before the real data is in the
// repository. Its continents come from Natural Earth land polygons, but its
// heights, shelves and ice are invented, so a build from it is marked as a
// fixture and is never shipped.

import { readFileSync } from 'node:fs';
import { valueNoise } from '../../../app/src/core/hash.ts';
import { Grid } from './grid.ts';
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
      const n = valueNoise(c / 40, r / 40, 11) * 0.85 + valueNoise(c / 9, r / 9, 12) * 0.15;
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
