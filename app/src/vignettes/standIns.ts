// Stand-in figures and animals for vignettes (spec milestone 2, section 18.1):
// flat-coloured, cel-shaded shapes at life size in metres, posed on the main
// thread from the player's clip and clip time. They are not assets; approved
// models replace them without any change to the data.

import * as THREE from 'three';
import { hash01, hashString } from '../core/hash.ts';
import type { Clip } from '../world/vignette.ts';

const TWO_PI = Math.PI * 2;

let gradient: THREE.DataTexture | undefined;
/** Three flat bands of light, as in the toy-planet style (spec section 8). */
function toonGradient(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const materials = new Map<number, THREE.MeshToonMaterial>();
function toon(colour: number): THREE.MeshToonMaterial {
  let m = materials.get(colour);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: colour, gradientMap: toonGradient() });
    materials.set(colour, m);
  }
  return m;
}
const INK = new THREE.MeshBasicMaterial({ color: 0x2a1a12, side: THREE.BackSide });

/** A part with a dark ink outline (an enlarged back-face copy). */
function part(geometry: THREE.BufferGeometry, colour: number, ink = 0.04): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, toon(colour));
  geometry.computeBoundingSphere();
  const r = geometry.boundingSphere!.radius;
  const outline = new THREE.Mesh(geometry, INK);
  outline.scale.setScalar(1 + ink / Math.max(r, 0.05));
  outline.position.copy(geometry.boundingSphere!.center).multiplyScalar(-(outline.scale.x - 1));
  mesh.add(outline);
  return mesh;
}

function capsule(radius: number, length: number): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(radius, length, 3, 8);
}

export interface StandIn {
  root: THREE.Group;
  /** Height in metres, for sinking when it falls. */
  height: number;
  pose(clip: Clip, seconds: number): void;
  /** Fades the model in or out, 0 to 1; without it, the actor is shown or hidden. */
  setFade?(fade: number): void;
  /** Puts a shelter up step by step, 0 to 1; without it, the shelter is shown whole. */
  setBuilt?(built: number): void;
  /** Where spears stick: the body bone and its extent in the bone's own space. */
  back?: { bone: THREE.Object3D; box: THREE.Box3 };
}

const FURS = [0x8a5a3a, 0x9b6b3f, 0x6e4a2f, 0xa37a4c, 0x7d5536];
const SKINS = [0xc58c64, 0xa86f4c, 0x8d5a3b, 0xd2a07a];
const HAIR = [0x2b1d14, 0x3d2a1c, 0x4a3322];

/** A person of an ice-age hunting band; looks vary by a hash of its key. */
export function buildHuman(key: string, role: string | undefined): StandIn {
  const h = hashString(key);
  const fur = FURS[Math.floor(hash01(h, 1) * FURS.length)]!;
  const skin = SKINS[Math.floor(hash01(h, 2) * SKINS.length)]!;
  const hair = HAIR[Math.floor(hash01(h, 3) * HAIR.length)]!;
  const size = role === 'hunter' ? 1 : 0.8 + hash01(h, 4) * 0.2;

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.95;
  root.add(body);
  const torso = part(capsule(0.2, 0.42), fur);
  torso.position.y = 0.32;
  torso.scale.set(1, 1, 0.8);
  body.add(torso);
  const head = new THREE.Group();
  head.position.y = 0.78;
  body.add(head);
  head.add(part(new THREE.SphereGeometry(0.15, 12, 8), skin));
  const cap = part(new THREE.SphereGeometry(0.16, 12, 6, 0, TWO_PI, 0, Math.PI / 2), hair, 0.02);
  cap.position.y = 0.02;
  head.add(cap);

  const limb = (x: number, y: number, z: number, r: number, len: number, colour: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = part(capsule(r, len), colour);
    m.position.y = -len / 2 - r;
    pivot.add(m);
    body.add(pivot);
    return pivot;
  };
  const armL = limb(0, 0.58, 0.27, 0.065, 0.42, fur);
  const armR = limb(0, 0.58, -0.27, 0.065, 0.42, fur);
  const legL = limb(0, 0.02, 0.1, 0.085, 0.62, fur);
  const legR = limb(0, 0.02, -0.1, 0.085, 0.62, fur);

  // Hunters carry a spear in the right hand, pointing forward (+x).
  let spear: THREE.Object3D | undefined;
  if (role === 'hunter') {
    spear = new THREE.Group();
    const shaft = part(new THREE.CylinderGeometry(0.022, 0.022, 2.2, 6), 0xb98a52, 0.015);
    shaft.rotation.z = -Math.PI / 2;
    const tip = part(new THREE.ConeGeometry(0.045, 0.22, 6), 0x5c5650, 0.015);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 1.2;
    spear.add(shaft, tip);
    spear.position.set(0.25, -0.58, 0);
    armR.add(spear);
  }
  // A bundle of meat and hide, shown while carrying.
  const bundle = part(new THREE.SphereGeometry(0.28, 10, 8), 0x8c3b2e);
  bundle.scale.set(1.3, 0.8, 1);
  bundle.position.set(0, 1.0, 0);
  bundle.visible = false;
  body.add(bundle);

  root.scale.setScalar(size);

  const pose = (clip: Clip, s: number) => {
    let legSwing = 0;
    let armSwingL: number;
    let armSwingR: number;
    let lean = 0;
    let drop = 0;
    let bob = 0;
    bundle.visible = clip === 'carry';
    if (spear) spear.visible = !(clip === 'throw' && s > 0.55) && clip !== 'carry';
    const w = (hz: number) => Math.sin(s * TWO_PI * hz);
    switch (clip) {
      case 'walk':
        legSwing = 0.5 * w(1.6);
        armSwingL = -0.4 * w(1.6);
        armSwingR = 0.4 * w(1.6);
        bob = 0.03 * Math.abs(w(1.6));
        break;
      case 'run':
        legSwing = 0.9 * w(2.8);
        armSwingL = -0.9 * w(2.8);
        armSwingR = 0.9 * w(2.8);
        lean = -0.3;
        bob = 0.08 * Math.abs(w(2.8));
        break;
      case 'carry':
        legSwing = 0.4 * w(1.3);
        armSwingL = Math.PI - 0.3;
        armSwingR = Math.PI - 0.3;
        bob = 0.02 * Math.abs(w(1.3));
        break;
      case 'work':
        drop = 0.3;
        lean = -0.7;
        armSwingL = 1.2 + 0.5 * w(1.2);
        armSwingR = 1.2 + 0.5 * w(1.2);
        break;
      case 'point':
        armSwingR = 1.5;
        armSwingL = 0.1 * w(0.3);
        break;
      case 'throw':
        armSwingR = s < 0.4 ? -2.4 * (s / 0.4) : s < 0.6 ? -2.4 + 4.0 * ((s - 0.4) / 0.2) : 1.6;
        armSwingL = 0.8;
        lean = s < 0.4 ? 0.15 : -0.25;
        break;
      case 'cheer':
        armSwingL = Math.PI - 0.4 + 0.3 * w(2);
        armSwingR = Math.PI - 0.4 - 0.3 * w(2);
        bob = 0.05 * Math.abs(w(2));
        break;
      default:
        armSwingL = 0.05 * w(0.4);
        armSwingR = -0.05 * w(0.4);
        bob = 0.01 * w(0.4);
    }
    // Limbs swing about z: positive moves a hanging limb forward (+x).
    legL.rotation.z = legSwing;
    legR.rotation.z = -legSwing;
    armL.rotation.z = armSwingL;
    armR.rotation.z = armSwingR;
    body.rotation.z = lean;
    body.position.y = 0.95 - drop + bob;
    if (clip === 'work') {
      legL.rotation.z = 1.0;
      legR.rotation.z = 1.0;
    }
  };
  pose('idle', 0);
  return { root, height: 1.75 * size, pose };
}

/** A woolly mammoth, about 3.2 m at the shoulder. */
export function buildMammoth(): StandIn {
  const fur = 0x6b3a24;
  const dark = 0x4e2918;
  const root = new THREE.Group();
  const tilt = new THREE.Group(); // rolls over when it falls
  root.add(tilt);
  const body = new THREE.Group();
  body.position.y = 2.3;
  tilt.add(body);
  const trunkBody = part(new THREE.SphereGeometry(1, 16, 12), fur, 0.06);
  trunkBody.scale.set(2.2, 1.45, 1.4);
  body.add(trunkBody);
  const hump = part(new THREE.SphereGeometry(0.8, 12, 10), fur, 0.06);
  hump.position.set(0.9, 0.9, 0);
  body.add(hump);

  const head = new THREE.Group();
  head.position.set(2.0, 0.6, 0);
  body.add(head);
  const skull = part(new THREE.SphereGeometry(0.85, 14, 10), fur, 0.06);
  skull.scale.set(1, 1.15, 0.95);
  head.add(skull);
  const dome = part(new THREE.SphereGeometry(0.5, 12, 8), dark, 0.05);
  dome.position.set(0.05, 0.85, 0);
  head.add(dome);
  for (const side of [1, -1]) {
    const ear = part(new THREE.SphereGeometry(0.28, 8, 6), dark, 0.03);
    ear.scale.set(0.5, 1, 1);
    ear.position.set(-0.3, 0.2, side * 0.75);
    head.add(ear);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.6, -0.5, side * 0.35),
      new THREE.Vector3(1.3, -1.2, side * 0.6),
      new THREE.Vector3(2.0, -0.9, side * 0.75),
      new THREE.Vector3(2.1, -0.2, side * 0.5),
    ]);
    head.add(part(new THREE.TubeGeometry(curve, 16, 0.11, 6), 0xf1e4c8, 0.03));
  }
  // Trunk: three segments that sway.
  const trunk: THREE.Group[] = [];
  let parent: THREE.Object3D = head;
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Group();
    seg.position.set(i === 0 ? 0.7 : 0, i === 0 ? -0.2 : -0.6, 0);
    const m = part(capsule(0.22 - i * 0.04, 0.45), fur, 0.03);
    m.position.y = -0.3;
    seg.add(m);
    parent.add(seg);
    trunk.push(seg);
    parent = seg;
  }
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [1.2, 0.6],
    [1.2, -0.6],
    [-1.2, 0.6],
    [-1.2, -0.6],
  ] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.5, z);
    const m = part(new THREE.CylinderGeometry(0.4, 0.36, 1.85, 10), fur, 0.05);
    m.position.y = -0.9;
    pivot.add(m);
    body.add(pivot);
    legs.push(pivot);
  }
  const tail = part(capsule(0.08, 0.5), dark, 0.02);
  tail.position.set(-2.2, 0.2, 0);
  tail.rotation.z = -0.6;
  body.add(tail);

  const pose = (clip: Clip, s: number) => {
    const w = (hz: number) => Math.sin(s * TWO_PI * hz);
    let swing = 0;
    let bob = 0;
    let roll = 0;
    if (clip === 'walk') {
      swing = 0.3 * w(0.8);
      bob = 0.05 * Math.abs(w(0.8));
    } else if (clip === 'run') {
      swing = 0.55 * w(1.4);
      bob = 0.15 * Math.abs(w(1.4));
    } else if (clip === 'fall') {
      roll = Math.min(1, s / 1.5) * 1.35;
    }
    legs[0]!.rotation.z = swing;
    legs[3]!.rotation.z = swing;
    legs[1]!.rotation.z = -swing;
    legs[2]!.rotation.z = -swing;
    body.position.y = 2.3 + bob;
    tilt.rotation.x = roll;
    tilt.position.y = roll * 0.5;
    const sway = clip === 'run' ? 0.5 : 0.25;
    trunk[0]!.rotation.z = sway * w(0.35) - 0.1;
    trunk[1]!.rotation.z = sway * w(0.35 + 0.1) + 0.15;
    trunk[2]!.rotation.z = sway * w(0.35 + 0.2) + 0.25;
    head.rotation.z = clip === 'run' ? -0.15 : 0.05 * w(0.2);
  };
  pose('idle', 0);
  return { root, height: 4, pose };
}

/** Builds the stand-in for a cast member's look. */
/** A prop stand-in: a flat-coloured block on runners, the size of a loaded sledge. */
function buildPropStandIn(): StandIn {
  const root = new THREE.Group();
  const block = part(new THREE.BoxGeometry(1.4, 1, 1.6), 0xd6bc8a);
  block.position.set(0, 0.85, 0);
  const runners = part(new THREE.BoxGeometry(2.6, 0.3, 1.3), 0x7a5030);
  runners.position.set(0, 0.15, 0);
  root.add(block, runners);
  return { root, height: 1.35, pose: () => {} };
}

export function buildStandIn(
  kind: 'human' | 'animal' | 'prop',
  look: string,
  key: string,
  role?: string,
): StandIn {
  if (kind === 'prop') return buildPropStandIn();
  if (kind === 'animal' && look === 'woolly-mammoth') return buildMammoth();
  return buildHuman(key, role);
}
