// Ocean mask (spec milestone 1, section 5.1): for every cell, the lowest
// sea level at which it is connected to the open ocean, computed by a
// priority flood outward from the deep ocean.

import { OCEAN_MIN_LEVEL, OCEAN_NEVER, OCEAN_RANGE } from '../../../app/src/content/formats.ts';
import type { Grid, GridData } from './grid.ts';

/** Cells deeper than this seed the flood; deep inland basins (Black Sea, Caspian) stay out. */
export const OPEN_OCEAN_DEPTH = -3000;

/**
 * Returns, per cell, a byte v in 0..OCEAN_RANGE meaning "sea once the sea
 * level reaches OCEAN_MIN_LEVEL + v metres", or OCEAN_NEVER.
 */
export function oceanConnection(heights: Grid<GridData>): Uint8Array {
  const { width: w, height: h } = heights;
  const n = w * h;
  const hd = heights.data;
  const out = new Uint8Array(n).fill(OCEAN_NEVER);
  const buckets = new Int32Array(OCEAN_RANGE + 1).fill(-1);
  const next = new Int32Array(n);
  const done = new Uint8Array(n);

  const push = (i: number, level: number) => {
    const b = Math.max(0, Math.ceil(level - OCEAN_MIN_LEVEL));
    if (b > OCEAN_RANGE) return;
    next[i] = buckets[b]!;
    buckets[b] = i;
    out[i] = b; // tentative; lowered only by an earlier bucket
  };

  for (let i = 0; i < n; i++) {
    if (hd[i]! <= OPEN_OCEAN_DEPTH) push(i, OCEAN_MIN_LEVEL);
  }

  for (let b = 0; b <= OCEAN_RANGE; b++) {
    while (buckets[b]! >= 0) {
      const i = buckets[b]!;
      buckets[b] = next[i]!;
      if (done[i]) continue;
      done[i] = 1;
      out[i] = b;
      const r = (i / w) | 0;
      const c = i - r * w;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= h) continue;
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const cc = (c + dc + w) % w;
          const j = rr * w + cc;
          if (done[j]) continue;
          const level = Math.max(b + OCEAN_MIN_LEVEL, hd[j]!);
          const nb = Math.max(0, Math.ceil(level - OCEAN_MIN_LEVEL));
          if (nb <= OCEAN_RANGE && (out[j] === OCEAN_NEVER || nb < out[j]!)) push(j, level);
        }
      }
    }
  }
  return out;
}

export interface InlandSea {
  id: string;
  lat: number;
  lon: number;
  /** Today's surface level in metres; shown at this level at every date. */
  level: number;
}

/** Seas that are shown as water at every date (spec milestone 1, section 5.1). */
export const INLAND_SEAS: InlandSea[] = [
  { id: 'black-sea', lat: 43.0, lon: 34.0, level: 0 },
  { id: 'caspian-sea', lat: 42.0, lon: 50.5, level: -28 },
];

/** Floods each inland sea from its seed through cells below its level. */
export function floodInlandSeas(
  heights: Grid<GridData>,
  seas: InlandSea[],
  mark: (index: number, level: number) => void,
): void {
  const { width: w, height: hgt } = heights;
  const seen = new Uint8Array(w * hgt);
  for (const sea of seas) {
    const { c, r } = heights.position(sea.lat, sea.lon);
    const start = heights.index(Math.round(c), Math.round(r));
    if (heights.data[start]! >= sea.level)
      throw new Error(`Seed for ${sea.id} is not below its level`);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      mark(i, sea.level);
      const rr = (i / w) | 0;
      const cc = i - rr * w;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const r2 = rr + dr;
        if (r2 < 0 || r2 >= hgt) continue;
        const j = r2 * w + ((cc + dc + w) % w);
        if (!seen[j] && heights.data[j]! < sea.level) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
  }
}
