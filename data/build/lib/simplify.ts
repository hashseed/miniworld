// Simplified map (spec milestone 1, section 4.2): the elevation is smoothed
// so the globe shows the Earth's shapes rather than all its details. Land and
// continental shelf are smoothed separately from the deep sea floor, so
// shelves and land bridges keep their depth, and land that is land today
// stays land, so small islands never vanish.

import { Grid } from './grid.ts';

const KM_PER_DEGREE = 111.32;
/** Cells above this height (m) are smoothed together; deeper ones separately. */
export const SHELF_SPLIT_M = -150;

/** Radius of one of three box passes that together approximate a Gaussian of sigma cells. */
function boxRadius(sigmaCells: number): number {
  return Math.max(0, Math.round((Math.sqrt(4 * sigmaCells * sigmaCells + 1) - 1) / 2));
}

/** Box blur of one line in place, through a scratch buffer of prefix sums. */
function blurLine(
  data: Float32Array,
  start: number,
  stride: number,
  n: number,
  radius: number,
  wrap: boolean,
  prefix: Float64Array,
): void {
  if (radius <= 0) return;
  prefix[0] = 0;
  for (let k = 0; k < n; k++) prefix[k + 1] = prefix[k]! + data[start + k * stride]!;
  const total = prefix[n]!;
  for (let k = 0; k < n; k++) {
    let a = k - radius;
    let b = k + radius + 1;
    let sum: number;
    if (wrap) {
      // Longitude wraps around; the window never exceeds the line.
      sum = 0;
      if (a < 0) {
        sum += total - prefix[n + a]!;
        a = 0;
      }
      if (b > n) {
        sum += prefix[b - n]!;
        b = n;
      }
      sum += prefix[b]! - prefix[a]!;
    } else {
      a = Math.max(0, a);
      b = Math.min(n, b);
      sum = prefix[b]! - prefix[a]!;
    }
    data[start + k * stride] = sum;
  }
}

/** Smooths an elevation grid with a Gaussian of about sigmaKm (section 4.2). */
export function smoothElevation(g: Grid, sigmaKm: number): Grid {
  const { width: w, height: h } = g;
  const n = w * h;
  const out = new Int16Array(n);
  const value = new Float32Array(n);
  const weight = new Float32Array(n);
  const prefix = new Float64Array(Math.max(w, h) + 1);
  const cellKm = g.cellDegrees * KM_PER_DEGREE;
  const rowRadius = new Int32Array(h);
  for (let r = 0; r < h; r++) {
    const lat = 90 - (r + 0.5) * g.cellDegrees;
    const kmPerCol = Math.max(cellKm * Math.cos((lat * Math.PI) / 180), 1e-3);
    rowRadius[r] = Math.min(Math.floor((w - 1) / 2), boxRadius(sigmaKm / kmPerCol));
  }
  const colRadius = boxRadius(sigmaKm / cellKm);

  for (const high of [true, false]) {
    for (let i = 0; i < n; i++) {
      const inPart = g.data[i]! > SHELF_SPLIT_M === high ? 1 : 0;
      value[i] = g.data[i]! * inPart;
      weight[i] = inPart;
    }
    for (let pass = 0; pass < 3; pass++) {
      for (const buf of [value, weight]) {
        for (let r = 0; r < h; r++) blurLine(buf, r * w, 1, w, rowRadius[r]!, true, prefix);
        for (let c = 0; c < w; c++) blurLine(buf, c, w, h, colRadius, false, prefix);
      }
    }
    for (let i = 0; i < n; i++) {
      if (g.data[i]! > SHELF_SPLIT_M !== high) continue;
      out[i] = Math.round(value[i]! / weight[i]!);
    }
  }
  for (let i = 0; i < n; i++) if (g.data[i]! > 0 && out[i]! < 1) out[i] = 1;
  return new Grid(w, h, out);
}
