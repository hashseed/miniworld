// Approved clay models for the tree's figures (spec milestone 2, section 13.3).
// A figure gets the model of its culture profile or animal when
// that model is approved in the asset manifest, and a stand-in otherwise.

import * as THREE from 'three';
import { drawable } from '../content/assets.ts';
import { ANIMALS, buildAnimal, type AnimalId } from '../../../assets/src/animals.ts';
import { animateAnimal, animatePerson, blendPerson } from '../../../assets/src/clips.ts';
import { lightUniforms, type Model } from '../../../assets/src/kit.ts';
import {
  buildPerson,
  buildArrow,
  buildBow,
  buildSpear,
  PROFILES,
  type Kind,
  type Profile,
  type Tool,
} from '../../../assets/src/people.ts';
import {
  buildHearth,
  buildShelter,
  CAMP_SHELTER,
  flickerHearth,
  lightHearth,
  SHELTERS,
  type ShelterId,
} from '../../../assets/src/shelters.ts';
import { hashString } from '../core/hash.ts';
import type { CastRules, Clip } from './standIns.ts';
import { buildStandIn, type StandIn } from './standIns.ts';

/** The family at a camp: a woman, a child and a man, then repeating. */
const FAMILY: Kind[] = ['woman', 'child', 'man'];
/** An animal's model is animal-<id> (content-format.md section 1). */
function animalModel(look: string): AnimalId | undefined {
  const id = `animal-${look}`;
  return (ANIMALS as readonly string[]).includes(id) ? (id as AnimalId) : undefined;
}

/** Wraps a model: it faces +Z, the stand-ins and the stage face +X. */
function wrap(model: Model, pose: (clip: Clip, seconds: number) => void): StandIn {
  const root = new THREE.Group();
  model.object.rotation.y = Math.PI / 2;
  root.add(model.object);
  // Height of the body alone: held tools and loads are left out.
  const extras = ['tool', 'load'].flatMap((name) => {
    const bone = model.bones.get(name);
    return bone?.parent ? [[bone, bone.parent] as const] : [];
  });
  for (const [bone, parent] of extras) parent.remove(bone);
  const box = new THREE.Box3().setFromObject(model.object);
  for (const [bone, parent] of extras) parent.add(bone);
  pose('idle', 0);
  return { root, height: box.max.y - box.min.y, pose, setFade: fader(model.object) };
}

/**
 * Fading for one model: the first fade gives it its own copies of the shared
 * materials, with a fade uniform of its own, so other models stay solid.
 */
function fader(object: THREE.Object3D): (fade: number) => void {
  let own: { value: number } | undefined;
  return (fade) => {
    if (!own) {
      if (fade >= 1) return;
      const uniform = { value: 1 };
      const copies = new Map<THREE.Material, THREE.ShaderMaterial>();
      object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const m = mesh.material as THREE.ShaderMaterial | undefined;
        if (!mesh.isMesh || !m?.isShaderMaterial) return;
        let copy = copies.get(m);
        if (!copy) {
          copy = m.clone();
          copy.uniforms = { ...m.uniforms, fade: uniform };
          copies.set(m, copy);
        }
        mesh.material = copy;
      });
      own = uniform;
    }
    own.value = fade;
  };
}

/** Builds the drawn actor for a cast member. */
export function buildActor(
  kind: 'human' | 'animal' | 'prop',
  look: string,
  key: string,
  index: number,
  rules: CastRules = {},
): StandIn {
  if (kind === 'animal') {
    const id = animalModel(look);
    if (id && drawable.has(id)) {
      const model = buildAnimal(id);
      const actor = wrap(model, (clip, s) => animateAnimal(model, clip, s));
      const body = model.bones.get('body');
      if (body) {
        // The body's extent in its own space, without legs, head or tail.
        const box = new THREE.Box3();
        for (const child of body.children)
          if ((child as THREE.Mesh).isMesh) {
            const g = (child as THREE.Mesh).geometry;
            g.computeBoundingBox();
            box.union(g.boundingBox!);
          }
        if (!box.isEmpty()) actor.back = { bone: body, box };
      }
      return actor;
    }
  } else if ((PROFILES as readonly string[]).includes(look)) {
    const profile = look as Profile;
    // The role's cast rules (vocab/roles.yaml) say who plays it and what it holds.
    const person: Kind = rules.man ? 'man' : FAMILY[index % FAMILY.length]!;
    if (drawable.has(`figure-${profile}-${person}`)) {
      const model = buildPerson({
        profile,
        kind: person,
        variant: hashString(key) % 997,
        tool: rules.tool as Tool | undefined,
      });
      return wrap(model, (clip, s) => animatePerson(model, clip, s));
    }
  }
  return buildStandIn(kind, look, key, rules);
}

/** Points the models' shared studio light and ink at this frame. */
export function lightModels(
  lightDir: THREE.Vector3,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
): void {
  const e = camera.matrixWorld.elements;
  lightUniforms.lightDir.value.copy(lightDir);
  lightUniforms.screenUp.value.set(e[4]!, e[5]!, e[6]!);
  lightUniforms.viewport.value.set(canvas.width, canvas.height);
  lightUniforms.inkPixels.value = (1.6 * canvas.width) / Math.max(1, canvas.clientWidth);
}

/**
 * Builds a stage prop (section 18.2): a culture's camp shelter or an asset by
 * id, facing +X like the stage, or undefined when it has no approved model.
 */
export function buildProp(kind: 'shelter' | 'asset', look: string): StandIn | undefined {
  let model: Model | undefined;
  if (kind === 'shelter') {
    const id = CAMP_SHELTER[look as Profile];
    if (id && drawable.has(id)) model = buildShelter(id);
  } else if (look === 'prop-hearth' && drawable.has(look)) {
    const hearth = buildHearth();
    return {
      ...wrap(hearth, (_clip, seconds) => flickerHearth(hearth, seconds)),
      setLit: (lit: number) => lightHearth(hearth, lit),
    };
  } else if ((SHELTERS as readonly string[]).includes(look) && drawable.has(look))
    model = buildShelter(look as ShelterId);
  if (!model) return undefined;
  return wrap(model, () => {});
}

/** A thrown spear, shaft along +Y with the tip up, at life size. */
export function buildSpearObject(): THREE.Object3D {
  return buildSpear().object;
}

/** A figure of the tree of humankind (spec humankind.md, section 8.1). */
export interface TreeActor extends StandIn {
  /** Poses a change of clip under way: `weight` 0 shows `from`, 1 shows `to`. */
  blend(from: Clip, fromSeconds: number, to: Clip, toSeconds: number, weight: number): void;
  /** Hides the held tool after posing, while a hunter's spear is away from his hand. */
  hideTool(): void;
}

/**
 * Builds a figure of the tree: the first person with her own look, or a
 * woman, man or child of the culture; a stand-in while the model is not approved.
 */
export function buildTreeFigure(
  look: 'founder' | 'woman' | 'man' | 'child',
  id: number,
  profile: Profile = 'african-stone-age',
): TreeActor {
  const asset = look === 'founder' ? 'figure-first-person' : `figure-${profile}-${look}`;
  if (drawable.has(asset)) {
    const model = buildPerson(
      look === 'founder'
        ? { profile: 'african-stone-age', kind: 'woman', founder: true }
        : { profile, kind: look, variant: id % 997 },
    );
    const actor = wrap(model, (clip, s) => animatePerson(model, clip, s));
    return {
      ...actor,
      blend: (a, as, b, bs, w) => blendPerson(model, a, as, b, bs, w),
      hideTool: () => void (model.bones.get('tool')!.visible = false),
    };
  }
  const standIn = buildStandIn('human', profile, `tree:${id}`, undefined);
  return { ...standIn, blend: (_a, _as, b, bs) => standIn.pose(b, bs), hideTool: () => {} };
}

/**
 * The batch a figure of the tree is drawn in (humankind.md section 8): its key and how to
 * build its model, or undefined without an approved model, when it is a stand-in. Looks
 * repeat every 12 variants (skin, hair and hide colours come from lists of at most four
 * and three), so figures share a dozen models a profile and kind and look as before.
 */
export function treeFigureBatch(
  look: 'founder' | 'woman' | 'man' | 'child',
  id: number,
  profile: Profile = 'african-stone-age',
): TreeBatch | undefined {
  const asset = look === 'founder' ? 'figure-first-person' : `figure-${profile}-${look}`;
  if (!drawable.has(asset)) return undefined;
  if (look === 'founder')
    return {
      key: 'founder',
      build: () =>
        turned(buildPerson({ profile: 'african-stone-age', kind: 'woman', founder: true })),
    };
  const variant = (id % 997) % LOOK_VARIANTS;
  return {
    key: `${profile}:${look}:${variant}`,
    build: () => turned(buildPerson({ profile, kind: look, variant })),
  };
}
const LOOK_VARIANTS = 12;

/** A model drawn as copies in a batch (posedBatches.ts): its key and how to build it. */
export interface TreeBatch {
  key: string;
  build: () => Model;
}

/** Turns a model to face +X like the stage and the stand-ins, as wrap() does. */
function turned(model: Model): Model {
  model.object.rotation.y = Math.PI / 2;
  return model;
}

/** The batch of a lodging or camp prop of the tree by its asset id, or undefined without an approved model. */
export function treePropBatch(kind: string): TreeBatch | undefined {
  if (kind === 'prop-hearth')
    return drawable.has(kind) ? { key: kind, build: () => turned(buildHearth()) } : undefined;
  if (!(SHELTERS as readonly string[]).includes(kind) || !drawable.has(kind)) return undefined;
  return { key: kind, build: () => turned(buildShelter(kind as ShelterId)) };
}

/** The batch of a hunted animal of the tree by its model id, or undefined without an approved model. */
export function treePreyBatch(id: AnimalId): TreeBatch | undefined {
  if (!drawable.has(id)) return undefined;
  return { key: id, build: () => turned(buildAnimal(id)) };
}

/** The batch of thrown spears: the shaft along +Y, its middle at the origin, at life size. */
export const TREE_SPEAR_BATCH: TreeBatch = {
  key: 'spear',
  build: () => {
    const spear = buildSpear();
    // The model's shaft runs up from its grip.
    spear.object.position.set(0, -1.1, 0);
    return spear;
  },
};

/** The batch of arrows: the shaft along +Y, its middle at the origin, at life size. */
export const TREE_ARROW_BATCH: TreeBatch = { key: 'arrow', build: buildArrow };

/** The batch of a bow in the archer's hand: its limbs along +Y, its middle bowed towards +Z, the way the arrow flies. */
export const TREE_BOW_BATCH: TreeBatch = { key: 'bow', build: buildBow };

/** A hunted animal of the tree by its model id, facing +X like the stage, or undefined without an approved model. */
export function buildTreePrey(id: AnimalId): StandIn | undefined {
  if (!drawable.has(id)) return undefined;
  const model = buildAnimal(id);
  return wrap(model, (clip, s) => animateAnimal(model, clip, s));
}
