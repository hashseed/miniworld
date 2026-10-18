// Clips for the models (spec milestone 2, sections 5.3 and 13.3) as pure
// functions of the clip and the seconds since it started, so the same call
// always gives the same pose. The asset build can bake them into animation
// textures; vignettes can also call them directly every frame.

import * as THREE from 'three';
import type { Model } from './kit.ts';

export type Clip =
  'idle' | 'walk' | 'run' | 'carry' | 'work' | 'point' | 'throw' | 'cheer' | 'struggle' | 'fall';

/** Seconds into the throw gesture when the spear leaves the hand. */
export const THROW_RELEASE = 0.55;

const TAU = Math.PI * 2;

function reset(m: Model): void {
  for (const b of m.bones.values()) {
    b.rotation.set(0, 0, 0);
    const rest = b.userData.rest as THREE.Vector3 | undefined;
    if (rest) b.position.copy(rest);
  }
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Poses a person built by buildPerson for a clip at a time in seconds. */
export function animatePerson(m: Model, clip: Clip, seconds: number): void {
  reset(m);
  const bone = (name: string) => m.bones.get(name)!;
  const rot = (name: string, x = 0, y = 0, z = 0) => bone(name).rotation.set(x, y, z);
  const lift = (dy: number) => (bone('hips').position.y += dy);
  const t = seconds;
  bone('tool').visible =
    clip !== 'carry' && clip !== 'work' && !(clip === 'throw' && t >= THROW_RELEASE);
  bone('load').visible = clip === 'carry';

  const legs = (phase: number, swing: number, bend: number) => {
    const s = Math.sin(phase * TAU);
    rot('legUpperL', -swing * s);
    rot('legUpperR', swing * s);
    rot('legLowerL', Math.max(0, bend * s));
    rot('legLowerR', Math.max(0, -bend * s));
    lift(Math.abs(Math.cos(phase * TAU)) * swing * 0.06);
  };

  switch (clip) {
    case 'idle': {
      const b = Math.sin((t / 3.2) * TAU);
      rot('torso', 0.02 * b);
      rot('head', 0.04 * b, 0.25 * Math.sin((t / 7) * TAU));
      rot('armUpperL', 0.04 * b, 0, 0.1);
      rot('armUpperR', -0.06 - 0.04 * b, 0, -0.1);
      rot('armLowerR', -0.3);
      break;
    }
    case 'walk': {
      const p = t / 1.0;
      legs(p, 0.5, 0.6);
      const s = Math.sin(p * TAU);
      rot('armUpperL', 0.45 * s, 0, 0.1);
      rot('armUpperR', -0.3 * s - 0.15, 0, -0.1);
      rot('armLowerL', -0.3);
      rot('armLowerR', -0.4);
      rot('torso', 0.06, 0.08 * s);
      break;
    }
    case 'run': {
      const p = t / 0.6;
      legs(p, 0.85, 1.3);
      const s = Math.sin(p * TAU);
      rot('torso', 0.25, 0.12 * s);
      rot('head', -0.15);
      rot('armUpperL', 0.8 * s, 0, 0.12);
      rot('armUpperR', -0.5 * s - 0.4, 0, -0.12);
      rot('armLowerL', -1.2);
      rot('armLowerR', -1.0);
      break;
    }
    case 'carry': {
      // Walking with a bundle across the shoulders, held by both hands.
      const p = t / 1.15;
      legs(p, 0.4, 0.5);
      rot('torso', 0.12);
      // Upper arms raised and bent back so the hands hold the bundle behind the neck.
      rot('armUpperL', -3.3, 0, 0.45);
      rot('armUpperR', -3.3, 0, -0.45);
      rot('armLowerL', -1.6);
      rot('armLowerR', -1.6);
      break;
    }
    case 'work': {
      // Crouched on one knee, cutting with steady strokes.
      const s = Math.sin((t / 0.9) * TAU);
      lift(-0.38 * (bone('hips').userData.rest as THREE.Vector3).y);
      rot('legUpperL', -1.45);
      rot('legLowerL', 1.5);
      rot('legUpperR', -0.35);
      rot('legLowerR', 2.2);
      rot('torso', 0.5);
      rot('head', -0.25);
      rot('armUpperR', -0.9 - 0.25 * s, 0, -0.1);
      rot('armLowerR', -0.5 + 0.2 * s);
      rot('armUpperL', -0.8, 0, 0.2);
      rot('armLowerL', -0.4);
      break;
    }
    case 'point': {
      const b = Math.sin((t / 1.6) * TAU);
      rot('armUpperL', -1.5 + 0.06 * b, 0, 0.1);
      rot('armLowerL', -0.05);
      rot('armUpperR', -0.1, 0, -0.1);
      rot('armLowerR', -0.4);
      rot('head', 0, 0.15);
      rot('torso', 0, 0.2);
      break;
    }
    case 'throw': {
      // Wind back, snap forward, the spear leaves at THROW_RELEASE, follow
      // through, then stand watching it fly until the gesture ends at 3 s.
      const wind = smooth(t / 0.4);
      const snap = smooth((t - 0.42) / 0.18);
      const settle = smooth((t - 1.0) / 0.7);
      const arm = mix(mix(-0.3, -3.4, wind), -1.0, snap);
      const upper = mix(arm, -0.1, settle);
      const lower = mix(mix(-0.2, -1.2, wind), -0.1, snap);
      rot('armUpperR', upper, 0, -0.2);
      rot('armLowerR', lower);
      // Turn the spear in the hand so it points forward and a little up, ready to fly.
      rot('tool', mix(0, 1.27 - upper - lower, wind));
      rot('armUpperL', mix(mix(-0.2, -1.3, wind), -0.4, snap), 0, 0.25);
      const twist = mix(mix(0, 0.5, wind), -0.35, snap);
      rot('torso', mix(mix(0, -0.15, wind), 0.3, snap) * (1 - settle), twist * (1 - settle));
      const step = mix(wind, 1, snap) * (1 - settle);
      rot('legUpperL', -0.45 * step);
      rot('legUpperR', 0.35 * step);
      rot('legLowerR', 0.3 * step);
      rot('head', -0.1 * settle);
      break;
    }
    case 'cheer': {
      const s = Math.sin((t / 0.7) * TAU);
      rot('armUpperL', -2.8 + 0.25 * s, 0, 0.35);
      rot('armUpperR', -2.8 - 0.25 * s, 0, -0.35);
      rot('armLowerL', -0.3);
      rot('armLowerR', -0.3);
      rot('head', -0.2);
      lift(Math.max(0, s) * 0.12);
      break;
    }
    case 'fall':
      break;
  }
}

/** The lowest vertex of a model in its own space, as posed. */
function lowestPoint(m: Model): number {
  m.object.updateMatrixWorld(true);
  const toModel = m.object.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let lowest = Infinity;
  m.object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    // Ink hulls share their parent's geometry, so only the coloured meshes are read.
    if (!mesh.isMesh || (mesh.parent as THREE.Mesh).isMesh) return;
    matrix.multiplyMatrices(toModel, mesh.matrixWorld);
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++)
      lowest = Math.min(lowest, v.fromBufferAttribute(pos, i).applyMatrix4(matrix).y);
  });
  return lowest;
}

/** Poses an animal built by buildAnimal. Times scale with its size, so a mammoth strides slower than a wolf. */
export function animateAnimal(m: Model, clip: Clip, seconds: number): void {
  reset(m);
  const body = m.bones.get('body')!;
  const rest = body.userData.rest as THREE.Vector3;
  const stride = Math.sqrt(rest.y);
  const rot = (name: string, x = 0, y = 0, z = 0) => m.bones.get(name)?.rotation.set(x, y, z);
  const gait = (period: number, swing: number) => {
    const p = (seconds / period) * TAU;
    // Diagonal pairs move together, as in a walk or trot.
    rot('legFL', swing * Math.sin(p));
    rot('legBR', swing * Math.sin(p));
    rot('legFR', -swing * Math.sin(p));
    rot('legBL', -swing * Math.sin(p));
    rot('head', 0.05 * Math.sin(p * 2));
    rot('tail', 0, 0.25 * Math.sin(p));
    body.position.y = rest.y + Math.abs(Math.cos(p)) * swing * 0.05 * rest.y;
  };
  switch (clip) {
    case 'walk':
      gait(1.1 * stride, 0.3);
      break;
    case 'run':
      gait(0.55 * stride, 0.55);
      rot('head', -0.1);
      break;
    case 'struggle': {
      // Hit and struggling: rears up, tosses its head and stamps, again and again.
      const p = seconds / (1.4 * stride);
      const rear = Math.max(0, Math.sin(p * TAU));
      const stamp = Math.sin(p * TAU * 3) * (1 - rear);
      body.rotation.x = -0.38 * rear;
      body.position.y = rest.y * (1 + 0.18 * rear);
      rot('legFL', -0.9 * rear + 0.25 * stamp);
      rot('legFR', -0.7 * rear - 0.25 * stamp);
      rot('legBL', 0.35 * rear);
      rot('legBR', 0.35 * rear);
      rot('head', -0.45 * rear + 0.15 * Math.sin(p * TAU * 2), 0.3 * Math.sin(p * TAU));
      rot('tail', 0, 0.6 * Math.sin(p * TAU * 4));
      break;
    }
    case 'fall': {
      // Rolls onto its side while sinking over 3 s; nothing more is shown.
      const f = smooth(seconds / 3);
      const angle = f * (Math.PI / 2) * 0.92;
      body.rotation.z = angle;
      for (const name of ['legFL', 'legFR', 'legBL', 'legBR']) rot(name, 0, 0, 0.3 * f);
      // Keep its lowest point on the ground as it rolls, then sink a little.
      body.position.y = rest.y;
      body.position.y += -lowestPoint(m) - f * 0.12 * rest.y;
      break;
    }
    default: {
      const b = Math.sin((seconds / (3 * stride)) * TAU);
      rot('head', 0.06 * b, 0.12 * Math.sin((seconds / (5 * stride)) * TAU));
      rot('tail', 0, 0.2 * Math.sin((seconds / 1.3) * TAU));
      body.position.y = rest.y + 0.005 * rest.y * b;
    }
  }
}
