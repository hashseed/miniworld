// Approval by content (spec milestone 2, section 13.3): every model the app
// may draw, built the default way, and a hash of its geometry that the asset
// manifest records when Yang approves it.

import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { plantGeometry } from '../../app/src/globe/foliageModels.ts';
import { KINDS as PLANT_KINDS } from '../../app/src/globe/foliageKinds.ts';
import { ANIMALS, buildAnimal } from './animals.ts';
import { PROFILES, buildPerson, type Kind } from './people.ts';
import { SHELTERS, buildHearth, buildShelter } from './shelters.ts';

const PERSON_KINDS: Kind[] = ['man', 'woman', 'child'];

/** Every approvable model by its asset id, built by default (variant 0, default tool). */
export const MODELS: Record<string, () => THREE.Object3D> = Object.fromEntries([
  ...PROFILES.flatMap((profile) =>
    PERSON_KINDS.map((kind) => [
      `figure-${profile}-${kind}`,
      () => buildPerson({ profile, kind }).object,
    ]),
  ),
  [
    'figure-first-person',
    () => buildPerson({ profile: 'african-stone-age', kind: 'woman', founder: true }).object,
  ],
  ...SHELTERS.map((id) => [id, () => buildShelter(id).object]),
  ['prop-hearth', () => buildHearth().object],
  ...ANIMALS.map((id) => [id, () => buildAnimal(id).object]),
  ...PLANT_KINDS.map((kind, i) => [
    `plant-${kind}`,
    () => new THREE.Mesh(plantGeometry(i), new THREE.MeshBasicMaterial()),
  ]),
]) as Record<string, () => THREE.Object3D>;

/** Positions to 0.1 mm, everything else to 0.001, as integers. */
function quantise(values: ArrayLike<number>, step: number): Int32Array {
  return Int32Array.from(values as ArrayLike<number>, (v) => Math.round(v / step));
}

/**
 * Hash of a model's geometry: for every part in tree order, its placement and
 * its attributes and indices, rounded so that the last bits of floating-point
 * maths do not matter. 16 hex digits.
 */
export function geometryHash(object: THREE.Object3D): string {
  const hash = createHash('sha256');
  const add = (label: string, data: Int32Array | Uint32Array) => {
    hash.update(`${label}:${data.length}\0`);
    hash.update(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  };
  object.traverse((o) => {
    add('position', quantise(o.position.toArray(), 1e-4));
    add('rotation', quantise(o.quaternion.toArray(), 1e-3));
    add('scale', quantise(o.scale.toArray(), 1e-3));
    hash.update(`visible:${o.visible}\0`);
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    for (const name of Object.keys(g.attributes).sort()) {
      const values = g.getAttribute(name).array as ArrayLike<number>;
      add(name, quantise(values, name === 'position' ? 1e-4 : 1e-3));
    }
    if (g.index) add('index', Uint32Array.from(g.index.array as ArrayLike<number>));
  });
  return hash.digest('hex').slice(0, 16);
}
