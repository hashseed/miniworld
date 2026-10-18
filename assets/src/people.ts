// Prehistoric people (spec milestone 2, sections 5 and 13.3): a man, a woman
// and a child for each culture profile, on one shared skeleton. Bold, chunky
// shapes with few details, because dioramas are drawn far larger than life.

import * as THREE from 'three';
import {
  type BoneDef,
  type Model,
  type Vec3,
  ModelBuilder,
  blob,
  cone,
  horn,
  lathe,
  limb,
  mirrorX,
  pick,
  rod,
  shade,
} from './kit.ts';

export const PROFILES = [
  'african-stone-age',
  'neanderthal',
  'coastal-asia-hunter',
  'first-australians',
  'ice-age-hunter',
  'steppe-beringia-hunter',
  'natufian',
  'old-kingdom-egyptian',
] as const;
export type Profile = (typeof PROFILES)[number];
export type Kind = 'man' | 'woman' | 'child';
export type Tool =
  | 'spear'
  | 'thrusting-spear'
  | 'spear-thrower'
  | 'bow'
  | 'digging-stick'
  | 'scraper'
  | 'basket'
  | 'dish'
  | 'sickle'
  | 'fishing-spear'
  | 'needle'
  | 'grinding-stone'
  | 'staff'
  | 'palette'
  | 'none';

type Top = 'none' | 'wrap' | 'drape' | 'cloak' | 'tunic' | 'parka' | 'sheath';
type Bottom = 'apron' | 'skirt' | 'leg-wraps' | 'trousers' | 'kilt' | 'sheath';

interface ProfileLook {
  skin: string[];
  hair: string[];
  top: Record<Kind, Top>;
  bottom: Record<Kind, Bottom>;
  /** Main colour of hide or fur, with variants. */
  hide: string[];
  trim: string;
  beads?: string;
  headband?: string;
  ochre?: boolean;
  boots?: boolean;
  tools: Record<Kind, Tool>;
  neanderthal?: boolean;
  /**
   * Egyptian wigs and dress (giza.md section 11.5): a blunt black wig, long
   * with lappets for women, the sidelock of youth for children, a broad
   * collar of two colours, a pleated kilt front and no beards.
   */
  egyptian?: { collar: [string, string]; tab: string; band: string };
}

const DARK_HAIR = ['#2a1d17', '#33241b', '#3b2a20'];

export const LOOKS: Record<Profile, ProfileLook> = {
  'african-stone-age': {
    skin: ['#4f321f', '#5e3b26', '#6b4430', '#7a4e33'],
    hair: DARK_HAIR,
    top: { man: 'none', woman: 'wrap', child: 'none' },
    bottom: { man: 'apron', woman: 'skirt', child: 'apron' },
    hide: ['#b98a57', '#a8794a', '#c49a66'],
    trim: '#8a5f38',
    beads: '#f4ecd8',
    tools: { man: 'bow', woman: 'digging-stick', child: 'none' },
  },
  neanderthal: {
    skin: ['#e2b896', '#d1a07a', '#c48e66', '#b8835a'],
    hair: ['#3b2a20', '#5c3a22', '#8e4424', '#2a1d17'],
    top: { man: 'drape', woman: 'drape', child: 'drape' },
    bottom: { man: 'leg-wraps', woman: 'leg-wraps', child: 'kilt' },
    hide: ['#7a5233', '#8a6240', '#6a4a30'],
    trim: '#a98864',
    tools: { man: 'thrusting-spear', woman: 'scraper', child: 'none' },
    neanderthal: true,
  },
  'coastal-asia-hunter': {
    skin: ['#7a4e33', '#94603f', '#a8714c'],
    hair: DARK_HAIR,
    top: { man: 'none', woman: 'wrap', child: 'none' },
    bottom: { man: 'skirt', woman: 'skirt', child: 'apron' },
    hide: ['#b9a66a', '#a8955a', '#c4b27a'],
    trim: '#7d6c3c',
    beads: '#e9dcc2',
    tools: { man: 'fishing-spear', woman: 'basket', child: 'basket' },
  },
  'first-australians': {
    skin: ['#4a2f1e', '#5a3a26', '#6b4430'],
    hair: ['#2a1d17', '#3b2a20', '#5a3d27'],
    top: { man: 'cloak', woman: 'cloak', child: 'none' },
    bottom: { man: 'apron', woman: 'apron', child: 'apron' },
    hide: ['#6e5a48', '#7a6452', '#5f4d3d'],
    trim: '#c9b49a',
    ochre: true,
    tools: { man: 'spear', woman: 'dish', child: 'digging-stick' },
  },
  'ice-age-hunter': {
    skin: ['#6b4430', '#7a4e33', '#94603f', '#a8714c'],
    hair: DARK_HAIR,
    top: { man: 'tunic', woman: 'tunic', child: 'tunic' },
    bottom: { man: 'trousers', woman: 'trousers', child: 'trousers' },
    hide: ['#9a6e45', '#8a5f3a', '#a97c50'],
    trim: '#e8dcc4',
    beads: '#f0e6cf',
    boots: true,
    tools: { man: 'spear-thrower', woman: 'needle', child: 'none' },
  },
  'steppe-beringia-hunter': {
    skin: ['#94603f', '#a8714c', '#b8835a'],
    hair: DARK_HAIR,
    top: { man: 'parka', woman: 'parka', child: 'parka' },
    bottom: { man: 'trousers', woman: 'trousers', child: 'trousers' },
    hide: ['#8f8578', '#7d6a58', '#9c8a72'],
    trim: '#efe6d4',
    boots: true,
    tools: { man: 'spear', woman: 'scraper', child: 'none' },
  },
  natufian: {
    skin: ['#94603f', '#a8714c', '#b8835a'],
    hair: DARK_HAIR,
    top: { man: 'tunic', woman: 'tunic', child: 'none' },
    bottom: { man: 'kilt', woman: 'skirt', child: 'apron' },
    hide: ['#c09060', '#b07f52', '#cc9e6c'],
    trim: '#7b5434',
    headband: '#f2ead8',
    tools: { man: 'sickle', woman: 'grinding-stone', child: 'basket' },
  },
  // Pyramid builders of the Old Kingdom (giza.md section 11): white linen kilts
  // for the men, linen dresses for the women, short black hair.
  'old-kingdom-egyptian': {
    skin: ['#7a4e33', '#8d5a3b', '#94603f', '#a8714c'],
    hair: ['#141010', '#1a1412'],
    top: { man: 'none', woman: 'sheath', child: 'none' },
    bottom: { man: 'kilt', woman: 'sheath', child: 'kilt' },
    hide: ['#fbf8ef', '#f4efe2', '#fffdf6'],
    trim: '#cdb98e',
    tools: { man: 'none', woman: 'basket', child: 'none' },
    egyptian: { collar: ['#2a9db0', '#e0aa2e'], tab: '#e9d9a8', band: '#2a9db0' },
  },
};

interface Body {
  height: number;
  hipY: number;
  kneeY: number;
  shoulderY: number;
  neckY: number;
  shoulderX: number;
  hipX: number;
  head: number;
  chest: Vec3;
  limb: number;
}

function body(kind: Kind, neanderthal: boolean): Body {
  // Chunky toy proportions: big head, thick limbs (section 13.3).
  const b: Body =
    kind === 'child'
      ? {
          height: 1.2,
          hipY: 0.5,
          kneeY: 0.26,
          shoulderY: 0.86,
          neckY: 0.92,
          shoulderX: 0.17,
          hipX: 0.08,
          head: 0.17,
          chest: [0.15, 0.2, 0.11],
          limb: 0.055,
        }
      : kind === 'woman'
        ? {
            height: 1.62,
            hipY: 0.8,
            kneeY: 0.42,
            shoulderY: 1.3,
            neckY: 1.36,
            shoulderX: 0.21,
            hipX: 0.11,
            head: 0.17,
            chest: [0.18, 0.26, 0.13],
            limb: 0.068,
          }
        : {
            height: 1.72,
            hipY: 0.84,
            kneeY: 0.44,
            shoulderY: 1.38,
            neckY: 1.44,
            shoulderX: 0.25,
            hipX: 0.12,
            head: 0.175,
            chest: [0.22, 0.28, 0.15],
            limb: 0.078,
          };
  if (neanderthal) {
    // Shorter, broader chest, short shins (Trinkaus 1981).
    const s = 0.94;
    b.hipY *= s * 0.97;
    b.kneeY *= s * 0.92;
    b.shoulderY *= s;
    b.neckY *= s;
    b.height *= s;
    b.shoulderX *= 1.1;
    b.chest = [b.chest[0] * 1.2, b.chest[1], b.chest[2] * 1.25];
    b.limb *= 1.15;
  }
  return b;
}

function skeleton(b: Body): BoneDef[] {
  const elbow = b.shoulderY - (b.shoulderY - b.hipY) * 0.55;
  return [
    { name: 'hips', pivot: [0, b.hipY, 0] },
    { name: 'torso', pivot: [0, b.hipY + 0.04, 0], parent: 'hips' },
    { name: 'head', pivot: [0, b.neckY, 0], parent: 'torso' },
    { name: 'armUpperL', pivot: [b.shoulderX, b.shoulderY, 0], parent: 'torso' },
    { name: 'armLowerL', pivot: [b.shoulderX + 0.03, elbow, 0], parent: 'armUpperL' },
    { name: 'armUpperR', pivot: [-b.shoulderX, b.shoulderY, 0], parent: 'torso' },
    { name: 'armLowerR', pivot: [-b.shoulderX - 0.03, elbow, 0], parent: 'armUpperR' },
    { name: 'legUpperL', pivot: [b.hipX, b.hipY, 0], parent: 'hips' },
    { name: 'legLowerL', pivot: [b.hipX, b.kneeY, 0], parent: 'legUpperL' },
    { name: 'legUpperR', pivot: [-b.hipX, b.hipY, 0], parent: 'hips' },
    { name: 'legLowerR', pivot: [-b.hipX, b.kneeY, 0], parent: 'legUpperR' },
  ];
}

export interface PersonOptions {
  profile: Profile;
  kind: Kind;
  /** Stable variant number; chooses skin, hair and hide colours. */
  variant?: number;
  tool?: Tool;
}

/** Builds one person at life size, facing +Z, feet on y = 0. */
export function buildPerson(o: PersonOptions): Model {
  const look = LOOKS[o.profile];
  const v = o.variant ?? 0;
  const neanderthal = !!look.neanderthal;
  const b = body(o.kind, neanderthal);
  const bones = skeleton(b);
  const wristY = b.hipY - 0.02;
  // The held tool and the carried load hang on their own bones so clips can hide them.
  bones.push({ name: 'tool', pivot: [-(b.shoulderX + 0.04), wristY, 0.03], parent: 'armLowerR' });
  bones.push({ name: 'load', pivot: [0, b.shoulderY, 0], parent: 'torso' });
  const mb = new ModelBuilder(bones);
  const skin = pick(look.skin, v);
  const hair = pick(look.hair, v * 7 + 3);
  const hide = pick(look.hide, v * 3 + 1);
  const dark = shade(hide, -0.3);
  const top = look.top[o.kind];
  const bottom = look.bottom[o.kind];
  const elbow = bones[4]!.pivot[1];
  const wrist = b.hipY - 0.02;
  const ankle = 0.08;
  const bothSides = (
    g: THREE.BufferGeometry,
    colour: THREE.ColorRepresentation,
    left: string,
    right: string,
  ) => {
    mb.add(g, colour, left);
    mb.add(mirrorX(g), colour, right);
  };

  // Hips and torso.
  const bareTorso = top === 'none' || top === 'wrap';
  const torsoColour = bareTorso || top === 'cloak' ? skin : hide;
  const [cx, cy, cz] = b.chest;
  const chestY = b.hipY + (b.shoulderY - b.hipY) * 0.6;
  mb.add(blob([0, chestY, 0], [cx, cy, cz], 7), torsoColour, 'torso');
  mb.add(
    blob([0, b.hipY + 0.06, 0], [cx * 0.85, 0.15, cz * 0.95], 7),
    bareTorso ? skin : hide,
    'hips',
  );
  mb.add(limb([0, b.shoulderY - 0.05, 0], [0, b.neckY + 0.04, 0], cx * 0.38), skin, 'torso');

  // Head: big and round; Neanderthals get a long low skull, brow ridge, big nose, no chin.
  const hr = b.head * (o.kind === 'child' ? 1.15 : 1);
  const headY = b.neckY + hr * 0.95;
  if (neanderthal) {
    mb.add(blob([0, headY, -0.02], [hr * 0.98, hr * 0.9, hr * 1.12], 7), skin, 'head');
    mb.add(
      blob([0, headY + hr * 0.25, hr * 0.78], [hr * 0.8, hr * 0.2, hr * 0.3], 6),
      shade(skin, -0.08),
      'head',
    );
    mb.add(
      blob([0, headY - hr * 0.05, hr * 0.95], [hr * 0.24, hr * 0.28, hr * 0.26], 6),
      shade(skin, -0.05),
      'head',
    );
  } else {
    mb.add(blob([0, headY, 0], [hr, hr * 1.02, hr * 0.98], 7), skin, 'head');
  }
  // Eyes: two dark dots, the only facial detail.
  for (const s of [1, -1]) {
    mb.add(
      blob([s * hr * 0.36, headY + hr * 0.08, hr * 0.86], [hr * 0.1, hr * 0.13, hr * 0.06], 4),
      '#1d1410',
      'head',
    );
  }

  // Hair or hood.
  if (top === 'parka') {
    mb.add(
      blob([0, headY + hr * 0.1, -hr * 0.12], [hr * 1.32, hr * 1.3, hr * 1.25], 7),
      hide,
      'head',
    );
    // Fur ruff round the face, leaving the face open.
    mb.add(torusRing([0, headY, hr * 0.62], hr * 0.95, hr * 0.26), look.trim, 'head');
  } else if (look.egyptian) {
    addWig(mb, o.kind, headY, hr, hair, skin, look.egyptian.band);
  } else {
    const long =
      o.kind === 'woman' ||
      (o.kind === 'child' && v % 2 === 1) ||
      o.profile === 'first-australians';
    mb.add(
      blob([0, headY + hr * 0.3, -hr * 0.12], [hr * 1.05, hr * 0.8, hr * 0.98], 7),
      hair,
      'head',
    );
    if (long)
      mb.add(
        blob([0, headY - hr * 0.35, -hr * 0.62], [hr * 0.9, hr * 1.0, hr * 0.42], 6),
        hair,
        'head',
      );
    if (o.kind === 'woman' && v % 3 === 1)
      mb.add(
        blob([0, headY + hr * 0.75, -hr * 0.45], [hr * 0.4, hr * 0.36, hr * 0.36], 6),
        hair,
        'head',
      );
    if (o.kind === 'man' && v % 3 !== 2) {
      mb.add(
        blob([0, headY - hr * 0.62, hr * 0.48], [hr * 0.7, hr * 0.5, hr * 0.5], 6),
        hair,
        'head',
      );
    }
    if (look.headband)
      mb.add(
        torusRing([0, headY + hr * 0.35, -0.01], hr * 1.02, hr * 0.09, 'y'),
        look.headband,
        'head',
      );
  }

  // Arms: upper and lower with big mitt hands (1.4x).
  const armColour = top === 'tunic' || top === 'parka' ? hide : skin;
  const sx = b.shoulderX;
  bothSides(
    limb([sx, b.shoulderY, 0], [sx + 0.03, elbow, 0], b.limb * 1.05, b.limb * 0.95),
    armColour,
    'armUpperL',
    'armUpperR',
  );
  bothSides(
    limb([sx + 0.03, elbow, 0], [sx + 0.04, wrist + 0.06, 0], b.limb * 0.95, b.limb * 0.85),
    top === 'parka' ? hide : skin,
    'armLowerL',
    'armLowerR',
  );
  if (top === 'parka' || top === 'tunic') {
    bothSides(
      torusRing([sx + 0.04, wrist + 0.08, 0], b.limb * 0.95, b.limb * 0.45, 'y'),
      look.trim,
      'armLowerL',
      'armLowerR',
    );
  }
  bothSides(
    blob([sx + 0.04, wrist, 0.01], [b.limb * 1.25, b.limb * 1.5, b.limb * 1.1], 5),
    skin,
    'armLowerL',
    'armLowerR',
  );

  // Legs and feet.
  const legColour = bottom === 'trousers' ? dark : bottom === 'leg-wraps' ? hide : skin;
  const legR = b.limb * 1.3;
  bothSides(
    limb([b.hipX, b.hipY, 0], [b.hipX, b.kneeY, 0], legR, legR * 0.9),
    legColour,
    'legUpperL',
    'legUpperR',
  );
  bothSides(
    limb([b.hipX, b.kneeY, 0], [b.hipX, ankle + 0.04, 0], legR * 0.9, legR * 0.75),
    legColour,
    'legLowerL',
    'legLowerR',
  );
  const footColour = look.boots ? shade(hide, -0.45) : neanderthal ? shade(hide, -0.2) : skin;
  bothSides(
    blob([b.hipX, 0.06, 0.05], [legR * 0.95, 0.065, legR * 1.6], 5),
    footColour,
    'legLowerL',
    'legLowerR',
  );
  if (bottom === 'leg-wraps') {
    for (const y of [b.kneeY * 0.55, b.kneeY * 1.05]) {
      bothSides(
        torusRing([b.hipX, y, 0], legR * 0.95, legR * 0.3, 'y'),
        dark,
        'legLowerL',
        'legLowerR',
      );
    }
  }
  if (look.boots) {
    bothSides(
      torusRing([b.hipX, ankle + 0.12, 0], legR * 0.85, legR * 0.4, 'y'),
      look.trim,
      'legLowerL',
      'legLowerR',
    );
  }

  // Clothing over the body.
  const waist = b.hipY + 0.08;
  if (top === 'tunic' || top === 'parka') {
    const len = top === 'parka' ? b.hipY * 0.5 : b.hipY * 0.62;
    mb.add(
      lathe(
        [
          [0, b.shoulderY + 0.03],
          [cx * 0.45, b.shoulderY + 0.02],
          [cx * 1.12, chestY],
          [cx * 1.12, waist],
          [cx * 1.22, len + 0.04],
          [cx * 1.24, len],
        ],
        [0, 0, 0],
        7,
        [1, 1, cz / cx],
      ),
      hide,
      'torso',
    );
    mb.add(torusRing([0, len + 0.02, 0], cx * 1.2, 0.035, 'y', cz / cx), look.trim, 'hips');
    if (top === 'tunic')
      mb.add(torusRing([0, waist, 0], cx * 1.13, 0.025, 'y', cz / cx), dark, 'hips');
  }
  if (top === 'drape') {
    // Untailored hide thrown over the shoulders, fur side out, tied at the waist.
    mb.add(
      lathe(
        [
          [0, b.shoulderY + 0.06],
          [cx * 0.45, b.shoulderY + 0.05],
          [cx * 1.25, b.shoulderY - 0.06],
          [cx * 1.22, chestY - 0.1],
          [cx * 1.32, b.hipY - 0.08],
        ],
        [0, 0, 0],
        7,
        [1, 1, cz / cx],
      ),
      hide,
      'torso',
    );
    mb.add(torusRing([0, waist, 0], cx * 1.18, 0.03, 'y', cz / cx), dark, 'hips');
  }
  if (top === 'cloak') {
    // Possum-skin cloak over one shoulder, worn with the fur inside and patterned skin out.
    mb.add(
      lathe(
        [
          [0, b.shoulderY + 0.05],
          [cx * 0.5, b.shoulderY + 0.04],
          [cx * 1.3, b.shoulderY - 0.1],
          [cx * 1.35, b.hipY],
        ],
        [0.02, 0, -0.01],
        8,
        [1, 1, cz / cx],
      ),
      hide,
      'torso',
    );
    for (const y of [chestY + 0.05, chestY - 0.12])
      mb.add(torusRing([0.02, y, -0.01], cx * 1.33, 0.012, 'y', cz / cx), look.trim, 'torso');
  }
  if (top === 'wrap') {
    mb.add(
      lathe(
        [
          [cx * 1.08, chestY + 0.06],
          [cx * 1.12, chestY - 0.04],
          [cx * 1.06, chestY - 0.16],
        ],
        [0, 0, 0],
        7,
        [1, 1, cz / cx],
      ),
      hide,
      'torso',
    );
  }
  if (bottom === 'sheath') {
    // A white linen dress from under the arms to the ankles, on two straps.
    mb.add(
      lathe(
        [
          [cx * 1.06, chestY + 0.08],
          [cx * 1.1, waist],
          [cx * 1.12, b.hipY - 0.1],
          [cx * 1.02, ankle + 0.16],
        ],
        [0, 0, 0],
        8,
        [1, 1, cz / cx + 0.12],
      ),
      hide,
      'hips',
    );
    for (const s of [1, -1])
      mb.add(
        limb([s * cx * 0.5, chestY + 0.06, cz * 0.6], [s * cx * 0.5, b.shoulderY + 0.02, 0], 0.025),
        hide,
        'torso',
      );
  }
  if (bottom === 'apron' || bottom === 'skirt' || bottom === 'kilt') {
    const low =
      bottom === 'apron' ? b.hipY - 0.18 : bottom === 'kilt' ? b.kneeY + 0.1 : b.kneeY + 0.04;
    mb.add(
      lathe(
        [
          [cx * 0.92, waist + 0.02],
          [cx * 1.05, b.hipY - 0.04],
          [cx * 1.2, low],
        ],
        [0, 0, 0],
        7,
        [1, 1, cz / cx + 0.15],
      ),
      bottom === 'apron' ? shade(hide, -0.1) : hide,
      'hips',
    );
    mb.add(torusRing([0, waist + 0.02, 0], cx * 0.94, 0.025, 'y', cz / cx), dark, 'hips');
    if (bottom === 'kilt' && look.egyptian) {
      // The pleated front panel of the kilt.
      mb.add(
        blob(
          [0, (waist + b.kneeY + 0.1) / 2, cz * 1.15],
          [cx * 0.42, (waist - b.kneeY) * 0.42, 0.03],
          5,
        ),
        look.egyptian.tab,
        'hips',
      );
    }
  }
  if (look.egyptian && o.kind !== 'child') {
    // The broad collar: a band of blue beads between gold, on the shoulders.
    const [inner, outer] = look.egyptian.collar; // blue, gold
    const y = b.shoulderY + 0.03;
    const band = (r0: number, r1: number, colour: string) =>
      mb.add(
        lathe(
          [
            [cx * r0, y + 0.03 - r0 * 0.15],
            [cx * r1, y - r1 * 0.22],
            [cx * r1, y - r1 * 0.22 - 0.04],
          ],
          [0, 0, 0],
          8,
          [1, 1, (cz / cx) * 1.05],
        ),
        colour,
        'torso',
      );
    band(0.4, 0.82, outer);
    band(0.8, 1.04, inner);
    band(1.02, 1.12, outer);
  }
  if (look.beads) {
    mb.add(torusRing([0, b.shoulderY + 0.02, 0.01], cx * 0.55, 0.022, 'y', 1), look.beads, 'torso');
  }
  if (look.ochre) {
    // Ochre lines across the chest and upper arms.
    for (const dy of [0.05, -0.03]) {
      mb.add(torusRing([0, chestY + dy, 0], cx * 1.01, 0.012, 'y', cz / cx), '#b5532c', 'torso');
    }
    bothSides(
      torusRing([sx + 0.015, (b.shoulderY + elbow) / 2, 0], b.limb * 1.02, 0.012, 'y'),
      '#d9d0bf',
      'armUpperL',
      'armUpperR',
    );
  }

  // Tool in the right hand.
  const tool = o.tool ?? look.tools[o.kind];
  addTool(mb, tool, [-(sx + 0.04), wrist, 0.03], o.kind === 'child' ? 0.75 : 1);

  // A bundle of meat wrapped in hide and tied with cord, carried across the shoulders.
  mb.add(blob([0, b.shoulderY + 0.2, -cz - 0.08], [cx * 1.8, 0.2, 0.22], 7), '#dcbc8c', 'load');
  for (const dx of [-0.6, 0.6]) {
    mb.add(
      torusRing([dx * cx, b.shoulderY + 0.2, -cz - 0.08], 0.21, 0.025, 'x'),
      '#5a3a22',
      'load',
    );
  }

  const model = mb.build(`${o.profile}-${o.kind}`);
  model.bones.get('load')!.visible = false;
  return model;
}

/**
 * An Egyptian wig (giza.md section 11.5): a blunt black bob for men, a long
 * wig with two lappets over the shoulders and a coloured band for women, and
 * the shaved head with the sidelock of youth for children. The face stays open.
 */
function addWig(
  mb: ModelBuilder,
  kind: Kind,
  headY: number,
  hr: number,
  hair: string,
  skin: string,
  band: string,
): void {
  if (kind === 'child') {
    mb.add(
      blob([0, headY + hr * 0.2, -hr * 0.06], [hr * 1.02, hr * 0.84, hr * 0.98], 7),
      shade(skin, -0.12),
      'head',
    );
    mb.add(
      blob([hr * 0.95, headY - hr * 0.45, hr * 0.05], [hr * 0.24, hr * 0.7, hr * 0.24], 5),
      hair,
      'head',
    );
    return;
  }
  // Crown with a straight fringe over the eyes.
  mb.add(blob([0, headY + hr * 0.5, -hr * 0.1], [hr * 1.18, hr * 0.62, hr * 1.1], 7), hair, 'head');
  if (kind === 'man') {
    // Square sides and back down to the jaw.
    mb.add(
      blob([0, headY - hr * 0.1, -hr * 0.3], [hr * 1.32, hr * 0.92, hr * 0.92], 7),
      hair,
      'head',
    );
    return;
  }
  mb.add(
    blob([0, headY - hr * 0.55, -hr * 0.32], [hr * 1.3, hr * 1.4, hr * 0.86], 7),
    hair,
    'head',
  );
  for (const s of [1, -1])
    mb.add(
      blob([s * hr * 0.92, headY - hr * 1.15, hr * 0.28], [hr * 0.32, hr * 0.8, hr * 0.3], 5),
      hair,
      'head',
    );
  mb.add(
    torusRing([0, headY + hr * 0.42, -hr * 0.05], hr * 1.16, hr * 0.1, 'y', 0.94),
    band,
    'head',
  );
}

/** A band around an axis: belts, cuffs, bead strings, fur trims. A bulging open tube, cheaper than a torus. */
function torusRing(
  at: Vec3,
  r: number,
  tube: number,
  axis: 'x' | 'y' | 'z' = 'z',
  squash = 1,
): THREE.BufferGeometry {
  const g = lathe(
    [
      [r, -tube],
      [r + tube, 0],
      [r, tube],
    ],
    [0, 0, 0],
    6,
  );
  if (axis === 'z') g.rotateX(Math.PI / 2);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  g.scale(1, 1, squash);
  g.translate(...at);
  return g;
}

const WOOD = '#8a5a32';
const STONE = '#9a958c';
const FLINT = '#6f7378';

function addTool(mb: ModelBuilder, tool: Tool, hand: Vec3, s: number): void {
  const [x, y, z] = hand;
  const bone = 'tool';
  const at = (dy: number): Vec3 => [x, y + dy * s, z];
  switch (tool) {
    case 'spear':
    case 'fishing-spear':
    case 'spear-thrower':
      mb.add(rod(at(-0.6), at(1.35), 0.022 * s), WOOD, bone);
      if (tool === 'fishing-spear') {
        for (const dx of [-0.05, 0, 0.05])
          mb.add(
            cone([x + dx, y + 1.3 * s, z], [x + dx * 1.6, y + 1.55 * s, z], 0.018, 4),
            '#d8cdb5',
            bone,
          );
      } else {
        mb.add(cone(at(1.3), at(1.6), 0.05 * s, 4), FLINT, bone);
      }
      if (tool === 'spear-thrower') {
        // The spear-thrower: a short carved board held behind the spear.
        mb.add(
          rod([x - 0.05, y - 0.05, z - 0.04], [x - 0.05, y + 0.5 * s, z - 0.04], 0.02, 4),
          '#c9b38e',
          bone,
        );
        mb.add(blob([x - 0.05, y + 0.5 * s, z - 0.04], [0.035, 0.05, 0.035], 5), '#c9b38e', bone);
      }
      break;
    case 'thrusting-spear':
      mb.add(rod(at(-0.7), at(1.25), 0.032 * s), WOOD, bone);
      mb.add(cone(at(1.22), at(1.5), 0.065 * s, 4), FLINT, bone);
      break;
    case 'bow':
      mb.add(
        horn(
          [x, y - 0.65 * s, z + 0.05],
          [x, y, z + 0.35],
          [x, y + 0.65 * s, z + 0.05],
          0.022,
          0.022,
          8,
          5,
        ),
        WOOD,
        bone,
      );
      mb.add(
        rod([x, y - 0.63 * s, z + 0.05], [x, y + 0.63 * s, z + 0.05], 0.006, 3),
        '#e6dccb',
        bone,
      );
      break;
    case 'digging-stick':
      mb.add(rod(at(-0.75), at(0.55), 0.024 * s), WOOD, bone);
      mb.add(cone(at(-0.75), at(-0.95), 0.024 * s, 5), WOOD, bone);
      mb.add(blob(at(0.0), [0.06 * s, 0.06 * s, 0.06 * s], 5), STONE, bone); // stone weight
      break;
    case 'scraper':
      mb.add(blob([x, y - 0.02, z + 0.1], [0.07, 0.035, 0.09], 5), FLINT, bone);
      break;
    case 'needle':
      mb.add(rod([x, y, z + 0.06], [x, y + 0.14, z + 0.12], 0.008, 3), '#efe6d2', bone);
      break;
    case 'basket': {
      const g = lathe(
        [
          [0.0, 0],
          [0.13, 0.01],
          [0.18, 0.18],
          [0.2, 0.22],
        ],
        [0, 0, 0],
        9,
      );
      g.scale(s, s, s);
      g.translate(x, y - 0.24 * s, z + 0.05);
      mb.add(g, '#c8a96a', bone);
      mb.add(torusRing([x, y - 0.02 * s, z + 0.05], 0.2 * s, 0.02, 'y'), '#9c7d45', bone);
      break;
    }
    case 'dish': {
      // A long wooden carrying dish held at the hip.
      const g = lathe(
        [
          [0, 0],
          [0.16, 0.03],
          [0.2, 0.09],
        ],
        [0, 0, 0],
        9,
        [1, 1, 1.9],
      );
      g.translate(x - 0.05, y - 0.08, z + 0.12);
      mb.add(g, '#a8683c', bone);
      break;
    }
    case 'sickle':
      mb.add(
        horn(
          [x, y - 0.05, z + 0.05],
          [x, y + 0.25, z + 0.2],
          [x, y + 0.38, z + 0.05],
          0.025,
          0.02,
          6,
          5,
        ),
        '#e8dcc0',
        bone,
      );
      for (let i = 0; i < 3; i++)
        mb.add(
          blob([x, y + 0.14 + i * 0.09, z + 0.16 - i * 0.03], [0.018, 0.04, 0.03], 4),
          FLINT,
          bone,
        );
      break;
    case 'grinding-stone':
      mb.add(blob([x, y - 0.02, z + 0.1], [0.08, 0.05, 0.11], 6), '#8e8579', bone);
      break;
    case 'staff':
      // An overseer's long staff, taller than he is.
      mb.add(rod(at(-0.8), at(1.2), 0.026 * s), '#6e4526', bone);
      mb.add(blob(at(1.2), [0.045 * s, 0.05 * s, 0.045 * s], 5), '#e0aa2e', bone);
      break;
    case 'palette':
      // A scribe's palette with its red and black inks, held flat.
      mb.add(blob([x, y + 0.02, z + 0.12], [0.05, 0.02, 0.17], 5), '#d8c49a', bone);
      for (const [dz, c] of [
        [0.08, '#b23a2a'],
        [0.15, '#1d1410'],
      ] as const)
        mb.add(blob([x, y + 0.04, z + dz + 0.06], [0.022, 0.012, 0.022], 4), c, bone);
      break;
    case 'none':
      break;
  }
}

// --- Poses for the sheets and the stand-in clips. Rotations in radians. ---

export type Pose = 'stand' | 'walk' | 'throw' | 'work' | 'carry' | 'point';

export function posePerson(m: Model, pose: Pose, phase = 0.25): void {
  const set = (name: string, x = 0, y = 0, z = 0) => m.bones.get(name)?.rotation.set(x, y, z);
  for (const b of m.bones.values()) b.rotation.set(0, 0, 0);
  const s = Math.sin(phase * Math.PI * 2);
  switch (pose) {
    case 'stand':
      set('armUpperL', 0.05, 0, 0.12);
      set('armUpperR', -0.1, 0, -0.12);
      set('armLowerR', -0.35);
      set('head', 0.05, 0.15);
      break;
    case 'walk':
      set('legUpperL', -0.5 * s);
      set('legUpperR', 0.5 * s);
      set('legLowerL', Math.max(0, 0.6 * s));
      set('legLowerR', Math.max(0, -0.6 * s));
      set('armUpperL', 0.45 * s, 0, 0.1);
      set('armUpperR', -0.3 * s - 0.2, 0, -0.1);
      set('armLowerR', -0.4);
      set('armLowerL', -0.3);
      set('torso', 0.06);
      break;
    case 'throw':
      set('torso', -0.15, 0.35);
      set('armUpperR', -2.6, 0, -0.25);
      set('armLowerR', -0.6);
      set('armUpperL', -1.1, 0, 0.3);
      set('legUpperL', -0.45);
      set('legLowerL', 0.15);
      set('legUpperR', 0.35);
      set('legLowerR', 0.3);
      break;
    case 'work':
      set('hips', 0.0);
      set('torso', 0.45);
      set('head', -0.2);
      set('armUpperL', -0.9, 0, 0.15);
      set('armLowerL', -0.6);
      set('armUpperR', -1.0, 0, -0.15);
      set('armLowerR', -0.5);
      set('legUpperL', -0.35);
      set('legLowerL', 0.6);
      set('legUpperR', -0.1);
      set('legLowerR', 0.3);
      break;
    case 'carry':
      set('armUpperL', -2.9, 0, 0.15);
      set('armLowerL', -0.5);
      set('armUpperR', -0.6, 0, -0.1);
      set('armLowerR', -0.9);
      set('legUpperL', -0.25);
      set('legUpperR', 0.25);
      set('legLowerR', 0.3);
      break;
    case 'point':
      set('armUpperL', -1.45, -0.3, 0.2);
      set('armLowerL', -0.1);
      set('armUpperR', -0.2, 0, -0.1);
      set('armLowerR', -0.4);
      set('head', 0, 0.3);
      break;
  }
}
