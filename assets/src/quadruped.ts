// The shared four-legged body of the clay animals (spec milestone 2, section
// 13.3): barrel body, neck and head, eyes and four chunky legs on their own
// bones, so the animal clips drive every quadruped the same way.

import * as THREE from 'three';
import { type Pattern, type Vec3, ModelBuilder, blob, limb, shade } from './kit.ts';

export interface Quad {
  /** Height of the back at the shoulder. */
  shoulder: number;
  /** Length of the body from chest to rump. */
  length: number;
  /** Half thickness of the body (x, y). */
  girth: [number, number];
  leg: number;
  /** Thigh and shoulder thick, lower leg slim, a bump at the knee (default: even chunky legs). */
  taper?: boolean;
  /** How far the legs stand out to the sides, as a share of the body's half width (default 0.55). */
  legSpread?: number;
  /** Neck from the chest: forward and up, as a share of the shoulder height. */
  neck: [number, number];
  head: Vec3;
  /** Head tilt down from level, radians. */
  headDrop: number;
  coat: string;
  belly?: string;
  legColour?: string;
  hoof?: string;
  /** Round column feet with toenails (elephants) instead of flat hooves or paws; the hoof colour is the nails'. */
  toenails?: boolean;
  /**
   * How far the knees bend while a foot is lifted, in radians (default 0.8):
   * little for elephants' column legs, deep for cats and dogs.
   */
  knee?: number;
  /** Patterns painted on the coat (zebra stripes); the parts get extra rings so bands can follow them. */
  pattern?: {
    body?: Pattern;
    chest?: Pattern;
    neck?: Pattern;
    head?: Pattern;
    legs?: Pattern;
    /** Segments round the patterned body and chest (default 8 and 7), for patches finer than bands. */
    segments?: number;
  };
}

/** Height of the front knee and of the hock as a share of the top of the leg. */
const FRONT_KNEE = 0.45;
const HOCK = 0.5;

export interface Parts {
  mb: ModelBuilder;
  headAt: THREE.Vector3;
  front: number;
  back: number;
  bodyY: number;
}

export function quadruped(q: Quad, clay = 1): Parts {
  const front = q.length / 2;
  const back = -q.length / 2;
  const legTop = q.shoulder - q.girth[1] * 0.9;
  const spread = q.girth[0] * (q.legSpread ?? 0.55);
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
      { name: 'legFL', pivot: [spread, legTop, front * 0.72], parent: 'body' },
      { name: 'legFR', pivot: [-spread, legTop, front * 0.72], parent: 'body' },
      { name: 'legBL', pivot: [spread, legTop, back * 0.72], parent: 'body' },
      { name: 'legBR', pivot: [-spread, legTop, back * 0.72], parent: 'body' },
      { name: 'tail', pivot: [0, bodyY + q.girth[1] * 0.4, back * 1.02], parent: 'body' },
      // The lower legs hang from the knees in front and the hocks behind,
      // which bend the other way (Yang, 2026-10-18: legs need a joint).
      ...(
        [
          ['FL', spread, front, FRONT_KNEE, 1],
          ['FR', -spread, front, FRONT_KNEE, 1],
          ['BL', spread, back, HOCK, -1],
          ['BR', -spread, back, HOCK, -1],
        ] as const
      ).map(([leg, x, end, at, way]) => ({
        name: `low${leg}`,
        pivot: [x, legTop * at, end * 0.72] as Vec3,
        parent: `leg${leg}`,
        flex: way * (q.knee ?? (q.toenails ? 0.3 : 0.8)),
      })),
    ],
    clay,
  );
  // Body: chest and rump lumps joined by the barrel.
  const pt = q.pattern;
  const barrel = pt?.body
    ? blob([0, bodyY, 0], [q.girth[0], q.girth[1], q.length * 0.55], pt.segments ?? 8, 15, 'z')
    : blob([0, bodyY, 0], [q.girth[0], q.girth[1], q.length * 0.55], 8);
  mb.add(barrel, q.coat, 'body', pt?.body);
  const chestAt: Vec3 = [0, bodyY + q.girth[1] * 0.08, front * 0.6];
  const chestRadii: Vec3 = [q.girth[0] * 1.05, q.girth[1] * 1.04, q.length * 0.3];
  mb.add(
    pt?.body ? blob(chestAt, chestRadii, pt.segments ?? 7, 8, 'z') : blob(chestAt, chestRadii, 9),
    q.coat,
    'body',
    pt?.chest ?? pt?.body,
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
      pt?.neck ? 6 : 0,
    ),
    q.coat,
    'head',
    pt?.neck,
  );
  const head = pt?.head ? blob([0, 0, 0], q.head, 7, 9, 'z') : blob([0, 0, 0], q.head, 7);
  head.rotateX(q.headDrop);
  head.translate(headAt.x, headAt.y, headAt.z);
  mb.add(head, q.coat, 'head', pt?.head);
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
  for (const [leg, x, z, at] of [
    ['FL', 1, front * 0.72, FRONT_KNEE],
    ['FR', -1, front * 0.72, FRONT_KNEE],
    ['BL', 1, back * 0.72, HOCK],
    ['BR', -1, back * 0.72, HOCK],
  ] as const) {
    const bone = `low${leg}`;
    const lx = x * spread;
    const legR = q.leg * 1.4; // chunky toy legs
    const footY = Math.max(0.08, legR * 0.75);
    const kneeY = Math.max(footY + legR * 0.5, legTop * at);
    const topR = q.taper ? legR * 1.6 : legR;
    const kneeR = legR * (q.taper ? 0.62 : 0.87);
    const footR = legR * (q.taper ? 0.5 : 0.75);
    // Upper leg to the knee, lower leg to one cap radius above the ground, so its rounded end rests there.
    mb.add(
      limb([lx, legTop, z], [lx, kneeY, z], topR, kneeR, 5, pt?.legs ? 2 : 0),
      legColour,
      `leg${leg}`,
      pt?.legs,
    );
    mb.add(
      limb([lx, kneeY, z], [lx, footY, z], kneeR, footR, 5, pt?.legs ? 2 : 0),
      legColour,
      bone,
      pt?.legs,
    );
    if (q.taper)
      mb.add(blob([lx, kneeY, z], [kneeR * 1.25, kneeR * 1.2, kneeR * 1.25], 5), legColour, bone);
    if (q.toenails) {
      // A round foot as wide as the leg and a little wider at the ground, with
      // three nails at the front (Yang, 2026-10-18: elephants have no flat feet).
      mb.add(
        blob([lx, legR * 0.5, z], [legR * 1.08, legR * 0.55, legR * 1.08], 6),
        legColour,
        bone,
      );
      for (const t of [-0.45, 0, 0.45])
        mb.add(
          blob(
            [lx + t * legR, legR * 0.2, z + legR * 0.98],
            [legR * 0.22, legR * 0.2, legR * 0.14],
            4,
          ),
          q.hoof ?? shade(legColour, 0.25),
          bone,
        );
      continue;
    }
    mb.add(
      blob([lx, 0.06, z + legR * 0.2], [legR * 0.85, 0.07, legR * 1.0], 5),
      q.hoof ?? shade(legColour, -0.35),
      bone,
    );
  }
  return { mb, headAt, front, back, bodyY };
}
