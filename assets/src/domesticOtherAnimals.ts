// Domesticated animals of the other centres of domestication (spec
// docs/spec/neolithic/domestic-animals-other-centres.md). Life size in metres,
// facing +Z, feet on y = 0, built like the wild animals.

import { type Model, ModelBuilder, blob, cone, horn, limb, mirrorX, shade } from './kit.ts';
import { quadruped } from './quadruped.ts';
import { tuftTail } from './wildAnimals.ts';

export const DOMESTIC_OTHER_ANIMALS = [
  'animal-dog',
  'animal-zebu',
  'animal-water-buffalo',
  'animal-llama',
  'animal-guinea-pig',
] as const;
export type DomesticOtherAnimalId = (typeof DOMESTIC_OTHER_ANIMALS)[number];

const EYE = '#1d1410';

export function buildDomesticOtherAnimal(id: DomesticOtherAnimalId): Model {
  switch (id) {
    case 'animal-dog':
      return dog();
    case 'animal-zebu':
      return zebu();
    case 'animal-water-buffalo':
      return waterBuffalo();
    case 'animal-llama':
      return llama();
    case 'animal-guinea-pig':
      return guineaPig();
  }
}

/** Early dog: small and lean, tan with a white chest and feet, blunt muzzle, tail curled over the back. */
function dog(): Model {
  const coat = '#b98c5a';
  const p = quadruped({
    taper: true,
    knee: 1.1,
    shoulder: 0.55,
    length: 0.8,
    girth: [0.14, 0.17],
    leg: 0.04,
    neck: [0.28, 0.14],
    head: [0.1, 0.1, 0.15],
    headDrop: 0.2,
    coat,
    belly: '#eadfc9',
    legColour: '#e6dac3',
    hoof: '#6b5a48',
  });
  const { mb, headAt, bodyY, back, front } = p;
  // Dark saddle over the back and a white chest.
  mb.add(blob([0, bodyY + 0.09, -0.02], [0.115, 0.1, 0.27], 7), '#6d4b2e', 'body');
  mb.add(blob([0, bodyY - 0.03, front * 0.8], [0.1, 0.12, 0.12], 6), '#eadfc9', 'body');
  // Short blunt muzzle with a black nose.
  mb.add(
    cone([0, headAt.y - 0.03, headAt.z + 0.07], [0, headAt.y - 0.05, headAt.z + 0.21], 0.055, 6),
    '#d9bf97',
    'head',
  );
  mb.add(blob([0, headAt.y - 0.045, headAt.z + 0.21], [0.026, 0.022, 0.022], 4), EYE, 'head');
  // Ears stand, short, and fold over at the tip.
  for (const s of [1, -1])
    mb.add(
      cone(
        [s * 0.06, headAt.y + 0.07, headAt.z - 0.04],
        [s * 0.08, headAt.y + 0.14, headAt.z - 0.02],
        0.04,
        4,
      ),
      '#6d4b2e',
      'head',
    );
  // Tail curled up over the back.
  mb.add(
    horn(
      [0, bodyY + 0.1, back],
      [0, bodyY + 0.3, back - 0.14],
      [0, bodyY + 0.24, back + 0.12],
      0.035,
      0.025,
      4,
      4,
    ),
    shade(coat, 0.1),
    'tail',
  );
  return mb.build('animal-dog');
}

/** Zebu: high shoulder hump, loose dewlap, long drooping ears, short horns, light grey with a dark front. */
function zebu(): Model {
  const coat = '#b8ad98';
  const dark = '#716a5e';
  const p = quadruped({
    taper: true,
    shoulder: 1.2,
    length: 1.75,
    girth: [0.38, 0.45],
    leg: 0.082,
    neck: [0.16, 0.06],
    head: [0.17, 0.22, 0.36],
    headDrop: 0.75,
    coat,
    belly: '#ddd6c6',
    legColour: '#b9b2a1',
    hoof: '#2a211b',
  });
  const { mb, headAt, bodyY, front } = p;
  // The hump over the shoulders, dark like the neck.
  mb.add(blob([0, bodyY + 0.4, front * 0.35], [0.27, 0.25, 0.34], 8), shade(coat, -0.06), 'body');
  mb.add(blob([0, bodyY + 0.12, front * 0.92], [0.34, 0.34, 0.26], 8), dark, 'body');
  // Dewlap: loose skin hanging from throat to chest.
  mb.add(
    blob([0, headAt.y - 0.34, front * 0.95 + 0.02], [0.08, 0.26, 0.22], 6),
    shade(coat, -0.1),
    'head',
  );
  mb.add(blob([0, headAt.y - 0.12, headAt.z + 0.22], [0.12, 0.1, 0.12], 5), '#8e867a', 'head'); // muzzle
  // Long drooping ears and short horns up and out.
  for (const s of [1, -1]) {
    mb.add(
      blob([s * 0.26, headAt.y + 0.02, headAt.z - 0.12], [0.13, 0.035, 0.07], 5),
      dark,
      'head',
    );
    mb.add(
      horn(
        [s * 0.14, headAt.y + 0.17, headAt.z - 0.15],
        [s * 0.3, headAt.y + 0.3, headAt.z - 0.2],
        [s * 0.3, headAt.y + 0.5, headAt.z - 0.12],
        0.05,
        0.015,
        4,
        4,
      ),
      '#d9d0b8',
      'head',
    );
  }
  tuftTail(p, coat, '#2a2420', 0.9, 0.03);
  return mb.build('animal-zebu');
}

/** Swamp buffalo: slate grey and sparsely haired, broad face, horns sweeping out and back, pale chevron. */
function waterBuffalo(): Model {
  const coat = '#6b6d70';
  const p = quadruped({
    taper: true,
    shoulder: 1.2,
    length: 2.0,
    girth: [0.5, 0.5],
    leg: 0.1,
    neck: [0.2, -0.2],
    head: [0.2, 0.22, 0.4],
    headDrop: 0.8,
    coat,
    belly: '#7d7f82',
    legColour: '#8b8c8e',
    hoof: '#26221f',
  });
  const { mb, headAt } = p;
  mb.add(blob([0, headAt.y - 0.1, headAt.z + 0.24], [0.14, 0.11, 0.13], 5), '#8f8e8c', 'head'); // muzzle
  // The pale chevron under the throat.
  mb.add(blob([0, headAt.y - 0.2, headAt.z - 0.06], [0.12, 0.04, 0.1], 5), '#d8d4c8', 'head');
  // Big crescent horns sweeping out and back.
  for (const s of [1, -1]) {
    mb.add(
      horn(
        [s * 0.15, headAt.y + 0.14, headAt.z - 0.1],
        [s * 0.75, headAt.y + 0.22, headAt.z - 0.28],
        [s * 0.62, headAt.y + 0.3, headAt.z - 0.82],
        0.075,
        0.02,
        6,
        5,
      ),
      '#3a342e',
      'head',
    );
    mb.add(blob([s * 0.25, headAt.y + 0.05, headAt.z - 0.17], [0.1, 0.04, 0.06], 5), coat, 'head');
  }
  tuftTail(p, coat, '#3d3f42', 0.9, 0.035);
  return mb.build('animal-water-buffalo');
}

/** Llama: long neck, banana ears, woolly body in cream, brown and white patches. */
function llama(): Model {
  const coat = '#e4d6b8';
  const brown = '#7d5b3c';
  const white = '#f6f1e6';
  const p = quadruped({
    taper: true,
    shoulder: 1.15,
    length: 1.3,
    girth: [0.28, 0.32],
    leg: 0.062,
    neck: [0.2, 0.36],
    head: [0.11, 0.13, 0.23],
    headDrop: 0.4,
    coat,
    belly: white,
    legColour: '#cdb998',
    hoof: '#3a2c22',
  });
  const { mb, headAt, bodyY, front, back } = p;
  // Thick wool on the flanks and a thick neck, patched.
  for (const s of [1, -1])
    mb.add(blob([s * 0.2, bodyY + 0.02, 0], [0.16, 0.26, 0.5], 7), coat, 'body');
  mb.add(blob([0.2, bodyY + 0.06, -0.15], [0.13, 0.2, 0.3], 6), brown, 'body');
  mb.add(blob([-0.2, bodyY + 0.02, 0.25], [0.13, 0.22, 0.26], 6), white, 'body');
  mb.add(blob([-0.14, bodyY + 0.2, -0.3], [0.14, 0.12, 0.2], 6), brown, 'body');
  mb.add(
    limb([0, bodyY + 0.12, front * 0.85], [0, headAt.y - 0.25, headAt.z - 0.1], 0.15, 0.1, 6),
    coat,
    'head',
  );
  mb.add(blob([0, headAt.y - 0.5, headAt.z - 0.2], [0.14, 0.16, 0.12], 5), brown, 'head'); // neck patch
  mb.add(blob([0, headAt.y + 0.12, headAt.z - 0.08], [0.1, 0.07, 0.09], 5), coat, 'head'); // topknot
  mb.add(blob([0, headAt.y - 0.03, headAt.z + 0.1], [0.085, 0.09, 0.13], 5), white, 'head'); // face
  mb.add(blob([0, headAt.y - 0.04, headAt.z + 0.22], [0.03, 0.025, 0.02], 4), EYE, 'head');
  for (const s of [1, -1])
    mb.add(
      cone(
        [s * 0.06, headAt.y + 0.12, headAt.z - 0.1],
        [s * 0.09, headAt.y + 0.27, headAt.z - 0.12],
        0.045,
        4,
      ),
      brown,
      'head',
    );
  mb.add(blob([0, bodyY + 0.15, back * 1.03], [0.06, 0.1, 0.06], 5), coat, 'tail');
  return mb.build('animal-llama');
}

/** Guinea pig: a rounded, tailless cavy in orange, white and brown patches. */
function guineaPig(): Model {
  const orange = '#c98a4c';
  const white = '#f4eee2';
  const brown = '#5a3a24';
  const y = 0.09;
  const mb = new ModelBuilder([
    { name: 'body', pivot: [0, y, 0] },
    { name: 'head', pivot: [0, y + 0.02, 0.11], parent: 'body' },
    { name: 'tail', pivot: [0, y, -0.14], parent: 'body' },
    { name: 'legFL', pivot: [0.05, 0.06, 0.08], parent: 'body' },
    { name: 'legFR', pivot: [-0.05, 0.06, 0.08], parent: 'body' },
    { name: 'legBL', pivot: [0.05, 0.06, -0.08], parent: 'body' },
    { name: 'legBR', pivot: [-0.05, 0.06, -0.08], parent: 'body' },
  ]);
  mb.add(blob([0, y + 0.01, -0.01], [0.085, 0.085, 0.15], 8), orange, 'body', (c) =>
    c.x > 0.035 && c.z < 0.04 && c.z > -0.09 ? white : c.z < -0.1 ? brown : undefined,
  );
  mb.add(blob([0, y + 0.02, 0.15], [0.06, 0.06, 0.07], 7), orange, 'head');
  mb.add(blob([0, y + 0.03, 0.17], [0.025, 0.05, 0.06], 5), white, 'head'); // blaze
  mb.add(blob([0, y, 0.215], [0.022, 0.02, 0.015], 4), '#d9a0a0', 'head'); // nose
  for (const s of [1, -1]) {
    mb.add(blob([s * 0.05, y + 0.02, 0.2], [0.009, 0.011, 0.009], 4), EYE, 'head');
    mb.add(blob([s * 0.05, y + 0.07, 0.13], [0.025, 0.03, 0.012], 4), '#d9a0a0', 'head'); // ears
  }
  const leg = limb([0.05, 0.065, 0.08], [0.05, 0.02, 0.085], 0.025, 0.02, 5);
  for (const [name, z] of [
    ['FL', 0],
    ['BL', -0.16],
  ] as const) {
    const g = leg.clone();
    g.translate(0, 0, z);
    mb.add(g, orange, `leg${name}`);
    mb.add(mirrorX(g), orange, `leg${name.replace('L', 'R')}`);
    for (const s of [1, -1])
      mb.add(
        blob([s * 0.05, 0.015, z + 0.095], [0.02, 0.015, 0.03], 4),
        white,
        `leg${name.replace('L', s > 0 ? 'L' : 'R')}`,
      );
  }
  mb.add(blob([0, y - 0.01, -0.15], [0.02, 0.02, 0.02], 4), brown, 'tail');
  return mb.build('animal-guinea-pig');
}
