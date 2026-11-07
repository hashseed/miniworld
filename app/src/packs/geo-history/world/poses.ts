// The plate poses of the geo-history pack (geo-history.md, section 5.1): the
// rotation model of the plate model and the pose of every plate at any age.
//
// A rotation row says how a plate sits relative to a fixed plate at one age.
// Between two ages of the same plate the rotation is interpolated along the
// great circle, as GPlates does, and composed with the pose of its fixed
// plate up the tree, so each plate ends with one unit quaternion: its pose.
// This code uses sin, cos and acos, so the last bits of a pose may differ
// between devices; nothing branches on them (see geo-history.md, section 10).

export type Quat = readonly [number, number, number, number];

export const IDENTITY: Quat = [0, 0, 0, 1];

const DEG = Math.PI / 180;

/** A rotation row: [plate, age Ma, pole lat, pole lon, angle in degrees, fixed plate]. */
export type RotationRow = readonly number[];

interface Entry {
  age: number;
  q: Quat;
  fixed: number;
}

export function mul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function conjugate(a: Quat): Quat {
  return [-a[0], -a[1], -a[2], a[3]];
}

/** Unit quaternion for a rotation of `angleDeg` about the pole at (lat, lon) degrees. */
export function fromPole(latDeg: number, lonDeg: number, angleDeg: number): Quat {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const half = (angleDeg * DEG) / 2;
  const s = Math.sin(half);
  return [
    Math.cos(lat) * Math.cos(lon) * s,
    Math.cos(lat) * Math.sin(lon) * s,
    Math.sin(lat) * s,
    Math.cos(half),
  ];
}

/** Spherical linear interpolation along the shorter arc. */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    dot = -dot;
  }
  let ka: number;
  let kb: number;
  if (dot > 0.99995) {
    ka = 1 - t;
    kb = t;
  } else {
    const theta = Math.acos(dot);
    const s = Math.sin(theta);
    ka = Math.sin((1 - t) * theta) / s;
    kb = Math.sin(t * theta) / s;
  }
  const x = ka * a[0] + kb * bx;
  const y = ka * a[1] + kb * by;
  const z = ka * a[2] + kb * bz;
  const w = ka * a[3] + kb * bw;
  const n = Math.sqrt(x * x + y * y + z * z + w * w);
  return [x / n, y / n, z / n, w / n];
}

/** Rotate the unit vector (x, y, z) by `q`. */
export function rotate(q: Quat, v: readonly [number, number, number]): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const [x, y, z] = v;
  // t = 2 q.xyz × v; v' = v + w t + q.xyz × t
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ];
}

export class RotationModel {
  private readonly tracks = new Map<number, Entry[]>();

  constructor(rows: readonly RotationRow[]) {
    for (const r of rows) {
      const plate = r[0]!;
      const entry: Entry = { age: r[1]!, q: fromPole(r[2]!, r[3]!, r[4]!), fixed: r[5]! };
      const list = this.tracks.get(plate);
      if (list) list.push(entry);
      else this.tracks.set(plate, [entry]);
    }
    for (const list of this.tracks.values()) list.sort((a, b) => a.age - b.age);
  }

  /** Ids of all plates that have a rotation track. */
  plates(): number[] {
    return [...this.tracks.keys()];
  }

  /** The youngest and the oldest age of a plate's track, in Ma. */
  span(plate: number): [number, number] | undefined {
    const list = this.tracks.get(plate);
    return list ? [list[0]!.age, list[list.length - 1]!.age] : undefined;
  }

  /** The pose of `plate` at `age` Ma: where its present-day points are, in the model's frame. */
  absolute(plate: number, age: number, memo?: Map<number, Quat>): Quat {
    if (plate === 0) return IDENTITY;
    const cached = memo?.get(plate);
    if (cached) return cached;
    const list = this.tracks.get(plate);
    let result: Quat = IDENTITY;
    if (list) {
      let hi = 0;
      while (hi < list.length && list[hi]!.age < age) hi++;
      if (hi === 0 || hi === list.length) {
        // Before the first or after the last age: hold the nearest rotation.
        const e = list[hi === 0 ? 0 : list.length - 1]!;
        result = mul(this.absolute(e.fixed, age, memo), e.q);
      } else {
        const e1 = list[hi]!;
        const e0 = list[hi - 1]!;
        const t = e1.age === e0.age ? 0 : (age - e0.age) / (e1.age - e0.age);
        if (e0.fixed === e1.fixed) {
          result = mul(this.absolute(e0.fixed, age, memo), slerp(e0.q, e1.q, t));
        } else {
          // The fixed plate changes between the two ages: interpolate the poses themselves.
          const a0 = mul(this.absolute(e0.fixed, e0.age), e0.q);
          const a1 = mul(this.absolute(e1.fixed, e1.age), e1.q);
          result = slerp(a0, a1, t);
        }
      }
    }
    memo?.set(plate, result);
    return result;
  }

  /** Poses of every plate at `age`, by plate id. */
  poses(age: number): Map<number, Quat> {
    const memo = new Map<number, Quat>();
    for (const p of this.tracks.keys()) this.absolute(p, age, memo);
    return memo;
  }
}
