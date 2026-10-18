// The history lens (spec history-lens.md): a fixed warp of the sphere that
// draws busy regions larger. The world stays in true coordinates; only the
// drawing goes through the warp. The warp ships as two 2-degree grids, one
// forward (true to drawn) and one inverse (drawn to true), and is blended
// with the identity by the strength the slider sets (section 4.1).

import type { Vec3 } from './cube.ts';

/** Grid spacing in degrees and the number of points per row and column. */
export const LENS_STEP = 2;
export const LENS_COLS = 360 / LENS_STEP + 1; // -180..180, both ends kept
export const LENS_ROWS = 180 / LENS_STEP + 1; // -90..90
export const LENS_POINTS = LENS_COLS * LENS_ROWS;
const MAGIC = 0x534e454c; // "LENS"

/** Encodes drawn latitude and longitude per point as 16-bit values, after a small header. */
export function encodeLensGrids(forward: Float64Array, inverse: Float64Array): Uint8Array {
  const out = new Uint8Array(8 + LENS_POINTS * 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, LENS_COLS, true);
  view.setUint16(6, LENS_ROWS, true);
  const put = (grid: Float64Array, base: number) => {
    for (let p = 0; p < LENS_POINTS; p++) {
      const x = grid[p * 3]!;
      const y = grid[p * 3 + 1]!;
      const z = grid[p * 3 + 2]!;
      const lat = Math.asin(Math.max(-1, Math.min(1, y)));
      const lon = Math.abs(y) > 1 - 1e-12 ? 0 : Math.atan2(x, z);
      view.setUint16(base + p * 4, Math.round((lat / Math.PI + 0.5) * 65535), true);
      view.setUint16(base + p * 4 + 2, Math.round(((lon / Math.PI + 1) / 2) * 65535), true);
    }
  };
  put(forward, 8);
  put(inverse, 8 + LENS_POINTS * 4);
  return out;
}

/** Decodes both grids into unit vectors. */
export function decodeLensGrids(bytes: Uint8Array): {
  forward: Float64Array;
  inverse: Float64Array;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('Not a lens file');
  if (view.getUint16(4, true) !== LENS_COLS || view.getUint16(6, true) !== LENS_ROWS)
    throw new Error('Unexpected lens grid size');
  const get = (base: number) => {
    const g = new Float64Array(LENS_POINTS * 3);
    for (let p = 0; p < LENS_POINTS; p++) {
      const lat = (view.getUint16(base + p * 4, true) / 65535 - 0.5) * Math.PI;
      const lon = ((view.getUint16(base + p * 4 + 2, true) / 65535) * 2 - 1) * Math.PI;
      g[p * 3] = Math.cos(lat) * Math.sin(lon);
      g[p * 3 + 1] = Math.sin(lat);
      g[p * 3 + 2] = Math.cos(lat) * Math.cos(lon);
    }
    return g;
  };
  return { forward: get(8), inverse: get(8 + LENS_POINTS * 4) };
}

/** True direction of a grid point. */
export function gridPointDir(col: number, row: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const lat = ((-90 + row * LENS_STEP) * Math.PI) / 180;
  const lon = ((-180 + col * LENS_STEP) * Math.PI) / 180;
  out[0] = Math.cos(lat) * Math.sin(lon);
  out[1] = Math.sin(lat);
  out[2] = Math.cos(lat) * Math.cos(lon);
  return out;
}

/**
 * Bilinear lookup of a grid of unit vectors at a direction, normalised. The
 * shader does the same (shaders.ts, lensAt), so both agree.
 */
export function sampleGrid(grid: Float64Array, d: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
  const lat = Math.asin(Math.max(-1, Math.min(1, d[1]))) * (180 / Math.PI);
  const lon = Math.atan2(d[0], d[2]) * (180 / Math.PI);
  const fx = Math.min(LENS_COLS - 1.000001, Math.max(0, (lon + 180) / LENS_STEP));
  const fy = Math.min(LENS_ROWS - 1.000001, Math.max(0, (lat + 90) / LENS_STEP));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const a = (j * LENS_COLS + i) * 3;
  const b = a + 3;
  const c = a + LENS_COLS * 3;
  const e = c + 3;
  const w0 = (1 - tx) * (1 - ty);
  const w1 = tx * (1 - ty);
  const w2 = (1 - tx) * ty;
  const w3 = tx * ty;
  let x = grid[a]! * w0 + grid[b]! * w1 + grid[c]! * w2 + grid[e]! * w3;
  let y = grid[a + 1]! * w0 + grid[b + 1]! * w1 + grid[c + 1]! * w2 + grid[e + 1]! * w3;
  let z = grid[a + 2]! * w0 + grid[b + 2]! * w1 + grid[c + 2]! * w2 + grid[e + 2]! * w3;
  const len = Math.hypot(x, y, z) || 1;
  x /= len;
  y /= len;
  z /= len;
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

/** Bilinear lookup of a scalar grid at a direction. */
export function sampleScalar(grid: Float64Array | Float32Array, d: Vec3): number {
  const lat = Math.asin(Math.max(-1, Math.min(1, d[1]))) * (180 / Math.PI);
  const lon = Math.atan2(d[0], d[2]) * (180 / Math.PI);
  const fx = Math.min(LENS_COLS - 1.000001, Math.max(0, (lon + 180) / LENS_STEP));
  const fy = Math.min(LENS_ROWS - 1.000001, Math.max(0, (lat + 90) / LENS_STEP));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const a = j * LENS_COLS + i;
  const c = a + LENS_COLS;
  return (
    grid[a]! * (1 - tx) * (1 - ty) +
    grid[a + 1]! * tx * (1 - ty) +
    grid[c]! * (1 - tx) * ty +
    grid[c + 1]! * tx * ty
  );
}

/**
 * Width factor (square root of the area factor) at every forward grid point,
 * from the drawn positions of its neighbours.
 */
export function widthFactors(forward: Float64Array): Float32Array {
  const w = new Float32Array(LENS_POINTS);
  const t0: Vec3 = [0, 0, 0];
  const t1: Vec3 = [0, 0, 0];
  const t2: Vec3 = [0, 0, 0];
  const t3: Vec3 = [0, 0, 0];
  for (let j = 0; j < LENS_ROWS; j++) {
    // Rows next to a pole use the one-sided difference.
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(LENS_ROWS - 1, j + 1);
    for (let i = 0; i < LENS_COLS; i++) {
      const i0 = i === 0 ? LENS_COLS - 2 : i - 1;
      const i1 = i === LENS_COLS - 1 ? 1 : i + 1;
      const at = (ii: number, jj: number) => (jj * LENS_COLS + ii) * 3;
      // Drawn area spanned by the four neighbours, over the true area.
      const drawn = quadArea(forward, at(i0, j), at(i1, j), at(i, j0), at(i, j1));
      gridPointDir(i0, j, t0);
      gridPointDir(i1, j, t1);
      gridPointDir(i, j0, t2);
      gridPointDir(i, j1, t3);
      const trueArea = quadAreaV(t0, t1, t2, t3);
      w[j * LENS_COLS + i] = trueArea > 1e-9 ? Math.sqrt(Math.max(0, drawn / trueArea)) : NaN;
    }
  }
  // The poles: the mean of the next row, where the differences above degenerate.
  for (const [pole, next] of [
    [0, 1],
    [LENS_ROWS - 1, LENS_ROWS - 2],
  ] as const) {
    let sum = 0;
    for (let i = 0; i < LENS_COLS - 1; i++) sum += w[next * LENS_COLS + i]!;
    w.fill(sum / (LENS_COLS - 1), pole * LENS_COLS, (pole + 1) * LENS_COLS);
  }
  return w;
}

function quadArea(g: Float64Array, a: number, b: number, c: number, d: number): number {
  return quadAreaV(
    [g[a]!, g[a + 1]!, g[a + 2]!],
    [g[b]!, g[b + 1]!, g[b + 2]!],
    [g[c]!, g[c + 1]!, g[c + 2]!],
    [g[d]!, g[d + 1]!, g[d + 2]!],
  );
}

/** |(b - a) × (d - c)|: twice the area of the quad with diagonals a-b and c-d. */
function quadAreaV(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2];
  const vx = d[0] - c[0],
    vy = d[1] - c[1],
    vz = d[2] - c[2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/** Spherical interpolation between two unit vectors. */
export function slerpDir(a: Vec3, b: Vec3, t: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const angle = Math.acos(dot);
  if (angle < 1e-9) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    return out;
  }
  const s = Math.sin(angle);
  const ka = Math.sin((1 - t) * angle) / s;
  const kb = Math.sin(t * angle) / s;
  out[0] = a[0] * ka + b[0] * kb;
  out[1] = a[1] * ka + b[1] * kb;
  out[2] = a[2] * ka + b[2] * kb;
  return out;
}

/**
 * Stiffness of the spring the blend follows (section 4.1), in 1/s: critically
 * damped, a jump by 1 settles in about 1 s, or 0.25 s with reduced motion.
 */
export const MORPH_OMEGA = 7;
export const MORPH_OMEGA_REDUCED = 26;
/** Highest strength of the slider (200%). */
export const MAX_STRENGTH = 2;

/**
 * The warp and its blend with the identity: 0 shows true sizes, 1 the warp
 * as built (100%) and 2 twice its displacement (200%, history-lens.md).
 */
export class Lens {
  readonly forward: Float64Array;
  readonly inverse: Float64Array;
  readonly width: Float32Array;
  /** Current drawn strength (section 4.1). */
  blend = 0;
  /** Strength the blend is moving to. */
  private target = 0;
  private velocity = 0;
  private widest: number;
  private tmp: Vec3 = [0, 0, 0];
  private tmp2: Vec3 = [0, 0, 0];

  constructor(forward: Float64Array, inverse: Float64Array) {
    this.forward = forward;
    this.inverse = inverse;
    this.width = widthFactors(forward);
    let m = 1;
    for (const w of this.width) if (w > m) m = w;
    this.widest = m;
  }

  /** Sets the strength (0..2); with animate false it jumps straight there (at start). */
  setStrength(strength: number, animate = true): void {
    this.target = Math.max(0, Math.min(MAX_STRENGTH, strength));
    if (!animate) {
      this.blend = this.target;
      this.velocity = 0;
    }
  }

  get strength(): number {
    return this.target;
  }

  get morphing(): boolean {
    return this.blend !== this.target;
  }

  /**
   * Advances the morph by frame time with the exact solution of a critically
   * damped spring, so long frames stay stable; returns whether the blend changed.
   */
  advance(dtMs: number, omega: number): boolean {
    if (!this.morphing) return false;
    const t = Math.max(0, dtMs) / 1000;
    const c1 = this.blend - this.target;
    const c2 = this.velocity + omega * c1;
    const e = Math.exp(-omega * t);
    this.blend = this.target + (c1 + c2 * t) * e;
    this.velocity = (c2 - omega * (c1 + c2 * t)) * e;
    if (this.blend < 0 || this.blend > MAX_STRENGTH) {
      this.blend = Math.max(0, Math.min(MAX_STRENGTH, this.blend));
      this.velocity = 0;
    }
    // Within a thousandth of the strength the rest is invisible, so it snaps.
    if (Math.abs(this.blend - this.target) < 1e-3 && Math.abs(this.velocity) < 1e-2) {
      this.blend = this.target;
      this.velocity = 0;
    }
    return true;
  }

  /**
   * Forward grid and width factor as an RGBA float texture's data, for the
   * terrain shader (shaders.ts, lensAt).
   */
  textureData(): Float32Array {
    const data = new Float32Array(LENS_POINTS * 4);
    for (let p = 0; p < LENS_POINTS; p++) {
      data[p * 4] = this.forward[p * 3]!;
      data[p * 4 + 1] = this.forward[p * 3 + 1]!;
      data[p * 4 + 2] = this.forward[p * 3 + 2]!;
      data[p * 4 + 3] = this.width[p]!;
    }
    return data;
  }

  static identity(): Lens {
    const g = new Float64Array(LENS_POINTS * 3);
    const d: Vec3 = [0, 0, 0];
    for (let j = 0; j < LENS_ROWS; j++)
      for (let i = 0; i < LENS_COLS; i++) {
        gridPointDir(i, j, d);
        g.set(d, (j * LENS_COLS + i) * 3);
      }
    return new Lens(g, g);
  }

  /** Drawn direction of a true direction at the current blend (above 1 it extrapolates). */
  toDrawn(d: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
    if (this.blend <= 0) {
      out[0] = d[0];
      out[1] = d[1];
      out[2] = d[2];
      return out;
    }
    // Normalised linear blend along the arc, exactly as the shader does it.
    const w = sampleGrid(this.forward, d, this.tmp);
    const b = this.blend;
    const x = d[0] + (w[0] - d[0]) * b;
    const y = d[1] + (w[1] - d[1]) * b;
    const z = d[2] + (w[2] - d[2]) * b;
    const len = Math.hypot(x, y, z);
    out[0] = x / len;
    out[1] = y / len;
    out[2] = z / len;
    return out;
  }

  /** True direction of a drawn direction at the current blend. */
  toTrue(d: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
    if (this.blend <= 0) {
      out[0] = d[0];
      out[1] = d[1];
      out[2] = d[2];
      return out;
    }
    // Start from the blended inverse grid and correct by the forward error,
    // shrunk by the local width so that strong lenses converge too.
    const x: Vec3 = slerpDir(d, sampleGrid(this.inverse, d, this.tmp), this.blend, [0, 0, 0]);
    for (let k = 0; k < 8; k++) {
      const f = this.toDrawn(x, this.tmp2);
      const k1 = 1 / this.widthAt(x);
      x[0] += (d[0] - f[0]) * k1;
      x[1] += (d[1] - f[1]) * k1;
      x[2] += (d[2] - f[2]) * k1;
      const len = Math.hypot(x[0], x[1], x[2]);
      x[0] /= len;
      x[1] /= len;
      x[2] /= len;
    }
    out[0] = x[0];
    out[1] = x[1];
    out[2] = x[2];
    return out;
  }

  /** Width factor at a true direction at the current blend (drawn km per true km). */
  widthAt(d: Vec3): number {
    if (this.blend <= 0) return 1;
    return 1 + (sampleScalar(this.width, d) - 1) * this.blend;
  }

  /**
   * Width factor of the warp as built (strength 100 %), whatever the current
   * blend: tiles are refined by it, so moving the slider never re-picks them.
   */
  builtWidthAt(d: Vec3): number {
    return sampleScalar(this.width, d);
  }

  /** Largest width factor anywhere, for conservative bounds. */
  get maxWidth(): number {
    return Math.max(1, 1 + (this.widest - 1) * this.blend);
  }
}
