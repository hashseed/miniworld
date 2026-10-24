// Crop tufts (spec neolithic/fields-and-crops.md section 1): a few plants of one crop standing together,
// built from thin pyramids, flat leaves and small fruit, with vertex colours and no ink. The footprint is
// a square one unit wide centred on the origin so tufts one unit apart tile a field; Y is up. A stage
// from 0 to 1 (bare, sprout, green, ripe, stubble) shapes and paints the tuft.

import * as THREE from 'three';
import { detCos, detSin } from '../../app/src/core/detmath.ts';
import { hash01 } from '../../app/src/core/hash.ts';

export const CROPS = [
  'emmer',
  'einkorn',
  'barley',
  'millet',
  'rice',
  'maize',
  'squash',
  'potato',
  'quinoa',
  'taro',
  'banana',
  'flax',
  'lentil',
] as const;
export type CropId = (typeof CROPS)[number];

/** The five named stages: bare, sprout, green, ripe, stubble. */
export const STAGES = [0, 0.25, 0.5, 0.75, 1] as const;
/** The stage the approved model is built at. */
export const RIPE_STAGE = 0.75;

class Acc {
  pos: number[] = [];
  col: number[] = [];
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb = ca, cc = ca) {
    for (const [p, k] of [
      [a, ca],
      [b, cb],
      [c, cc],
    ] as const) {
      this.pos.push(p.x, p.y, p.z);
      this.col.push(k.r, k.g, k.b);
    }
  }
  /** An open cone or frustum along base to tip with `sides` sides (a cone when rTip is 0). */
  frustum(
    base: THREE.Vector3,
    tip: THREE.Vector3,
    rBase: number,
    rTip: number,
    sides: number,
    cBase: THREE.Color,
    cTip = cBase,
  ) {
    const axis = tip.clone().sub(base).normalize();
    const ref = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(axis, ref).normalize();
    const w = new THREE.Vector3().crossVectors(axis, u).normalize();
    const ring = (centre: THREE.Vector3, r: number, i: number) => {
      const t = (i / sides) * Math.PI * 2;
      return centre
        .clone()
        .addScaledVector(u, r * detCos(t))
        .addScaledVector(w, r * detSin(t));
    };
    for (let i = 0; i < sides; i++) {
      const a = ring(base, rBase, i);
      const b = ring(base, rBase, i + 1);
      if (rTip <= 0) this.tri(a, b, tip, cBase, cBase, cTip);
      else {
        const c = ring(tip, rTip, i);
        const d = ring(tip, rTip, i + 1);
        this.tri(a, b, d, cBase, cBase, cTip);
        this.tri(a, d, c, cBase, cTip, cTip);
      }
    }
  }
  /**
   * A flat leaf from `base` along horizontal direction angle `turn`: it rises by `rise`, then falls by
   * `sag` towards the tip, `segments` long (2 triangles for 2 segments, then 2 more per segment).
   */
  leaf(
    base: THREE.Vector3,
    turn: number,
    length: number,
    width: number,
    rise: number,
    sag: number,
    c: THREE.Color,
    cTip = c,
    segments = 2,
  ) {
    const dx = detCos(turn);
    const dz = detSin(turn);
    const point = (t: number, side: number) => {
      const wd = width * Math.sin(Math.PI * Math.min(1, 0.15 + 0.85 * t)) * side;
      const lift = rise * (4 * t * (1 - t) + t * 0.3) - sag * t * t;
      return new THREE.Vector3(
        base.x + dx * length * t - dz * wd,
        Math.max(0, base.y + lift),
        base.z + dz * length * t + dx * wd,
      );
    };
    const rows: THREE.Vector3[][] = [];
    for (let s = 1; s < segments; s++) rows.push([point(s / segments, 1), point(s / segments, -1)]);
    const tip = point(1, 0);
    const colourAt = (t: number) => c.clone().lerp(cTip, t);
    let prev: THREE.Vector3[] = [base, base];
    rows.forEach((row, i) => {
      const t = (i + 1) / segments;
      if (i === 0) this.tri(base, row[0]!, row[1]!, c, colourAt(t));
      else {
        this.tri(prev[0]!, row[0]!, prev[1]!, colourAt(t - 1 / segments));
        this.tri(prev[1]!, row[0]!, row[1]!, colourAt(t));
      }
      prev = row;
    });
    this.tri(prev[0]!, tip, prev[1]!, colourAt(1 - 1 / segments), cTip);
  }
  /** A flat fan of `sides` triangles around `centre`, tilted: the rim is raised by `tilt` towards `turn`. */
  fan(
    centre: THREE.Vector3,
    radius: number,
    sides: number,
    c: THREE.Color,
    turn = 0,
    tilt = 0,
    cRim = c,
  ) {
    const rim = (i: number) => {
      const t = (i / sides) * Math.PI * 2;
      return new THREE.Vector3(
        centre.x + radius * detCos(t),
        Math.max(0, centre.y + tilt * radius * detCos(t - turn) - 0.1 * radius),
        centre.z + radius * detSin(t),
      );
    };
    for (let i = 0; i < sides; i++) this.tri(centre, rim(i + 1), rim(i), c, cRim, cRim);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

interface Look {
  /** Per keyframe (bare, sprout, green, ripe, stubble): plant height factor, fruit amount, colours. */
  h: number[];
  fruit: number[];
  col: string[];
  fruitCol: string[];
}

const SOIL = '#7a5231';
const STRAW = '#cdb26a';

const LOOKS: Record<CropId, Look> = {
  emmer: {
    h: [0, 0.2, 0.75, 1, 0.12],
    fruit: [0, 0, 0, 1, 0],
    col: [SOIL, '#a8cf5a', '#6fa83a', '#d9b04a', STRAW],
    fruitCol: [SOIL, '#a8cf5a', '#8cb24a', '#e8c168', STRAW],
  },
  einkorn: {
    h: [0, 0.18, 0.65, 0.88, 0.12],
    fruit: [0, 0, 0, 1, 0],
    col: [SOIL, '#a8cf5a', '#78ad3c', '#d2a845', STRAW],
    fruitCol: [SOIL, '#a8cf5a', '#8cb24a', '#dcb860', STRAW],
  },
  barley: {
    h: [0, 0.2, 0.7, 0.95, 0.12],
    fruit: [0, 0, 0, 1, 0],
    col: [SOIL, '#a8cf5a', '#76b33f', '#e0c060', STRAW],
    fruitCol: [SOIL, '#a8cf5a', '#8cb24a', '#efd88a', STRAW],
  },
  millet: {
    h: [0, 0.15, 0.7, 1, 0.12],
    fruit: [0, 0, 0, 1, 0],
    col: [SOIL, '#a8cf5a', '#6aa83a', '#c99a3c', STRAW],
    fruitCol: [SOIL, '#a8cf5a', '#7fb040', '#d9a840', STRAW],
  },
  rice: {
    h: [0, 0.2, 0.7, 1, 0.1],
    fruit: [0, 0, 0, 1, 0],
    col: ['#6f6a4c', '#a8d860', '#5fb34a', '#d6bd4e', STRAW],
    fruitCol: ['#6f6a4c', '#a8d860', '#7ab84a', '#e6cf62', STRAW],
  },
  maize: {
    h: [0, 0.12, 0.6, 1, 0.1],
    fruit: [0, 0, 0.3, 1, 0],
    col: [SOIL, '#a8cf5a', '#4f9c35', '#bfae4a', STRAW],
    fruitCol: [SOIL, '#a8cf5a', '#9bc050', '#e6c230', STRAW],
  },
  squash: {
    h: [0, 0.2, 0.8, 1, 0.1],
    fruit: [0, 0, 0.4, 1, 0],
    col: [SOIL, '#a8cf5a', '#4c9a3a', '#6c8f3c', STRAW],
    fruitCol: [SOIL, '#a8cf5a', '#7fa83a', '#e08a2a', STRAW],
  },
  potato: {
    h: [0, 0.2, 0.75, 1, 0.1],
    fruit: [0, 0, 0.2, 1, 0],
    col: [SOIL, '#a8cf5a', '#3f8a3f', '#a8a040', STRAW],
    fruitCol: [SOIL, '#a8cf5a', '#e8e8f0', '#f4f0f8', STRAW],
  },
  quinoa: {
    h: [0, 0.15, 0.65, 1, 0.1],
    fruit: [0, 0, 0.3, 1, 0],
    col: [SOIL, '#a8cf5a', '#6aa545', '#a89a48', STRAW],
    fruitCol: [SOIL, '#a8cf5a', '#9ab850', '#c4544a', STRAW],
  },
  taro: {
    h: [0, 0.3, 0.8, 1, 0.1],
    fruit: [0, 0, 0, 0, 0],
    col: [SOIL, '#7fc060', '#2f8a45', '#2c8040', STRAW],
    fruitCol: [SOIL, SOIL, SOIL, SOIL, STRAW],
  },
  banana: {
    h: [0, 0.2, 0.8, 1, 0.12],
    fruit: [0, 0, 0, 1, 0],
    col: [SOIL, '#9ad060', '#58a838', '#4f9c34', '#9a8a4a'],
    fruitCol: [SOIL, SOIL, '#7aaa3a', '#e8cf3c', STRAW],
  },
  flax: {
    h: [0, 0.2, 0.75, 1, 0.12],
    fruit: [0, 0, 1, 1, 0],
    col: [SOIL, '#a8cf5a', '#7aa84a', '#c9b469', STRAW],
    fruitCol: [SOIL, '#a8cf5a', '#6a9ae0', '#8a6a3a', STRAW],
  },
  lentil: {
    h: [0, 0.2, 0.7, 1, 0.1],
    fruit: [0, 0, 0.3, 1, 0],
    col: [SOIL, '#a8cf5a', '#72a63e', '#b89a48', STRAW],
    fruitCol: [SOIL, '#a8cf5a', '#9ac050', '#c8a85a', STRAW],
  },
};

/** Linear interpolation of per-keyframe values at stage s. */
function along(values: number[], s: number): number {
  const x = Math.min(0.999999, Math.max(0, s)) * 4;
  const i = Math.floor(x);
  return values[i]! + (values[i + 1]! - values[i]!) * (x - i);
}
function colourAt(values: string[], s: number): THREE.Color {
  const x = Math.min(0.999999, Math.max(0, s)) * 4;
  const i = Math.floor(x);
  return new THREE.Color(values[i]).lerp(new THREE.Color(values[i + 1]), x - i);
}

interface Ctx {
  acc: Acc;
  h: number;
  fruit: number;
  c: THREE.Color;
  f: THREE.Color;
  light: THREE.Color;
  /** A stable hash in 0..1 for this tuft's n-th decision. */
  r: (n: number) => number;
}

/** Points on a jittered grid inside the footprint. */
function spots(ctx: Ctx, nx: number, nz: number, jitter = 0.12): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const n = i * 7 + j;
      out.push([
        ((i + 0.5) / nx - 0.5) * 0.9 + (ctx.r(n * 2) - 0.5) * jitter,
        ((j + 0.5) / nz - 0.5) * 0.9 + (ctx.r(n * 2 + 1) - 0.5) * jitter,
      ]);
    }
  return out;
}

const lighter = (c: THREE.Color, k = 0.18) => c.clone().lerp(new THREE.Color(1, 1, 0.8), k);

interface Cereal {
  grid: [number, number];
  height: number;
  ear: number;
  earR: number;
  awn?: number;
  droop?: number;
  sides?: number;
  leaves?: number;
}

function cereal(ctx: Ctx, o: Cereal): void {
  const { acc, h, fruit } = ctx;
  spots(ctx, ...o.grid).forEach(([x, z], i) => {
    const top = o.height * h;
    const lean = (ctx.r(i * 5 + 100) - 0.5) * 0.14;
    const turn = ctx.r(i * 5 + 101) * Math.PI * 2;
    const tip = new THREE.Vector3(x + lean, top, z + lean * 0.6);
    acc.frustum(
      new THREE.Vector3(x, 0, z),
      tip,
      0.022,
      0,
      3,
      ctx.c.clone().multiplyScalar(0.8),
      ctx.c,
    );
    if (o.leaves !== 0 && h > 0.05)
      acc.leaf(
        new THREE.Vector3(x, top * 0.3, z),
        turn,
        0.32 * h,
        0.04,
        0.12 * h,
        0.14 * h,
        ctx.c,
        lighter(ctx.c),
      );
    if (fruit > 0.02) {
      const len = o.ear * fruit;
      const droop = (o.droop ?? 0) * fruit;
      const ex = tip.x + detCos(turn) * len * droop;
      const ez = tip.z + detSin(turn) * len * droop;
      const end = new THREE.Vector3(ex, tip.y + len * (1 - 0.9 * droop) - 0.02, ez);
      acc.frustum(
        tip,
        end,
        o.earR * fruit,
        0,
        o.sides ?? 4,
        ctx.f.clone().multiplyScalar(0.92),
        ctx.f,
      );
      if (o.awn)
        acc.frustum(
          end,
          end
            .clone()
            .add(new THREE.Vector3(detCos(turn) * 0.04, o.awn * fruit, detSin(turn) * 0.04)),
          0.012,
          0,
          3,
          ctx.f,
          lighter(ctx.f, 0.5),
        );
    }
  });
}

function rice(ctx: Ctx): void {
  const { acc, h, fruit } = ctx;
  spots(ctx, 3, 3, 0.1).forEach(([x, z], i) => {
    const top = 0.9 * h;
    const turn = ctx.r(i + 200) * Math.PI * 2;
    const tip = new THREE.Vector3(x + detCos(turn) * 0.05, top, z + detSin(turn) * 0.05);
    acc.frustum(
      new THREE.Vector3(x, 0, z),
      tip,
      0.02,
      0,
      3,
      ctx.c.clone().multiplyScalar(0.8),
      ctx.c,
    );
    if (h > 0.05)
      for (let k = 0; k < (i % 3 === 0 ? 2 : 1); k++)
        acc.leaf(
          new THREE.Vector3(x, top * 0.35, z),
          turn + k * 2.6,
          0.5 * h,
          0.035,
          0.25 * h,
          0.32 * h,
          ctx.c,
          lighter(ctx.c),
          3,
        );
    if (fruit > 0.02) {
      const len = 0.28 * fruit;
      const end = new THREE.Vector3(
        tip.x + detCos(turn) * len * 0.6,
        top - 0.08 * fruit,
        tip.z + detSin(turn) * len * 0.6,
      );
      acc.frustum(tip, end, 0.04 * fruit, 0, 3, ctx.f, ctx.f.clone().multiplyScalar(0.9));
    }
  });
}

function maize(ctx: Ctx): void {
  const { acc, h, fruit } = ctx;
  [
    [-0.22, -0.16],
    [0.2, 0.2],
  ].forEach(([x0, z0], i) => {
    const x = x0! + (ctx.r(i) - 0.5) * 0.08;
    const z = z0! + (ctx.r(i + 9) - 0.5) * 0.08;
    const top = 1.6 * h;
    const base = new THREE.Vector3(x, 0, z);
    const tip = new THREE.Vector3(x, top, z);
    acc.frustum(base, tip, 0.05, 0.034, 4, ctx.c.clone().multiplyScalar(0.85), ctx.c);
    if (h > 0.05) {
      for (let k = 0; k < 5; k++) {
        const y = top * (0.22 + 0.15 * k);
        acc.leaf(
          new THREE.Vector3(x, y, z),
          k * 2.4 + i,
          0.55 * h,
          0.06,
          0.18 * h,
          0.4 * h,
          ctx.c,
          lighter(ctx.c),
          2,
        );
      }
      if (fruit > 0.02 || h > 0.9)
        for (let k = 0; k < 3; k++)
          acc.frustum(
            new THREE.Vector3(x, top, z),
            new THREE.Vector3(x + detCos(k * 2.1) * 0.16, top + 0.22, z + detSin(k * 2.1) * 0.16),
            0.014,
            0,
            3,
            ctx.light,
            lighter(ctx.light, 0.5),
          );
    }
    if (fruit > 0.05) {
      // Cobs: a fat cone in a green husk with golden kernels at its tip.
      for (const side of [-1, 1]) {
        const cy = top * (0.5 + 0.08 * side);
        const out = new THREE.Vector3(detCos(i * 3 + side) * 0.07, 0, detSin(i * 3 + side) * 0.07);
        const a = new THREE.Vector3(x, cy, z).add(out);
        const b = a
          .clone()
          .add(out.clone().multiplyScalar(1.2 * fruit))
          .add(new THREE.Vector3(0, 0.26 * fruit, 0));
        acc.frustum(a, b, 0.075 * fruit, 0, 5, new THREE.Color('#7ba444'), ctx.f);
      }
    }
  });
}

function squash(ctx: Ctx): void {
  const { acc, h, fruit } = ctx;
  const green = ctx.c;
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + ctx.r(k) * 0.8;
    const start = new THREE.Vector3(0, 0.02, 0);
    const mid = new THREE.Vector3(detCos(a) * 0.3 * h, 0.07 * h, detSin(a) * 0.3 * h);
    const end = new THREE.Vector3(detCos(a + 0.5) * 0.52 * h, 0.04 * h, detSin(a + 0.5) * 0.52 * h);
    if (h > 0.05) {
      acc.frustum(start, mid, 0.02, 0.012, 3, green.clone().multiplyScalar(0.8), green);
      acc.frustum(mid, end, 0.012, 0, 3, green, green);
    }
  }
  if (h > 0.05) {
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3 + ctx.r(k + 10);
      const d = 0.2 + 0.2 * ctx.r(k + 20);
      acc.fan(
        new THREE.Vector3(detCos(a) * d * h, 0.1 * h + 0.03 * k * 0.3, detSin(a) * d * h),
        0.19 * h,
        6,
        green.clone().multiplyScalar(0.92),
        a,
        0.25,
        lighter(green),
      );
    }
  }
  if (fruit > 0.05)
    for (let k = 0; k < 2; k++) {
      const a = k * 3.1 + 0.8;
      const g = new THREE.IcosahedronGeometry(0.15 * fruit, 0);
      g.scale(1, 0.75, 1);
      const p = g.getAttribute('position');
      for (let i = 0; i + 2 < p.count; i += 3)
        acc.tri(
          new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).add(
            new THREE.Vector3(detCos(a) * 0.25, 0.1 * fruit, detSin(a) * 0.25),
          ),
          new THREE.Vector3(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)).add(
            new THREE.Vector3(detCos(a) * 0.25, 0.1 * fruit, detSin(a) * 0.25),
          ),
          new THREE.Vector3(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)).add(
            new THREE.Vector3(detCos(a) * 0.25, 0.1 * fruit, detSin(a) * 0.25),
          ),
          ctx.f,
        );
    }
}

function potato(ctx: Ctx): void {
  const { acc, h, fruit } = ctx;
  for (let k = 0; k < 3; k++) {
    const a = k * 2.09 + ctx.r(k);
    const top = new THREE.Vector3(detCos(a) * 0.1, 0.4 * h, detSin(a) * 0.1);
    acc.frustum(
      new THREE.Vector3(0, 0, 0),
      top,
      0.03,
      0,
      3,
      ctx.c.clone().multiplyScalar(0.7),
      ctx.c,
    );
  }
  if (h > 0.05)
    for (let k = 0; k < 10; k++) {
      const a = k * 0.63 + ctx.r(k + 30);
      const y = (0.12 + 0.28 * ctx.r(k + 40)) * h;
      acc.leaf(
        new THREE.Vector3(detCos(a) * 0.04, y, detSin(a) * 0.04),
        a,
        0.4 * h,
        0.1,
        0.06 * h,
        0.12 * h,
        ctx.c,
        lighter(ctx.c, 0.1),
      );
    }
  if (fruit > 0.05)
    for (let k = 0; k < 4; k++) {
      const a = k * 1.6 + 0.4;
      const p = new THREE.Vector3(detCos(a) * 0.17, 0.38 * h, detSin(a) * 0.17);
      acc.frustum(
        p,
        p.clone().add(new THREE.Vector3(0, 0.1 * fruit, 0)),
        0.06 * fruit,
        0,
        3,
        ctx.f.clone().multiplyScalar(0.9),
        ctx.f,
      );
    }
}

function quinoa(ctx: Ctx): void {
  const { acc, h, fruit } = ctx;
  const top = 1.35 * h;
  const base = new THREE.Vector3(0, 0, 0);
  const tip = new THREE.Vector3(0, top, 0);
  acc.frustum(base, tip, 0.05, 0.03, 4, ctx.c.clone().multiplyScalar(0.8), ctx.c);
  if (h > 0.05)
    for (let k = 0; k < 6; k++)
      acc.leaf(
        new THREE.Vector3(0, top * (0.2 + 0.1 * k), 0),
        k * 1.7,
        0.3 * h,
        0.07,
        0.08 * h,
        0.1 * h,
        ctx.c,
        lighter(ctx.c),
      );
  const head = ctx.c.clone().lerp(ctx.f, fruit);
  if (h > 0.2) {
    const size = 0.5 * h * (0.25 + 0.75 * Math.max(fruit, 0.2));
    acc.frustum(
      new THREE.Vector3(0, top - size, 0),
      new THREE.Vector3(0, top + 0.06, 0),
      0.13 * h,
      0.05 * h,
      6,
      head.clone().multiplyScalar(0.9),
      head,
    );
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI + 0.6;
      const b = new THREE.Vector3(detCos(a) * 0.1, top * 0.7, detSin(a) * 0.1);
      acc.frustum(
        b,
        b.clone().add(new THREE.Vector3(detCos(a) * 0.06, size * 0.7, detSin(a) * 0.06)),
        0.06 * h,
        0,
        5,
        head.clone().multiplyScalar(0.9),
        head,
      );
    }
  }
}

function taro(ctx: Ctx): void {
  const { acc, h } = ctx;
  for (let k = 0; k < 4; k++) {
    const a = k * 1.571 + 0.4 + ctx.r(k) * 0.3;
    const reach = 0.12 + 0.14 * (k % 2);
    const base = new THREE.Vector3(detCos(a) * 0.1, 0, detSin(a) * 0.1);
    const top = new THREE.Vector3(
      base.x + detCos(a) * reach * h,
      (0.65 + 0.15 * (k % 2)) * h,
      base.z + detSin(a) * reach * h,
    );
    acc.frustum(base, top, 0.03, 0.02, 3, ctx.c.clone().multiplyScalar(0.7), ctx.c);
    if (h > 0.05) {
      // A heart: a fan of seven triangles with the notch at the stalk.
      acc.fan(top, 0.3 * h, 7, ctx.c.clone().multiplyScalar(0.95), a, 0.35, lighter(ctx.c, 0.12));
    }
  }
}

function banana(ctx: Ctx): void {
  const { acc, h, fruit } = ctx;
  const stem = 0.95 * h;
  acc.frustum(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, stem, 0),
    0.12,
    0.08,
    6,
    ctx.c.clone().multiplyScalar(0.8),
    ctx.c,
  );
  if (h > 0.05)
    for (let k = 0; k < 6; k++)
      acc.leaf(
        new THREE.Vector3(0, stem, 0),
        k * 1.05 + 0.2,
        1.2 * h,
        0.14,
        0.5 * h,
        0.75 * h,
        ctx.c,
        lighter(ctx.c, 0.1),
        3,
      );
  if (fruit > 0.05) {
    const hang = new THREE.Vector3(0.1, stem - 0.05, 0);
    acc.frustum(
      hang,
      hang.clone().add(new THREE.Vector3(0.12 * fruit, -0.15 * fruit, 0)),
      0.02,
      0.015,
      3,
      new THREE.Color('#6a4a2a'),
    );
    for (let hand = 0; hand < 2; hand++)
      for (let k = 0; k < 4; k++) {
        const a = hand * 0.9 + k * 1.57;
        const p = new THREE.Vector3(
          0.22 + detCos(a) * 0.05,
          stem - 0.2 - hand * 0.14,
          detSin(a) * 0.05,
        ).multiplyScalar(1);
        p.y = stem - 0.2 - hand * 0.15;
        acc.frustum(
          p,
          p.clone().add(new THREE.Vector3(0.03, -0.17 * fruit, 0)),
          0.035 * fruit,
          0.01,
          4,
          ctx.f,
          ctx.f.clone().multiplyScalar(0.8),
        );
      }
  }
}

function flax(ctx: Ctx): void {
  const { acc, h, fruit } = ctx;
  spots(ctx, 3, 3, 0.1).forEach(([x, z], i) => {
    const top = 0.85 * h;
    const lean = (ctx.r(i + 300) - 0.5) * 0.1;
    const tip = new THREE.Vector3(x + lean, top, z);
    acc.frustum(
      new THREE.Vector3(x, 0, z),
      tip,
      0.018,
      0,
      3,
      ctx.c.clone().multiplyScalar(0.8),
      ctx.c,
    );
    if (fruit > 0.02) {
      if (ctx.r(i + 310) < 0.5 && ctx.f.b > ctx.f.r)
        acc.fan(tip.clone().add(new THREE.Vector3(0, 0.02, 0)), 0.07, 4, ctx.f, 0, 0.3, ctx.f);
      else if (ctx.f.b <= ctx.f.r)
        acc.frustum(
          tip,
          tip.clone().add(new THREE.Vector3(0, 0.07, 0)),
          0.035,
          0,
          3,
          ctx.f,
          ctx.f.clone().multiplyScalar(0.8),
        );
    }
  });
}

function lentil(ctx: Ctx): void {
  const { acc, h, fruit } = ctx;
  spots(ctx, 2, 2, 0.15).forEach(([x, z], i) => {
    const top = 0.5 * h;
    acc.frustum(
      new THREE.Vector3(x, 0, z),
      new THREE.Vector3(x, top, z),
      0.02,
      0,
      3,
      ctx.c.clone().multiplyScalar(0.8),
      ctx.c,
    );
    if (h > 0.05)
      for (let k = 0; k < 4; k++)
        acc.leaf(
          new THREE.Vector3(x, top * (0.35 + 0.18 * k), z),
          k * 1.6 + i,
          0.22 * h,
          0.05,
          0.08 * h,
          0.1 * h,
          ctx.c,
          lighter(ctx.c),
        );
    if (fruit > 0.05)
      for (let k = 0; k < 2; k++)
        acc.frustum(
          new THREE.Vector3(x, top * 0.65, z),
          new THREE.Vector3(
            x + detCos(k * 3 + i) * 0.1 * fruit,
            top * 0.65 - 0.02,
            z + detSin(k * 3 + i) * 0.1 * fruit,
          ),
          0.025 * fruit,
          0,
          3,
          ctx.f,
          ctx.f.clone().multiplyScalar(0.85),
        );
  });
}

/** Tilled ground with no plant: a few low clods. */
function clods(ctx: Ctx, colour: THREE.Color): void {
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + ctx.r(k) * 1.2;
    const d = 0.18 + 0.15 * ctx.r(k + 5);
    const p = new THREE.Vector3(detCos(a) * d, 0, detSin(a) * d);
    ctx.acc.frustum(
      p,
      p.clone().add(new THREE.Vector3(0, 0.07 + 0.03 * ctx.r(k + 8), 0)),
      0.15,
      0,
      5,
      colour.clone().multiplyScalar(0.8),
      colour,
    );
  }
}

/** The stubble left after the harvest: short cut stalks among the clods. */
function stubble(ctx: Ctx): void {
  clods(ctx, new THREE.Color(SOIL));
  spots(ctx, 3, 3, 0.2).forEach(([x, z], i) => {
    if (i % 2 === 0)
      ctx.acc.frustum(
        new THREE.Vector3(x, 0, z),
        new THREE.Vector3(x, 0.11 + 0.03 * ctx.r(i + 400), z),
        0.022,
        0.014,
        3,
        ctx.c.clone().multiplyScalar(0.8),
        ctx.c,
      );
  });
}

const BUILD: Record<CropId, (ctx: Ctx) => void> = {
  emmer: (c) => cereal(c, { grid: [3, 3], height: 0.95, ear: 0.2, earR: 0.05, awn: 0.08 }),
  einkorn: (c) =>
    cereal(c, { grid: [3, 3], height: 0.85, ear: 0.2, earR: 0.035, sides: 3, awn: 0.05 }),
  barley: (c) =>
    cereal(c, { grid: [3, 3], height: 0.95, ear: 0.22, earR: 0.05, awn: 0.2, droop: 0.4 }),
  millet: (c) =>
    cereal(c, { grid: [2, 3], height: 1.25, ear: 0.3, earR: 0.075, sides: 5, droop: 0.7 }),
  rice,
  maize,
  squash,
  potato,
  quinoa,
  taro,
  banana,
  flax,
  lentil,
};

/** The tuft of a crop at a stage from 0 (bare) to 1 (stubble), as a coloured geometry. */
export function cropGeometry(id: CropId, stage: number): THREE.BufferGeometry {
  const look = LOOKS[id];
  const seed = CROPS.indexOf(id) + 1;
  const acc = new Acc();
  const s = Math.min(1, Math.max(0, stage));
  const c = colourAt(look.col, s);
  const ctx: Ctx = {
    acc,
    h: along(look.h, s),
    fruit: along(look.fruit, s),
    c,
    f: colourAt(look.fruitCol, s),
    light: lighter(c, 0.4),
    r: (n) => hash01(seed, n, 71),
  };
  if (s < 0.01) clods(ctx, id === 'rice' ? new THREE.Color('#6f6a4c') : new THREE.Color(SOIL));
  else if (s > 0.99) stubble(ctx);
  else BUILD[id](ctx);
  return acc.geometry();
}

export function cropTriangles(id: CropId, stage: number): number {
  return cropGeometry(id, stage).getAttribute('position').count / 3;
}

/** Spacing of the tufts in a field, in layout metres (spec section 1.2). */
export const CROP_SPACING_M: Record<CropId, number> = {
  emmer: 0.11,
  einkorn: 0.11,
  barley: 0.11,
  flax: 0.11,
  lentil: 0.11,
  millet: 0.2,
  rice: 0.2,
  maize: 0.2,
  squash: 0.2,
  potato: 0.2,
  quinoa: 0.2,
  taro: 0.2,
  banana: 0.4,
};
