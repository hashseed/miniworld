// Neolithic livestock (spec neolithic/livestock.md): early domestic sheep,
// goat, cattle and pig. Life size in metres, facing +Z, feet on y = 0.

import { type Model, type Vec3, blob, cone, horn, limb } from './kit.ts';
import { quadruped } from './quadruped.ts';
import { ears, tuftTail } from './wildAnimals.ts';

export const LIVESTOCK_ANIMALS = [
  'animal-sheep',
  'animal-goat',
  'animal-cattle',
  'animal-pig',
] as const;
export type LivestockId = (typeof LIVESTOCK_ANIMALS)[number];

export function buildLivestock(id: LivestockId): Model {
  switch (id) {
    case 'animal-sheep':
      return sheep();
    case 'animal-goat':
      return goat();
    case 'animal-cattle':
      return cattle();
    case 'animal-pig':
      return pig();
  }
}

/** Early domestic sheep: a short pale fleece over a dark brown face and legs, small curled horns. */
function sheep(): Model {
  const dark = '#5e4a38';
  const fleece = '#dcd0b2';
  const p = quadruped({
    shoulder: 0.7,
    length: 0.9,
    girth: [0.2, 0.22],
    leg: 0.032,
    legSpread: 0.62,
    neck: [0.2, 0.0],
    head: [0.07, 0.1, 0.16],
    headDrop: 0.55,
    coat: dark,
    hoof: '#2a2119',
  });
  const { mb, headAt, bodyY, front, back } = p;
  // The fleece: barrel, chest, rump and a ruff round the neck.
  mb.add(blob([0, bodyY + 0.01, 0], [0.245, 0.255, 0.5], 9), fleece, 'body');
  mb.add(blob([0, bodyY + 0.03, front * 0.55], [0.23, 0.24, 0.22], 8), fleece, 'body');
  mb.add(blob([0, bodyY + 0.01, back * 0.6], [0.23, 0.24, 0.2], 8), fleece, 'body');
  mb.add(blob([0, bodyY + 0.17, front * 0.8], [0.12, 0.15, 0.14], 7), fleece, 'head');
  // A small curled horn on each side.
  for (const s of [1, -1])
    mb.add(
      horn(
        [s * 0.05, headAt.y + 0.1, headAt.z - 0.07],
        [s * 0.17, headAt.y + 0.19, headAt.z - 0.14],
        [s * 0.12, headAt.y + 0.0, headAt.z - 0.17],
        0.03,
        0.012,
        5,
        5,
      ),
      '#c9b995',
      'head',
    );
  ears(p, [0.1, 0.03, -0.1], [0.07, 0.03, 0.04], dark);
  mb.add(blob([0, bodyY - 0.02, back * 1.08], [0.05, 0.1, 0.05], 5), fleece, 'tail');
  return p.mb.build('animal-sheep');
}

/** Domestic goat: wild bezoar colours, a dark stripe, a beard and horns swept back. */
function goat(): Model {
  const coat = '#85705a';
  const dark = '#33291f';
  const p = quadruped({
    shoulder: 0.68,
    length: 0.85,
    girth: [0.15, 0.19],
    leg: 0.028,
    legSpread: 0.7,
    neck: [0.2, 0.09],
    head: [0.065, 0.09, 0.16],
    headDrop: 0.45,
    coat,
    belly: '#cdbb98',
    legColour: dark,
    hoof: '#1f1812',
  });
  const { mb, headAt, bodyY, front, back } = p;
  // Dark stripe down the spine.
  mb.add(
    limb([0, bodyY + 0.15, front * 0.5], [0, bodyY + 0.14, back * 0.6], 0.025, 0.022, 4),
    dark,
    'body',
  );
  // Beard, and a pale blaze on the face.
  mb.add(blob([0, headAt.y - 0.12, headAt.z + 0.1], [0.03, 0.07, 0.03], 5), dark, 'head');
  mb.add(blob([0, headAt.y + 0.0, headAt.z + 0.15], [0.03, 0.05, 0.045], 5), '#cdbb98', 'head');
  for (const s of [1, -1])
    mb.add(
      horn(
        [s * 0.04, headAt.y + 0.08, headAt.z - 0.07],
        [s * 0.07, headAt.y + 0.27, headAt.z - 0.2],
        [s * 0.09, headAt.y + 0.22, headAt.z - 0.4],
        0.026,
        0.008,
        6,
        5,
      ),
      '#b9a883',
      'head',
    );
  ears(p, [0.09, 0.04, -0.1], [0.06, 0.025, 0.04], coat);
  // A short tail held up.
  mb.add(
    limb([0, bodyY + 0.12, back * 1.0], [0, bodyY + 0.24, back * 1.08], 0.03, 0.02, 4),
    dark,
    'tail',
  );
  return mb.build('animal-goat');
}

/** Early domestic cattle: the aurochs recipe at about 0.64 of its height, with shorter horns. */
function cattle(): Model {
  const coat = '#5a3422';
  const p = quadruped({
    shoulder: 1.15,
    length: 1.6,
    girth: [0.34, 0.4],
    leg: 0.06,
    neck: [0.2, -0.08],
    head: [0.15, 0.19, 0.3],
    headDrop: 0.8,
    coat,
    legColour: '#4d2c1d',
    hoof: '#1f1511',
  });
  const { mb, headAt, bodyY, front, back } = p;
  mb.add(
    limb([0, bodyY + 0.33, front * 0.4], [0, bodyY + 0.31, back * 0.6], 0.04, 0.035, 4),
    '#a48a68',
    'body',
  );
  mb.add(blob([0, headAt.y - 0.2, headAt.z + 0.18], [0.11, 0.1, 0.09], 5), '#cdb99c', 'head');
  for (const s of [1, -1])
    mb.add(
      horn(
        [s * 0.11, headAt.y + 0.13, headAt.z - 0.09],
        [s * 0.34, headAt.y + 0.17, headAt.z - 0.04],
        [s * 0.27, headAt.y + 0.36, headAt.z + 0.1],
        0.05,
        0.018,
        5,
        5,
      ),
      '#e4d8bb',
      'head',
    );
  ears(p, [0.18, 0.04, -0.15], [0.07, 0.04, 0.04], coat);
  tuftTail(p, coat, '#2b1a12', 0.6, 0.03);
  return mb.build('animal-cattle');
}

/** Early domestic pig: lean and bristly, long snout, small tusks, a ridge of bristles, curly tail. */
function pig(): Model {
  const coat = '#5d4b3d';
  const bristle = '#2b231c';
  const p = quadruped({
    shoulder: 0.58,
    length: 1.0,
    girth: [0.18, 0.2],
    leg: 0.03,
    legSpread: 0.65,
    neck: [0.12, -0.12],
    head: [0.1, 0.11, 0.26],
    headDrop: 0.3,
    coat,
    legColour: '#524136',
    hoof: '#1f1812',
  });
  const { mb, headAt, bodyY, front, back } = p;
  // Snout disc and nostrils, small tusks.
  const snout: Vec3 = [0, headAt.y - 0.045, headAt.z + 0.26];
  mb.add(blob(snout, [0.055, 0.05, 0.055], 6), '#b99086', 'head');
  mb.add(blob([0, snout[1] - 0.01, snout[2] + 0.04], [0.04, 0.035, 0.02], 5), '#7a5a54', 'head');
  for (const s of [1, -1])
    mb.add(
      cone(
        [s * 0.07, snout[1] - 0.03, snout[2] - 0.04],
        [s * 0.085, snout[1] + 0.045, snout[2] - 0.01],
        0.014,
        4,
      ),
      '#e6dcc4',
      'head',
    );
  // Ears: small, upright and turned forward.
  for (const s of [1, -1])
    mb.add(
      cone(
        [s * 0.08, headAt.y + 0.08, headAt.z - 0.1],
        [s * 0.1, headAt.y + 0.2, headAt.z - 0.02],
        0.045,
        4,
      ),
      coat,
      'head',
    );
  // The bristle crest along the spine.
  for (let i = 0; i < 6; i++) {
    const z = front * 0.7 - (i * (front * 0.7 - back * 0.55)) / 5;
    mb.add(cone([0, bodyY + 0.17, z], [0, bodyY + 0.27, z - 0.05], 0.022, 4), bristle, 'body');
  }
  // Curly tail.
  mb.add(
    horn(
      [0, bodyY + 0.08, back * 1.02],
      [0, bodyY + 0.25, back * 1.15],
      [0.04, bodyY + 0.15, back * 1.08],
      0.016,
      0.01,
      5,
      4,
    ),
    coat,
    'tail',
  );
  return mb.build('animal-pig');
}
