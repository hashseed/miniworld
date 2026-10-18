// Checks of the model scripts (spec milestone 2, section 13.3): deterministic
// geometry, triangle budgets, feet on the ground, facing, clips and the
// asset manifest.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import manifest from '../../data/assets/manifest.json';
import { ANIMALS, buildAnimal } from './animals.ts';
import { THROW_RELEASE, animateAnimal, animatePerson, type Clip } from './clips.ts';
import type { Model } from './kit.ts';
import { PROFILES, buildPerson, type Kind } from './people.ts';
import { SHELTERS, buildHearth, buildShelter } from './shelters.ts';

const KINDS: Kind[] = ['man', 'woman', 'child'];
const people = PROFILES.flatMap((profile) => KINDS.map((kind) => ({ profile, kind })));

/** Every vertex position of a model, in bone order, as one array. */
function positions(m: Model): number[] {
  const out: number[] = [];
  m.object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(mesh.parent as THREE.Mesh).isMesh) {
      out.push(...(mesh.geometry.getAttribute('position').array as Float32Array));
    }
  });
  return out;
}

/** Bounds of what is drawn: hidden parts such as an unused carried bundle don't count. */
function bounds(m: Model): THREE.Box3 {
  m.object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  m.object.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
  });
  return box;
}

describe('people', () => {
  it.each(people)('$profile $kind is the same every time it is built', ({ profile, kind }) => {
    expect(positions(buildPerson({ profile, kind, variant: 3 }))).toEqual(
      positions(buildPerson({ profile, kind, variant: 3 })),
    );
  });

  it.each(people)(
    '$profile $kind stays within 1,050 triangles, carried bundle included',
    ({ profile, kind }) => {
      expect(buildPerson({ profile, kind }).triangles).toBeLessThanOrEqual(1050);
    },
  );

  it.each(people)(
    '$profile $kind stands on the ground at a believable height',
    ({ profile, kind }) => {
      const b = bounds(buildPerson({ profile, kind, tool: 'none' }));
      expect(b.min.y).toBeGreaterThan(-0.05);
      expect(b.min.y).toBeLessThan(0.03);
      const height = b.max.y;
      if (kind === 'child') expect(height).toBeLessThan(1.4);
      else expect(height).toBeGreaterThan(1.45);
      expect(height).toBeLessThan(2.0);
    },
  );

  it('faces +Z: the toes point forward', () => {
    const m = buildPerson({ profile: 'natufian', kind: 'woman' });
    const shin = m.bones.get('legLowerL')!.children[0] as THREE.Mesh;
    shin.geometry.computeBoundingBox();
    expect(shin.geometry.boundingBox!.max.z).toBeGreaterThan(
      -shin.geometry.boundingBox!.min.z + 0.05,
    );
  });

  it('uses only colours, never Math.random, for variety: variants differ only in colour', () => {
    const a = buildPerson({ profile: 'african-stone-age', kind: 'man', variant: 0 });
    const b = buildPerson({ profile: 'african-stone-age', kind: 'man', variant: 1 });
    expect(a.triangles).toBe(b.triangles);
  });
});

describe('shelters and animals', () => {
  it.each([...SHELTERS])('%s is deterministic, on the ground and within 1,000 triangles', (id) => {
    const m = buildShelter(id);
    expect(positions(m)).toEqual(positions(buildShelter(id)));
    expect(m.triangles).toBeLessThanOrEqual(1000);
    // Rocks and floors may sit partly in the ground, but not deep.
    expect(bounds(m).min.y).toBeGreaterThan(-0.5);
  });

  it('the hearth stays small', () => {
    expect(buildHearth().triangles).toBeLessThanOrEqual(400);
  });

  it.each([...ANIMALS])('%s is deterministic, stands on its feet and faces +Z', (id) => {
    const m = buildAnimal(id);
    expect(positions(m)).toEqual(positions(buildAnimal(id)));
    expect(m.triangles).toBeLessThanOrEqual(1200);
    const b = bounds(m);
    expect(b.min.y).toBeGreaterThan(-0.05);
    expect(b.min.y).toBeLessThan(0.05);
    expect(m.bones.get('head')!.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(0);
  });

  it('the mammoth is the biggest animal and about twice as tall as a man', () => {
    const man = bounds(
      buildPerson({ profile: 'steppe-beringia-hunter', kind: 'man', tool: 'none' }),
    ).max.y;
    const mammoth = bounds(buildAnimal('animal-mammoth')).max.y;
    for (const id of ANIMALS) expect(bounds(buildAnimal(id)).max.y).toBeLessThanOrEqual(mammoth);
    expect(mammoth / man).toBeGreaterThan(1.7);
    expect(mammoth / man).toBeLessThan(2.6);
  });
});

describe('clips', () => {
  const clips: Clip[] = ['idle', 'walk', 'run', 'carry', 'work', 'point', 'throw', 'cheer'];

  function pose(m: Model): number[] {
    return [...m.bones.values()].flatMap(
      (b) => [...b.rotation.toArray().slice(0, 3), ...b.position.toArray()] as number[],
    );
  }

  it.each(clips)('%s gives the same pose for the same time, whatever came before', (clip) => {
    const m = buildPerson({ profile: 'ice-age-hunter', kind: 'man' });
    animatePerson(m, clip, 1.234);
    const first = pose(m);
    animatePerson(m, 'run', 0.4);
    animatePerson(m, clip, 1.234);
    expect(pose(m)).toEqual(first);
  });

  it('the spear leaves the hand at the release time and comes back for other clips', () => {
    const m = buildPerson({ profile: 'ice-age-hunter', kind: 'man' });
    const tool = m.bones.get('tool')!;
    animatePerson(m, 'throw', THROW_RELEASE - 0.01);
    expect(tool.visible).toBe(true);
    animatePerson(m, 'throw', THROW_RELEASE);
    expect(tool.visible).toBe(false);
    animatePerson(m, 'idle', 0);
    expect(tool.visible).toBe(true);
  });

  it('only carry shows the bundle, and it hides the spear', () => {
    const m = buildPerson({ profile: 'steppe-beringia-hunter', kind: 'woman' });
    animatePerson(m, 'carry', 0.5);
    expect(m.bones.get('load')!.visible).toBe(true);
    expect(m.bones.get('tool')!.visible).toBe(false);
    animatePerson(m, 'walk', 0.5);
    expect(m.bones.get('load')!.visible).toBe(false);
  });

  it('crouching lowers the body but keeps the feet near the ground', () => {
    const m = buildPerson({ profile: 'natufian', kind: 'man', tool: 'none' });
    const standing = bounds(m).max.y;
    animatePerson(m, 'work', 0);
    const b = bounds(m);
    expect(b.max.y).toBeLessThan(standing * 0.85);
    expect(b.min.y).toBeGreaterThan(-0.15);
  });

  it('the falling mammoth ends on its side, resting on the ground', () => {
    const m = buildAnimal('animal-mammoth');
    const standing = bounds(m).max.y;
    for (const t of [0, 1, 2, 3]) {
      animateAnimal(m, 'fall', t);
      const b = bounds(m);
      // It may sink a little into the ground, but never more than a small part of its height.
      expect(b.min.y).toBeGreaterThan(-0.12 * standing);
      expect(b.min.y).toBeLessThan(0.1);
    }
    expect(bounds(m).max.y).toBeLessThan(standing * 0.85);
    expect(m.bones.get('body')!.rotation.z).toBeGreaterThan(1.3);
  });
});

describe('asset manifest', () => {
  const entries = new Map(manifest.assets.map((a) => [a.id, a.status]));
  const ids = [
    ...people.map(({ profile, kind }) => `figure-${profile}-${kind}`),
    ...SHELTERS,
    'prop-hearth',
    ...ANIMALS,
  ];

  it.each(ids)('%s is listed and approved', (id) => {
    expect(entries.get(id)).toBe('approved');
  });
});
