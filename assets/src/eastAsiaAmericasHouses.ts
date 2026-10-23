// Houses of the East Asian, American and New Guinea Neolithic (spec
// docs/spec/neolithic/east-asia-americas-new-guinea-houses.md). Life size in
// metres, door facing +Z.

import * as THREE from 'three';
import { type Model, type Vec3, ModelBuilder, STONE, blob, box, lathe, rod, shade } from './kit.ts';

export const EAST_ASIA_AMERICAS_HOUSES = [
  'shelter-yangtze-stilt-house',
  'shelter-yellow-river-pit-house',
  'shelter-mesoamerican-hut',
  'shelter-andean-stone-house',
  'shelter-highland-new-guinea-house',
] as const;
export type EastAsiaAmericasHouseId = (typeof EAST_ASIA_AMERICAS_HOUSES)[number];

const OAK = '#c9a064';
const THATCH = '#cdb26a';
const DAUB = '#cdb48a';
const LOESS = '#c2a15f';
const CANE = '#d9bb7c';
const DOOR = '#3a2a20';

/** Normals pointing away from the middle, so the ink outline of a block stays closed at its edges. */
function soft(g: THREE.BufferGeometry, mid?: Vec3): THREE.BufferGeometry {
  g.computeBoundingBox();
  const c = mid ? new THREE.Vector3(...mid) : g.boundingBox!.getCenter(new THREE.Vector3());
  const pos = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(c).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

const slab = (min: Vec3, max: Vec3) => soft(box(min, max));

/**
 * A gable roof: a triangular prism along z with its ridge at `ridge` and its eaves at `eave`,
 * `halfWidth` out to each side, from z0 to z1.
 */
function gable(
  halfWidth: number,
  eave: number,
  ridge: number,
  z0: number,
  z1: number,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1, z1 - z0, 3, 1, false);
  // Apex up, axis along z; the triangle spans x of +-0.866 and y of -0.5 to 1.
  g.rotateX(-Math.PI / 2);
  g.scale(halfWidth / 0.866, (ridge - eave) / 1.5, 1);
  g.translate(0, eave + ((ridge - eave) / 1.5) * 0.5, (z0 + z1) / 2);
  return soft(g, [0, eave, (z0 + z1) / 2]);
}

/** A lathed roof or wall squashed along z into an egg-shaped plan. */
const oval = (profile: [number, number][], stretch: number, segments = 12) =>
  lathe(profile, [0, 0, 0], segments, [1, 1, stretch]);

export function buildEastAsiaAmericasHouse(id: EastAsiaAmericasHouseId): Model {
  const mb = new ModelBuilder();
  switch (id) {
    case 'shelter-yangtze-stilt-house': {
      // Hemudu: oak piles in three rows, bearers and crossbeams joined to them by mortise and
      // tenon (the tenon ends stand out), a plank floor, a box of wattle and a big gable roof
      // over a front veranda; a notched log leans on the veranda.
      const F = 1.25;
      for (const x of [-1.9, 0, 1.9])
        for (const z of [-2.7, -0.9, 0.9, 2.7])
          mb.add(rod([x, 0, z], [x, F - 0.05, z], 0.12, 4), shade(OAK, -0.1));
      for (const x of [-1.9, 1.9]) mb.add(rod([x, 0.95, -3.1], [x, 0.95, 3.3], 0.09, 4), OAK);
      for (const z of [-2.7, -0.9, 0.9, 2.7])
        mb.add(rod([-2.15, 0.7, z], [2.15, 0.7, z], 0.07, 4), shade(OAK, 0.06));
      const planks = 6;
      for (let i = 0; i < planks; i++) {
        const x0 = -2.1 + (i * 4.2) / planks;
        mb.add(
          slab([x0, F - 0.05, -3.1], [x0 + 4.2 / planks - 0.02, F + 0.08, 3.4]),
          shade(OAK, (i % 2) * 0.1 - 0.04),
        );
      }
      // Walls: a woven plank-and-wattle box with the door cut in its front.
      mb.add(slab([-1.85, F + 0.05, -2.9], [1.85, F + 1.45, 1.9]), shade(DAUB, -0.12));
      mb.add(slab([-1.9, F + 1.25, -2.95], [1.9, F + 1.5, 1.95]), shade(OAK, -0.05));
      mb.add(blob([0, F + 0.7, 1.92], [0.42, 0.62, 0.1], 6), DOOR);
      // The roof: ridge along z over the box, hanging past the front to cover the veranda.
      mb.add(gable(2.55, F + 1.4, F + 3.15, -3.3, 3.55), THATCH);
      mb.add(rod([0, F + 3.12, -3.4], [0, F + 3.12, 3.65], 0.1, 4), shade(THATCH, -0.2));
      for (const x of [-1.7, 1.7])
        mb.add(rod([x, F + 0.05, 3.2], [x, F + 1.65, 3.2], 0.09, 4), OAK);
      // Notched log from the ground to the veranda.
      mb.add(rod([0.3, 0, 4.5], [0.3, F + 0.06, 3.5], 0.14, 5), shade(OAK, -0.1));
      for (const k of [0.25, 0.5, 0.75])
        mb.add(blob([0.3, k * (F + 0.06), 4.5 - k], [0.2, 0.05, 0.12], 4), shade(OAK, 0.15));
      break;
    }
    case 'shelter-yellow-river-pit-house': {
      // Banpo, Cishan and Peiligang: a round house sunk into loess with a rim bank, a low thatch
      // cone, and a stepped entrance under a small gabled hood.
      mb.add(
        lathe(
          [
            [3.15, 0],
            [2.75, 0.3],
            [2.35, 0.3],
            [2.2, -0.3],
            [0, -0.3],
          ],
          [0, 0, 0],
          14,
        ),
        LOESS,
      );
      // Three earth steps from the ground down to the door.
      for (let k = 0; k < 3; k++)
        mb.add(
          slab([-0.6, -0.4 + k * 0.1, 3.0 + k * 0.45], [0.6, -0.2 + k * 0.1, 3.45 + k * 0.45]),
          shade(LOESS, -0.12 + k * 0.05),
        );
      // The cone roof of thatch and clay, in batches of straw, drooping at the eaves.
      mb.add(
        lathe(
          [
            [3.2, 0.05],
            [3.0, 0.5],
            [2.2, 1.35],
            [1.2, 2.25],
            [0.35, 2.9],
            [0.1, 3.05],
          ],
          [0, 0, 0],
          14,
        ),
        THATCH,
      );
      mb.add(
        lathe(
          [
            [3.0, 0.1],
            [2.7, 0.7],
            [2.15, 1.3],
          ],
          [0, 0, 0],
          14,
        ),
        shade(THATCH, -0.14),
      );
      mb.add(
        lathe(
          [
            [2.45, 1.05],
            [2.0, 1.55],
            [1.7, 1.65],
          ],
          [0, 0, 0],
          14,
        ),
        shade(THATCH, 0.1),
      );
      mb.add(
        lathe(
          [
            [1.55, 1.9],
            [1.1, 2.4],
            [0.85, 2.5],
          ],
          [0, 0, 0],
          14,
        ),
        shade(THATCH, -0.1),
      );
      mb.add(blob([0, 3.0, 0], [0.35, 0.22, 0.35], 6), shade(LOESS, -0.15));
      // The gabled hood over the entrance, and the dark door under it.
      mb.add(gable(1.2, 1.0, 2.2, 2.3, 4.1), shade(THATCH, 0.08));
      mb.add(blob([0, 0.3, 3.05], [0.5, 0.7, 0.2], 6), DOOR);
      for (const x of [-0.95, 0.95]) mb.add(rod([x, -0.2, 3.85], [x, 1.05, 3.85], 0.08, 4), OAK);
      break;
    }
    case 'shelter-mesoamerican-hut': {
      // Oaxaca: an oval of upright poles and cane wattle plastered with daub, a steep thatch roof
      // with eaves and crossed poles on top, a door in the short end.
      const S = 1.4;
      mb.add(
        oval(
          [
            [1.62, 0],
            [1.67, 0.7],
            [1.6, 1.5],
          ],
          S,
          14,
        ),
        DAUB,
      );
      // Bare wattle where the plaster has flaked, and poles rising into the roof.
      const patch = (a: number, h: number) =>
        mb.add(
          blob([Math.sin(a) * 1.64, h, Math.cos(a) * 1.64 * S], [0.34, 0.42, 0.05], 5),
          shade(OAK, -0.18),
        );
      patch(1.9, 0.6);
      patch(-2.2, 0.8);
      patch(2.9, 0.45);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.4) continue;
        mb.add(
          rod(
            [Math.sin(a) * 1.6, 1.3, Math.cos(a) * 1.6 * S],
            [Math.sin(a) * 1.55, 1.8, Math.cos(a) * 1.55 * S],
            0.06,
            4,
          ),
          OAK,
        );
      }
      mb.add(
        oval(
          [
            [2.0, 1.25],
            [1.7, 1.75],
            [1.15, 2.4],
            [0.5, 2.95],
            [0.05, 3.2],
          ],
          S,
          14,
        ),
        THATCH,
      );
      mb.add(
        oval(
          [
            [2.0, 1.25],
            [1.85, 1.5],
            [1.55, 1.6],
          ],
          S,
          14,
        ),
        shade(THATCH, -0.15),
      );
      for (const k of [-1, 1]) mb.add(rod([0, 2.95, k * 0.7], [0, 3.55, -k * 0.15], 0.06, 4), OAK);
      mb.add(blob([0, 0.55, 2.2], [0.42, 0.55, 0.14], 6), DOOR);
      for (const x of [-0.5, 0.5]) mb.add(rod([x, 0, 2.2], [x, 1.15, 2.2], 0.07, 4), OAK);
      mb.add(rod([-0.6, 1.1, 2.2], [0.6, 1.1, 2.2], 0.07, 4), OAK);
      break;
    }
    case 'shelter-andean-stone-house': {
      // A round house of fitted fieldstones with a slab over the low door and a cone of ichu grass.
      const R = 1.95;
      mb.add(
        lathe(
          [
            [R + 0.05, 0],
            [R - 0.05, 1.3],
            [R - 0.2, 1.3],
            [R - 0.2, 0],
          ],
          [0, 0, 0],
          12,
        ),
        shade(STONE, -0.05),
      );
      const courses: [number, number, number][] = [
        [0.28, 11, 0.5],
        [0.72, 11, 0.45],
        [1.15, 10, 0.42],
      ];
      courses.forEach(([y, n, w], j) => {
        for (let i = 0; i < n; i++) {
          const a = ((i + (j % 2) * 0.5) / n) * Math.PI * 2;
          if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.3 && j < 2) continue;
          mb.add(
            blob([Math.sin(a) * R, y, Math.cos(a) * R], [w * 0.8, 0.27, w * 0.55], 5, 3),
            shade(STONE, ((i * 7 + j * 3) % 5) * 0.045 - 0.09),
          );
        }
      });
      // The doorway: dark opening, jamb stones and a slab lintel.
      mb.add(blob([0, 0.5, R + 0.02], [0.4, 0.5, 0.1], 6), DOOR);
      mb.add(slab([-0.65, 1.0, R - 0.25], [0.65, 1.2, R + 0.3]), shade(STONE, 0.1));
      for (const x of [-0.5, 0.5])
        mb.add(blob([x, 0.45, R + 0.05], [0.18, 0.55, 0.2], 5, 3), shade(STONE, 0.05));
      mb.add(
        lathe(
          [
            [R + 0.55, 1.15],
            [R + 0.25, 1.5],
            [1.4, 2.1],
            [0.7, 2.7],
            [0.08, 3.1],
          ],
          [0, 0, 0],
          12,
        ),
        shade(THATCH, 0.1),
      );
      mb.add(
        lathe(
          [
            [R + 0.55, 1.15],
            [R + 0.4, 1.35],
            [R + 0.1, 1.55],
          ],
          [0, 0, 0],
          12,
        ),
        shade(THATCH, -0.12),
      );
      mb.add(rod([0, 2.9, 0], [0.05, 3.5, 0], 0.05, 4), OAK);
      break;
    }
    case 'shelter-highland-new-guinea-house': {
      // A round house on short posts above the damp garden soil: split-plank floor, woven cane
      // walls, a tall slightly hollow cone of kunai grass, and a log step.
      const F = 0.55;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.2;
        mb.add(
          rod(
            [Math.sin(a) * 1.7, 0, Math.cos(a) * 1.7],
            [Math.sin(a) * 1.7, F, Math.cos(a) * 1.7],
            0.11,
            4,
          ),
          shade(OAK, -0.1),
        );
      }
      mb.add(
        lathe(
          [
            [2.05, F - 0.12],
            [2.05, F + 0.05],
            [0, F + 0.05],
          ],
          [0, 0, 0],
          12,
        ),
        OAK,
      );
      // Basket weave: a chequer of light and dark cane, a panel per lathe segment and per row.
      const weave = (p: THREE.Vector3) => {
        const col = Math.floor(((Math.atan2(p.x, p.z) + Math.PI) / (Math.PI * 2)) * 18);
        return (col + (p.y > F + 0.6 ? 1 : 0)) % 2 === 0 ? shade(CANE, 0.08) : shade(CANE, -0.24);
      };
      mb.add(
        lathe(
          [
            [1.9, F + 0.05],
            [1.95, F + 0.6],
            [1.9, F + 1.2],
          ],
          [0, 0, 0],
          18,
        ),
        CANE,
        undefined,
        weave,
      );
      mb.add(
        lathe(
          [
            [2.65, F + 1.05],
            [2.25, F + 1.4],
            [1.5, F + 2.4],
            [0.7, F + 3.4],
            [0.25, F + 3.95],
            [0.12, F + 4.15],
          ],
          [0, 0, 0],
          14,
        ),
        THATCH,
      );
      mb.add(
        lathe(
          [
            [2.65, F + 1.05],
            [2.5, F + 1.3],
            [2.1, F + 1.45],
          ],
          [0, 0, 0],
          14,
        ),
        shade(THATCH, -0.15),
      );
      mb.add(blob([0, F + 4.1, 0], [0.3, 0.3, 0.3], 5), shade(THATCH, -0.2));
      mb.add(blob([0, F + 0.55, 1.98], [0.38, 0.5, 0.1], 6), DOOR);
      mb.add(rod([0.1, 0, 2.9], [0.1, F + 0.02, 2.2], 0.15, 5), shade(OAK, -0.1));
      break;
    }
  }
  return mb.build(id);
}
