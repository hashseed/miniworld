// The landmark model of Göbekli Tepe when newly built (spec gobekli-tepe.md):
// round enclosures of rubble wall and bench, with T-shaped limestone pillars
// facing inward and a pair of taller figure-pillars in the middle. Life size in
// metres, +Y up, centred on Enclosure D, open to the sky.

import * as THREE from 'three';
import { type Model, type Vec3, ModelBuilder, blob, box, rod, shade } from './kit.ts';

const STONE_NEW = '#dccdab';
const WALL = '#c4b28d';
const PLASTER = '#cdb59f';
const BEDROCK = '#b8a888';
const BELT = '#a89472';
const PELT = '#b98f62';

/** An enclosure: where it lies (m east and south of D's middle), half-width, and its pillar count. */
interface Ring {
  x: number;
  z: number;
  rx: number;
  rz: number;
  pillars: number;
  /** The way the central pillars face, in radians. */
  facing: number;
  centre: boolean;
}

/** D, then C, B and A (sizes after the excavation, places roughly after its plan). */
const RINGS: Ring[] = [
  { x: 0, z: 0, rx: 5.5, rz: 5, pillars: 8, facing: 0.8, centre: true },
  { x: -13, z: 4, rx: 7.5, rz: 6.5, pillars: 9, facing: 0.5, centre: true },
  { x: -3, z: -13, rx: 4.5, rz: 4, pillars: 7, facing: 0.3, centre: true },
  { x: 13, z: -9, rx: 4, rz: 3.8, pillars: 6, facing: -0.4, centre: true },
];

/** Moves a part built facing +Z at the origin to a place, turned about Y. */
function put(
  g: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  turn: number,
): THREE.BufferGeometry {
  g.rotateY(turn);
  g.translate(x, y, z);
  return g;
}

/** A T-pillar facing +Z: shaft, crossbar, and for a figure-pillar its arms, belt and pelt. */
function pillar(
  mb: ModelBuilder,
  x: number,
  z: number,
  turn: number,
  height: number,
  figure: boolean,
  relief: number,
): void {
  const head = height * 0.22;
  const shaftH = height - head;
  const w = figure ? 1.05 : 0.85;
  const d = figure ? 0.5 : 0.42;
  const stone = shade(STONE_NEW, ((relief * 7) % 5) * 0.012 - 0.02);
  const part = (min: Vec3, max: Vec3, colour: THREE.ColorRepresentation) =>
    mb.add(put(box(min, max), x, 0, z, turn), colour);
  part([-w / 2, 0, -d / 2], [w / 2, shaftH, d / 2], stone);
  part([-w * 1.0, shaftH, -d * 0.6], [w * 1.0, height, d * 0.6], shade(stone, 0.03));
  if (figure) {
    // Arms down the narrow sides, bending in over a belt, hands nearly meeting.
    for (const s of [-1, 1]) {
      part(
        [s * w * 0.5 - 0.09 + (s > 0 ? 0.06 : -0.06), shaftH * 0.34, -d * 0.2],
        [s * w * 0.5 + 0.09 + (s > 0 ? 0.06 : -0.06), shaftH * 0.86, d * 0.65],
        shade(stone, -0.05),
      );
      part(
        [s * w * 0.12, shaftH * 0.46, d * 0.5],
        [s * w * 0.5, shaftH * 0.56, d * 0.68],
        shade(stone, -0.05),
      );
      part(
        [s * 0.02, shaftH * 0.42, d * 0.5],
        [s * 0.2, shaftH * 0.52, d * 0.75],
        shade(stone, 0.02),
      );
    }
    part([-w * 0.52, shaftH * 0.34, d * 0.45], [w * 0.52, shaftH * 0.4, d * 0.62], BELT);
    part([-w * 0.3, shaftH * 0.16, d * 0.45], [w * 0.3, shaftH * 0.34, d * 0.58], PELT);
  } else {
    // A relief animal on the front: fox, boar or snake by the pillar's number.
    const dark = shade(stone, -0.14);
    const kind = relief % 3;
    const f = d * 0.5;
    const rel = (g: THREE.BufferGeometry) => mb.add(put(g, x, 0, z, turn), dark);
    if (kind === 0) {
      rel(blob([0, shaftH * 0.55, f], [0.3, 0.14, 0.05], 6));
      rel(blob([0.3, shaftH * 0.6, f], [0.1, 0.08, 0.05], 5));
      rel(blob([-0.38, shaftH * 0.5, f], [0.22, 0.06, 0.05], 5));
    } else if (kind === 1) {
      rel(blob([0, shaftH * 0.5, f], [0.32, 0.17, 0.05], 6));
      rel(blob([0.3, shaftH * 0.53, f], [0.11, 0.09, 0.05], 5));
    } else {
      for (let i = 0; i < 4; i++)
        rel(
          rod(
            [-0.3 + i * 0.2, shaftH * (0.45 + (i % 2) * 0.14), f],
            [-0.2 + i * 0.2, shaftH * (0.59 - (i % 2) * 0.14), f],
            0.035,
          ),
        );
    }
  }
}

function ring(mb: ModelBuilder, r: Ring, index: number): void {
  // Floor of lime plaster and the bench-and-wall between the pillars.
  mb.add(blob([r.x, 0.02, r.z], [r.rx + 0.4, 0.06, r.rz + 0.4], 24), PLASTER);
  const n = r.pillars * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    const ax = r.x + Math.sin(a) * (r.rx + 0.4);
    const az = r.z + Math.cos(a) * (r.rz + 0.4);
    const bx = r.x + Math.sin(b) * (r.rx + 0.4);
    const bz = r.z + Math.cos(b) * (r.rz + 0.4);
    const len = Math.hypot(bx - ax, bz - az) + 0.1;
    const turn = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    mb.add(
      put(
        box([-len / 2, 0, -0.4], [len / 2, 1.1 + 0.08 * Math.sin(i * 2.1), 0.4]),
        mx,
        0,
        mz,
        turn,
      ),
      shade(WALL, (i % 3) * 0.02),
    );
    mb.add(
      put(box([-len / 2, 0, -0.85], [len / 2, 0.4, -0.35]), mx, 0, mz, turn),
      shade(STONE_NEW, -0.1),
    );
  }
  for (let i = 0; i < r.pillars; i++) {
    const a = ((i + 0.5) / r.pillars) * Math.PI * 2;
    const x = r.x + Math.sin(a) * (r.rx - 0.3);
    const z = r.z + Math.cos(a) * (r.rz - 0.3);
    pillar(mb, x, z, a + Math.PI, 2.5 + 0.2 * Math.sin(i * 1.7 + index), false, i + index);
  }
  if (r.centre) {
    const c = Math.cos(r.facing);
    const s = Math.sin(r.facing);
    for (const side of [-1, 1])
      pillar(
        mb,
        r.x + side * 1.0 * c,
        r.z - side * 1.0 * s,
        r.facing,
        index === 0 ? 4.2 : 3.8,
        true,
        0,
      );
  }
}

/** Göbekli Tepe with its first `rings` enclosures (1 to 4). */
export function buildGobekliTepe(rings = 1): Model {
  const mb = new ModelBuilder([], 0.25);
  const list = RINGS.slice(0, rings);
  const hx = Math.max(...list.map((r) => Math.abs(r.x) + r.rx)) + 3;
  const hz = Math.max(...list.map((r) => Math.abs(r.z) + r.rz)) + 3;
  mb.add(blob([-2, -0.3, -4], [hx, 0.45, hz], 28), BEDROCK);
  list.forEach((r, i) => ring(mb, r, i));
  return mb.build(`gobekli-tepe-${rings}`);
}

// --- The ring as a scene prop (humankind.md section 8.2): Enclosure D alone, in at most 1,000
// triangles, with a gate on the camp's side (+Z) and six building steps. Parts are exact (no clay
// wobble, which cracks the seams of separate faces) and omit faces that cannot be seen: the
// undersides, the backs against the wall, the tops under the crossbars.

const GATE = (22 * Math.PI) / 180;
const WALL_H = 1.12;
const BENCH_H = 0.4;
const OUT = [5.9, 5.4] as const;
const IN = [5.1, 4.6] as const;
const BENCH = [4.6, 4.1] as const;

/** A box without the faces left out of `skip` (any of 'x', 'X', 'y', 'Y', 'z', 'Z': low and high ends). */
function slab(min: Vec3, max: Vec3, skip = ''): THREE.BufferGeometry {
  const lo = min.map((v, i) => Math.min(v, max[i]!)) as Vec3;
  const hi = min.map((v, i) => Math.max(v, max[i]!)) as Vec3;
  const g = box(lo, hi).toNonIndexed();
  const keep = (['X', 'x', 'Y', 'y', 'Z', 'z'] as const).map((f) => !skip.includes(f));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal'] as const) {
    const a = g.getAttribute(name);
    const list: number[] = [];
    for (let face = 0; face < 6; face++)
      if (keep[face])
        for (let i = face * 6; i < face * 6 + 6; i++) list.push(a.getX(i), a.getY(i), a.getZ(i));
    out.setAttribute(name, new THREE.Float32BufferAttribute(list, 3));
  }
  return out;
}

/** A flat-shaded mesh from triangles given as point triples (counter-clockwise from outside). */
function mesh(tris: Vec3[][]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
  g.computeVertexNormals();
  return g;
}

/** The wall and the bench along the ellipse from the gate's one side round to the other. */
function wallArc(
  r: readonly [number, number],
  r2: readonly [number, number],
  h: (a: number) => number,
  faces: string,
): THREE.BufferGeometry {
  const n = 18;
  const tris: Vec3[][] = [];
  const at = (a: number, q: readonly [number, number], y: number): Vec3 => [
    Math.sin(a) * q[0],
    y,
    Math.cos(a) * q[1],
  ];
  const quad = (p: Vec3, q: Vec3, r: Vec3, s: Vec3) => tris.push([p, q, r], [p, r, s]);
  for (let i = 0; i < n; i++) {
    const a = GATE + ((2 * Math.PI - 2 * GATE) * i) / n;
    const b = GATE + ((2 * Math.PI - 2 * GATE) * (i + 1)) / n;
    // Angles run clockwise seen from above (x = sin, z = cos), so outward faces order a to b.
    if (faces.includes('o')) quad(at(a, r, 0), at(a, r, h(a)), at(b, r, h(b)), at(b, r, 0));
    if (faces.includes('i')) quad(at(b, r2, 0), at(b, r2, h(b)), at(a, r2, h(a)), at(a, r2, 0));
    if (faces.includes('t')) quad(at(a, r2, h(a)), at(b, r2, h(b)), at(b, r, h(b)), at(a, r, h(a)));
  }
  if (faces.includes('e'))
    for (const [a, flip] of [
      [GATE, false],
      [2 * Math.PI - GATE, true],
    ] as const) {
      const [p0, p1, p2, p3] = [at(a, r2, 0), at(a, r2, h(a)), at(a, r, h(a)), at(a, r, 0)];
      if (flip) quad(p0, p3, p2, p1);
      else quad(p0, p1, p2, p3);
    }
  return mesh(tris);
}

/** A T-pillar facing +Z: the shaft without its ends, which the floor and the crossbar cover, and the crossbar. */
function tPillar(
  x: number,
  z: number,
  turn: number,
  height: number,
  w: number,
  d: number,
): THREE.BufferGeometry[] {
  const shaftH = height * 0.78;
  const parts = [
    slab([-w / 2, 0, -d / 2], [w / 2, shaftH, d / 2], 'yY'),
    slab([-w, shaftH, -d * 0.6], [w, height, d * 0.6]),
  ];
  for (const g of parts) {
    g.rotateY(turn);
    g.translate(x, 0, z);
  }
  return parts;
}

/** The pillar's pieces put where they belong, turned about Y. */
function moved(g: THREE.BufferGeometry, x: number, z: number, turn: number): THREE.BufferGeometry {
  g.rotateY(turn);
  g.translate(x, 0, z);
  return g;
}

/** The ring prop: bones `build-0` to `build-5`, one per session of raising it (section 8.2). */
export function addGobekliRing(mb: ModelBuilder): void {
  const step = (k: number) => {
    const name = `build-${k}`;
    mb.bone({ name, pivot: [0, 0, 0] });
    return name;
  };
  const rx = 5.5;
  const rz = 5;
  const raw = (g: THREE.BufferGeometry, colour: THREE.ColorRepresentation, bone: string) =>
    mb.add(g, colour, bone, undefined, 0);
  // 0: the bedrock platform and the plaster floor.
  let b = step(0);
  raw(mesh(disc(7.2, 6.7, 0.1, 14)), BEDROCK, b);
  raw(mesh(disc(5.9, 5.4, 0.14, 14)), PLASTER, b);
  // 1: the wall of rubble and the bench along its inside.
  b = step(1);
  raw(
    wallArc(OUT, IN, (a) => WALL_H + 0.07 * Math.sin(a * 6), 'oite'),
    WALL,
    b,
  );
  raw(
    wallArc(IN, BENCH, () => BENCH_H, 'it'),
    shade(STONE_NEW, -0.1),
    b,
  );
  // 2 and 3: the eight ring pillars, the near four, then the far four, facing inward.
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    b = step(1 + (Math.cos(a) > 0 ? 1 : 2));
    const height = 2.5 + 0.2 * Math.sin(i * 1.7);
    const stone = shade(STONE_NEW, ((i * 7) % 5) * 0.012 - 0.02);
    const [x, z] = [Math.sin(a) * (rx - 0.3), Math.cos(a) * (rz - 0.3)];
    const parts = tPillar(0, 0, 0, height, 0.85, 0.42);
    parts.forEach((g, k) => raw(moved(g, x, z, a + Math.PI), k ? shade(stone, 0.03) : stone, b));
  }
  // 4 and 5: the two tall figure-pillars, then their arms, belt and pelt and the reliefs.
  for (const side of [-1, 1]) {
    const c = Math.cos(0.8);
    const s = Math.sin(0.8);
    const [x, z] = [side * c, -side * s];
    const turn = 0.8;
    const [w, d, height] = [1.05, 0.5, 4.2];
    const shaftH = height * 0.78;
    b = step(4);
    tPillar(0, 0, 0, height, w, d).forEach((g, k) =>
      raw(moved(g, x, z, turn), k ? shade(STONE_NEW, 0.03) : STONE_NEW, b),
    );
    b = step(5);
    for (const e of [-1, 1]) {
      raw(
        moved(
          slab(
            [e * w * 0.5 - 0.09, shaftH * 0.34, -d * 0.2],
            [e * w * 0.5 + 0.09, shaftH * 0.86, d * 0.65],
            'yY',
          ),
          x,
          z,
          turn,
        ),
        shade(STONE_NEW, -0.05),
        b,
      );
      raw(
        moved(
          slab(
            [e * w * 0.5 - 0.09, shaftH * 0.46, d * 0.5],
            [e * 0.05, shaftH * 0.56, d * 0.68],
            'z',
          ),
          x,
          z,
          turn,
        ),
        shade(STONE_NEW, -0.05),
        b,
      );
    }
    raw(
      moved(
        slab([-w * 0.52, shaftH * 0.34, d * 0.45], [w * 0.52, shaftH * 0.4, d * 0.62], 'z'),
        x,
        z,
        turn,
      ),
      BELT,
      b,
    );
    raw(
      moved(
        slab([-w * 0.3, shaftH * 0.16, d * 0.45], [w * 0.3, shaftH * 0.34, d * 0.58], 'z'),
        x,
        z,
        turn,
      ),
      PELT,
      b,
    );
  }
  // Reliefs, one low blob on the front of each ring pillar, in the last step.
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    const shaftH = (2.5 + 0.2 * Math.sin(i * 1.7)) * 0.78;
    const kind = i % 3;
    const [x, z] = [Math.sin(a) * (rx - 0.3), Math.cos(a) * (rz - 0.3)];
    const g = blob(
      [0, shaftH * 0.55, 0.21],
      kind === 2 ? [0.34, 0.1, 0.03] : [0.3, 0.15, 0.04],
      5,
      3,
    );
    raw(moved(g, x, z, a + Math.PI), shade(STONE_NEW, -0.16), b);
  }
}

/** A low disc (an ellipse of two radii at its foot, narrowing to the top), closed on top only. */
function disc(r0: number, r1: number, top: number, n: number): Vec3[][] {
  const tris: Vec3[][] = [];
  const pt = (k: number, f: number, y: number): Vec3 => {
    const a = (k / n) * Math.PI * 2;
    return [Math.sin(a) * r0 * f, y, Math.cos(a) * r0 * f * (r1 / r0)];
  };
  for (let k = 0; k < n; k++) {
    tris.push([[0, top, 0], pt(k + 1, 1, top), pt(k, 1, top)]);
    tris.push(
      [pt(k, 1, 0), pt(k, 1, top), pt(k + 1, 1, top)],
      [pt(k, 1, 0), pt(k + 1, 1, top), pt(k + 1, 1, 0)],
    );
  }
  return tris;
}
