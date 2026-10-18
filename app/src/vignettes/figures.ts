// Approved clay models for vignette casts (spec milestone 2, sections 13.3 and
// 18.1). A cast member gets the model of its culture profile or animal when
// that model is approved in the asset manifest, and a stand-in otherwise.

import * as THREE from 'three';
import manifest from '../../../data/assets/manifest.json';
import { ANIMALS, buildAnimal, type AnimalId } from '../../../assets/src/animals.ts';
import { animateAnimal, animatePerson } from '../../../assets/src/clips.ts';
import { lightUniforms, type Model } from '../../../assets/src/kit.ts';
import { buildProp, PROPS, type PropId } from '../../../assets/src/landmarks.ts';
import {
  buildPerson,
  PROFILES,
  type Kind,
  type Profile,
  type Tool,
} from '../../../assets/src/people.ts';
import { hashString } from '../core/hash.ts';
import type { Clip } from '../world/vignette.ts';
import { buildStandIn, type StandIn } from './standIns.ts';

const approved = new Set(
  (manifest as { assets: { id: string; status: string }[] }).assets
    .filter((a) => a.status === 'approved')
    .map((a) => a.id),
);

/** The family at a camp: a woman, a child and a man, then repeating. */
const FAMILY: Kind[] = ['woman', 'child', 'man'];
/** Roles always played by a man of the profile (the building crews of giza.md section 11). */
const MEN = new Set(['hunter', 'worker', 'overseer', 'scribe']);
/** Tools held by roles instead of the profile's own. */
const ROLE_TOOLS: Record<string, Tool> = { hunter: 'spear', overseer: 'staff', scribe: 'palette' };

/** Content animal ids that differ from the model ids. */
const ANIMAL_MODELS: Record<string, AnimalId> = { 'woolly-mammoth': 'animal-mammoth' };

function animalModel(look: string): AnimalId | undefined {
  const id = ANIMAL_MODELS[look] ?? `animal-${look}`;
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
  return { root, height: box.max.y - box.min.y, pose };
}

/** Builds the drawn actor for a cast member. */
export function buildActor(
  kind: 'human' | 'animal' | 'prop',
  look: string,
  key: string,
  index: number,
  role?: string,
): StandIn {
  if (kind === 'prop') {
    if ((PROPS as readonly string[]).includes(look) && approved.has(look)) {
      const model = buildProp(look as PropId);
      return wrap(model, () => {});
    }
  } else if (kind === 'animal') {
    const id = animalModel(look);
    if (id && approved.has(id)) {
      const model = buildAnimal(id);
      return wrap(model, (clip, s) => animateAnimal(model, clip, s));
    }
  } else if ((PROFILES as readonly string[]).includes(look)) {
    const profile = look as Profile;
    const person: Kind = role && MEN.has(role) ? 'man' : FAMILY[index % FAMILY.length]!;
    if (approved.has(`figure-${profile}-${person}`)) {
      const model = buildPerson({
        profile,
        kind: person,
        variant: hashString(key) % 997,
        // Hunters carry the spear they throw; overseers a staff, scribes a palette.
        tool: role ? ROLE_TOOLS[role] : undefined,
      });
      return wrap(model, (clip, s) => animatePerson(model, clip, s));
    }
  }
  return buildStandIn(kind, look, key, role);
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
