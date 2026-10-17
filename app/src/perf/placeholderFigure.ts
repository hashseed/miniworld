// The stress scene's placeholder humanoid (spec milestone 1, section 11.4):
// plain shapes on one shared skeleton, with three animations baked into a
// texture and played on the GPU, the technique real figures will use. Not an
// asset; it never appears outside the stress scene.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const FRAMES_PER_ANIM = 24;
export const ANIMATIONS = ['walk', 'work', 'idle'] as const;

interface Part {
  geometry: THREE.BufferGeometry;
  pivot: THREE.Vector3;
  bone: number;
}

// Bones: 0 body, 1 head, 2 left arm, 3 right arm, 4 left leg, 5 right leg.
function parts(): Part[] {
  const limb = (r: number, h: number) => new THREE.CylinderGeometry(r, r * 0.85, h, 8, 1, true);
  const at = (g: THREE.BufferGeometry, x: number, y: number, z = 0) => g.translate(x, y, z);
  return [
    {
      geometry: at(new THREE.CylinderGeometry(0.22, 0.18, 0.6, 10, 2), 0, 1.15),
      pivot: new THREE.Vector3(0, 0.85, 0),
      bone: 0,
    },
    {
      geometry: at(new THREE.CylinderGeometry(0.18, 0.2, 0.2, 10, 1), 0, 0.8),
      pivot: new THREE.Vector3(0, 0.85, 0),
      bone: 0,
    },
    {
      geometry: at(new THREE.IcosahedronGeometry(0.17, 2), 0, 1.65),
      pivot: new THREE.Vector3(0, 1.45, 0),
      bone: 1,
    },
    {
      geometry: at(limb(0.065, 0.62), -0.3, 1.12),
      pivot: new THREE.Vector3(-0.3, 1.42, 0),
      bone: 2,
    },
    { geometry: at(limb(0.065, 0.62), 0.3, 1.12), pivot: new THREE.Vector3(0.3, 1.42, 0), bone: 3 },
    {
      geometry: at(new THREE.IcosahedronGeometry(0.08, 0), -0.3, 0.78),
      pivot: new THREE.Vector3(-0.3, 1.42, 0),
      bone: 2,
    },
    {
      geometry: at(new THREE.IcosahedronGeometry(0.08, 0), 0.3, 0.78),
      pivot: new THREE.Vector3(0.3, 1.42, 0),
      bone: 3,
    },
    { geometry: at(limb(0.09, 0.8), -0.11, 0.4), pivot: new THREE.Vector3(-0.11, 0.8, 0), bone: 4 },
    { geometry: at(limb(0.09, 0.8), 0.11, 0.4), pivot: new THREE.Vector3(0.11, 0.8, 0), bone: 5 },
    {
      geometry: at(new THREE.BoxGeometry(0.14, 0.08, 0.26), -0.11, 0.04, 0.05),
      pivot: new THREE.Vector3(-0.11, 0.8, 0),
      bone: 4,
    },
    {
      geometry: at(new THREE.BoxGeometry(0.14, 0.08, 0.26), 0.11, 0.04, 0.05),
      pivot: new THREE.Vector3(0.11, 0.8, 0),
      bone: 5,
    },
  ];
}

/** Rotation (x axis, radians) of each bone in a frame of an animation. */
function pose(anim: number, phase: number): number[] {
  const s = Math.sin(phase * Math.PI * 2);
  const c = Math.cos(phase * Math.PI * 2);
  if (anim === 0) return [0.05, 0.05 * c, -0.6 * s, 0.6 * s, 0.55 * s, -0.55 * s]; // walk
  if (anim === 1) return [0.35 + 0.15 * s, 0.2, -1.4 - 0.6 * s, -1.4 - 0.6 * s, 0.1, 0.1]; // work: hoeing
  return [0.02 * s, 0.1 * c, 0.05 * s, -0.05 * s, 0, 0]; // idle
}

export interface PlaceholderFigure {
  geometry: THREE.BufferGeometry;
  animation: THREE.DataTexture;
  triangles: number;
  vertices: number;
}

export function buildPlaceholderFigure(): PlaceholderFigure {
  const ps = parts();
  const tagged = ps.map((p) => {
    const g = p.geometry.toNonIndexed();
    g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    g.setAttribute('bone', new THREE.BufferAttribute(new Float32Array(n).fill(p.bone), 1));
    return g;
  });
  const geometry = mergeGeometries(tagged)!;
  const count = geometry.getAttribute('position').count;
  const ids = new Float32Array(count);
  for (let i = 0; i < count; i++) ids[i] = i;
  geometry.setAttribute('vid', new THREE.BufferAttribute(ids, 1));

  // Bake every frame's vertex positions (and normals' y in w for shading).
  const pivots: THREE.Vector3[] = [];
  for (const p of ps) pivots[p.bone] = p.pivot;
  const pos = geometry.getAttribute('position');
  const bones = geometry.getAttribute('bone');
  const height = ANIMATIONS.length * FRAMES_PER_ANIM;
  const data = new Float32Array(count * height * 4);
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const body = new THREE.Matrix4();
  for (let a = 0; a < ANIMATIONS.length; a++)
    for (let f = 0; f < FRAMES_PER_ANIM; f++) {
      const angles = pose(a, f / FRAMES_PER_ANIM);
      const row = a * FRAMES_PER_ANIM + f;
      const bob = a === 0 ? Math.abs(Math.sin((f / FRAMES_PER_ANIM) * Math.PI * 2)) * 0.05 : 0;
      body
        .makeTranslation(pivots[0]!.x, pivots[0]!.y + bob, pivots[0]!.z)
        .multiply(new THREE.Matrix4().makeRotationX(angles[0]!))
        .multiply(new THREE.Matrix4().makeTranslation(-pivots[0]!.x, -pivots[0]!.y, -pivots[0]!.z));
      for (let i = 0; i < count; i++) {
        const b = bones.getX(i);
        const pv = pivots[b]!;
        v.fromBufferAttribute(pos, i);
        m.makeTranslation(pv.x, pv.y, pv.z)
          .multiply(new THREE.Matrix4().makeRotationX(angles[b]!))
          .multiply(new THREE.Matrix4().makeTranslation(-pv.x, -pv.y, -pv.z));
        v.applyMatrix4(m);
        if (b !== 4 && b !== 5) v.applyMatrix4(body);
        const o = (row * count + i) * 4;
        data[o] = v.x;
        data[o + 1] = v.y;
        data[o + 2] = v.z;
        data[o + 3] = 1;
      }
    }
  const animation = new THREE.DataTexture(data, count, height, THREE.RGBAFormat, THREE.FloatType);
  animation.needsUpdate = true;
  return { geometry, animation, triangles: count / 3, vertices: count };
}
