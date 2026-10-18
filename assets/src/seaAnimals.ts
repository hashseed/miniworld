// Sea animals (spec wildlife.md, section 6): whales, dolphins and Steller's
// sea cow. Life size in metres, facing +Z, the lowest point on y = 0 like
// the land animals; the wildlife layer floats them at the sea surface.

import { type Model, type Vec3, ModelBuilder, blob, cone, limb, mirrorX } from './kit.ts';

export const SEA_ANIMALS = ['animal-whale', 'animal-dolphin', 'animal-sea-cow'] as const;
export type SeaAnimalId = (typeof SEA_ANIMALS)[number];

const EYE = '#1d1410';

export function buildSeaAnimal(id: SeaAnimalId): Model {
  switch (id) {
    case 'animal-whale':
      return whale();
    case 'animal-dolphin':
      return dolphin();
    case 'animal-sea-cow':
      return seaCow();
  }
}

interface SwimmerShape {
  /** Body radii (half width, half height, half length) and the colours of back and belly. */
  body: Vec3;
  back: string;
  belly: string;
  /** Tail stock length and radius at the body, flukes half span. */
  tail: number;
  stock: number;
  flukes: number;
  /** Flipper length, width and how far back from the nose. */
  fin: [number, number, number];
}

/** A streamlined body on the body bone, tail stock and flukes on the tail bone, flippers on fin bones. */
function swimmer(s: SwimmerShape): {
  mb: ModelBuilder;
  mid: number;
  nose: number;
} {
  const [w, h, l] = s.body;
  // The flippers hang below the belly; the lowest of them rests on y = 0.
  const mid = h + Math.max(0, s.fin[0] * 0.5 * Math.sin(0.45) - h * 0.4);
  const nose = l;
  const tailAt = -l * 0.8;
  const mb = new ModelBuilder([
    { name: 'body', pivot: [0, mid, 0] },
    { name: 'head', pivot: [0, mid, l * 0.6], parent: 'body' },
    { name: 'tail', pivot: [0, mid, tailAt], parent: 'body' },
    { name: 'finL', pivot: [w * 0.8, mid - h * 0.4, l - s.fin[2]], parent: 'body' },
    { name: 'finR', pivot: [-w * 0.8, mid - h * 0.4, l - s.fin[2]], parent: 'body' },
  ]);
  // Dark back, pale belly painted on: the belly is the lower part of the body.
  mb.add(blob([0, mid, 0], [w, h, l], 10, 9, 'z'), s.back, 'body', (q) =>
    q.y < mid - h * 0.35 ? s.belly : undefined,
  );
  mb.add(
    limb(
      [0, mid, tailAt + l * 0.3],
      [0, mid + h * 0.05, tailAt - s.tail],
      s.stock,
      s.stock * 0.3,
      6,
    ),
    s.back,
    'tail',
  );
  for (const side of [1, -1]) {
    const fluke = blob([0, 0, 0], [s.flukes * 0.55, h * 0.06, s.flukes * 0.28], 6);
    fluke.rotateY(side * 0.5);
    fluke.translate(side * s.flukes * 0.45, mid + h * 0.05, tailAt - s.tail - s.flukes * 0.12);
    mb.add(fluke, s.back, 'tail');
  }
  const fin = blob([0, 0, 0], [s.fin[0] * 0.5, h * 0.05, s.fin[1] * 0.5], 6);
  fin.rotateZ(-0.45);
  fin.rotateY(-0.5);
  fin.translate(w * 0.8 + s.fin[0] * 0.4, mid - h * 0.6, l - s.fin[2] - s.fin[0] * 0.25);
  mb.add(fin, s.back, 'finL');
  mb.add(mirrorX(fin), s.back, 'finR');
  return { mb, mid, nose };
}

/** A humpback whale: dark slate, pale belly, very long flippers, broad flukes. */
function whale(): Model {
  const { mb, mid, nose } = swimmer({
    body: [1.5, 1.4, 5.0],
    back: '#3b4250',
    belly: '#d8dde0',
    tail: 3.0,
    stock: 1.0,
    flukes: 2.4,
    fin: [4.0, 0.9, 2.5],
  });
  // A low hump and small fin on the back, eyes low by the mouth, a knobbly head.
  mb.add(cone([0, mid + 1.1, -2.6], [0, mid + 1.6, -3.3], 0.4, 5), '#3b4250', 'body');
  for (const side of [1, -1]) {
    mb.add(blob([side * 1.1, mid - 0.3, nose - 1.6], [0.12, 0.12, 0.12], 4), EYE, 'head');
    for (const z of [0.6, 1.4, 2.2])
      mb.add(
        blob([side * 0.35, mid + 1.15, nose - z - 0.6], [0.18, 0.15, 0.18], 4),
        '#4a5262',
        'head',
      );
  }
  return mb.build('animal-whale');
}

/** A bottlenose dolphin: grey, pale belly, a short beak, a curved fin on its back. */
function dolphin(): Model {
  const { mb, mid, nose } = swimmer({
    body: [0.3, 0.33, 1.1],
    back: '#7d8a96',
    belly: '#e1e5e8',
    tail: 0.55,
    stock: 0.2,
    flukes: 0.4,
    fin: [0.4, 0.18, 0.55],
  });
  mb.add(
    cone([0, mid - 0.03, nose - 0.15], [0, mid - 0.07, nose + 0.22], 0.1, 6),
    '#8996a2',
    'head',
  );
  mb.add(cone([0, mid + 0.25, -0.05], [0, mid + 0.6, -0.35], 0.16, 5), '#6c7884', 'body');
  for (const side of [1, -1])
    mb.add(blob([side * 0.22, mid + 0.06, nose - 0.3], [0.035, 0.035, 0.035], 4), EYE, 'head');
  return mb.build('animal-dolphin');
}

/** Steller's sea cow: huge and bulky, dark bark-like skin, a small head, stubby flippers, a forked tail. */
function seaCow(): Model {
  const { mb, mid, nose } = swimmer({
    body: [1.2, 1.0, 3.6],
    back: '#5b5148',
    belly: '#6e645a',
    tail: 1.6,
    stock: 0.8,
    flukes: 1.4,
    fin: [1.0, 0.5, 1.4],
  });
  mb.add(blob([0, mid - 0.1, nose + 0.2], [0.55, 0.5, 0.6], 7), '#5b5148', 'head');
  mb.add(blob([0, mid - 0.25, nose + 0.7], [0.4, 0.3, 0.2], 5), '#8a7e72', 'head');
  for (const side of [1, -1])
    mb.add(blob([side * 0.4, mid + 0.1, nose + 0.45], [0.06, 0.06, 0.06], 4), EYE, 'head');
  return mb.build('animal-sea-cow');
}
