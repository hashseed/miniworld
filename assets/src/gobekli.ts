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
