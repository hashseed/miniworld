// Distances on global latitude-longitude grids (spec milestone 1, sections
// 4.2 and 5.2): an eight-neighbour chamfer transform with each row's own
// east-west cell size, run twice so it wraps round the antimeridian.

const KM_PER_DEG = 111.32;

/** Distance in km from every cell to the nearest seed cell (0 on seeds). */
export function distanceKm(seed: Uint8Array, w: number, h: number): Float32Array {
  const cellKm = (180 / h) * KM_PER_DEG;
  const dx = new Float64Array(h);
  for (let r = 0; r < h; r++) {
    const lat = 90 - ((r + 0.5) * 180) / h;
    dx[r] = Math.max(cellKm * Math.cos((lat * Math.PI) / 180), 1e-3);
  }
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = seed[i] ? 0 : 1e9;
  const relax = (i: number, j: number, cost: number) => {
    const v = d[j]! + cost;
    if (v < d[i]!) d[i] = v;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < h; r++) {
      const ddx = dx[r]!;
      const diag = Math.hypot(r > 0 ? (ddx + dx[r - 1]!) / 2 : ddx, cellKm);
      for (let c = 0; c < w; c++) {
        const i = r * w + c;
        relax(i, r * w + ((c - 1 + w) % w), ddx);
        if (r > 0) {
          relax(i, (r - 1) * w + c, cellKm);
          relax(i, (r - 1) * w + ((c - 1 + w) % w), diag);
          relax(i, (r - 1) * w + ((c + 1) % w), diag);
        }
      }
    }
    for (let r = h - 1; r >= 0; r--) {
      const ddx = dx[r]!;
      const diag = Math.hypot(r < h - 1 ? (ddx + dx[r + 1]!) / 2 : ddx, cellKm);
      for (let c = w - 1; c >= 0; c--) {
        const i = r * w + c;
        relax(i, r * w + ((c + 1) % w), ddx);
        if (r < h - 1) {
          relax(i, (r + 1) * w + c, cellKm);
          relax(i, (r + 1) * w + ((c - 1 + w) % w), diag);
          relax(i, (r + 1) * w + ((c + 1) % w), diag);
        }
      }
    }
  }
  return d;
}

/**
 * Signed distance in km from the border of a mask: positive inside, negative
 * outside, with the border half way between cell centres.
 */
export function signedDistanceKm(mask: Uint8Array, w: number, h: number): Float32Array {
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) outside[i] = mask[i] ? 0 : 1;
  const toOutside = distanceKm(outside, w, h);
  const toInside = distanceKm(mask, w, h);
  const half = ((180 / h) * KM_PER_DEG) / 2;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++)
    out[i] = mask[i] ? Math.min(toOutside[i]!, 1e6) - half : half - Math.min(toInside[i]!, 1e6);
  return out;
}
