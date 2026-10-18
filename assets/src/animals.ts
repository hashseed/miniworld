// Animals of the first culture profiles (spec milestone 2, section 13.3).
// Life size in metres, facing +Z, feet on y = 0. Nothing is shown wounded.

import * as THREE from 'three';
import {
  type Model,
  type Vec3,
  ModelBuilder,
  blob,
  cone,
  horn,
  limb,
  mirrorX,
  shade,
} from './kit.ts';

export const ANIMALS = [
  'animal-mammoth',
  'animal-woolly-rhino',
  'animal-bison',
  'animal-horse',
  'animal-reindeer',
  'animal-cave-bear',
  'animal-wolf',
  'animal-eland',
  'animal-gazelle',
  'animal-kangaroo',
] as const;
export type AnimalId = (typeof ANIMALS)[number];

interface Quad {
  /** Height of the back at the shoulder. */
  shoulder: number;
  /** Length of the body from chest to rump. */
  length: number;
  /** Half thickness of the body (x, y). */
  girth: [number, number];
  leg: number;
  /** Neck from the chest: forward and up, as a share of the shoulder height. */
  neck: [number, number];
  head: Vec3;
  /** Head tilt down from level, radians. */
  headDrop: number;
  coat: string;
  belly?: string;
  legColour?: string;
  hoof?: string;
}

interface Parts {
  mb: ModelBuilder;
  headAt: THREE.Vector3;
  front: number;
  back: number;
  bodyY: number;
}

function quadruped(q: Quad, clay = 1): Parts {
  const front = q.length / 2;
  const back = -q.length / 2;
  const legTop = q.shoulder - q.girth[1] * 0.9;
  const bodyY = q.shoulder - q.girth[1] * 0.75;
  const headAt = new THREE.Vector3(
    0,
    q.shoulder + q.neck[1] * q.shoulder,
    front + q.neck[0] * q.shoulder,
  );
  const mb = new ModelBuilder(
    [
      { name: 'body', pivot: [0, bodyY, 0] },
      { name: 'head', pivot: [0, bodyY + q.girth[1] * 0.4, front * 0.85], parent: 'body' },
      { name: 'legFL', pivot: [q.girth[0] * 0.55, legTop, front * 0.72], parent: 'body' },
      { name: 'legFR', pivot: [-q.girth[0] * 0.55, legTop, front * 0.72], parent: 'body' },
      { name: 'legBL', pivot: [q.girth[0] * 0.55, legTop, back * 0.72], parent: 'body' },
      { name: 'legBR', pivot: [-q.girth[0] * 0.55, legTop, back * 0.72], parent: 'body' },
      { name: 'tail', pivot: [0, bodyY + q.girth[1] * 0.4, back * 1.02], parent: 'body' },
    ],
    clay,
  );
  // Body: chest and rump lumps joined by the barrel.
  mb.add(blob([0, bodyY, 0], [q.girth[0], q.girth[1], q.length * 0.55], 8), q.coat, 'body');
  mb.add(
    blob(
      [0, bodyY + q.girth[1] * 0.08, front * 0.6],
      [q.girth[0] * 1.05, q.girth[1] * 1.04, q.length * 0.3],
      9,
    ),
    q.coat,
    'body',
  );
  if (q.belly)
    mb.add(
      blob(
        [0, bodyY - q.girth[1] * 0.45, 0],
        [q.girth[0] * 0.8, q.girth[1] * 0.5, q.length * 0.42],
        8,
      ),
      q.belly,
      'body',
    );
  // Neck and head.
  const neckBase: Vec3 = [0, bodyY + q.girth[1] * 0.3, front * 0.8];
  mb.add(
    limb(
      neckBase,
      [0, headAt.y - q.head[1] * 0.3, headAt.z - q.head[2] * 0.45],
      Math.min(q.girth[0], q.girth[1]) * 0.55,
      q.head[0] * 0.8,
      6,
    ),
    q.coat,
    'head',
  );
  const head = blob([0, 0, 0], q.head, 7);
  head.rotateX(q.headDrop);
  head.translate(headAt.x, headAt.y, headAt.z);
  mb.add(head, q.coat, 'head');
  // Eyes.
  for (const s of [1, -1]) {
    mb.add(
      blob(
        [s * q.head[0] * 0.85, headAt.y + q.head[1] * 0.3, headAt.z + q.head[2] * 0.1],
        [q.head[0] * 0.13, q.head[0] * 0.15, q.head[0] * 0.13],
        5,
      ),
      '#1d1410',
      'head',
    );
  }
  // Legs with hooves or paws.
  const legColour = q.legColour ?? q.coat;
  for (const [bone, x, z] of [
    ['legFL', 1, front * 0.72],
    ['legFR', -1, front * 0.72],
    ['legBL', 1, back * 0.72],
    ['legBR', -1, back * 0.72],
  ] as const) {
    const lx = x * q.girth[0] * 0.55;
    const leg = q.leg * 1.4; // chunky toy legs
    // End the leg one cap radius up, so its rounded end rests on the ground.
    mb.add(
      limb([lx, legTop, z], [lx, Math.max(0.08, leg * 0.75), z], leg, leg * 0.75, 5),
      legColour,
      bone,
    );
    mb.add(
      blob([lx, 0.06, z + leg * 0.2], [leg * 0.85, 0.07, leg * 1.0], 5),
      q.hoof ?? shade(legColour, -0.35),
      bone,
    );
  }
  return { mb, headAt, front, back, bodyY };
}

export function buildAnimal(id: AnimalId): Model {
  switch (id) {
    case 'animal-mammoth': {
      // Woolly mammoth: high domed head, shoulder hump, sloping back, small ears, long curling tusks.
      const coat = '#7a4a2a';
      const q = quadruped({
        shoulder: 3.1,
        length: 3.4,
        girth: [1.15, 1.2],
        leg: 0.33,
        neck: [0.12, -0.05],
        head: [0.7, 0.85, 0.75],
        headDrop: 0.2,
        coat,
        hoof: '#4a3428',
      });
      const { mb, headAt, bodyY, back } = q;
      mb.add(blob([0, 3.1, 0.75], [0.95, 0.65, 1.0], 9), coat, 'body'); // hump
      mb.add(
        blob([0, headAt.y + 0.55, headAt.z - 0.1], [0.55, 0.5, 0.55], 8),
        shade(coat, -0.08),
        'head',
      ); // domed crown
      // Shaggy hair skirt along the flanks.
      for (const s of [1, -1]) {
        const g = blob([s * 0.72, bodyY - 0.62, 0.15], [0.48, 0.78, 1.55], 8);
        mb.add(g, shade(coat, -0.12), 'body');
      }
      mb.add(
        blob([0, headAt.y - 0.8, headAt.z + 0.05], [0.6, 0.5, 0.45], 7),
        shade(coat, -0.12),
        'head',
      ); // throat hair
      // Trunk: a tapering curve that curls at the tip.
      mb.add(
        horn(
          [0, headAt.y - 0.2, headAt.z + 0.55],
          [0, headAt.y - 1.6, headAt.z + 1.1],
          [0, 0.55, headAt.z + 0.75],
          0.24,
          0.1,
          6,
          6,
        ),
        shade(coat, 0.05),
        'head',
      );
      for (const s of [1, -1]) {
        mb.add(
          horn(
            [s * 0.3, headAt.y - 0.45, headAt.z + 0.45],
            [s * 0.9, headAt.y - 1.9, headAt.z + 1.9],
            [s * 0.15, headAt.y - 0.2, headAt.z + 2.15],
            0.13,
            0.05,
            8,
            6,
          ),
          '#f1e7d0',
          'head',
        );
        mb.add(
          blob([s * 0.68, headAt.y + 0.15, headAt.z - 0.25], [0.12, 0.3, 0.25], 6),
          shade(coat, -0.15),
          'head',
        ); // small ears
      }
      mb.add(
        horn(
          [0, bodyY + 0.6, back * 1.0],
          [0, bodyY + 0.2, back * 1.2],
          [0, bodyY - 0.4, back * 1.12],
          0.08,
          0.05,
          4,
          4,
        ),
        coat,
        'tail',
      );
      mb.add(blob([0, bodyY - 0.5, back * 1.12], [0.12, 0.2, 0.12], 5), shade(coat, -0.2), 'tail');
      return mb.build(id);
    }
    case 'animal-woolly-rhino': {
      const coat = '#8a6a48';
      const { mb, headAt, bodyY, back } = quadruped({
        shoulder: 1.75,
        length: 2.6,
        girth: [0.75, 0.75],
        leg: 0.2,
        neck: [0.15, -0.25],
        head: [0.38, 0.38, 0.65],
        headDrop: 0.35,
        coat,
        hoof: '#4f3a2a',
      });
      mb.add(blob([0, 1.75, 0.6], [0.6, 0.35, 0.7], 8), coat, 'body');
      mb.add(blob([0, bodyY - 0.4, 0.3], [0.7, 0.4, 1.1], 8), shade(coat, -0.12), 'body');
      // Long front horn and a short second horn.
      mb.add(
        horn(
          [0, headAt.y + 0.1, headAt.z + 0.45],
          [0, headAt.y + 0.5, headAt.z + 0.85],
          [0, headAt.y + 0.95, headAt.z + 0.95],
          0.13,
          0.03,
          4,
          5,
        ),
        '#d9cdb4',
        'head',
      );
      mb.add(
        cone([0, headAt.y + 0.22, headAt.z + 0.1], [0, headAt.y + 0.5, headAt.z + 0.05], 0.09, 6),
        '#d9cdb4',
        'head',
      );
      for (const s of [1, -1])
        mb.add(
          blob([s * 0.25, headAt.y + 0.38, headAt.z - 0.35], [0.07, 0.17, 0.1], 5),
          coat,
          'head',
        );
      mb.add(
        horn(
          [0, bodyY + 0.3, back],
          [0, bodyY, back * 1.18],
          [0, bodyY - 0.3, back * 1.12],
          0.05,
          0.03,
          4,
          4,
        ),
        coat,
        'tail',
      );
      return mb.build(id);
    }
    case 'animal-bison': {
      // Steppe bison: huge shoulder hump, shaggy front, long upswept horns.
      const coat = '#5e3d25';
      const { mb, headAt, bodyY, back } = quadruped({
        shoulder: 1.95,
        length: 2.4,
        girth: [0.62, 0.7],
        leg: 0.15,
        neck: [0.18, -0.25],
        head: [0.33, 0.38, 0.45],
        headDrop: 0.5,
        coat: '#7a5233',
        legColour: '#6a4528',
        hoof: '#2e2219',
      });
      mb.add(blob([0, 1.75, 0.5], [0.72, 0.65, 0.85], 9), coat, 'body');
      mb.add(blob([0, headAt.y + 0.05, headAt.z - 0.1], [0.42, 0.42, 0.4], 8), coat, 'head');
      mb.add(
        blob([0, headAt.y - 0.45, headAt.z + 0.05], [0.18, 0.3, 0.16], 6),
        shade(coat, -0.15),
        'head',
      ); // beard
      for (const s of [1, -1])
        mb.add(
          horn(
            [s * 0.3, headAt.y + 0.25, headAt.z],
            [s * 0.75, headAt.y + 0.25, headAt.z + 0.1],
            [s * 0.7, headAt.y + 0.7, headAt.z - 0.05],
            0.07,
            0.025,
            4,
            4,
          ),
          '#d8ceb8',
          'head',
        );
      mb.add(
        limb([0, bodyY + 0.3, back * 1.0], [0, bodyY - 0.45, back * 1.12], 0.045, 0.03, 4),
        '#7a5233',
        'tail',
      );
      mb.add(blob([0, bodyY - 0.5, back * 1.12], [0.07, 0.12, 0.07], 5), coat, 'tail');
      return mb.build(id);
    }
    case 'animal-horse': {
      // Wild horse: dun coat, dark legs, upright dark mane, as in the cave paintings.
      const coat = '#c39a62';
      const dark = '#3c2b20';
      const { mb, headAt, bodyY, back, front } = quadruped({
        shoulder: 1.35,
        length: 1.6,
        girth: [0.38, 0.42],
        leg: 0.085,
        neck: [0.42, 0.3],
        head: [0.18, 0.2, 0.42],
        headDrop: 0.9,
        coat,
        belly: '#e2cda3',
        legColour: dark,
        hoof: '#241a14',
      });
      mb.add(
        limb([0, bodyY + 0.42, front * 0.55], [0, headAt.y + 0.18, headAt.z - 0.25], 0.08, 0.06, 5),
        dark,
        'head',
      ); // mane
      mb.add(blob([0, headAt.y - 0.2, headAt.z + 0.26], [0.13, 0.11, 0.13], 6), '#dcc8a0', 'head'); // pale muzzle
      for (const s of [1, -1])
        mb.add(
          cone(
            [s * 0.1, headAt.y + 0.15, headAt.z - 0.25],
            [s * 0.13, headAt.y + 0.38, headAt.z - 0.27],
            0.05,
            5,
          ),
          coat,
          'head',
        );
      mb.add(
        horn(
          [0, bodyY + 0.25, back],
          [0, bodyY + 0.1, back * 1.4],
          [0, bodyY - 0.55, back * 1.25],
          0.09,
          0.05,
          4,
          4,
        ),
        dark,
        'tail',
      );
      return mb.build(id);
    }
    case 'animal-reindeer': {
      const coat = '#8c7a66';
      const { mb, headAt, bodyY, back, front } = quadruped({
        shoulder: 1.15,
        length: 1.45,
        girth: [0.33, 0.36],
        leg: 0.075,
        neck: [0.4, 0.25],
        head: [0.15, 0.17, 0.33],
        headDrop: 0.7,
        coat,
        belly: '#e4dccd',
        legColour: '#6a5a4a',
        hoof: '#2e2520',
      });
      mb.add(blob([0, bodyY + 0.12, front * 0.95], [0.3, 0.3, 0.25], 7), '#e9e2d4', 'head'); // pale neck ruff
      for (const s of [1, -1]) {
        const base: Vec3 = [s * 0.08, headAt.y + 0.15, headAt.z - 0.15];
        mb.add(
          horn(
            base,
            [s * 0.4, headAt.y + 0.55, headAt.z - 0.45],
            [s * 0.35, headAt.y + 1.05, headAt.z + 0.05],
            0.035,
            0.02,
            5,
            4,
          ),
          '#d6c7a8',
          'head',
        );
        mb.add(
          horn(
            [s * 0.3, headAt.y + 0.55, headAt.z - 0.35],
            [s * 0.42, headAt.y + 0.75, headAt.z - 0.1],
            [s * 0.5, headAt.y + 0.8, headAt.z + 0.08],
            0.022,
            0.012,
            4,
            4,
          ),
          '#d6c7a8',
          'head',
        );
        mb.add(
          horn(
            [s * 0.38, headAt.y + 0.9, headAt.z - 0.1],
            [s * 0.5, headAt.y + 1.0, headAt.z - 0.05],
            [s * 0.55, headAt.y + 1.12, headAt.z + 0.05],
            0.02,
            0.012,
            4,
            4,
          ),
          '#d6c7a8',
          'head',
        );
        mb.add(
          cone(
            [s * 0.1, headAt.y + 0.1, headAt.z - 0.2],
            [s * 0.22, headAt.y + 0.22, headAt.z - 0.25],
            0.04,
            5,
          ),
          coat,
          'head',
        );
      }
      mb.add(blob([0, bodyY + 0.15, back * 1.05], [0.09, 0.12, 0.08], 5), '#efe9de', 'tail');
      return mb.build(id);
    }
    case 'animal-cave-bear': {
      const coat = '#6a4a32';
      const { mb, headAt, bodyY, back } = quadruped({
        shoulder: 1.35,
        length: 1.9,
        girth: [0.6, 0.62],
        leg: 0.19,
        neck: [0.18, -0.08],
        head: [0.3, 0.3, 0.38],
        headDrop: 0.1,
        coat,
        hoof: '#3a2a20',
      });
      mb.add(blob([0, 1.28, 0.45], [0.5, 0.35, 0.55], 8), coat, 'body');
      mb.add(blob([0, headAt.y - 0.07, headAt.z + 0.36], [0.15, 0.13, 0.16], 6), '#8c6c50', 'head');
      mb.add(blob([0, headAt.y - 0.02, headAt.z + 0.5], [0.06, 0.05, 0.04], 5), '#1d1410', 'head');
      for (const s of [1, -1])
        mb.add(
          blob([s * 0.22, headAt.y + 0.27, headAt.z - 0.12], [0.09, 0.09, 0.05], 5),
          coat,
          'head',
        );
      mb.add(blob([0, bodyY + 0.2, back * 1.02], [0.09, 0.08, 0.08], 5), coat, 'tail');
      return mb.build(id);
    }
    case 'animal-wolf': {
      const coat = '#8d857a';
      const { mb, headAt, bodyY, back } = quadruped({
        shoulder: 0.8,
        length: 1.0,
        girth: [0.2, 0.24],
        leg: 0.055,
        neck: [0.32, 0.12],
        head: [0.14, 0.14, 0.2],
        headDrop: 0.15,
        coat,
        belly: '#d9d2c4',
        legColour: '#a49c90',
        hoof: '#4a423a',
      });
      mb.add(
        cone([0, headAt.y - 0.05, headAt.z + 0.12], [0, headAt.y - 0.07, headAt.z + 0.38], 0.08, 6),
        coat,
        'head',
      );
      mb.add(blob([0, headAt.y - 0.06, headAt.z + 0.38], [0.03, 0.03, 0.03], 4), '#1d1410', 'head');
      for (const s of [1, -1])
        mb.add(
          cone(
            [s * 0.08, headAt.y + 0.1, headAt.z - 0.05],
            [s * 0.1, headAt.y + 0.27, headAt.z - 0.07],
            0.05,
            4,
          ),
          coat,
          'head',
        );
      mb.add(
        horn(
          [0, bodyY + 0.12, back],
          [0, bodyY, back * 1.5],
          [0, bodyY - 0.3, back * 1.7],
          0.07,
          0.05,
          4,
          4,
        ),
        shade(coat, -0.1),
        'tail',
      );
      return mb.build(id);
    }
    case 'animal-eland': {
      // Eland: tawny, pale stripes, dewlap, straight spiralled horns.
      const coat = '#b88a58';
      const { mb, headAt, back } = quadruped({
        shoulder: 1.6,
        length: 1.8,
        girth: [0.42, 0.48],
        leg: 0.08,
        neck: [0.32, 0.2],
        head: [0.15, 0.17, 0.36],
        headDrop: 0.6,
        coat,
        belly: '#e2cfae',
        legColour: '#9c7448',
        hoof: '#2e2219',
      });
      mb.add(
        blob([0, headAt.y - 0.55, headAt.z - 0.35], [0.1, 0.22, 0.18], 6),
        shade(coat, -0.15),
        'head',
      ); // dewlap
      for (const s of [1, -1])
        mb.add(
          cone(
            [s * 0.07, headAt.y + 0.15, headAt.z - 0.15],
            [s * 0.14, headAt.y + 0.75, headAt.z - 0.45],
            0.045,
            5,
          ),
          '#3a2c22',
          'head',
        );
      mb.add(limb([0, 1.4, back], [0, 0.85, back * 1.12], 0.03, 0.02, 4), coat, 'tail');
      return mb.build(id);
    }
    case 'animal-gazelle': {
      // Mountain gazelle: slender, sandy back, white belly, dark flank band, lyre horns.
      const coat = '#c39462';
      const { mb, headAt, back } = quadruped({
        shoulder: 0.78,
        length: 0.9,
        girth: [0.18, 0.2],
        leg: 0.035,
        neck: [0.38, 0.35],
        head: [0.08, 0.09, 0.19],
        headDrop: 0.55,
        coat,
        belly: '#f2ebde',
        legColour: '#b28a5c',
        hoof: '#2e2219',
      });
      for (const s of [1, -1]) {
        mb.add(blob([s * 0.17, 0.55, 0], [0.03, 0.04, 0.32], 5), '#5c3f28', 'body');
        mb.add(
          horn(
            [s * 0.04, headAt.y + 0.08, headAt.z - 0.08],
            [s * 0.1, headAt.y + 0.3, headAt.z - 0.25],
            [s * 0.06, headAt.y + 0.38, headAt.z - 0.15],
            0.018,
            0.008,
            4,
            4,
          ),
          '#2f2620',
          'head',
        );
        mb.add(
          cone(
            [s * 0.06, headAt.y + 0.05, headAt.z - 0.1],
            [s * 0.15, headAt.y + 0.16, headAt.z - 0.16],
            0.03,
            4,
          ),
          coat,
          'head',
        );
      }
      mb.add(blob([0, 0.65, back * 1.05], [0.04, 0.07, 0.04], 4), '#2f2620', 'tail');
      return mb.build(id);
    }
    case 'animal-kangaroo':
      return kangaroo();
  }
}

/** Grey kangaroo, upright on its hind legs with its tail as a third leg. */
function kangaroo(): Model {
  const coat = '#8f8073';
  const belly = '#d8cfc2';
  const mb = new ModelBuilder([
    { name: 'body', pivot: [0, 0.5, 0] },
    { name: 'head', pivot: [0, 1.15, 0.12], parent: 'body' },
    { name: 'tail', pivot: [0, 0.45, -0.25], parent: 'body' },
    { name: 'legL', pivot: [0.14, 0.5, -0.05], parent: 'body' },
    { name: 'legR', pivot: [-0.14, 0.5, -0.05], parent: 'body' },
  ]);
  const torso = blob([0, 0, 0], [0.24, 0.42, 0.22], 9);
  torso.rotateX(0.35);
  torso.translate(0, 0.78, 0.0);
  mb.add(torso, coat, 'body');
  mb.add(blob([0, 0.72, 0.12], [0.17, 0.3, 0.12], 7), belly, 'body');
  mb.add(blob([0, 1.28, 0.2], [0.12, 0.13, 0.18], 8), coat, 'head');
  mb.add(blob([0, 1.24, 0.35], [0.06, 0.06, 0.07], 5), '#3a3029', 'head');
  for (const s of [1, -1]) {
    mb.add(blob([s * 0.06, 1.46, 0.12], [0.04, 0.12, 0.05], 5), coat, 'head');
    mb.add(blob([s * 0.07, 1.32, 0.28], [0.022, 0.025, 0.02], 4), '#1d1410', 'head');
    mb.add(limb([s * 0.13, 0.98, 0.15], [s * 0.11, 0.78, 0.3], 0.035, 0.03, 5), coat, 'body'); // short arms
  }
  const hind = limb([0.15, 0.45, -0.05], [0.15, 0.2, 0.15], 0.11, 0.06, 7);
  mb.add(hind, coat, 'legL');
  mb.add(mirrorX(hind), coat, 'legR');
  const foot = blob([0.15, 0.04, 0.2], [0.05, 0.04, 0.2], 6);
  mb.add(foot, shade(coat, -0.3), 'legL');
  mb.add(mirrorX(foot), shade(coat, -0.3), 'legR');
  mb.add(horn([0, 0.5, -0.2], [0, 0.1, -0.55], [0, 0.05, -0.95], 0.1, 0.035, 5, 5), coat, 'tail');
  return mb.build('animal-kangaroo');
}
