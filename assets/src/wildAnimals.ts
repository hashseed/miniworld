// Wild animals of every continent (spec wildlife.md, section 6). Life size in
// metres, facing +Z, feet on y = 0, built like the prehistoric animals.

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
import { quadruped, type Parts } from './quadruped.ts';

export const WILD_ANIMALS = [
  'animal-elephant',
  'animal-asian-elephant',
  'animal-giraffe',
  'animal-zebra',
  'animal-wildebeest',
  'animal-lion',
  'animal-lioness',
  'animal-camel',
  'animal-yak',
  'animal-brown-bear',
  'animal-polar-bear',
  'animal-guanaco',
  'animal-crocodile',
  'animal-penguin',
  'animal-parrot',
  'animal-kea',
] as const;
export type WildAnimalId = (typeof WILD_ANIMALS)[number];

const EYE = '#1d1410';

export function buildWildAnimal(id: WildAnimalId): Model {
  switch (id) {
    case 'animal-elephant':
      return elephant(id, true);
    case 'animal-asian-elephant':
      return elephant(id, false);
    case 'animal-giraffe':
      return giraffe();
    case 'animal-zebra':
      return zebra();
    case 'animal-wildebeest':
      return wildebeest();
    case 'animal-lion':
      return lion(id, true);
    case 'animal-lioness':
      return lion(id, false);
    case 'animal-camel':
      return camel();
    case 'animal-yak':
      return yak();
    case 'animal-brown-bear':
      return bear(id, false);
    case 'animal-polar-bear':
      return bear(id, true);
    case 'animal-guanaco':
      return guanaco();
    case 'animal-crocodile':
      return crocodile();
    case 'animal-penguin':
      return penguin();
    case 'animal-parrot':
      return bird(id, {
        body: '#d5312a',
        wing: ['#d5312a', '#f2c230', '#2f6fc0'],
        tail: '#2f6fc0',
        face: '#f4efe6',
        beak: '#efe6d2',
        underWing: '#f2c230',
        tailLength: 0.5,
      });
    case 'animal-kea':
      return bird(id, {
        body: '#6f7f3c',
        wing: ['#6f7f3c', '#5d6c33', '#3f6b5a'],
        tail: '#56652f',
        face: '#6f7f3c',
        beak: '#4a4744',
        underWing: '#e2662c',
        tailLength: 0.22,
      });
  }
}

/** A short tail on the tail bone ending in a tuft. */
function tuftTail(
  p: Parts,
  coat: THREE.ColorRepresentation,
  tuft: THREE.ColorRepresentation,
  length: number,
  r: number,
): void {
  const { mb, bodyY, back } = p;
  const top: Vec3 = [0, bodyY + 0.2 * length, back * 1.02];
  const end: Vec3 = [0, bodyY - 0.75 * length, back * 1.02 - 0.15 * length];
  mb.add(limb(top, end, r, r * 0.7, 4), coat, 'tail');
  mb.add(blob(end, [r * 1.6, r * 3, r * 1.6], 5), tuft, 'tail');
}

/** Ears as flattened lumps either side of the head. */
function ears(p: Parts, at: Vec3, radii: Vec3, colour: THREE.ColorRepresentation): void {
  for (const s of [1, -1])
    p.mb.add(blob([s * at[0], p.headAt.y + at[1], p.headAt.z + at[2]], radii, 5), colour, 'head');
}

/** African elephant: big ears, tusks; Asian elephant: small ears, twin-domed head, darker. */
function elephant(id: WildAnimalId, african: boolean): Model {
  const coat = african ? '#8f8b86' : '#6e6866';
  const p = quadruped({
    shoulder: african ? 3.2 : 2.7,
    length: african ? 3.2 : 2.9,
    girth: african ? [1.05, 1.15] : [0.95, 1.05],
    leg: african ? 0.34 : 0.31,
    legSpread: 0.36,
    neck: [0.24, -0.06],
    head: [0.62, 0.72, 0.62],
    headDrop: 0.15,
    coat,
    hoof: '#c9c1b2',
  });
  const { mb, headAt, bodyY } = p;
  if (african) {
    // Huge fan ears, the African elephant's mark.
    for (const s of [1, -1]) {
      // Hinged at the side of the head, hanging back over the neck.
      const ear = blob([0, 0, 0], [0.1, 0.85, 0.7], 8);
      ear.rotateY(s * 0.3);
      ear.translate(s * 0.62, headAt.y - 0.05, headAt.z - 0.42);
      mb.add(ear, shade(coat, -0.08), 'head');
    }
  } else {
    // Two domes on the forehead and small ears.
    for (const s of [1, -1])
      mb.add(
        blob([s * 0.24, headAt.y + 0.52, headAt.z - 0.05], [0.32, 0.3, 0.34], 7),
        coat,
        'head',
      );
    ears(p, [0.56, 0.0, -0.2], [0.08, 0.45, 0.32], shade(coat, -0.08));
  }
  // Trunk hanging nearly to the ground, curling forward at the tip.
  mb.add(
    horn(
      [0, headAt.y - 0.2, headAt.z + 0.5],
      [0, headAt.y - 1.9, headAt.z + 0.85],
      [0, 0.45, headAt.z + 0.95],
      0.24,
      0.1,
      6,
      6,
    ),
    shade(coat, 0.04),
    'head',
  );
  if (african)
    for (const s of [1, -1])
      mb.add(
        horn(
          [s * 0.28, headAt.y - 0.45, headAt.z + 0.42],
          [s * 0.38, headAt.y - 1.15, headAt.z + 0.8],
          [s * 0.3, headAt.y - 1.0, headAt.z + 1.2],
          0.11,
          0.05,
          5,
          5,
        ),
        '#f1e7d0',
        'head',
      );
  tuftTail(p, coat, shade(coat, -0.4), 1.0, 0.06);
  mb.add(blob([0, bodyY + 0.95, 0.3], [0.7, 0.35, 0.9], 7), coat, 'body'); // high back
  return mb.build(id);
}

function giraffe(): Model {
  const coat = '#d9a65c';
  const patch = '#8a5228';
  const p = quadruped({
    shoulder: 2.9,
    length: 1.9,
    girth: [0.42, 0.5],
    leg: 0.085,
    neck: [0.32, 0.72],
    head: [0.15, 0.17, 0.36],
    headDrop: 0.75,
    coat,
    belly: '#efd9ad',
    legColour: '#e2c28a',
    hoof: '#3a2c22',
  });
  const { mb, headAt, bodyY, front } = p;
  // A second, thicker neck along the first, so the long neck reads from afar.
  mb.add(
    limb([0, bodyY + 0.35, front * 0.9], [0, headAt.y - 0.35, headAt.z - 0.25], 0.26, 0.13, 6),
    coat,
    'head',
  );
  // Brown patches on the body and neck.
  const spots: Vec3[] = [
    [0.4, 0.2, 0.55],
    [-0.4, 0.15, 0.5],
    [0.42, 0.1, -0.25],
    [-0.42, 0.22, -0.3],
    [0.3, 0.42, 0.1],
    [-0.3, 0.42, 0.05],
    [0.0, 0.48, -0.55],
  ];
  for (const [x, y, z] of spots)
    mb.add(blob([x, bodyY + y, z], [0.13, 0.15, 0.17], 5), patch, 'body');
  for (const t of [0.3, 0.6]) {
    const y = bodyY + 0.5 + (headAt.y - bodyY - 0.9) * t;
    const z = front * 0.9 + (headAt.z - front * 0.9) * t;
    for (const s of [1, -1]) mb.add(blob([s * 0.15, y, z], [0.07, 0.13, 0.1], 5), patch, 'head');
  }
  // Dark mane along the back of the thick neck, sunk a little into it.
  const na: Vec3 = [0, bodyY + 0.35, front * 0.9];
  const nb: Vec3 = [0, headAt.y - 0.35, headAt.z - 0.25];
  const dy = nb[1] - na[1];
  const dz = nb[2] - na[2];
  const len = Math.sqrt(dy * dy + dz * dz);
  // Unit vector across the neck towards its back, and the neck radius there.
  const [by, bz] = [dz / len, -dy / len];
  const onBack = (t: number, r: number): Vec3 => [
    0,
    na[1] + dy * t + by * r * 0.8,
    na[2] + dz * t + bz * r * 0.8,
  ];
  mb.add(limb(onBack(0.1, 0.27), onBack(1.05, 0.15), 0.075, 0.055, 4), patch, 'head');
  // Ossicones and ears.
  for (const s of [1, -1]) {
    mb.add(
      limb(
        [s * 0.07, headAt.y + 0.12, headAt.z - 0.15],
        [s * 0.09, headAt.y + 0.38, headAt.z - 0.2],
        0.035,
        0.045,
        4,
      ),
      patch,
      'head',
    );
    mb.add(
      cone(
        [s * 0.12, headAt.y + 0.08, headAt.z - 0.2],
        [s * 0.3, headAt.y + 0.15, headAt.z - 0.25],
        0.05,
        4,
      ),
      coat,
      'head',
    );
  }
  tuftTail(p, coat, '#2e2219', 0.9, 0.03);
  return mb.build('animal-giraffe');
}

function zebra(): Model {
  const white = '#f2eee6';
  const black = '#26211e';
  const p = quadruped({
    shoulder: 1.3,
    length: 1.55,
    girth: [0.37, 0.41],
    leg: 0.085,
    neck: [0.42, 0.3],
    head: [0.17, 0.2, 0.42],
    headDrop: 0.9,
    coat: white,
    legColour: '#d9d4cb',
    hoof: black,
  });
  const { mb, headAt, bodyY, front, back } = p;
  // Stripes: thin dark bands wrapped round the barrel, slightly proud of it.
  for (const z of [0.55, 0.3, 0.05, -0.2, -0.45]) {
    mb.add(blob([0, bodyY + 0.03, z], [0.4, 0.44, 0.045], 7), black, 'body');
  }
  // Rump stripes and a striped neck.
  for (const s of [1, -1])
    mb.add(blob([s * 0.3, bodyY + 0.05, back * 0.72], [0.1, 0.32, 0.045], 5), black, 'body');
  for (const t of [0.35, 0.65]) {
    const y = bodyY + 0.3 + (headAt.y - bodyY - 0.4) * t;
    const z = front * 0.8 + (headAt.z - 0.2 - front * 0.8) * t;
    mb.add(blob([0, y, z], [0.17, 0.05, 0.13], 5), black, 'head');
  }
  // Upright black and white mane, dark muzzle, ears.
  mb.add(
    limb([0, bodyY + 0.42, front * 0.55], [0, headAt.y + 0.18, headAt.z - 0.25], 0.08, 0.06, 5),
    black,
    'head',
  );
  mb.add(blob([0, headAt.y - 0.2, headAt.z + 0.27], [0.12, 0.11, 0.12], 6), black, 'head');
  for (const s of [1, -1])
    mb.add(
      cone(
        [s * 0.1, headAt.y + 0.15, headAt.z - 0.25],
        [s * 0.14, headAt.y + 0.4, headAt.z - 0.27],
        0.05,
        5,
      ),
      white,
      'head',
    );
  tuftTail(p, white, black, 0.6, 0.035);
  return mb.build('animal-zebra');
}

function wildebeest(): Model {
  const coat = '#6f7378';
  const dark = '#2b2726';
  const p = quadruped({
    shoulder: 1.4,
    length: 1.6,
    girth: [0.37, 0.45],
    leg: 0.075,
    neck: [0.32, 0.05],
    head: [0.15, 0.2, 0.42],
    headDrop: 1.0,
    coat,
    legColour: '#55585c',
    hoof: dark,
  });
  const { mb, headAt, bodyY, front } = p;
  // Heavy front and sloping back; dark shoulder bands.
  mb.add(blob([0, bodyY + 0.2, front * 0.55], [0.42, 0.52, 0.45], 8), coat, 'body');
  for (const z of [0.55, 0.35, 0.15])
    for (const s of [1, -1])
      mb.add(blob([s * 0.36, bodyY + 0.05, z], [0.05, 0.3, 0.035], 4), dark, 'body');
  // Black mane, beard and face.
  mb.add(
    limb([0, bodyY + 0.5, front * 0.5], [0, headAt.y + 0.15, headAt.z - 0.25], 0.07, 0.06, 5),
    dark,
    'head',
  );
  mb.add(blob([0, headAt.y - 0.35, headAt.z - 0.2], [0.09, 0.26, 0.12], 5), dark, 'head');
  mb.add(blob([0, headAt.y - 0.05, headAt.z + 0.15], [0.13, 0.17, 0.3], 6), dark, 'head');
  // Horns out sideways, down, then up like a buffalo's.
  for (const s of [1, -1])
    mb.add(
      horn(
        [s * 0.08, headAt.y + 0.2, headAt.z - 0.2],
        [s * 0.42, headAt.y + 0.05, headAt.z - 0.2],
        [s * 0.36, headAt.y + 0.38, headAt.z - 0.12],
        0.06,
        0.02,
        5,
        4,
      ),
      '#3a3634',
      'head',
    );
  tuftTail(p, dark, dark, 0.65, 0.035);
  return mb.build('animal-wildebeest');
}

function lion(id: WildAnimalId, maned: boolean): Model {
  const coat = '#c9995a';
  const p = quadruped({
    shoulder: maned ? 1.15 : 1.0,
    length: maned ? 1.75 : 1.55,
    girth: maned ? [0.32, 0.37] : [0.28, 0.32],
    leg: maned ? 0.1 : 0.085,
    neck: [0.22, 0.05],
    head: maned ? [0.23, 0.23, 0.26] : [0.19, 0.2, 0.24],
    headDrop: 0.05,
    coat,
    belly: '#e3c693',
    hoof: shade(coat, -0.1).getStyle(),
  });
  const { mb, headAt } = p;
  if (maned)
    mb.add(blob([0, headAt.y - 0.05, headAt.z - 0.2], [0.42, 0.45, 0.36], 8), '#7a4a22', 'head');
  // Pale muzzle with a dark nose, round ears.
  const r = maned ? 1 : 0.85;
  mb.add(
    blob([0, headAt.y - 0.08, headAt.z + 0.2 * r], [0.12 * r, 0.1 * r, 0.12 * r], 6),
    '#ead2a6',
    'head',
  );
  mb.add(blob([0, headAt.y - 0.01, headAt.z + 0.31 * r], [0.04, 0.03, 0.03], 4), '#3a2620', 'head');
  ears(p, [0.15 * r, 0.2 * r, -0.06], [0.06, 0.07, 0.04], coat);
  // Long tail with a dark tuft.
  mb.add(
    horn(
      [0, p.bodyY + 0.15, p.back],
      [0, p.bodyY - 0.2, p.back * 1.5],
      [0, p.bodyY - 0.55, p.back * 1.55],
      0.04,
      0.03,
      4,
      4,
    ),
    coat,
    'tail',
  );
  mb.add(blob([0, p.bodyY - 0.6, p.back * 1.55], [0.06, 0.09, 0.06], 5), '#4a3020', 'tail');
  return mb.build(id);
}

function camel(): Model {
  const coat = '#c9a06a';
  const p = quadruped({
    shoulder: 1.9,
    length: 1.75,
    girth: [0.4, 0.45],
    leg: 0.085,
    neck: [0.5, 0.22],
    head: [0.13, 0.15, 0.36],
    headDrop: 0.3,
    coat,
    belly: '#dcbd8c',
    hoof: '#6b5236',
  });
  const { mb, headAt, bodyY } = p;
  // One big hump.
  mb.add(blob([0, bodyY + 0.42, -0.05], [0.3, 0.4, 0.42], 8), coat, 'body');
  mb.add(blob([0, headAt.y - 0.08, headAt.z + 0.26], [0.1, 0.1, 0.12], 5), '#b48a55', 'head');
  ears(p, [0.1, 0.13, -0.25], [0.04, 0.06, 0.04], coat);
  tuftTail(p, coat, shade(coat, -0.3).getStyle(), 0.55, 0.03);
  return mb.build('animal-camel');
}

function yak(): Model {
  const coat = '#2f2722';
  const p = quadruped({
    shoulder: 1.75,
    length: 2.2,
    girth: [0.6, 0.62],
    leg: 0.13,
    neck: [0.16, -0.22],
    head: [0.28, 0.3, 0.38],
    headDrop: 0.5,
    coat,
    hoof: '#1a1512',
  });
  const { mb, headAt, bodyY } = p;
  mb.add(blob([0, 1.65, 0.5], [0.6, 0.45, 0.75], 8), coat, 'body'); // hump
  // Long skirt of shaggy hair down the flanks.
  for (const s of [1, -1])
    mb.add(blob([s * 0.5, bodyY - 0.5, 0.05], [0.32, 0.6, 1.25], 8), shade(coat, 0.08), 'body');
  mb.add(blob([0, headAt.y - 0.05, headAt.z + 0.22], [0.16, 0.15, 0.14], 6), '#5a4e44', 'head');
  // Wide horns curving up and forward.
  for (const s of [1, -1])
    mb.add(
      horn(
        [s * 0.22, headAt.y + 0.22, headAt.z - 0.1],
        [s * 0.7, headAt.y + 0.3, headAt.z - 0.1],
        [s * 0.55, headAt.y + 0.75, headAt.z + 0.08],
        0.075,
        0.025,
        5,
        4,
      ),
      '#d8d0c0',
      'head',
    );
  // Bushy tail.
  mb.add(
    limb([0, bodyY + 0.3, p.back], [0, bodyY - 0.55, p.back * 1.12], 0.06, 0.1, 4),
    coat,
    'tail',
  );
  return mb.build('animal-yak');
}

/** Brown bear: shoulder hump, round ears. Polar bear: creamy white, long neck, small head. */
function bear(id: WildAnimalId, polar: boolean): Model {
  const coat = polar ? '#efe9da' : '#7a5230';
  const p = quadruped({
    shoulder: polar ? 1.3 : 1.2,
    length: polar ? 2.0 : 1.8,
    girth: polar ? [0.52, 0.55] : [0.55, 0.58],
    leg: polar ? 0.18 : 0.18,
    neck: polar ? [0.38, -0.02] : [0.18, -0.08],
    head: polar ? [0.25, 0.25, 0.3] : [0.31, 0.3, 0.29],
    headDrop: polar ? 0.15 : 0.1,
    coat,
    hoof: polar ? '#d8d0bd' : '#3a2a20',
  });
  const { mb, headAt, bodyY, back } = p;
  if (!polar) mb.add(blob([0, 1.18, 0.45], [0.46, 0.32, 0.5], 8), coat, 'body'); // hump
  const muzzle = polar ? '#e6dfcd' : '#a07a55';
  // A short round muzzle on a round face, with round ears.
  mb.add(
    blob([0, headAt.y - 0.08, headAt.z + (polar ? 0.27 : 0.25)], [0.13, 0.11, 0.11], 6),
    muzzle,
    'head',
  );
  mb.add(
    blob([0, headAt.y - 0.03, headAt.z + (polar ? 0.37 : 0.35)], [0.06, 0.05, 0.04], 5),
    '#1d1410',
    'head',
  );
  mb.add(
    blob([0, headAt.y - 0.08, headAt.z - 0.02], [polar ? 0.27 : 0.33, 0.22, 0.24], 7),
    coat,
    'head',
  ); // full cheeks
  ears(p, [polar ? 0.17 : 0.22, polar ? 0.2 : 0.25, -0.06], [0.09, 0.09, 0.06], coat);
  mb.add(blob([0, bodyY + 0.2, back * 1.02], [0.09, 0.08, 0.08], 5), coat, 'tail');
  return mb.build(id);
}

function guanaco(): Model {
  const coat = '#b9875a';
  const p = quadruped({
    shoulder: 1.1,
    length: 1.2,
    girth: [0.28, 0.32],
    leg: 0.065,
    neck: [0.25, 0.75],
    head: [0.12, 0.14, 0.26],
    headDrop: 0.35,
    coat,
    belly: '#f0e7da',
    legColour: '#a97a50',
    hoof: '#2e2219',
  });
  const { mb, headAt, bodyY, front } = p;
  // A thicker upright neck and the grey face.
  mb.add(
    limb([0, bodyY + 0.15, front * 0.85], [0, headAt.y - 0.2, headAt.z - 0.12], 0.16, 0.1, 6),
    coat,
    'head',
  );
  mb.add(blob([0, headAt.y - 0.02, headAt.z + 0.08], [0.11, 0.12, 0.2], 6), '#6a625a', 'head');
  for (const s of [1, -1])
    mb.add(
      cone(
        [s * 0.07, headAt.y + 0.1, headAt.z - 0.1],
        [s * 0.1, headAt.y + 0.3, headAt.z - 0.12],
        0.045,
        4,
      ),
      coat,
      'head',
    );
  mb.add(blob([0, bodyY + 0.12, p.back * 1.05], [0.07, 0.12, 0.07], 5), shade(coat, -0.2), 'tail');
  return mb.build('animal-guanaco');
}

/** A crocodile: long and low, legs sprawled to the sides, ridged tail. */
function crocodile(): Model {
  const skin = '#5d6b3c';
  const belly = '#b6ad78';
  const bodyY = 0.27;
  const mb = new ModelBuilder([
    { name: 'body', pivot: [0, bodyY, 0] },
    { name: 'head', pivot: [0, bodyY, 0.75], parent: 'body' },
    { name: 'legFL', pivot: [0.32, bodyY, 0.5], parent: 'body' },
    { name: 'legFR', pivot: [-0.32, bodyY, 0.5], parent: 'body' },
    { name: 'legBL', pivot: [0.32, bodyY, -0.55], parent: 'body' },
    { name: 'legBR', pivot: [-0.32, bodyY, -0.55], parent: 'body' },
    { name: 'tail', pivot: [0, bodyY, -0.8], parent: 'body' },
  ]);
  mb.add(blob([0, bodyY, 0], [0.4, 0.24, 0.95], 8), skin, 'body');
  mb.add(blob([0, bodyY - 0.1, 0.05], [0.33, 0.14, 0.8], 7), belly, 'body');
  // Ridges along the back and tail.
  for (const z of [0.5, 0.2, -0.1, -0.4]) {
    for (const s of [1, -1])
      mb.add(
        cone([s * 0.14, bodyY + 0.18, z], [s * 0.14, bodyY + 0.33, z], 0.06, 4),
        shade(skin, -0.2),
        'body',
      );
  }
  // Head with a long snout, eye bumps on top and a row of teeth.
  mb.add(blob([0, bodyY + 0.02, 0.95], [0.26, 0.17, 0.3], 7), skin, 'head');
  mb.add(blob([0, bodyY - 0.02, 1.45], [0.15, 0.1, 0.5], 7), skin, 'head');
  mb.add(blob([0, bodyY - 0.08, 1.45], [0.13, 0.05, 0.46], 6), belly, 'head');
  for (const s of [1, -1]) {
    mb.add(blob([s * 0.12, bodyY + 0.17, 1.02], [0.07, 0.07, 0.07], 5), skin, 'head');
    mb.add(blob([s * 0.14, bodyY + 0.2, 1.06], [0.03, 0.03, 0.03], 4), '#e0b02a', 'head');
    mb.add(blob([s * 0.15, bodyY - 0.05, 1.55], [0.015, 0.05, 0.25], 4), '#f2ecd9', 'head');
  }
  // Legs: out to the side and down, feet flat on the ground.
  for (const [bone, x, z] of [
    ['legFL', 1, 0.5],
    ['legFR', -1, 0.5],
    ['legBL', 1, -0.55],
    ['legBR', -1, -0.55],
  ] as const) {
    mb.add(limb([x * 0.3, bodyY, z], [x * 0.48, 0.07, z + 0.05], 0.09, 0.07, 5), skin, bone);
    mb.add(blob([x * 0.5, 0.04, z + 0.12], [0.1, 0.04, 0.13], 5), shade(skin, -0.25), bone);
  }
  // Tail: long, tapering, with a ridge.
  mb.add(
    horn([0, bodyY, -0.75], [0, bodyY - 0.05, -1.5], [0.25, 0.12, -2.2], 0.22, 0.04, 6, 6),
    skin,
    'tail',
  );
  mb.add(
    horn([0, bodyY + 0.18, -0.8], [0, bodyY + 0.1, -1.5], [0.22, 0.2, -2.1], 0.05, 0.02, 5, 4),
    shade(skin, -0.2),
    'tail',
  );
  return mb.build('animal-crocodile');
}

/** Emperor penguin: upright, black back, white front, yellow neck patches, flippers. */
function penguin(): Model {
  const black = '#22262e';
  const white = '#f3f1ea';
  const mb = new ModelBuilder([
    { name: 'body', pivot: [0, 0.2, 0] },
    { name: 'head', pivot: [0, 1.0, 0.04], parent: 'body' },
    { name: 'wingL', pivot: [0.26, 0.85, 0], parent: 'body' },
    { name: 'wingR', pivot: [-0.26, 0.85, 0], parent: 'body' },
    { name: 'legL', pivot: [0.1, 0.2, 0.02], parent: 'body' },
    { name: 'legR', pivot: [-0.1, 0.2, 0.02], parent: 'body' },
  ]);
  mb.add(blob([0, 0.6, -0.02], [0.3, 0.57, 0.27], 9), black, 'body');
  mb.add(blob([0, 0.56, 0.07], [0.26, 0.52, 0.22], 9), white, 'body');
  mb.add(blob([0, 0.85, 0.12], [0.18, 0.16, 0.12], 6), '#f4e3a8', 'body'); // pale yellow chest
  mb.add(blob([0, 1.16, 0.02], [0.16, 0.16, 0.17], 8), black, 'head');
  for (const s of [1, -1]) {
    mb.add(blob([s * 0.13, 1.08, 0.06], [0.05, 0.08, 0.06], 5), '#f2b631', 'head'); // ear patches
    mb.add(blob([s * 0.08, 1.2, 0.13], [0.025, 0.025, 0.025], 4), '#f3f1ea', 'head');
  }
  mb.add(cone([0, 1.13, 0.14], [0, 1.08, 0.36], 0.045, 5), black, 'head');
  mb.add(blob([0, 1.1, 0.25], [0.02, 0.025, 0.07], 4), '#e98a3a', 'head'); // orange beak stripe
  const flipper = blob([0.3, 0.6, 0], [0.04, 0.3, 0.1], 6);
  flipper.rotateZ(0.15);
  mb.add(flipper, black, 'wingL');
  mb.add(mirrorX(flipper), black, 'wingR');
  const foot = blob([0.1, 0.04, 0.1], [0.07, 0.04, 0.11], 5);
  mb.add(foot, '#3a3530', 'legL');
  mb.add(mirrorX(foot), '#3a3530', 'legR');
  mb.add(cone([0, 0.25, -0.22], [0, 0.12, -0.38], 0.08, 4), black, 'body'); // tail
  return mb.build('animal-penguin');
}

interface BirdLook {
  body: string;
  /** Wing bands from the shoulder out. */
  wing: [string, string, string];
  tail: string;
  face: string;
  beak: string;
  underWing: string;
  tailLength: number;
}

/** A parrot drawn in flight: wings spread, tail streaming behind, feet tucked. */
function bird(id: WildAnimalId, look: BirdLook): Model {
  const y = 0.16;
  const mb = new ModelBuilder([
    { name: 'body', pivot: [0, y, 0] },
    { name: 'head', pivot: [0, y + 0.04, 0.16], parent: 'body' },
    { name: 'wingL', pivot: [0.08, y + 0.05, 0.03], parent: 'body' },
    { name: 'wingR', pivot: [-0.08, y + 0.05, 0.03], parent: 'body' },
    { name: 'tail', pivot: [0, y, -0.16], parent: 'body' },
  ]);
  mb.add(blob([0, y, 0], [0.1, 0.11, 0.22], 7), look.body, 'body');
  mb.add(blob([0, y + 0.06, 0.24], [0.085, 0.09, 0.1], 7), look.body, 'head');
  for (const s of [1, -1]) {
    mb.add(blob([s * 0.06, y + 0.07, 0.28], [0.03, 0.045, 0.05], 5), look.face, 'head');
    mb.add(blob([s * 0.072, y + 0.08, 0.29], [0.015, 0.015, 0.015], 4), EYE, 'head');
  }
  // Hooked beak.
  mb.add(
    horn([0, y + 0.07, 0.31], [0, y + 0.06, 0.4], [0, y - 0.01, 0.38], 0.04, 0.008, 4, 5),
    look.beak,
    'head',
  );
  // Wings: three bands from the shoulder out, flat and wide, coloured underneath.
  for (const s of [1, -1]) {
    const bone = s > 0 ? 'wingL' : 'wingR';
    look.wing.forEach((colour, i) => {
      const x = s * (0.15 + i * 0.12);
      mb.add(blob([x, y + 0.05, 0.02 - i * 0.03], [0.1, 0.028, 0.14 - i * 0.02], 6), colour, bone);
    });
    mb.add(blob([s * 0.22, y + 0.03, 0.0], [0.12, 0.012, 0.1], 5), look.underWing, bone);
  }
  // Tail streaming back, feet tucked under.
  mb.add(cone([0, y, -0.15], [0, y - 0.02, -0.15 - look.tailLength], 0.06, 5), look.tail, 'tail');
  mb.add(blob([0, y - 0.1, -0.02], [0.05, 0.03, 0.06], 4), '#5a5048', 'body');
  // The tucked feet touch y = 0 so the model stands on its "feet" like every model.
  mb.add(blob([0, 0.03, -0.02], [0.03, 0.03, 0.04], 4), '#5a5048', 'body');
  return mb.build(id);
}
