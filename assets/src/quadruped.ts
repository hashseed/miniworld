// The shared four-legged body of the clay animals (spec milestone 2, section
// 13.3): barrel body, neck and head, eyes and four chunky legs on their own
// bones, so the animal clips drive every quadruped the same way.

import * as THREE from 'three';
import { type Vec3, ModelBuilder, blob, limb, shade } from './kit.ts';

export interface Quad {
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
