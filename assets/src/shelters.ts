// Shelters and camp props of the first culture profiles (spec milestone 2,
// section 13.3). Life size in metres, door facing +Z.

import * as THREE from 'three';
import {
  type Model,
  type Vec3,
  ModelBuilder,
  STONE,
  blob,
  cone,
  horn,
  lathe,
  rod,
  sheet,
  shade,
} from './kit.ts';
import type { Profile } from './people.ts';

export const SHELTERS = [
  'shelter-hide-tent',
  'shelter-mammoth-bone-hut',
  'shelter-windbreak',
  'shelter-grass-hut',
  'shelter-lean-to',
  'shelter-bark',
  'shelter-natufian-house',
  'prop-drying-rack',
  'prop-carry-pole',
  'prop-spit',
  'prop-canoe',
  'prop-red-flag',
  'shelter-small-hut',
  // Scenes at anchors (humankind.md section 8.2).
  'prop-cave-wall-sulawesi',
  'prop-cave-wall-chauvet',
  'prop-burial',
  'prop-death-skull',
] as const;
export type ShelterId = (typeof SHELTERS)[number];

/** Radius of the carrying pole; its middle stands this high when it lies on the ground. */
export const POLE_R = 0.045;

/** Bones named this and a number are the steps of putting a shelter up, in order. */
export const BUILD_BONE = 'build-';

/** The shelter of each hunter-gatherer profile's camp; later profiles live in towns. */
export const CAMP_SHELTER: Partial<Record<Profile, ShelterId>> = {
  'african-stone-age': 'shelter-grass-hut',
  neanderthal: 'shelter-windbreak',
  // A closed hut, not the open lean-to: new people step out of their lodging, which an
  // open shelter cannot hide (Yang, 2026-10-19; milestone-2 section 13.3).
  'coastal-asia-hunter': 'shelter-grass-hut',
  'first-australians': 'shelter-bark',
  'ice-age-hunter': 'shelter-hide-tent',
  'steppe-beringia-hunter': 'shelter-hide-tent',
  natufian: 'shelter-natufian-house',
  // Hide tents until their own shelters are made (peopling.md section 9.1).
  'west-asia-hunter': 'shelter-hide-tent',
  'east-asia-hunter': 'shelter-hide-tent',
  'first-americans': 'shelter-hide-tent',
};

const POLE = '#7a5030';
const HIDE = '#b58b5c';
const BONE = '#ece2cc';
const THATCH = '#cdb26a';
const DOOR = '#3a2a20';

const ring = (n: number, r: number, y: number, f: (p: Vec3, a: number, i: number) => void) => {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    f([Math.sin(a) * r, y, Math.cos(a) * r], a, i);
  }
};

/**
 * Turns a two-sided sheet into one side facing away from the shelter's middle, with
 * normals pointing out, so a shell of sheets shades like a dome.
 */
function outward(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const n = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i) * 0.7, p.getZ(i)).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  // Keep only the side that faces out: the clay shader flips the normal of back faces.
  const index = g.getIndex()!.array;
  const kept: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    const [i, j, k] = [index[t]!, index[t + 1]!, index[t + 2]!];
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, j).sub(a);
    c.fromBufferAttribute(p, k).sub(a);
    b.cross(c);
    if (b.dot(v.set(n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!)) > 0) kept.push(i, j, k);
  }
  g.setIndex(kept);
  return g;
}

export function buildShelter(id: ShelterId): Model {
  const mb = new ModelBuilder();
  switch (id) {
    case 'shelter-hide-tent': {
      // A cone of sewn hides on poles that cross above the smoke hole.
      const h = 3.0;
      const r = 2.0;
      const panels = 6;
      for (let i = 0; i < panels; i++) {
        const a0 = (i / panels) * Math.PI * 2;
        const a1 = ((i + 1) / panels) * Math.PI * 2;
        const rows: Vec3[][] = [];
        for (let t = 0; t <= 3; t++) {
          const y = (t / 3) * h * 0.86;
          const rr = r * (1 - y / h);
          const row: Vec3[] = [];
          for (let k = 0; k <= 3; k++) {
            const a = a0 + ((a1 - a0) * k) / 3;
            const bulge = 1 + 0.05 * Math.sin((k / 3) * Math.PI);
            row.push([Math.sin(a) * rr * bulge, y, Math.cos(a) * rr * bulge]);
          }
          rows.push(row);
        }
        const door = i === 0;
        mb.add(sheet(rows), door ? shade(HIDE, -0.15) : shade(HIDE, (i % 3) * 0.06 - 0.04));
      }
      ring(panels, r, 0, (p) => {
        mb.add(
          rod([p[0] * 1.02, 0, p[2] * 1.02], [-p[0] * 0.12, h * 1.12, -p[2] * 0.12], 0.045, 5),
          POLE,
        );
        mb.add(blob([p[0] * 1.05, 0.08, p[2] * 1.05], [0.16, 0.12, 0.16], 5), STONE);
      });
      // Seams, the door opening and the smoke hole.
      mb.add(blob([0, 0.6, r * 0.79], [0.4, 0.6, 0.06], 7), DOOR);
      mb.add(
        lathe(
          [
            [0.27, 0],
            [0.24, 0.06],
          ],
          [0, h * 0.86, 0],
          8,
        ),
        shade(HIDE, -0.35),
      );
      break;
    }
    case 'shelter-mammoth-bone-hut': {
      // Mezhyrich: a hide dome held down by mammoth jaws, tusks and long bones.
      mb.add(
        lathe(
          [
            [2.5, 0],
            [2.45, 0.6],
            [2.1, 1.5],
            [1.2, 2.25],
            [0, 2.5],
          ],
          [0, 0, 0],
          12,
        ),
        shade(HIDE, -0.05),
      );
      ring(14, 2.55, 0.25, (p, a, i) => {
        mb.add(blob(p, [0.44, 0.28, 0.22], 5), i % 2 ? BONE : shade(BONE, -0.08));
        void a;
      });
      ring(10, 2.4, 0.7, (p) => mb.add(blob(p, [0.38, 0.24, 0.2], 5), shade(BONE, -0.04)));
      ring(7, 0, 0, (_p, a) => {
        const s = Math.sin(a);
        const c = Math.cos(a);
        mb.add(rod([s * 2.3, 0.9, c * 2.3], [s * 1.05, 2.2, c * 1.05], 0.07, 5), BONE);
      });
      // Tusk arch over the door.
      mb.add(horn([0.75, 0, 2.35], [0.9, 1.9, 2.75], [-0.1, 1.95, 2.55], 0.13, 0.07, 8, 6), BONE);
      mb.add(horn([-0.75, 0, 2.35], [-0.9, 1.9, 2.75], [0.1, 1.95, 2.55], 0.13, 0.07, 8, 6), BONE);
      mb.add(blob([0, 0.62, 2.42], [0.5, 0.62, 0.14], 7), DOOR);
      break;
    }
    case 'shelter-windbreak': {
      // A rock overhang with a hide windbreak on a curved row of poles.
      mb.add(blob([0, 1.2, -2.3], [3.0, 1.6, 0.9], 10), '#8e877c');
      mb.add(blob([0.3, 2.55, -1.75], [2.8, 0.45, 1.3], 10), '#a39b8e');
      mb.add(blob([-2.4, 0.5, -1.4], [0.8, 0.7, 0.8], 7), '#857e72');
      const poles: Vec3[] = [];
      for (let i = 0; i <= 4; i++) {
        const a = -0.9 + (i / 4) * 1.8;
        poles.push([Math.sin(a) * 2.2, 0, Math.cos(a) * 2.2 - 1.0]);
      }
      for (const p of poles) mb.add(rod(p, [p[0], 1.55, p[2]], 0.05, 5), POLE);
      const rows: Vec3[][] = [0, 0.7, 1.35].map((y) =>
        poles.map((p) => [p[0] * 0.99, y + 0.1, p[2] * 0.99 + 0.02] as Vec3),
      );
      mb.add(sheet(rows), shade(HIDE, -0.1));
      break;
    }
    case 'shelter-grass-hut': {
      // A forager's brush hut, as the Hadza and San build in an afternoon and leave when they
      // move on: a small dome of bent branches with bundles of grass laid loosely over it.
      // Each step of building is its own bone (BUILD_BONE), so a band puts it up in order:
      // the frame first, then the grass from the ground up (spec humankind.md, section 8.1).
      const R = 1.2;
      const H = 1.35;
      const step = (k: number, y: number) => {
        mb.bone({ name: `${BUILD_BONE}${k}`, pivot: [0, y, 0] });
        return `${BUILD_BONE}${k}`;
      };
      const dome = (a: number, t: number, out = 1): Vec3 => {
        const r = R * out * Math.cos((t * Math.PI) / 2);
        return [Math.sin(a) * r, H * out * Math.sin((t * Math.PI) / 2), Math.cos(a) * r];
      };
      // The frame: branches pushed into the ground and bent over, their tips poking out on
      // top; none stands in the doorway.
      const frame = step(0, 0);
      ring(7, 1, 0, (_p, a0) => {
        const a = a0 + Math.PI / 7;
        const bend = a + 0.25;
        mb.add(rod(dome(a, 0, 0.92), dome(a, 0.4, 0.92), 0.045, 4), POLE, frame);
        mb.add(rod(dome(a, 0.4, 0.92), dome((a + bend) / 2, 0.8, 0.92), 0.04, 4), POLE, frame);
        mb.add(
          rod(dome((a + bend) / 2, 0.8, 0.92), dome(bend + Math.PI, 0.86, 1.15), 0.035, 4),
          POLE,
          frame,
        );
      });
      // The grass: armfuls laid on the frame in three overlapping rows from the ground up,
      // their ends hanging ragged, leaving the doorway open in the bottom row.
      const rows: [number, number, number][] = [
        [0, 0.45, 8],
        [0.33, 0.75, 7],
        [0.62, 1, 5],
      ];
      rows.forEach(([t0, t1, n], j) => {
        const bone = step(j + 1, Math.max(0, dome(0, t0)[1] - 0.1));
        for (let i = 0; i < n; i++) {
          const mid = ((i + 0.5 * j) / n) * Math.PI * 2;
          const fromDoor = Math.abs(Math.atan2(Math.sin(mid), Math.cos(mid)));
          if (j === 0 && fromDoor < 0.4) continue;
          const half = (Math.PI / n) * 1.25;
          const cols = 7;
          const top: Vec3[] = [];
          const bottom: Vec3[] = [];
          for (let k = 0; k < cols; k++) {
            const a = mid - half + (2 * half * k) / (cols - 1);
            top.push(dome(a, Math.min(0.97, t1), 1.0));
            const b = dome(a, t0, 1.1 + 0.03 * j);
            const tip = k % 2 === 1 ? 0.16 + 0.05 * Math.sin(i * 2.1 + k + j) : 0;
            bottom.push([b[0], Math.max(0.02, b[1] - tip), b[2]]);
          }
          mb.add(
            outward(sheet([top, bottom])),
            shade(THATCH, 0.12 * Math.sin(i * 2.3 + j) - 0.06 * j),
            bone,
          );
        }
        // A closed band of grass under each row, so no gap shows the ground or the frame.
        const band: [number, number][] = [];
        for (let k = 0; k <= 2; k++) {
          const p = dome(0, t0 + ((Math.min(0.97, t1) - t0) * k) / 2, 0.97);
          band.push([Math.max(0.05, p[2]), p[1]]);
        }
        mb.add(lathe(band, [0, 0, 0], 9), shade(THATCH, -0.12), bone);
        // The doorway: a low, shadowed opening under the grass.
        if (j === 0) mb.add(blob(dome(0, 0.2, 0.99), [0.3, 0.36, 0.08], 6), '#5b3b26', bone);
        if (j === rows.length - 1)
          mb.add(
            lathe(
              [
                [0.45, 0],
                [0.25, 0.14],
                [0.02, 0.2],
              ],
              [0, H * 0.93, 0],
              7,
            ),
            shade(THATCH, -0.1),
            bone,
          );
      });
      break;
    }
    case 'shelter-lean-to': {
      // Two forked posts, a ridge pole and a sloping roof of branches and palm leaves.
      for (const x of [-1.6, 1.6]) {
        mb.add(rod([x, 0, 0.6], [x, 1.8, 0.6], 0.07, 5), POLE);
        mb.add(rod([x, 1.65, 0.6], [x + 0.15, 2.0, 0.6], 0.04, 4), POLE);
      }
      mb.add(rod([-1.9, 1.85, 0.6], [1.9, 1.85, 0.6], 0.06, 5), POLE);
      for (let i = 0; i < 6; i++) {
        const x = -1.6 + (i / 5) * 3.2;
        mb.add(rod([x, 1.9, 0.65], [x * 1.05, 0.05, -1.6], 0.035, 4), POLE);
      }
      for (let i = 0; i < 4; i++) {
        const y = 1.85 - i * 0.45;
        const z = 0.6 - i * 0.55;
        const rows: Vec3[][] = [
          [
            [-1.95, y + 0.08, z + 0.08],
            [0, y + 0.12, z + 0.08],
            [1.95, y + 0.08, z + 0.08],
          ],
          [
            [-1.95, y - 0.5, z - 0.62],
            [0, y - 0.46, z - 0.62],
            [1.95, y - 0.5, z - 0.62],
          ],
        ];
        mb.add(sheet(rows), shade('#6f8a45', (i % 2) * 0.1 - 0.05));
      }
      break;
    }
    case 'shelter-bark': {
      // Curved sheets of bark over bent saplings.
      for (let i = 0; i < 5; i++) {
        const a = -1.25 + (i / 4) * 2.5;
        mb.add(
          horn(
            [Math.sin(a) * 1.9, 0, Math.cos(a) * 1.9 - 0.6],
            [Math.sin(a) * 1.5, 2.2, Math.cos(a) * 1.5 - 0.6],
            [Math.sin(a) * 0.1, 1.8, -0.6],
            0.04,
            0.03,
            6,
            4,
          ),
          POLE,
        );
      }
      const slabs = 5;
      for (let s = 0; s < slabs; s++) {
        const a0 = -1.3 + (s / slabs) * 2.6 - 0.05;
        const a1 = -1.3 + ((s + 1) / slabs) * 2.6 + 0.05;
        const rows: Vec3[][] = [];
        for (let t = 0; t <= 4; t++) {
          const phi = (t / 4) * (Math.PI / 2) * 0.92;
          const rr = 1.95 * Math.cos(phi);
          const y = 1.75 * Math.sin(phi);
          rows.push(
            [a0, (a0 + a1) / 2, a1].map(
              (a) => [Math.sin(a) * rr, y, Math.cos(a) * rr - 0.6] as Vec3,
            ),
          );
        }
        mb.add(sheet(rows), shade('#7d6650', (s % 2) * 0.1 - 0.06));
      }
      break;
    }
    case 'shelter-natufian-house': {
      // Ain Mallaha: a round house sunk into the ground on a ring of stones, with a brush roof.
      mb.add(
        lathe(
          [
            [2.6, 0],
            [2.55, 0.35],
            [2.35, 0.42],
          ],
          [0, 0, 0],
          12,
        ),
        '#9a8463',
      );
      ring(12, 2.45, 0.38, (p, _a, i) =>
        mb.add(blob(p, [0.42, 0.28, 0.34], 5), shade(STONE, (i % 3) * 0.06 - 0.06)),
      );
      ring(10, 2.32, 0.78, (p, _a, i) =>
        mb.add(blob(p, [0.4, 0.24, 0.32], 5), shade(STONE, (i % 2) * 0.08)),
      );
      mb.add(
        lathe(
          [
            [2.7, 0.95],
            [2.0, 1.6],
            [0.9, 2.5],
            [0.1, 2.9],
          ],
          [0, 0, 0],
          12,
        ),
        shade(THATCH, -0.12),
      );
      mb.add(rod([0, 2.6, 0], [0.1, 3.3, 0.05], 0.06, 5), POLE);
      mb.add(blob([0, 0.7, 2.4], [0.45, 0.55, 0.2], 7), DOOR);
      break;
    }
    case 'prop-drying-rack': {
      for (const x of [-1.1, 1.1]) mb.add(rod([x, 0, 0], [x, 1.9, 0], 0.06, 5), POLE);
      mb.add(rod([-1.25, 1.8, 0], [1.25, 1.8, 0], 0.05, 5), POLE);
      const rows: Vec3[][] = [
        [
          [-0.85, 1.75, 0.05],
          [0, 1.78, 0.08],
          [0.85, 1.75, 0.05],
        ],
        [
          [-0.95, 0.95, 0.12],
          [0, 0.85, 0.18],
          [0.95, 0.95, 0.12],
        ],
        [
          [-0.7, 0.35, 0.08],
          [0, 0.25, 0.1],
          [0.7, 0.35, 0.08],
        ],
      ];
      mb.add(sheet(rows), '#c9a171');
      break;
    }
    case 'prop-spit': {
      // A roasting spit over the fire (humankind.md section 8.1): two forked sticks
      // either side, a crossbar resting in the forks, a joint of meat on it.
      for (const z of [-0.75, 0.75]) {
        mb.add(rod([0, 0, z], [0, 0.78, z], 0.035, 5), POLE);
        for (const s of [-1, 1]) mb.add(rod([0, 0.7, z], [s * 0.08, 0.86, z], 0.025, 4), POLE);
      }
      mb.add(rod([0, 0.79, -0.95], [0, 0.79, 0.95], 0.03, 5), POLE);
      mb.add(blob([0, 0.76, 0], [0.16, 0.13, 0.3], 7), '#8b3a26');
      break;
    }
    case 'shelter-small-hut': {
      // A small brush shelter for one family (sites.md section 2: minimal camps), where land
      // is too narrow for a full camp: a few branches leant together into a low half dome,
      // its open side the door, towards the hearth (+Z), and leafy boughs laid over it.
      const R = 0.85;
      const H = 1.0;
      const apex: Vec3 = [0, H, -0.15];
      const step = (k: number) => {
        mb.bone({ name: `${BUILD_BONE}${k}`, pivot: [0, 0, 0] });
        return `${BUILD_BONE}${k}`;
      };
      const frame = step(0);
      // Six branches from the back half of a ring to the apex; none across the door.
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (0.25 + (1.5 * i) / 5);
        mb.add(rod([Math.sin(a) * R, 0, Math.cos(a) * R], apex, 0.035, 4), POLE, frame);
      }
      // The boughs: leafy clumps over the frame in two rows, low and high, open at the door.
      const leaves = step(1);
      for (const [t, n, size] of [
        [0.3, 6, 0.32],
        [0.7, 4, 0.26],
      ] as const)
        for (let i = 0; i < n; i++) {
          const a = Math.PI * (0.3 + (1.4 * (i + 0.5)) / n);
          const x = Math.sin(a) * R * (1 - t) + apex[0] * t;
          const z = Math.cos(a) * R * (1 - t) + apex[2] * t;
          mb.add(
            blob([x, H * t * 0.95, z], [size, size * 0.6, size], 6),
            shade('#6f8a3c', 0.08 * (i % 3) - 0.08),
            leaves,
          );
        }
      break;
    }
    case 'prop-canoe': {
      // A small dugout canoe along +Z (peopling.md section 6), as a caricature (Yang,
      // 2026-10-20: "make the boats shorter and a bit more like a caricature"): a short, tubby
      // hull whose bow and stern curl up into round knobs, a pale stripe under the rim, and
      // a stubby spare paddle along the side.
      mb.add(blob([0, 0.2, 0], [0.42, 0.24, 1.05], 10), '#9a6438');
      mb.add(blob([0, 0.37, 0], [0.32, 0.07, 0.82], 8), '#3e2a1c');
      mb.add(blob([0, 0.3, 0], [0.44, 0.05, 1.02], 10), '#d9b27a');
      for (const z of [-1, 1]) {
        mb.add(blob([0, 0.36, z * 0.92], [0.17, 0.2, 0.2], 6), '#9a6438');
        mb.add(blob([0, 0.58, z * 1.02], [0.12, 0.12, 0.12], 6), '#9a6438');
      }
      mb.add(rod([0.3, 0.42, -0.5], [0.3, 0.42, 0.35], 0.03, 4), POLE);
      mb.add(blob([0.3, 0.42, 0.48], [0.08, 0.025, 0.15], 5), POLE);
      break;
    }
    case 'prop-red-flag': {
      // A marker for development, not history (peopling.md section 3.6): a tall pole with a
      // huge red cloth, about four times as high as a hut, so it is seen from far out.
      mb.add(rod([0, 0, 0], [0, 12.4, 0], 0.13, 6), '#e9e2d0');
      mb.add(blob([0, 12.55, 0], [0.22, 0.22, 0.22], 6), '#d9b13a');
      const rows: Vec3[][] = [0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3, 4].map((c): Vec3 => {
          const x = 0.1 + c * 1.3;
          return [x, 12 - r * 1.2 - 0.12 * c, 0.35 * Math.sin(c * 1.4 + r * 0.3)];
        }),
      );
      mb.add(sheet(rows), '#d42323');
      break;
    }
    case 'prop-cave-wall-sulawesi':
    case 'prop-cave-wall-chauvet': {
      // The painting on a cave's rock face (humankind.md section 8.2; Yang, 2026-10-21: "the
      // ground elevates to form the hill ... just the hill cut vertically on one side"): the
      // hill is the ground itself, raised by the globe, and its cut is drawn as rock; this
      // model is only what stands on the cut, facing the hearth (+Z): the painting, in parts
      // painted one after another, and a torch while it is painted.
      const sulawesi = id === 'prop-cave-wall-sulawesi';
      /** A point on the cut face at (x, y), just in front of it. */
      // Low on the face, where the drawn hill is high enough at its alcove's back.
      const face = (x: number, y: number, out = 0.06): Vec3 => [x * 0.8, 0.1 + y * 0.6, 0.06 + out];
      // The torch beside the face, lit while a session is painted (the scene shows it then).
      mb.bone({ name: 'torch', pivot: [0.85, 0, 0.5] });
      mb.add(rod([0.9, 0, 0.65], [0.8, 1.3, 0.35], 0.03, 4), POLE, 'torch');
      mb.add(blob([0.795, 1.42, 0.34], [0.1, 0.17, 0.1], 5), '#f08a2c', 'torch', undefined, 0);
      mb.add(blob([0.795, 1.39, 0.37], [0.055, 0.1, 0.055], 4), '#ffd166', 'torch', undefined, 0);
      const step = (k: number) => {
        const name = `${BUILD_BONE}${k}`;
        mb.bone({ name, pivot: face(0, 0.9, 0) });
        return name;
      };
      const dab = (
        x: number,
        y: number,
        w: number,
        h: number,
        colour: string,
        bone: string,
        out = 0.06,
      ) => mb.add(blob(face(x, y, out), [w, h, 0.02], 5), colour, bone, undefined, 0);
      const stroke = (
        pts: [number, number][],
        ox: number,
        oy: number,
        r: number,
        colour: string,
        bone: string,
        k = 1,
      ) => {
        for (let i = 1; i < pts.length; i++) {
          const [a0, a1] = pts[i - 1]!;
          const [b0, b1] = pts[i]!;
          mb.add(
            rod(face(ox + a0 * k, oy + a1 * k), face(ox + b0 * k, oy + b1 * k), r, 3),
            colour,
            bone,
            undefined,
            0,
          );
        }
      };
      if (sulawesi) {
        // Leang Karampuang (Oktaviana et al. 2024), in red-brown silhouettes: rows of warty
        // pigs on the left, and human figures on the right, two with arms raised high holding
        // fan-like objects, one smaller beside them, and a fan-shaped sign above.
        const RED = '#9a3e24';
        const pig = (ox: number, oy: number, bone: string) => {
          dab(ox, oy, 0.17, 0.075, RED, bone);
          dab(ox - 0.17, oy + 0.01, 0.07, 0.055, RED, bone);
          dab(ox - 0.245, oy - 0.005, 0.03, 0.025, RED, bone);
          for (const x of [-0.1, -0.03, 0.07, 0.13])
            stroke(
              [
                [x, -0.05],
                [x + 0.005, -0.15],
              ],
              ox,
              oy,
              0.016,
              RED,
              bone,
            );
          for (const x of [-0.08, 0.0, 0.08])
            stroke(
              [
                [x, 0.06],
                [x - 0.01, 0.11],
              ],
              ox,
              oy,
              0.01,
              RED,
              bone,
            );
          stroke(
            [
              [0.16, 0.02],
              [0.21, 0.07],
            ],
            ox,
            oy,
            0.01,
            RED,
            bone,
          );
        };
        const person = (
          ox: number,
          oy: number,
          k: number,
          arms: 'up' | 'down',
          fan: boolean,
          bone: string,
        ) => {
          dab(ox, oy + 0.3 * k, 0.04 * k, 0.045 * k, RED, bone);
          stroke(
            [
              [0, 0.25],
              [0, 0.02],
            ],
            ox,
            oy,
            0.03 * k,
            RED,
            bone,
            k,
          );
          stroke(
            [
              [0, 0.03],
              [-0.05, -0.2],
            ],
            ox,
            oy,
            0.022 * k,
            RED,
            bone,
            k,
          );
          stroke(
            [
              [0, 0.03],
              [0.05, -0.2],
            ],
            ox,
            oy,
            0.022 * k,
            RED,
            bone,
            k,
          );
          const hands: [number, number][] =
            arms === 'up'
              ? [
                  [-0.09, 0.44],
                  [0.09, 0.44],
                ]
              : [
                  [-0.1, 0.05],
                  [0.1, 0.07],
                ];
          for (const h of hands) stroke([[0, 0.22], h], ox, oy, 0.018 * k, RED, bone, k);
          if (fan)
            for (const [hx, hy] of hands) {
              dab(ox + hx * k, oy + (hy + 0.06) * k, 0.06 * k, 0.035 * k, RED, bone);
              for (const d of [-0.04, 0, 0.04])
                stroke(
                  [
                    [hx, hy],
                    [hx + d, hy + 0.09],
                  ],
                  ox,
                  oy,
                  0.008 * k,
                  RED,
                  bone,
                  k,
                );
            }
        };
        pig(-0.42, 1.45, step(0));
        pig(-0.45, 1.13, step(1));
        let b = step(2);
        pig(-0.5, 0.8, b);
        pig(-0.08, 0.82, b);
        b = step(3);
        person(0.12, 1.12, 0.9, 'down', false, b);
        b = step(4);
        person(0.4, 0.62, 1.15, 'up', true, b);
        person(0.66, 0.66, 1.15, 'up', true, b);
        b = step(5);
        person(0.82, 0.55, 0.75, 'down', false, b);
        dab(0.45, 1.5, 0.11, 0.04, RED, b);
        for (const d of [-0.07, -0.03, 0.03, 0.07])
          stroke(
            [
              [0.45 + d * 0.3, 1.47],
              [0.45 + d, 1.38],
            ],
            0,
            0,
            0.008,
            RED,
            b,
          );
      } else {
        // Chauvet (Clottes 2003; Quiles et al. 2016), in black charcoal outlines: the Panel of
        // the Horses, four heads one above another with upright manes; lions in profile; a
        // rhinoceros with its long curved horn; a bison; and red dots made with the palm.
        const BLACK = '#211c1a';
        const k = 0.75;
        const horse = (ox: number, oy: number, bone: string) => {
          mb.add(
            blob(face(ox - 0.03, oy, 0.035), [0.13, 0.07, 0.015], 5),
            '#8a7e72',
            bone,
            undefined,
            0,
          );
          stroke(
            [
              [0.22, -0.18],
              [0.14, 0.05],
              [-0.02, 0.16],
              [-0.14, 0.1],
              [-0.27, -0.06],
              [-0.2, -0.12],
              [-0.02, -0.1],
              [0.08, -0.2],
            ],
            ox,
            oy,
            0.018,
            BLACK,
            bone,
            k,
          );
          for (const t of [0.15, 0.06, -0.02])
            stroke(
              [
                [t, 0.07 + (0.14 - t) * 0.5],
                [t + 0.03, 0.15 + (0.14 - t) * 0.5],
              ],
              ox,
              oy,
              0.013,
              BLACK,
              bone,
              k,
            );
          stroke(
            [
              [-0.02, 0.16],
              [0.0, 0.25],
            ],
            ox,
            oy,
            0.013,
            BLACK,
            bone,
            k,
          );
          dab(ox - 0.08, oy + 0.045, 0.02, 0.02, BLACK, bone);
        };
        let b = step(0);
        horse(0.3, 1.55, b);
        horse(0.38, 1.38, b);
        b = step(1);
        horse(0.46, 1.21, b);
        horse(0.54, 1.04, b);
        b = step(2);
        for (const [ox, oy] of [
          [-0.35, 1.55],
          [-0.28, 1.36],
        ] as const) {
          stroke(
            [
              [-0.45, 0.02],
              [-0.15, 0.06],
              [0.12, 0.1],
              [0.27, 0.05],
              [0.31, -0.03],
              [0.22, -0.07],
              [0.0, -0.1],
            ],
            ox,
            oy,
            0.017,
            BLACK,
            b,
            k,
          );
          stroke(
            [
              [0.06, 0.1],
              [0.09, 0.16],
            ],
            ox,
            oy,
            0.012,
            BLACK,
            b,
            k,
          );
          dab(ox + 0.14, oy + 0.025, 0.018, 0.018, BLACK, b);
        }
        b = step(3);
        const body: [number, number][] = Array.from({ length: 9 }, (_, i) => {
          const a = (i / 8) * 2 * Math.PI;
          return [0.28 * Math.cos(a), 0.12 * Math.sin(a)];
        });
        stroke(body, 0.0, 0.62, 0.018, BLACK, b, k);
        stroke(
          [
            [-0.27, 0.02],
            [-0.42, -0.04],
            [-0.44, -0.1],
          ],
          0.0,
          0.62,
          0.016,
          BLACK,
          b,
          k,
        );
        stroke(
          [
            [-0.38, -0.01],
            [-0.5, 0.1],
            [-0.5, 0.2],
          ],
          0.0,
          0.62,
          0.018,
          BLACK,
          b,
          k,
        );
        stroke(
          [
            [-0.3, 0.06],
            [-0.34, 0.13],
          ],
          0.0,
          0.62,
          0.012,
          BLACK,
          b,
          k,
        );
        for (const x of [-0.16, 0.16])
          stroke(
            [
              [x, -0.11],
              [x, -0.22],
            ],
            0.0,
            0.62,
            0.014,
            BLACK,
            b,
            k,
          );
        b = step(4);
        stroke(
          [
            [0.2, -0.08],
            [0.17, 0.06],
            [0.04, 0.15],
            [-0.08, 0.1],
            [-0.17, 0.0],
            [-0.18, -0.08],
            [0.2, -0.08],
          ],
          0.55,
          0.68,
          0.017,
          BLACK,
          b,
          k,
        );
        stroke(
          [
            [-0.12, 0.08],
            [-0.18, 0.16],
          ],
          0.55,
          0.68,
          0.012,
          BLACK,
          b,
          k,
        );
        for (const x of [-0.1, 0.12])
          stroke(
            [
              [x, -0.08],
              [x, -0.18],
            ],
            0.55,
            0.68,
            0.012,
            BLACK,
            b,
            k,
          );
        b = step(5);
        for (let i = 0; i < 12; i++)
          dab(-0.6 + 0.07 * (i % 4), 0.95 + 0.08 * Math.floor(i / 4), 0.03, 0.028, '#a8442a', b);
      }
      break;
    }
    case 'prop-burial': {
      // A grave dug into a heap of earth (humankind.md section 8.2; Yang, 2026-10-21: "they
      // should first dig into the ground to change the ground elevation to fit the burial"):
      // the heap rises out of the ground first (the scene raises it), so the drawn ground,
      // not flat across a prop drawn some 200 km long, never cuts through it. Then, in four
      // steps: the trench, dark and deep; the body laid in it, wrapped and covered with
      // mammoth-ivory beads, ivory spears beside it; the trench closed with the earth and red
      // ochre; and grass grown over the heap (Yang: "the ground should just grow over it").
      const EARTH = '#7a5a3c';
      mb.add(blob([0, 0.06, 0], [1.3, 0.2, 0.75], 9), EARTH);
      const step = (k: number) => {
        const name = `${BUILD_BONE}${k}`;
        mb.bone({ name, pivot: [0, 0.2, 0] });
        return name;
      };
      let b = step(0);
      mb.add(blob([0, 0.215, 0], [0.95, 0.05, 0.32], 8), '#2b211a', b);
      for (const x of [-1, 1])
        mb.add(blob([x * 1.1, 0.26, 0], [0.22, 0.12, 0.3], 5), shade(EARTH, 0.06), b);
      b = step(1);
      mb.add(blob([0, 0.25, 0], [0.75, 0.06, 0.2], 8), '#a88f68', b);
      for (let i = 0; i < 16; i++)
        mb.add(
          blob([-0.6 + 0.08 * i, 0.31, 0.06 * Math.sin(i * 1.7)], [0.025, 0.025, 0.025], 4),
          '#efe6d2',
          b,
        );
      for (const z of [-0.25, 0.25])
        mb.add(rod([-0.85, 0.24, z], [0.85, 0.24, z], 0.02, 3), '#e9dfc6', b);
      b = step(2);
      mb.add(blob([0, 0.26, 0], [1.0, 0.1, 0.4], 8), EARTH, b);
      mb.add(blob([0, 0.34, 0], [0.7, 0.025, 0.28], 7), '#a3412a', b);
      b = step(3);
      mb.add(blob([0, 0.1, 0], [1.38, 0.28, 0.8], 9), '#7f9a55', b);
      for (const [x, z] of [
        [-0.7, 0.2],
        [0.3, -0.3],
        [0.8, 0.25],
      ] as const)
        mb.add(cone([x, 0.34, z], [x, 0.5, z], 0.08, 4), '#6f8a48', b);
      break;
    }
    case 'prop-death-skull': {
      // A small skull that rises from someone who has just died and fades away
      // (humankind.md section 8.2; Yang, 2026-10-21): a sign, not a body part, drawn as a
      // cartoon: a round white head, two dark eyes, a dark nose and a row of teeth.
      const BONE_WHITE = '#f1ece0';
      mb.add(blob([0, 0.22, 0], [0.16, 0.15, 0.15], 8), BONE_WHITE);
      mb.add(blob([0, 0.1, 0.03], [0.1, 0.06, 0.1], 6), BONE_WHITE);
      for (const x of [-1, 1])
        mb.add(blob([x * 0.06, 0.22, 0.13], [0.045, 0.05, 0.03], 5), '#231d1a');
      mb.add(blob([0, 0.16, 0.145], [0.02, 0.025, 0.02], 4), '#231d1a');
      for (const x of [-0.04, 0, 0.04])
        mb.add(blob([x, 0.085, 0.12], [0.012, 0.022, 0.012], 4), '#231d1a');
      break;
    }
    case 'prop-carry-pole': {
      // A carrying pole along +Z, the way models face, lying on the ground with its
      // middle over the origin, and two lashings of hide cord where an animal's legs
      // are bound to it (humankind.md section 8.1).
      mb.add(rod([0, POLE_R, -1.6], [0, POLE_R, 1.6], POLE_R, 5), POLE);
      for (const z of [-0.45, 0.4]) mb.add(blob([0, POLE_R, z], [0.07, 0.07, 0.09], 5), '#8a5f38');
      break;
    }
  }
  return mb.build(id);
}

/** The building steps of a shelter in order, or none when it is shown only whole. */
export function buildSteps(model: Model): THREE.Object3D[] {
  return [...model.bones]
    .filter(([name]) => name.startsWith(BUILD_BONE))
    .sort(([a], [b]) => Number(a.slice(BUILD_BONE.length)) - Number(b.slice(BUILD_BONE.length)))
    .map(([, bone]) => bone);
}

/** Shows a shelter put up as far as `built` (0 to 1): each step takes an equal share and grows up from its base. */
export function setBuilt(steps: THREE.Object3D[], built: number): void {
  steps.forEach((bone, k) => {
    const t = Math.min(1, Math.max(0, built * steps.length - k));
    bone.visible = t > 0;
    const e = t * t * (3 - 2 * t);
    bone.scale.set(0.9 + 0.1 * e, Math.max(0.02, e), 0.9 + 0.1 * e);
  });
}

/** The flames of the hearth: base, tip, radius and colour; each is its own bone so it can flicker. */
const FLAMES: [Vec3, Vec3, number, string][] = [
  [[0, 0.05, 0], [0.04, 0.95, 0.02], 0.3, '#f08a2c'],
  [[0.13, 0.05, 0.06], [0.2, 0.62, 0.08], 0.17, '#f6b23b'],
  [[-0.12, 0.05, -0.04], [-0.18, 0.66, -0.05], 0.16, '#f6b23b'],
  [[0, 0.05, 0.04], [0.0, 0.45, 0.05], 0.15, '#ffe08a'],
];

/** A ring of stones with a cartoon fire. */
export function buildHearth(): Model {
  const mb = new ModelBuilder();
  ring(7, 0.55, 0.08, (p, _a, i) =>
    mb.add(blob(p, [0.21, 0.14, 0.18], 5), shade(STONE, (i % 3) * 0.07 - 0.07)),
  );
  mb.add(rod([-0.35, 0.08, -0.1], [0.35, 0.16, 0.12], 0.06, 5), '#5a3a22');
  mb.add(rod([0.3, 0.08, -0.2], [-0.25, 0.16, 0.2], 0.06, 5), '#6a4528');
  FLAMES.forEach(([base, tip, r, colour], i) => {
    mb.bone({ name: `flame-${i}`, pivot: base });
    mb.add(cone(base, tip, r, i === 0 ? 7 : 6), colour, `flame-${i}`);
  });
  return mb.build('prop-hearth');
}

/** Lets the hearth's flames flicker: each stretches, squashes and sways at its own pace. */
/** Lets the hearth's flames grow from nothing as a new fire catches, 0 to 1, after flickering. */
export function lightHearth(model: Model, lit: number): void {
  FLAMES.forEach((_f, i) => {
    const flame = model.bones.get(`flame-${i}`);
    if (!flame) return;
    flame.visible = lit > 0.02;
    flame.scale.multiplyScalar(Math.max(0.02, lit));
  });
}

export function flickerHearth(model: Model, seconds: number): void {
  FLAMES.forEach((_f, i) => {
    const flame = model.bones.get(`flame-${i}`);
    if (!flame) return;
    const t = seconds * (5.1 + 1.7 * i) + i * 1.9;
    const lick = Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 0.7) * 0.4;
    flame.scale.set(1 - 0.08 * lick, 1 + 0.22 * lick, 1 - 0.08 * lick);
    flame.rotation.z = 0.12 * Math.sin(t * 0.7 + i);
  });
}
