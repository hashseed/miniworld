// Checks of the model scripts (spec milestone 2, section 13.3): deterministic
// geometry, triangle budgets, feet on the ground, facing, clips and the
// asset manifest.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import manifest from '../../data/assets/manifest.json';
import { ANIMALS, PREHISTORIC_ANIMALS, buildAnimal } from './animals.ts';
import { MODELS, geometryHash } from './approval.ts';
import {
  BLEND_SECONDS,
  GAITS,
  PERSON_LOOPS,
  THROW_RELEASE,
  SHOOT_RELEASE,
  animalLoop,
  animateAnimal,
  animatePerson,
  blendPerson,
  gaitSpeed,
  type Clip,
} from './clips.ts';
import type { Model } from './kit.ts';
import {
  LANDMARK_ASSETS,
  PROPS,
  PYRAMIDS,
  buildLandmarkAsset,
  buildProp,
  buildPyramid,
  pyramidShape,
  pyramidSurface,
  type LandmarkAssetId,
} from './landmarks.ts';
import { PROFILES, buildArrow, buildBow, buildPerson, type Kind } from './people.ts';
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
    '$profile $kind stays within 1,100 triangles, carried bundle included',
    ({ profile, kind }) => {
      expect(buildPerson({ profile, kind }).triangles).toBeLessThanOrEqual(1100);
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
  it.each([...SHELTERS])('%s is deterministic, on the ground and within its triangles', (id) => {
    const m = buildShelter(id);
    expect(positions(m)).toEqual(positions(buildShelter(id)));
    // A painted cave wall, of which there are a few in the world, has room for its drawing.
    expect(m.triangles).toBeLessThanOrEqual(id.startsWith('prop-cave-wall-') ? 2400 : 1000);
    // Rocks and floors may sit partly in the ground, but not deep.
    expect(bounds(m).min.y).toBeGreaterThan(-0.5);
  });

  it('the hearth stays small', () => {
    expect(buildHearth().triangles).toBeLessThanOrEqual(400);
  });

  it.each([...ANIMALS])('%s is deterministic, stands on its feet and faces +Z', (id) => {
    const m = buildAnimal(id);
    expect(positions(m)).toEqual(positions(buildAnimal(id)));
    expect(m.triangles).toBeLessThanOrEqual(1300);
    const b = bounds(m);
    expect(b.min.y).toBeGreaterThan(-0.05);
    expect(b.min.y).toBeLessThan(0.05);
    expect(m.bones.get('head')!.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(0);
  });

  it('the mammoth is the biggest prehistoric animal and about twice as tall as a man', () => {
    const man = bounds(
      buildPerson({ profile: 'steppe-beringia-hunter', kind: 'man', tool: 'none' }),
    ).max.y;
    const mammoth = bounds(buildAnimal('animal-mammoth')).max.y;
    for (const id of PREHISTORIC_ANIMALS)
      expect(bounds(buildAnimal(id)).max.y).toBeLessThanOrEqual(mammoth);
    expect(mammoth / man).toBeGreaterThan(1.7);
    expect(mammoth / man).toBeLessThan(2.6);
  });
});

describe('clips', () => {
  const clips: Clip[] = [
    'idle',
    'walk',
    'run',
    'carry',
    'work',
    'point',
    'throw',
    'shoot',
    'cheer',
  ];

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

  // Baked into animation textures (milestone 2, section 5.3), a clip must come round again
  // after its loop, or hold still after a one-off gesture.
  it.each(Object.entries(PERSON_LOOPS))('%s repeats as PERSON_LOOPS says', (clip, how) => {
    const m = buildPerson({ profile: 'ice-age-hunter', kind: 'man' });
    const visible = () => [...m.bones.values()].map((b) => b.visible);
    const at = (t: number) => {
      animatePerson(m, clip as Clip, t);
      return [...pose(m), ...visible().map(Number)];
    };
    // Times off the clips' stroke boundaries, where floor() is at the mercy of rounding.
    for (const t of [0.13, 0.37, 1.91, 4.05]) {
      const [a, b] = 'loop' in how ? [t, t + 3 * how.loop] : [how.once + t, how.once + t + 7];
      const p = at(a);
      const q = at(b);
      for (let i = 0; i < p.length; i++) expect(q[i]).toBeCloseTo(p[i]!, 6);
    }
  });

  const animalClips: Clip[] = [
    'idle',
    'walk',
    'run',
    'swim',
    'fly',
    'struggle',
    'bound',
    'hung',
    'fall',
  ];
  it.each(ANIMALS)('%s repeats as animalLoop says', (id) => {
    const m = buildAnimal(id);
    const pose = () =>
      [...m.bones.values()].flatMap(
        (b) => [...b.rotation.toArray().slice(0, 3), ...b.position.toArray()] as number[],
      );
    for (const clip of animalClips) {
      const how = animalLoop(m, clip);
      for (const t of [0.13, 0.37, 1.91]) {
        const [a, b] = 'loop' in how ? [t, t + 2 * how.loop] : [how.once + t, how.once + t + 7];
        animateAnimal(m, clip, a);
        const p = pose();
        animateAnimal(m, clip, b);
        const q = pose();
        for (let i = 0; i < p.length; i++) expect(q[i]).toBeCloseTo(p[i]!, 6);
      }
    }
  });

  /** The world position of the lowest point of a foot in the rest pose, as posed now. */
  function soleOf(m: Model, bone: string): () => THREE.Vector3 {
    animatePerson(m, 'idle', 0);
    m.object.position.set(0, 0, 0);
    m.object.updateMatrixWorld(true);
    let best: { mesh: THREE.Mesh; i: number; y: number } | undefined;
    m.bones.get(bone)!.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh.parent as THREE.Mesh).isMesh) return;
      const pos = mesh.geometry.getAttribute('position');
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        if (!best || v.y < best.y) best = { mesh, i, y: v.y };
      }
    });
    const { mesh, i } = best!;
    return () => {
      m.object.updateMatrixWorld(true);
      return new THREE.Vector3()
        .fromBufferAttribute(mesh.geometry.getAttribute('position'), i)
        .applyMatrix4(mesh.matrixWorld);
    };
  }

  it.each(['walk', 'carry', 'haul', 'bearBehind', 'bearAhead'] as const)(
    'moving at the gait speed, the standing foot of %s stays put on the ground',
    (clip) => {
      const m = buildPerson({ profile: 'african-stone-age', kind: 'woman', founder: true });
      const sole = soleOf(m, 'legLowerL');
      const g = GAITS[clip];
      const v = gaitSpeed(m, clip);
      const at = (u: number) => {
        const t = u * g.period;
        animatePerson(m, clip, t);
        m.object.position.set(0, 0, v * t);
        return sole();
      };
      const first = at(0.02);
      for (let u = 0.02; u < g.stance - 0.02; u += 0.02) {
        const p = at(u);
        expect(Math.abs(p.z - first.z)).toBeLessThan(0.05);
        expect(Math.abs(p.y)).toBeLessThan(0.05);
      }
    },
  );

  it('changing clip never snaps a limb (fluid motion)', () => {
    const m = buildPerson({ profile: 'african-stone-age', kind: 'woman', founder: true });
    const all: Clip[] = ['idle', 'walk', 'run', 'carry', 'haul', 'work', 'point', 'cheer'];
    const world = () => {
      m.object.updateMatrixWorld(true);
      return [...m.bones.values()].map((b) => b.getWorldQuaternion(new THREE.Quaternion()));
    };
    for (const from of all)
      for (const to of all) {
        if (from === to) continue;
        let prev: THREE.Quaternion[] | undefined;
        // From half a second before the change to half a second after, at 60 frames per second.
        for (let f = -30; f <= 30; f++) {
          const t = f / 60;
          if (t < 0) animatePerson(m, from, 2 + t);
          else if (t < BLEND_SECONDS) blendPerson(m, from, 2 + t, to, t, t / BLEND_SECONDS);
          else animatePerson(m, to, t);
          const cur = world();
          // A real arm swings at well under 30 radians per second, except in a throw.
          if (prev) cur.forEach((q, i) => expect(q.angleTo(prev![i]!) * 60).toBeLessThan(30));
          prev = cur;
        }
      }
  });

  it('the held tool is hidden for the whole bow gesture, and the arrow leaves the string after the bow is up', () => {
    const m = buildPerson({ profile: 'ice-age-hunter', kind: 'man' });
    const tool = m.bones.get('tool')!;
    animatePerson(m, 'shoot', 0);
    expect(tool.visible).toBe(false);
    animatePerson(m, 'shoot', SHOOT_RELEASE - 0.01);
    const drawn = m.bones.get('armLowerR')!.rotation.x;
    animatePerson(m, 'shoot', SHOOT_RELEASE + 0.3);
    expect(m.bones.get('armLowerR')!.rotation.x).toBeGreaterThan(drawn);
    expect(buildBow().object.children.length).toBeGreaterThan(0);
    expect(buildArrow().object.children.length).toBeGreaterThan(0);
    animatePerson(m, 'idle', 0);
    expect(tool.visible).toBe(true);
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

describe('landmarks', () => {
  const assets = Object.keys(LANDMARK_ASSETS) as LandmarkAssetId[];

  it.each(assets)('%s is deterministic and within the 20,000-triangle landmark budget', (id) => {
    const m = buildLandmarkAsset(id);
    expect(positions(m)).toEqual(positions(buildLandmarkAsset(id)));
    expect(m.triangles).toBeLessThanOrEqual(20000);
    // Sand mounds may reach into the ground, like the shelters' rocks.
    expect(bounds(m).min.y).toBeGreaterThan(-12);
  });

  it.each(Object.keys(PYRAMIDS) as (keyof typeof PYRAMIDS)[])(
    'the %s pyramid rises in whole tiers from nothing to its full height',
    (id) => {
      const H = PYRAMIDS[id].height;
      expect(pyramidShape(id, 0).core).toBe(0);
      const heights = [0.1, 0.3, 0.5, 0.7, 0.84].map((f) => pyramidShape(id, f).core);
      for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeGreaterThan(heights[i - 1]!);
      for (const h of heights)
        expect(Math.abs(h / (H / 24) - Math.round(h / (H / 24)))).toBeLessThan(1e-9);
      expect(pyramidShape(id, 0.85).core).toBeCloseTo(H);
      const done = pyramidShape(id, 1);
      expect(done.casingFrom).toBe(0);
      // The drawn model's height matches the shape.
      expect(bounds(buildPyramid(id, pyramidShape(id, 0.5))).max.y).toBeCloseTo(
        pyramidShape(id, 0.5).core,
        0,
      );
    },
  );

  it('the surface follows the rising and the finished pyramid, with ground around it', () => {
    const shape = pyramidShape('khufu', 0.5);
    const { base, height } = PYRAMIDS.khufu;
    expect(pyramidSurface('khufu', shape, 0, 0)).toBeCloseTo(shape.core);
    // Outside the base, where the crew works, there is only ground.
    expect(pyramidSurface('khufu', shape, 0, -base / 2 - 1)).toBe(0);
    expect(pyramidSurface('khufu', shape, base, 0)).toBe(0);
    // The finished pyramid has a pointed top.
    const done = pyramidShape('khufu', 'complete');
    expect(pyramidSurface('khufu', done, 0, 0)).toBeCloseTo(height);
  });

  it.each([...PROPS])('%s is deterministic and small', (id) => {
    const m = buildProp(id);
    expect(positions(m)).toEqual(positions(buildProp(id)));
    expect(m.triangles).toBeLessThanOrEqual(400);
  });
});

describe('asset manifest', () => {
  const entries = new Map(
    manifest.assets.map((a) => [a.id, a as { status: string; geometry?: string }]),
  );

  it.each(Object.keys(MODELS))(
    '%s is listed, and if approved, with the geometry it has now',
    (id) => {
      const entry = entries.get(id);
      expect(['generated', 'approved', 'rejected']).toContain(entry?.status);
      // The one model left unreviewed (giza.md section 12) is never drawn.
      if (entry?.status !== 'approved') return;
      // A changed model needs Yang's approval again; then `npm run approve-assets -- <id>`.
      expect(geometryHash(MODELS[id]!()), `${id} changed since it was approved`).toBe(
        entry?.geometry,
      );
    },
  );

  it('hashes the geometry, not the last bits of the arithmetic', () => {
    const a = buildHearth().object;
    const b = buildHearth().object;
    const mesh = b.getObjectByProperty('isMesh', true) as THREE.Mesh;
    const pos = mesh.geometry.getAttribute('position');
    pos.setX(0, pos.getX(0) + 1e-7);
    expect(geometryHash(b)).toBe(geometryHash(a));
    pos.setX(0, pos.getX(0) + 0.01);
    expect(geometryHash(b)).not.toBe(geometryHash(a));
  });

  it('only models waiting for review are not approved', () => {
    const waiting = Object.keys(MODELS).filter((id) => entries.get(id)?.status !== 'approved');
    expect(
      waiting.every((id) =>
        /^(stone-sledge|figure-african-stone-age-man|figure-(west-asia-hunter|east-asia-hunter|first-americans)-(man|woman|child)|prop-(carry-pole|spit|canoe|cave-wall-sulawesi|cave-wall-chauvet|burial|gobekli-ring)|shelter-small-hut)$/.test(
          id,
        ),
      ),
    ).toBe(true);
  });
});
