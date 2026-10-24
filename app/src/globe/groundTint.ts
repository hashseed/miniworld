// The ground tint of a foliage slice (spec foliage.md, section 6) as RGBA bytes on the
// slice grid. No DOM or Three.js, so the foliage worker makes it off the main thread and
// the main thread makes the same bytes where there are no workers (section 7).

import { FOLIAGE_GRID_H, FOLIAGE_GRID_W, type FoliageSlice } from '../content/formats.ts';
import { groundOf } from './foliageKinds.ts';

/** The tint of every cell of a slice: RGBA bytes, row by row. */
export function groundTint(slice: FoliageSlice): Uint8Array {
  const n = FOLIAGE_GRID_W * FOLIAGE_GRID_H;
  const data = new Uint8Array(n * 4);
  // Colours are blurred premultiplied by their strength, so untinted cells do not darken edges.
  let a: Float32Array = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b, w] = groundOf(slice.cells[i]!, slice.density[i]! / 255);
    a.set([r * w, g * w, b * w, w], i * 4);
  }
  // Two passes of a 3 × 3 blur, so the 0.5° cells blend into soft edges.
  for (let pass = 0; pass < 2; pass++) a = blurGrid(a);
  for (let i = 0; i < n; i++) {
    const w = a[i * 4 + 3]!;
    for (let k = 0; k < 3; k++) data[i * 4 + k] = w > 0 ? Math.round((a[i * 4 + k]! / w) * 255) : 0;
    data[i * 4 + 3] = Math.round(w * 255);
  }
  return data;
}

/** A 3 × 3 box blur of an RGBA grid on the foliage grid, wrapping in longitude. */
function blurGrid(src: Float32Array): Float32Array {
  const W = FOLIAGE_GRID_W;
  const H = FOLIAGE_GRID_H;
  const out = new Float32Array(src.length);
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      let count = 0;
      const o = (r * W + c) * 4;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= H) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const i = (rr * W + ((c + dc + W) % W)) * 4;
          for (let k = 0; k < 4; k++) out[o + k]! += src[i + k]!;
          count++;
        }
      }
      for (let k = 0; k < 4; k++) out[o + k]! /= count;
    }
  return out;
}
