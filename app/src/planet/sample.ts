// Interpolation of the gridded data (spec milestone 1, sections 4.2 and 5.2),
// shared by the terrain mesh, the planet query and the foliage so all of them
// read the same values between samples.

import { TERRAIN_BORDERED } from '../content/formats.ts';

/** Bilinear sample of a square grid at fractional sample coordinates, clamped to the grid. */
export function bilinear(
  grid: ArrayLike<number>,
  size: number,
  fi: number,
  fj: number,
  stride = 1,
  offset = 0,
): number {
  const i0 = Math.min(size - 2, Math.max(0, Math.floor(fi)));
  const j0 = Math.min(size - 2, Math.max(0, Math.floor(fj)));
  const ti = Math.min(1, Math.max(0, fi - i0));
  const tj = Math.min(1, Math.max(0, fj - j0));
  const at = (k: number) => grid[k * stride + offset]!;
  const a = at(j0 * size + i0);
  const b = at(j0 * size + i0 + 1);
  const c = at((j0 + 1) * size + i0);
  const d = at((j0 + 1) * size + i0 + 1);
  return (a * (1 - ti) + b * ti) * (1 - tj) + (c * (1 - ti) + d * ti) * tj;
}

/** Bilinear sample of heights that start one sample outside the tile. */
export function bilinearBordered(h: ArrayLike<number>, fi: number, fj: number): number {
  return bilinear(h, TERRAIN_BORDERED, fi + 1, fj + 1);
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Bicubic (Catmull-Rom) sample of bordered heights, as finer render tiles are refined. */
export function bicubicBordered(h: ArrayLike<number>, fi: number, fj: number): number {
  const B = TERRAIN_BORDERED;
  const x = fi + 1;
  const y = fj + 1;
  const x1 = Math.floor(x);
  const y1 = Math.floor(y);
  const tx = x - x1;
  const ty = y - y1;
  const at = (c: number, r: number) =>
    h[Math.min(B - 1, Math.max(0, r)) * B + Math.min(B - 1, Math.max(0, c))]!;
  const row = (r: number) => catmullRom(at(x1 - 1, r), at(x1, r), at(x1 + 1, r), at(x1 + 2, r), tx);
  return catmullRom(row(y1 - 1), row(y1), row(y1 + 1), row(y1 + 2), ty);
}

/** Bilinear sample of a global cell-centred latitude-longitude grid, wrapping in longitude. */
export function sampleGrid(
  g: ArrayLike<number>,
  w: number,
  h: number,
  lat: number,
  lon: number,
): number {
  const x = ((lon + 180) / 360) * w - 0.5;
  const y = Math.min(h - 1, Math.max(0, ((90 - lat) / 180) * h - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const y1 = Math.min(h - 1, y0 + 1);
  const c0 = ((x0 % w) + w) % w;
  const c1 = (c0 + 1) % w;
  const top = g[y0 * w + c0]! * (1 - fx) + g[y0 * w + c1]! * fx;
  const bottom = g[y1 * w + c0]! * (1 - fx) + g[y1 * w + c1]! * fx;
  return top * (1 - fy) + bottom * fy;
}
