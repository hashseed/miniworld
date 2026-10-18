// Megafauna that died out within the timeline (spec wildlife.md, section 6).
// Life size in metres, facing +Z, feet on y = 0, built like the wild animals.

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
import { quadruped } from './quadruped.ts';
import { bird, ears, lion, tuftTail, zebra } from './wildAnimals.ts';

export const EXTINCT_ANIMALS = [
  'animal-giant-deer',
  'animal-aurochs',
  'animal-cave-lion',
  'animal-smilodon',
  'animal-mastodon',
  'animal-ground-sloth',
  'animal-glyptodon',
  'animal-diprotodon',
  'animal-moa',
  'animal-haast-eagle',
  'animal-elephant-bird',
  'animal-dodo',
  'animal-quagga',
  'animal-thylacine',
] as const;
export type ExtinctAnimalId = (typeof EXTINCT_ANIMALS)[number];

const EYE = '#1d1410';
const band = (v: number) => ((Math.floor(v) % 2) + 2) % 2 === 1;

export function buildExtinctAnimal(id: ExtinctAnimalId): Model {
  switch (id) {
    case 'animal-giant-deer':
      return giantDeer();
    case 'animal-aurochs':
      return aurochs();
    case 'animal-cave-lion':
      return lion(id, false, '#d3bd92');
    case 'animal-smilodon':
      return smilodon();
    case 'animal-mastodon':
      return mastodon();
    case 'animal-ground-sloth':
      return groundSloth();
    case 'animal-glyptodon':
      return glyptodon();
    case 'animal-diprotodon':
      return diprotodon();
    case 'animal-moa':
      return ratite(id, false);
    case 'animal-elephant-bird':
      return ratite(id, true);
    case 'animal-haast-eagle':
      return bird(id, {
        body: '#4a3524',
        wing: ['#4a3524', '#3b2a1c', '#2a1e14'],
        tail: '#5a4330',
        face: '#5a4330',
        beak: '#e8c34a',
        underWing: '#7a5a3a',
        tailLength: 0.3,
      });
    case 'animal-dodo':
      return dodo();
    case 'animal-quagga':
      return zebra(true);
    case 'animal-thylacine':
      return thylacine();
  }
}

/** Giant deer (Irish elk): a big deer with huge flat antlers. */
function giantDeer(): Model {
  const coat = '#9a6a3c';
  const p = quadruped({
    shoulder: 1.9,
    length: 2.0,
    girth: [0.4, 0.47],
    leg: 0.08,
    neck: [0.38, 0.25],
    head: [0.14, 0.17, 0.38],
    headDrop: 0.5,
    coat,
    belly: '#d9c39c',
    hoof: '#2e2219',
  });
  const { mb, headAt } = p;
  const antler = shade(coat, 0.45);
  for (const s of [1, -1]) {
    // A beam out to the side, a broad palm and tines along its edge.
    const base: Vec3 = [s * 0.08, headAt.y + 0.15, headAt.z - 0.15];
    const end: Vec3 = [s * 0.75, headAt.y + 0.45, headAt.z - 0.3];
    mb.add(
      horn(base, [s * 0.45, headAt.y + 0.2, headAt.z - 0.1], end, 0.05, 0.04, 4, 4),
      antler,
      'head',
    );
    const palm = blob([0, 0, 0], [0.5, 0.06, 0.32], 6);
    palm.rotateZ(s * 0.35);
    palm.translate(s * 0.95, headAt.y + 0.52, headAt.z - 0.32);
    mb.add(palm, antler, 'head');
    for (const t of [0, 1, 2])
      mb.add(
        cone(
          [s * (0.75 + t * 0.25), headAt.y + 0.55 + t * 0.12, headAt.z - 0.15],
          [s * (0.8 + t * 0.3), headAt.y + 0.85 + t * 0.12, headAt.z - 0.05],
          0.04,
          4,
        ),
        antler,
        'head',
      );
  }
  ears(p, [0.12, 0.08, -0.25], [0.04, 0.09, 0.03], coat);
  mb.add(blob([0, p.bodyY + 0.1, p.back * 1.05], [0.06, 0.1, 0.05], 4), coat, 'tail');
  return mb.build('animal-giant-deer');
}

/** Aurochs: a huge black wild bull with a pale stripe down its back and forward-curving horns. */
function aurochs(): Model {
  const coat = '#241c18';
  const p = quadruped({
    shoulder: 1.8,
    length: 2.3,
    girth: [0.48, 0.58],
    leg: 0.1,
    neck: [0.2, -0.08],
    head: [0.2, 0.25, 0.4],
    headDrop: 0.8,
    coat,
    hoof: '#14100d',
  });
  const { mb, headAt, bodyY, front, back } = p;
  mb.add(
    limb([0, bodyY + 0.5, front * 0.45], [0, bodyY + 0.47, back * 0.75], 0.06, 0.05, 4),
    '#9a8466',
    'body',
  );
  mb.add(blob([0, headAt.y - 0.25, headAt.z + 0.24], [0.15, 0.13, 0.12], 5), '#cfc2aa', 'head');
  for (const s of [1, -1])
    mb.add(
      horn(
        [s * 0.15, headAt.y + 0.18, headAt.z - 0.12],
        [s * 0.6, headAt.y + 0.25, headAt.z - 0.05],
        [s * 0.45, headAt.y + 0.65, headAt.z + 0.35],
        0.07,
        0.025,
        5,
        5,
      ),
      '#e8dcc0',
      'head',
    );
  ears(p, [0.24, 0.05, -0.2], [0.09, 0.05, 0.05], coat);
  tuftTail(p, coat, '#0f0c0a', 0.8, 0.04);
  return mb.build('animal-aurochs');
}

/** Sabre-toothed cat: a stocky cat with a short tail and long upper fangs. */
function smilodon(): Model {
  const coat = '#b98a52';
  const p = quadruped({
    shoulder: 1.0,
    length: 1.6,
    girth: [0.34, 0.38],
    leg: 0.115,
    neck: [0.2, 0.05],
    head: [0.21, 0.2, 0.24],
    headDrop: 0.05,
    coat,
    belly: '#e1c99c',
    hoof: shade(coat, -0.1).getStyle(),
  });
  const { mb, headAt } = p;
  mb.add(blob([0, headAt.y - 0.08, headAt.z + 0.18], [0.12, 0.1, 0.12], 6), '#e6d2ae', 'head');
  mb.add(blob([0, headAt.y - 0.01, headAt.z + 0.29], [0.04, 0.03, 0.03], 4), '#3a2620', 'head');
  for (const s of [1, -1])
    mb.add(
      cone(
        [s * 0.05, headAt.y - 0.12, headAt.z + 0.22],
        [s * 0.05, headAt.y - 0.4, headAt.z + 0.2],
        0.03,
        4,
      ),
      '#f4ecd9',
      'head',
    );
  ears(p, [0.14, 0.18, -0.06], [0.05, 0.06, 0.04], coat);
  mb.add(
    limb([0, p.bodyY + 0.15, p.back], [0, p.bodyY, p.back * 1.2], 0.05, 0.04, 4),
    coat,
    'tail',
  );
  return mb.build('animal-smilodon');
}

/** American mastodon: lower and longer than a mammoth, reddish-brown hair, long upcurved tusks. */
function mastodon(): Model {
  const coat = '#5a3a24';
  const p = quadruped({
    shoulder: 2.6,
    length: 3.4,
    girth: [1.0, 1.05],
    leg: 0.3,
    legSpread: 0.4,
    neck: [0.2, -0.05],
    head: [0.55, 0.6, 0.55],
    headDrop: 0.2,
    coat,
    hoof: '#b9ad98',
    toenails: true,
  });
  const { mb, headAt, bodyY } = p;
  // A shaggy fringe under the belly, small ears, trunk and tusks.
  mb.add(blob([0, bodyY - 0.6, 0], [0.9, 0.35, 1.5], 7), shade(coat, -0.15), 'body');
  ears(p, [0.5, 0.1, -0.15], [0.08, 0.4, 0.3], shade(coat, -0.1));
  mb.add(
    horn(
      [0, headAt.y - 0.2, headAt.z + 0.45],
      [0, headAt.y - 1.6, headAt.z + 0.8],
      [0, 0.4, headAt.z + 0.85],
      0.22,
      0.09,
      6,
      6,
    ),
    coat,
    'head',
  );
  for (const s of [1, -1])
    mb.add(
      horn(
        [s * 0.25, headAt.y - 0.45, headAt.z + 0.35],
        [s * 0.35, headAt.y - 1.3, headAt.z + 1.3],
        [s * 0.5, headAt.y - 0.8, headAt.z + 2.0],
        0.1,
        0.05,
        6,
        5,
      ),
      '#efe6d2',
      'head',
    );
  tuftTail(p, coat, shade(coat, -0.3).getStyle(), 0.9, 0.06);
  return mb.build('animal-mastodon');
}

/** Giant ground sloth (Megatherium): elephant-sized and bulky, a small head, big claws and a thick tail. */
function groundSloth(): Model {
  const coat = '#7a5a3c';
  const p = quadruped({
    shoulder: 2.0,
    length: 2.6,
    girth: [0.85, 0.95],
    leg: 0.25,
    legSpread: 0.45,
    neck: [0.32, 0.02],
    head: [0.2, 0.24, 0.5],
    headDrop: 0.35,
    coat,
    hoof: '#2b211a',
  });
  const { mb, headAt, bodyY, back, front } = p;
  // Heavy hindquarters, a thick tail propping on the ground, claws curling in front.
  mb.add(blob([0, bodyY - 0.05, back * 0.55], [0.95, 1.0, 0.9], 8), coat, 'body');
  mb.add(limb([0, bodyY - 0.2, back * 0.95], [0, 0.25, back * 1.55], 0.35, 0.18, 5), coat, 'tail');
  for (const s of [1, -1])
    for (const t of [-0.08, 0.08])
      mb.add(
        cone(
          [s * 0.45 + t, 0.15, front * 0.72 + 0.2],
          [s * 0.45 + t, 0.05, front * 0.72 + 0.45],
          0.05,
          4,
        ),
        '#e6dccb',
        s > 0 ? 'legFL' : 'legFR',
      );
  mb.add(
    blob([0, headAt.y - 0.15, headAt.z + 0.42], [0.1, 0.1, 0.1], 5),
    shade(coat, -0.2),
    'head',
  );
  ears(p, [0.22, 0.12, -0.2], [0.05, 0.06, 0.04], coat);
  return mb.build('animal-ground-sloth');
}

/** Glyptodon: a car-sized armadillo under a domed shell of bony plates, with an armoured tail. */
function glyptodon(): Model {
  const shell = '#7b6448';
  const plate = '#a08664';
  const p = quadruped({
    shoulder: 1.5,
    length: 2.6,
    girth: [0.9, 0.75],
    leg: 0.17,
    legSpread: 0.65,
    neck: [0.06, -0.3],
    head: [0.22, 0.22, 0.28],
    headDrop: 0.3,
    coat: shell,
    legColour: '#5c4a36',
    hoof: '#2b211a',
    // Bands of pale plates painted round the shell, one per ring.
    pattern: {
      body: (q) =>
        band((Math.acos(Math.min(1, Math.max(-1, q.z / 1.43))) / Math.PI) * 15) ? plate : undefined,
      chest: () => undefined,
    },
  });
  const { mb, headAt, bodyY, back } = p;
  // A bony cap on the head and a ringed tail ending in a club.
  mb.add(blob([0, headAt.y + 0.12, headAt.z - 0.05], [0.2, 0.08, 0.2], 5), plate, 'head');
  mb.add(
    limb([0, bodyY - 0.1, back * 0.95], [0, 0.35, back * 1.5], 0.22, 0.12, 5, 4),
    shell,
    'tail',
    (q) => (band((q.z - back) / 0.14) ? plate : undefined),
  );
  mb.add(blob([0, 0.35, back * 1.55], [0.18, 0.16, 0.2], 6), plate, 'tail');
  return mb.build('animal-glyptodon');
}

/** Diprotodon: a wombat the size of a rhino, on short sturdy legs. */
function diprotodon(): Model {
  const coat = '#6e5a48';
  const p = quadruped({
    shoulder: 1.7,
    length: 2.6,
    girth: [0.7, 0.72],
    leg: 0.2,
    legSpread: 0.6,
    neck: [0.14, -0.12],
    head: [0.32, 0.36, 0.45],
    headDrop: 0.3,
    coat,
    belly: shade(coat, 0.2).getStyle(),
    hoof: '#2b211a',
  });
  const { mb, headAt } = p;
  mb.add(blob([0, headAt.y - 0.12, headAt.z + 0.36], [0.22, 0.16, 0.12], 6), '#2a221c', 'head');
  ears(p, [0.22, 0.28, -0.25], [0.08, 0.08, 0.05], coat);
  mb.add(blob([0, p.bodyY + 0.05, p.back * 1.03], [0.1, 0.08, 0.06], 4), coat, 'tail');
  return mb.build('animal-diprotodon');
}

/** Moa or elephant bird: a giant flightless bird with no wings to see, striding on thick legs. */
function ratite(id: ExtinctAnimalId, elephantBird: boolean): Model {
  const feathers = elephantBird ? '#5a4632' : '#6b4f33';
  const legC = elephantBird ? '#8a7a66' : '#a59478';
  const hip = elephantBird ? 1.35 : 1.25;
  const mb = new ModelBuilder([
    { name: 'body', pivot: [0, hip, 0] },
    { name: 'head', pivot: [0, hip + 0.3, 0.45], parent: 'body' },
    { name: 'legL', pivot: [0.2, hip, 0], parent: 'body' },
    { name: 'legR', pivot: [-0.2, hip, 0], parent: 'body' },
  ]);
  const r: Vec3 = elephantBird ? [0.55, 0.55, 0.75] : [0.42, 0.42, 0.65];
  mb.add(blob([0, hip + 0.2, -0.05], r, 8), feathers, 'body');
  mb.add(
    cone([0, hip + 0.15, -0.6], [0, hip - 0.1, -0.95], 0.25, 5),
    shade(feathers, -0.15),
    'body',
  );
  // Neck up and forward to a small head with a short beak.
  const headAt: Vec3 = elephantBird ? [0, hip + 1.1, 0.8] : [0, hip + 1.35, 0.85];
  mb.add(
    limb([0, hip + 0.35, 0.45], [headAt[0], headAt[1] - 0.1, headAt[2] - 0.05], 0.15, 0.08, 5),
    feathers,
    'head',
  );
  mb.add(blob(headAt, [0.09, 0.09, 0.12], 6), feathers, 'head');
  mb.add(
    cone(
      [0, headAt[1] - 0.02, headAt[2] + 0.08],
      [0, headAt[1] - 0.05, headAt[2] + 0.25],
      0.045,
      4,
    ),
    '#d8c9a8',
    'head',
  );
  for (const s of [1, -1])
    mb.add(
      blob([s * 0.07, headAt[1] + 0.03, headAt[2] + 0.04], [0.02, 0.02, 0.02], 4),
      EYE,
      'head',
    );
  // Thick legs with three-toed feet.
  const leg = limb([0.2, hip, 0], [0.2, 0.1, 0.05], elephantBird ? 0.13 : 0.1, 0.06, 5);
  mb.add(leg, legC, 'legL');
  mb.add(mirrorX(leg), legC, 'legR');
  for (const t of [-0.35, 0, 0.35]) {
    const toe = cone([0.2, 0.05, 0.05], [0.2 + t * 0.4, 0.03, 0.3], 0.035, 4);
    mb.add(toe, legC, 'legL');
    mb.add(mirrorX(toe), legC, 'legR');
  }
  return mb.build(id);
}

/** Dodo: a plump grey bird with a big hooked beak, stubby wings and a curly white tail. */
function dodo(): Model {
  const grey = '#8d8a84';
  const mb = new ModelBuilder([
    { name: 'body', pivot: [0, 0.22, 0] },
    { name: 'head', pivot: [0, 0.55, 0.12], parent: 'body' },
    { name: 'wingL', pivot: [0.24, 0.5, 0], parent: 'body' },
    { name: 'wingR', pivot: [-0.24, 0.5, 0], parent: 'body' },
    { name: 'legL', pivot: [0.08, 0.22, 0.02], parent: 'body' },
    { name: 'legR', pivot: [-0.08, 0.22, 0.02], parent: 'body' },
  ]);
  mb.add(blob([0, 0.42, -0.02], [0.26, 0.24, 0.3], 8), grey, 'body');
  mb.add(blob([0, 0.48, -0.32], [0.12, 0.12, 0.08], 5), '#f2efe8', 'body'); // curly tail
  mb.add(blob([0, 0.66, 0.16], [0.12, 0.13, 0.13], 7), grey, 'head');
  mb.add(
    horn([0, 0.66, 0.24], [0, 0.66, 0.4], [0, 0.58, 0.44], 0.07, 0.035, 4, 5),
    '#c8c08a',
    'head',
  );
  mb.add(blob([0, 0.6, 0.43], [0.035, 0.04, 0.035], 4), '#d8b84a', 'head');
  for (const s of [1, -1]) mb.add(blob([s * 0.09, 0.7, 0.2], [0.02, 0.02, 0.02], 4), EYE, 'head');
  const wing = blob([0.25, 0.45, -0.02], [0.05, 0.1, 0.12], 5);
  mb.add(wing, shade(grey, -0.1), 'wingL');
  mb.add(mirrorX(wing), shade(grey, -0.1), 'wingR');
  const leg = limb([0.08, 0.22, 0.02], [0.08, 0.04, 0.04], 0.04, 0.03, 4);
  mb.add(leg, '#d6b84a', 'legL');
  mb.add(mirrorX(leg), '#d6b84a', 'legR');
  const foot = blob([0.08, 0.025, 0.09], [0.05, 0.025, 0.07], 4);
  mb.add(foot, '#d6b84a', 'legL');
  mb.add(mirrorX(foot), '#d6b84a', 'legR');
  return mb.build('animal-dodo');
}

/** Thylacine (Tasmanian tiger): a sandy dog-like marsupial with dark stripes over its back and rump. */
function thylacine(): Model {
  const coat = '#b8915e';
  const dark = '#3b2a1f';
  const length = 1.1;
  const bodyY = 0.6 - 0.24 * 0.75;
  const p = quadruped({
    shoulder: 0.6,
    length,
    girth: [0.2, 0.24],
    leg: 0.055,
    neck: [0.2, 0.08],
    head: [0.11, 0.12, 0.26],
    headDrop: 0.1,
    coat,
    belly: '#e3d0ad',
    hoof: '#3b2a1f',
    pattern: {
      body: (q) => {
        if (q.z > 0.12 || q.y < bodyY) return undefined;
        const z = Math.min(1, Math.max(-1, q.z / (length * 0.55)));
        return band((Math.acos(z) / Math.PI) * 15) ? dark : undefined;
      },
      chest: () => undefined,
    },
  });
  const { mb, headAt, back } = p;
  mb.add(blob([0, headAt.y - 0.03, headAt.z + 0.22], [0.035, 0.03, 0.03], 4), '#1d1410', 'head');
  ears(p, [0.07, 0.13, -0.12], [0.045, 0.06, 0.03], coat);
  // A long stiff tail, thick at the base.
  mb.add(limb([0, bodyY + 0.05, back], [0, bodyY - 0.2, back - 0.5], 0.07, 0.025, 4), coat, 'tail');
  return mb.build('animal-thylacine');
}
