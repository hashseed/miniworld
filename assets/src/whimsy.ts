// Storybook proportions for the Neolithic houses (Yang, 2026-10-23: "not to scale, smaller, a bit
// whimsical, smaller base and larger roof"): the walls are drawn in, the roof flares out over them,
// and the house shrinks to a footprint that fits the places villages stand.

import * as THREE from 'three';
import type { Model } from './kit.ts';

export interface Whimsy {
  /** Longest side of the finished footprint in metres. */
  footprint: number;
  /** Where the walls end and the roof begins, as a share of the house height. */
  eave: number;
  /** Horizontal scale of the base and of the roof, before the final shrink. */
  base: number;
  roof: number;
  /** Height relative to width after the shrink (1 keeps the real proportions). */
  tall: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function whimsy(model: Model, w: Whimsy): Model {
  model.object.updateMatrixWorld(true);
  // Geometry is stored relative to its bone's pivot, so work in model space.
  const meshes: { g: THREE.BufferGeometry; node: THREE.Object3D; pivot: THREE.Vector3 }[] = [];
  const seen = new Set<THREE.BufferGeometry>();
  const box = new THREE.Box3();
  model.object.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || seen.has(m.geometry)) return;
    seen.add(m.geometry);
    const pivot = new THREE.Vector3().setFromMatrixPosition(m.parent!.matrixWorld);
    meshes.push({ g: m.geometry, node: m.parent!, pivot });
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++)
      box.expandByPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).add(pivot));
  });
  const height = box.max.y - box.min.y;
  const lo = box.min.y + height * w.eave * 0.6;
  const hi = box.min.y + height * Math.min(1, w.eave * 1.25);
  const scaleAt = (y: number) => w.base + (w.roof - w.base) * smooth(lo, hi, y);
  const warp = (v: THREE.Vector3) => {
    const s = scaleAt(v.y);
    return v.set(v.x * s, v.y, v.z * s);
  };
  let reach = 0;
  const tmp = new THREE.Vector3();
  for (const { g, pivot } of meshes) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      warp(tmp.set(p.getX(i), p.getY(i), p.getZ(i)).add(pivot));
      reach = Math.max(reach, Math.abs(tmp.x), Math.abs(tmp.z));
    }
  }
  const k = w.footprint / 2 / reach;
  const finish = (v: THREE.Vector3) => v.set(v.x * k, v.y * k * w.tall, v.z * k);
  const world = new Map<THREE.Object3D, THREE.Vector3>();
  model.object.traverse((o) => {
    world.set(o, new THREE.Vector3().setFromMatrixPosition(o.matrixWorld));
  });
  for (const { g, pivot } of meshes) {
    const np = finish(warp(pivot.clone()));
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      finish(warp(tmp.set(p.getX(i), p.getY(i), p.getZ(i)).add(pivot))).sub(np);
      p.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    p.needsUpdate = true;
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }
  const moved = new Map<THREE.Object3D, THREE.Vector3>();
  for (const [o, v] of world) moved.set(o, finish(warp(v.clone())));
  for (const [o, v] of moved) {
    if (o === model.object) continue;
    const parent = o.parent ? moved.get(o.parent) : undefined;
    o.position.copy(parent ? v.clone().sub(parent) : v);
    if (o.userData.rest) o.userData.rest = o.position.clone();
  }
  return model;
}

/** One look per house: small, with a roof bigger than the base. */
export const WHIMSY: Record<string, Whimsy> = {
  'shelter-pre-pottery-levant-house': {
    footprint: 2.2,
    eave: 0.8,
    base: 0.85,
    roof: 1.2,
    tall: 1.2,
  },
  'shelter-anatolian-house': { footprint: 2.2, eave: 0.85, base: 0.85, roof: 1.2, tall: 1.2 },
  'shelter-anatolian-house-joined': {
    footprint: 3.0,
    eave: 0.85,
    base: 0.85,
    roof: 1.2,
    tall: 1.2,
  },
  'shelter-lbk-longhouse': { footprint: 4.2, eave: 0.55, base: 0.75, roof: 1.2, tall: 1.4 },
  'shelter-mehrgarh-house': { footprint: 2.2, eave: 0.8, base: 0.85, roof: 1.2, tall: 1.2 },
  'shelter-egyptian-neolithic-hut': { footprint: 2.2, eave: 0.5, base: 0.8, roof: 1.2, tall: 1.5 },
  'shelter-yangtze-stilt-house': { footprint: 3.0, eave: 0.55, base: 0.75, roof: 1.25, tall: 1.1 },
  'shelter-yellow-river-pit-house': { footprint: 2.4, eave: 0.4, base: 0.8, roof: 1.2, tall: 1.2 },
  'shelter-mesoamerican-hut': { footprint: 2.2, eave: 0.55, base: 0.8, roof: 1.2, tall: 1.2 },
  'shelter-andean-stone-house': { footprint: 2.2, eave: 0.55, base: 0.8, roof: 1.2, tall: 1.2 },
  'shelter-highland-new-guinea-house': {
    footprint: 2.4,
    eave: 0.45,
    base: 0.7,
    roof: 1.25,
    tall: 1.0,
  },
};
