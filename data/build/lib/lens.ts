// Builds the history lens warp (spec history-lens.md, sections 2 and 3): the
// event density from the coordinates in the spec's event lists, the target
// area factor, and a diffusion cartogram on the sphere (Gastner and Newman
// 2004) solved with spherical harmonics, so it has no seam at the date line
// or the poles. Writes a forward and an inverse grid and checks the limits.

import {
  LENS_COLS,
  LENS_POINTS,
  LENS_ROWS,
  LENS_STEP,
  gridPointDir,
  sampleGrid,
} from '../../../app/src/globe/lens.ts';
import type { Vec3 } from '../../../app/src/globe/cube.ts';

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

export interface LensParams {
  /** Width of the Gaussian kernel (its standard deviation), km. */
  kernelKm: number;
  /** Added to density / mean density before the exponent. */
  offset: number;
  /** Starting exponent; lowered step by step until every check passes. */
  exponent: number;
  exponentStep: number;
  minFactor: number;
  maxFactor: number;
  /** Most stretch in one direction over the other, so shapes stay recognisable. */
  maxAnisotropy: number;
  /** Largest change of the area factor over any span of spanKm. */
  maxAreaRatio: number;
  spanKm: number;
  /** Highest spherical harmonic degree of the diffusion. */
  degree: number;
}

export const LENS_PARAMS: LensParams = {
  kernelKm: 1500,
  offset: 0.3,
  exponent: 0.5,
  exponentStep: 0.05,
  minFactor: 0.6,
  maxFactor: 3.5,
  maxAnisotropy: 1.5,
  maxAreaRatio: 2,
  spanKm: 1000,
  degree: 32,
};

// --- Event coordinates ---------------------------------------------------------

/**
 * Every point in a "Coordinates" column of the Markdown tables in a file,
 * one per row: "40.75, 14.49" with an optional note in brackets.
 */
export function parseCoordinates(markdown: string): { lat: number; lon: number }[] {
  const out: { lat: number; lon: number }[] = [];
  let column = -1;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) {
      column = -1;
      continue;
    }
    const cells = line
      .slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.trim());
    if (column < 0) {
      column = cells.indexOf('Coordinates');
      continue;
    }
    if (/^-+$/.test(cells[0] ?? '')) continue;
    const m = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(cells[column] ?? '');
    if (!m) continue;
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) out.push({ lat, lon });
  }
  return out;
}

// --- Area factor -----------------------------------------------------------------

function dirOf(latDeg: number, lonDeg: number): Vec3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}

/** Smoothed event density at directions (unnormalised). */
function density(points: Vec3[], dirs: Vec3[], kernelKm: number): Float64Array {
  const s = kernelKm / EARTH_RADIUS_KM;
  const k = 1 / (2 * s * s);
  const out = new Float64Array(dirs.length);
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i]!;
    let sum = 0;
    for (const p of points) {
      const dot = d[0] * p[0] + d[1] * p[1] + d[2] * p[2];
      // Chord length squared is close to the arc squared within the kernel's reach.
      const chord2 = 2 - 2 * dot;
      if (chord2 < 0.8) sum += Math.exp(-chord2 * k);
    }
    out[i] = sum;
  }
  return out;
}

/** Gauss-Legendre nodes and weights on [-1, 1]. */
function gaussLegendre(n: number): { x: Float64Array; w: Float64Array } {
  const x = new Float64Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = z;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (z * p1 - p0)) / (z * z - 1);
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x[i] = z;
    w[i] = 2 / ((1 - z * z) * dp * dp);
  }
  return { x, w };
}

/** Index of degree l and order m in the coefficient arrays. */
const lm = (l: number, m: number) => (l * (l + 1)) / 2 + m;

/** Orthonormal associated Legendre values q_lm(sin lat) for l, m up to L. */
function legendre(L: number, sinLat: number, out: Float64Array): void {
  const x = sinLat;
  const s = Math.sqrt(Math.max(0, 1 - x * x));
  let qmm = Math.sqrt(1 / (4 * Math.PI));
  for (let m = 0; m <= L; m++) {
    if (m > 0) qmm *= Math.sqrt((2 * m + 1) / (2 * m)) * s;
    out[lm(m, m)] = qmm;
    if (m === L) break;
    let q1 = qmm;
    let q2 = x * Math.sqrt(2 * m + 3) * qmm;
    out[lm(m + 1, m)] = q2;
    for (let l = m + 2; l <= L; l++) {
      const a = Math.sqrt((4 * l * l - 1) / (l * l - m * m));
      const b = Math.sqrt(((l - 1) * (l - 1) - m * m) / (4 * (l - 1) * (l - 1) - 1));
      const q = a * (x * q2 - b * q1);
      out[lm(l, m)] = q;
      q1 = q2;
      q2 = q;
    }
  }
}

/** Real spherical harmonic coefficients (cos and sin parts) of a function on the sphere. */
function project(f: (d: Vec3) => number, L: number): { c: Float64Array; s: Float64Array } {
  const nlat = 2 * L;
  const nlon = 4 * L;
  const { x, w } = gaussLegendre(nlat);
  const n = lm(L, L) + 1;
  const c = new Float64Array(n);
  const s = new Float64Array(n);
  const q = new Float64Array(n);
  const dphi = (2 * Math.PI) / nlon;
  const values = new Float64Array(nlon);
  for (let i = 0; i < nlat; i++) {
    const sinLat = x[i]!;
    const cosLat = Math.sqrt(1 - sinLat * sinLat);
    for (let k = 0; k < nlon; k++) {
      const lon = k * dphi;
      values[k] = f([cosLat * Math.sin(lon), sinLat, cosLat * Math.cos(lon)]);
    }
    legendre(L, sinLat, q);
    for (let m = 0; m <= L; m++) {
      let a = 0;
      let b = 0;
      for (let k = 0; k < nlon; k++) {
        a += values[k]! * Math.cos(m * k * dphi);
        b += values[k]! * Math.sin(m * k * dphi);
      }
      const norm = m === 0 ? 1 : Math.SQRT2;
      a *= w[i]! * dphi * norm;
      b *= w[i]! * dphi * norm;
      for (let l = m; l <= L; l++) {
        c[lm(l, m)]! += a * q[lm(l, m)]!;
        s[lm(l, m)]! += b * q[lm(l, m)]!;
      }
    }
  }
  return { c, s };
}

/** The area factor of section 2 at directions, for an exponent. */
export function targetFactor(
  events: { lat: number; lon: number }[],
  params: LensParams,
  exponent: number,
): (dirs: Vec3[]) => Float64Array {
  const pts = events.map((e) => dirOf(e.lat, e.lon));
  // Area-weighted mean density, from a fine equal-area sample.
  const sample: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(1 - y * y);
    sample.push([r * Math.sin(golden * i), y, r * Math.cos(golden * i)]);
  }
  const ds = density(pts, sample, params.kernelKm);
  let mean = 0;
  for (const v of ds) mean += v / N;
  const raw = (d: Float64Array) => d.map((v) => Math.pow(v / mean + params.offset, exponent));
  // Scale so the total area stays the same, then limit; repeat until both hold.
  const fs = raw(ds);
  let scale = 1;
  for (let it = 0; it < 30; it++) {
    let m = 0;
    for (const v of fs) m += Math.min(params.maxFactor, Math.max(params.minFactor, v * scale)) / N;
    scale /= m;
  }
  return (dirs) =>
    raw(density(pts, dirs, params.kernelKm)).map((v) =>
      Math.min(params.maxFactor, Math.max(params.minFactor, v * scale)),
    );
}

// --- Diffusion cartogram -----------------------------------------------------------

const VEL_STEP = 1; // degrees
const VEL_COLS = 360 / VEL_STEP + 1;
const VEL_ROWS = 180 / VEL_STEP + 1;

class DiffusionField {
  private L: number;
  private c: Float64Array;
  private s: Float64Array;
  private q: Float64Array[] = [];
  private dq: Float64Array[] = [];
  private cosm: Float64Array;
  private sinm: Float64Array;
  /** Velocity on the grid, as 3D tangent vectors, for the last evaluated time. */
  readonly v = new Float64Array(VEL_COLS * VEL_ROWS * 3);
  vmax = 0;

  constructor(coeffs: { c: Float64Array; s: Float64Array }, L: number) {
    this.L = L;
    this.c = coeffs.c;
    this.s = coeffs.s;
    const n = lm(L, L) + 1;
    const eps = 1e-5;
    for (let j = 0; j < VEL_ROWS; j++) {
      const lat = Math.max(-89.95, Math.min(89.95, -90 + j * VEL_STEP)) * DEG;
      const q = new Float64Array(n);
      const qa = new Float64Array(n);
      const qb = new Float64Array(n);
      legendre(L, Math.sin(lat), q);
      legendre(L, Math.sin(lat + eps), qa);
      legendre(L, Math.sin(lat - eps), qb);
      const dq = new Float64Array(n);
      for (let k = 0; k < n; k++) dq[k] = (qa[k]! - qb[k]!) / (2 * eps);
      this.q.push(q);
      this.dq.push(dq);
    }
    this.cosm = new Float64Array(VEL_COLS * (L + 1));
    this.sinm = new Float64Array(VEL_COLS * (L + 1));
    for (let i = 0; i < VEL_COLS; i++)
      for (let m = 0; m <= L; m++) {
        const lon = (-180 + i * VEL_STEP) * DEG;
        this.cosm[i * (L + 1) + m] = Math.cos(m * lon);
        this.sinm[i * (L + 1) + m] = Math.sin(m * lon);
      }
  }

  /** Evaluates v = -grad(rho) / rho at diffusion time t on the grid. */
  evaluate(t: number): void {
    const L = this.L;
    const decay = new Float64Array(L + 1);
    for (let l = 0; l <= L; l++) decay[l] = Math.exp(-l * (l + 1) * t);
    const A = new Float64Array(L + 1);
    const B = new Float64Array(L + 1);
    const dA = new Float64Array(L + 1);
    const dB = new Float64Array(L + 1);
    let vmax = 0;
    for (let j = 0; j < VEL_ROWS; j++) {
      const q = this.q[j]!;
      const dq = this.dq[j]!;
      for (let m = 0; m <= L; m++) {
        let a = 0,
          b = 0,
          da = 0,
          db = 0;
        for (let l = m; l <= L; l++) {
          const k = lm(l, m);
          const cc = this.c[k]! * decay[l]!;
          const ss = this.s[k]! * decay[l]!;
          a += cc * q[k]!;
          b += ss * q[k]!;
          da += cc * dq[k]!;
          db += ss * dq[k]!;
        }
        const norm = m === 0 ? 1 : Math.SQRT2;
        A[m] = a * norm;
        B[m] = b * norm;
        dA[m] = da * norm;
        dB[m] = db * norm;
      }
      const lat = Math.max(-89.95, Math.min(89.95, -90 + j * VEL_STEP)) * DEG;
      const cl = Math.cos(lat);
      const sl = Math.sin(lat);
      for (let i = 0; i < VEL_COLS; i++) {
        const o = i * (L + 1);
        let rho = 0,
          dLat = 0,
          dLon = 0;
        for (let m = 0; m <= L; m++) {
          const cm = this.cosm[o + m]!;
          const sm = this.sinm[o + m]!;
          rho += A[m]! * cm + B[m]! * sm;
          dLat += dA[m]! * cm + dB[m]! * sm;
          dLon += m * (B[m]! * cm - A[m]! * sm);
        }
        const lon = (-180 + i * VEL_STEP) * DEG;
        const sLon = Math.sin(lon);
        const cLon = Math.cos(lon);
        // Gradient in the north and east directions, then -grad / rho in 3D.
        const gN = dLat;
        const gE = dLon / cl;
        const r = Math.max(rho, 1e-6);
        const vn = -gN / r;
        const ve = -gE / r;
        const p = (j * VEL_COLS + i) * 3;
        this.v[p] = vn * (-sl * sLon) + ve * cLon;
        this.v[p + 1] = vn * cl;
        this.v[p + 2] = vn * (-sl * cLon) - ve * sLon;
        const sp = Math.hypot(vn, ve);
        if (sp > vmax) vmax = sp;
      }
    }
    this.vmax = vmax;
  }

  /** Velocity at a direction from the grid, in the tangent plane. */
  velocity(d: Vec3, out: Vec3): Vec3 {
    const lat = Math.asin(Math.max(-1, Math.min(1, d[1]))) / DEG;
    const lon = Math.atan2(d[0], d[2]) / DEG;
    const fx = Math.min(VEL_COLS - 1.000001, Math.max(0, (lon + 180) / VEL_STEP));
    const fy = Math.min(VEL_ROWS - 1.000001, Math.max(0, (lat + 90) / VEL_STEP));
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const a = (j * VEL_COLS + i) * 3;
    const c = a + VEL_COLS * 3;
    const v = this.v;
    for (let k = 0; k < 3; k++)
      out[k] =
        v[a + k]! * (1 - tx) * (1 - ty) +
        v[a + 3 + k]! * tx * (1 - ty) +
        v[c + k]! * (1 - tx) * ty +
        v[c + 3 + k]! * tx * ty;
    const dot = out[0] * d[0] + out[1] * d[1] + out[2] * d[2];
    out[0] -= dot * d[0];
    out[1] -= dot * d[1];
    out[2] -= dot * d[2];
    return out;
  }
}

function addNormalised(p: Vec3, v: Vec3, dt: number, out: Vec3): Vec3 {
  const x = p[0] + v[0] * dt;
  const y = p[1] + v[1] * dt;
  const z = p[2] + v[2] * dt;
  const len = Math.hypot(x, y, z);
  out[0] = x / len;
  out[1] = y / len;
  out[2] = z / len;
  return out;
}

/** Moves points along the diffusion flow from t = 0 until the density is even. */
function flow(field: DiffusionField, points: Vec3[]): void {
  const MAX_STEP_RAD = 0.002;
  let t = 0;
  field.evaluate(0);
  const v0 = field.v.slice();
  const prev = new Float64Array(points.length * 3);
  const a: Vec3 = [0, 0, 0];
  const b: Vec3 = [0, 0, 0];
  const mid: Vec3 = [0, 0, 0];
  let vmax0 = field.vmax;
  void v0;
  for (let step = 0; step < 20000; step++) {
    if (vmax0 < 1e-7 || t > 40) break;
    const dt = Math.min(MAX_STEP_RAD / vmax0, 0.5);
    // Heun's method: velocity at t and at t + dt.
    for (let p = 0; p < points.length; p++) {
      field.velocity(points[p]!, a);
      prev[p * 3] = a[0];
      prev[p * 3 + 1] = a[1];
      prev[p * 3 + 2] = a[2];
    }
    t += dt;
    field.evaluate(t);
    for (let p = 0; p < points.length; p++) {
      const pt = points[p]!;
      a[0] = prev[p * 3]!;
      a[1] = prev[p * 3 + 1]!;
      a[2] = prev[p * 3 + 2]!;
      addNormalised(pt, a, dt, mid);
      field.velocity(mid, b);
      a[0] = (a[0] + b[0]) / 2;
      a[1] = (a[1] + b[1]) / 2;
      a[2] = (a[2] + b[2]) / 2;
      addNormalised(pt, a, dt, pt);
    }
    vmax0 = field.vmax;
  }
}

// --- Checks ----------------------------------------------------------------------

export interface LensChecks {
  folds: number;
  maxAnisotropy: number;
  maxAreaRatio: number;
  minArea: number;
  maxArea: number;
}

/** Local area factor and anisotropy at every forward grid point (pole rows left out). */
export function jacobians(forward: Float64Array): { area: Float64Array; aniso: Float64Array } {
  const area = new Float64Array(LENS_POINTS).fill(NaN);
  const aniso = new Float64Array(LENS_POINTS).fill(NaN);
  const h = LENS_STEP * DEG;
  for (let j = 1; j < LENS_ROWS - 1; j++) {
    const lat = (-90 + j * LENS_STEP) * DEG;
    for (let i = 0; i < LENS_COLS; i++) {
      const i0 = i === 0 ? LENS_COLS - 2 : i - 1;
      const i1 = i === LENS_COLS - 1 ? 1 : i + 1;
      const at = (ii: number, jj: number): Vec3 => {
        const o = (jj * LENS_COLS + ii) * 3;
        return [forward[o]!, forward[o + 1]!, forward[o + 2]!];
      };
      const p = at(i, j);
      const e1 = at(i1, j);
      const e0 = at(i0, j);
      const n1 = at(i, j + 1);
      const n0 = at(i, j - 1);
      // Drawn tangent frame at p.
      const north: Vec3 = [-p[1] * p[0], 1 - p[1] * p[1], -p[1] * p[2]];
      const nl = Math.hypot(...north);
      north[0] /= nl;
      north[1] /= nl;
      north[2] /= nl;
      const east: Vec3 = [
        north[1] * p[2] - north[2] * p[1],
        north[2] * p[0] - north[0] * p[2],
        north[0] * p[1] - north[1] * p[0],
      ];
      const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      const dE: Vec3 = [e1[0] - e0[0], e1[1] - e0[1], e1[2] - e0[2]];
      const dN: Vec3 = [n1[0] - n0[0], n1[1] - n0[1], n1[2] - n0[2]];
      const sx = 2 * h * Math.cos(lat);
      const sy = 2 * h;
      // Jacobian columns: drawn change per true east step and per true north step.
      const a = dot(dE, east) / sx;
      const c = dot(dE, north) / sx;
      const b = dot(dN, east) / sy;
      const d = dot(dN, north) / sy;
      const det = a * d - b * c;
      const fro = a * a + b * b + c * c + d * d;
      const disc = Math.sqrt(Math.max(0, fro * fro - 4 * det * det));
      const s1 = Math.sqrt((fro + disc) / 2);
      const s2 = Math.sqrt(Math.max(0, (fro - disc) / 2));
      const k = j * LENS_COLS + i;
      area[k] = det;
      aniso[k] = s2 > 0 ? s1 / s2 : Infinity;
    }
  }
  return { area, aniso };
}

/**
 * The forward grid at a strength other than 100%: every point moved that many
 * times as far from its true position, as the app draws it (history-lens.md, 4.1).
 */
export function atStrength(forward: Float64Array, strength: number): Float64Array {
  const out = new Float64Array(forward.length);
  const d: Vec3 = [0, 0, 0];
  for (let j = 0; j < LENS_ROWS; j++)
    for (let i = 0; i < LENS_COLS; i++) {
      gridPointDir(i, j, d);
      const k = (j * LENS_COLS + i) * 3;
      const x = d[0] + (forward[k]! - d[0]) * strength;
      const y = d[1] + (forward[k + 1]! - d[1]) * strength;
      const z = d[2] + (forward[k + 2]! - d[2]) * strength;
      const len = Math.hypot(x, y, z);
      out[k] = x / len;
      out[k + 1] = y / len;
      out[k + 2] = z / len;
    }
  return out;
}

export function checkLens(forward: Float64Array, params: LensParams): LensChecks {
  const { area, aniso } = jacobians(forward);
  let folds = 0;
  let maxAniso = 1;
  let minArea = Infinity;
  let maxArea = 0;
  for (let k = 0; k < LENS_POINTS; k++) {
    const a = area[k]!;
    if (Number.isNaN(a)) continue;
    if (a <= 0) folds++;
    maxAniso = Math.max(maxAniso, aniso[k]!);
    minArea = Math.min(minArea, a);
    maxArea = Math.max(maxArea, a);
  }
  // Largest ratio of the area factor between points at most spanKm apart.
  const spanRad = params.spanKm / EARTH_RADIUS_KM;
  const rows = Math.ceil(spanRad / (LENS_STEP * DEG));
  let maxRatio = 1;
  const d0: Vec3 = [0, 0, 0];
  const d1: Vec3 = [0, 0, 0];
  for (let j = 1; j < LENS_ROWS - 1; j++)
    for (let i = 0; i < LENS_COLS - 1; i++) {
      const a0 = area[j * LENS_COLS + i]!;
      if (!(a0 > 0)) continue;
      gridPointDir(i, j, d0);
      const lat = Math.abs(-90 + j * LENS_STEP) * DEG;
      const cols = Math.min(LENS_COLS - 1, Math.ceil(rows / Math.max(0.05, Math.cos(lat))));
      for (let jj = Math.max(1, j - rows); jj <= Math.min(LENS_ROWS - 2, j + rows); jj++)
        for (let di = -cols; di <= cols; di++) {
          const ii = (((i + di) % (LENS_COLS - 1)) + (LENS_COLS - 1)) % (LENS_COLS - 1);
          const a1 = area[jj * LENS_COLS + ii]!;
          if (!(a1 > 0)) continue;
          gridPointDir(ii, jj, d1);
          const dot = d0[0] * d1[0] + d0[1] * d1[1] + d0[2] * d1[2];
          if (Math.acos(Math.min(1, dot)) > spanRad) continue;
          maxRatio = Math.max(maxRatio, a0 / a1);
        }
    }
  return {
    folds,
    maxAnisotropy: maxAniso,
    maxAreaRatio: maxRatio,
    minArea,
    maxArea,
  };
}

export function passes(c: LensChecks, params: LensParams): boolean {
  return (
    c.folds === 0 &&
    c.maxAnisotropy <= params.maxAnisotropy &&
    c.maxAreaRatio <= params.maxAreaRatio
  );
}

// --- The whole warp ------------------------------------------------------------------

/** Forward grid: the drawn position of every true grid point. */
export function forwardGrid(
  events: { lat: number; lon: number }[],
  params: LensParams,
  exponent: number,
): Float64Array {
  const factor = targetFactor(events, params, exponent);
  const coeffs = project((d) => factor([d])[0]!, params.degree);
  const field = new DiffusionField(coeffs, params.degree);
  const pts: Vec3[] = [];
  for (let j = 0; j < LENS_ROWS; j++)
    for (let i = 0; i < LENS_COLS; i++) pts.push(gridPointDir(i, j));
  flow(field, pts);
  // The flow leaves the globe free to turn as a whole. Turning it back so
  // the busy regions move least keeps every size and shape and keeps places
  // close to where they really are.
  const weights = factor(pts.map((_, k) => gridPointDir(k % LENS_COLS, Math.floor(k / LENS_COLS))));
  for (let k = 0; k < LENS_POINTS; k++)
    weights[k]! *= Math.cos((-90 + Math.floor(k / LENS_COLS) * LENS_STEP) * DEG) * weights[k]!;
  const rot = bestRotation(
    pts,
    pts.map((_, k) => gridPointDir(k % LENS_COLS, Math.floor(k / LENS_COLS))),
    weights,
  );
  const g = new Float64Array(LENS_POINTS * 3);
  for (let k = 0; k < LENS_POINTS; k++) g.set(rotate(rot, pts[k]!), k * 3);
  // Keep the seam and the poles exact: the last column repeats the first,
  // and each pole row is one point.
  for (let j = 0; j < LENS_ROWS; j++)
    g.copyWithin((j * LENS_COLS + LENS_COLS - 1) * 3, j * LENS_COLS * 3, j * LENS_COLS * 3 + 3);
  for (const row of [0, LENS_ROWS - 1]) {
    const m: Vec3 = [0, 0, 0];
    for (let i = 0; i < LENS_COLS - 1; i++)
      for (let k = 0; k < 3; k++) m[k]! += g[(row * LENS_COLS + i) * 3 + k]!;
    const len = Math.hypot(...m);
    for (let i = 0; i < LENS_COLS; i++)
      g.set([m[0] / len, m[1] / len, m[2] / len], (row * LENS_COLS + i) * 3);
  }
  return g;
}

type Quat = [number, number, number, number];

/**
 * The rotation that best maps points a onto points b in the weighted
 * least-squares sense (Horn 1987), as a unit quaternion [w, x, y, z].
 */
export function bestRotation(a: Vec3[], b: Vec3[], w: ArrayLike<number>): Quat {
  const S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < a.length; k++) {
    const p = a[k]!;
    const q = b[k]!;
    const wk = w[k]!;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r * 3 + c]! += wk * p[r]! * q[c]!;
  }
  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = S as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  // Largest eigenvector by power iteration on N shifted to be positive.
  let shift = 0;
  for (const row of N)
    shift = Math.max(
      shift,
      row.reduce((s, v) => s + Math.abs(v), 0),
    );
  let v: Quat = [1, 0, 0, 0];
  for (let it = 0; it < 2000; it++) {
    const nv: Quat = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) {
      nv[r] = shift * v[r]!;
      for (let c = 0; c < 4; c++) nv[r]! += N[r]![c]! * v[c]!;
    }
    const len = Math.hypot(...nv);
    v = [nv[0] / len, nv[1] / len, nv[2] / len, nv[3] / len];
  }
  return v;
}

export function rotate(q: Quat, p: Vec3): Vec3 {
  const [w, x, y, z] = q;
  // p + 2w (u × p) + 2 u × (u × p), with u = (x, y, z).
  const cx = y * p[2] - z * p[1];
  const cy = z * p[0] - x * p[2];
  const cz = x * p[1] - y * p[0];
  return [
    p[0] + 2 * (w * cx + y * cz - z * cy),
    p[1] + 2 * (w * cy + z * cx - x * cz),
    p[2] + 2 * (w * cz + x * cy - y * cx),
  ];
}

/** Inverse grid: the true position of every drawn grid point, by fixed-point iteration on the forward grid. */
export function inverseGrid(forward: Float64Array): Float64Array {
  const g = new Float64Array(LENS_POINTS * 3);
  const target: Vec3 = [0, 0, 0];
  const f: Vec3 = [0, 0, 0];
  for (let k = 0; k < LENS_POINTS; k++) {
    gridPointDir(k % LENS_COLS, Math.floor(k / LENS_COLS), target);
    const x: Vec3 = [target[0], target[1], target[2]];
    for (let it = 0; it < 200; it++) {
      sampleGrid(forward, x, f);
      const ex = target[0] - f[0];
      const ey = target[1] - f[1];
      const ez = target[2] - f[2];
      x[0] += ex * 0.6;
      x[1] += ey * 0.6;
      x[2] += ez * 0.6;
      const len = Math.hypot(...x);
      x[0] /= len;
      x[1] /= len;
      x[2] /= len;
      if (Math.hypot(ex, ey, ez) < 1e-10) break;
    }
    g.set(x, k * 3);
  }
  return g;
}

export interface LensResult {
  forward: Float64Array;
  inverse: Float64Array;
  exponent: number;
  checks: LensChecks;
  events: number;
}

/** Builds the warp, lowering the exponent until every check passes (section 3). */
export function buildLens(
  events: { lat: number; lon: number }[],
  params: LensParams = LENS_PARAMS,
  log: (m: string) => void = () => {},
): LensResult {
  for (let e = params.exponent; e > 0.01; e -= params.exponentStep) {
    const exponent = Math.round(e * 1000) / 1000;
    const forward = forwardGrid(events, params, exponent);
    const checks = checkLens(forward, params);
    log(
      `lens exponent ${exponent}: area ${checks.minArea.toFixed(2)}..${checks.maxArea.toFixed(2)}, ` +
        `anisotropy ${checks.maxAnisotropy.toFixed(2)}, ratio over ${params.spanKm} km ` +
        `${checks.maxAreaRatio.toFixed(2)}, ${checks.folds} folds`,
    );
    if (passes(checks, params))
      return { forward, inverse: inverseGrid(forward), exponent, checks, events: events.length };
  }
  throw new Error('history lens: no exponent passes the checks');
}
