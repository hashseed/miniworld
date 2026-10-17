// Seeded integer hashing: every random-looking choice comes from a hash of
// stable inputs (spec section 9). Never use Math.random in world state.

/** 32-bit integer hash of up to four integers (a variant of lowbias32). */
export function hash32(a: number, b = 0, c = 0, d = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77);
  h ^= Math.imul(c | 0, 0xc2b2ae3d) ^ Math.imul(d | 0, 0x27d4eb2f);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash mapped to [0, 1). */
export function hash01(a: number, b = 0, c = 0, d = 0): number {
  return hash32(a, b, c, d) / 4294967296;
}

/** Smooth 2D value noise in [0, 1), built from hash01 on an integer lattice. */
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash01(x0, y0, seed);
  const b = hash01(x0 + 1, y0, seed);
  const c = hash01(x0, y0 + 1, seed);
  const d = hash01(x0 + 1, y0 + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}
