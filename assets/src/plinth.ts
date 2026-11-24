// Foundation plinth skirts for shelters and Neolithic houses (spec milestone-2.md
// section 13.3): extending 1.5 m below y = 0 (or extending stilt piles to -1.5 m)
// so upright buildings on slopes never hover over terrain.

import * as THREE from 'three';
import { ModelBuilder, type Model, type Vec3, rod } from './kit.ts';

/** How far below y = 0 every shelter or house plinth reaches in model metres. */
export const PLINTH_DEPTH_M = 1.5;

export type PlinthSpec =
  | {
      kind: 'round';
      rx: number;
      rz: number;
      colour: string;
      at?: [number, number];
      segments?: number;
      top?: number;
    }
  | {
      kind: 'rect';
      w: number;
      d: number;
      colour: string;
      chamfer?: number;
      at?: [number, number];
      top?: number;
    }
  | {
      kind: 'multi-rect';
      boxes: { w: number; d: number; chamfer?: number; at?: [number, number] }[];
      colour: string;
      top?: number;
    }
  | {
      kind: 'piles';
      posts: readonly [number, number][];
      r: number;
      colour: string;
      top?: number;
    };

/** Whether a mesh belongs to a foundation plinth skirt rather than the above-ground building. */
export function isPlinthMesh(o: THREE.Object3D): boolean {
  return o.name === 'plinth' || o.userData.plinth === true;
}

/**
 * Axis-aligned bounding box of a model's visible above-ground geometry in model
 * space, ignoring underground plinth skirts and ink-outline child hulls.
 */
export function aboveGroundBounds(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  object.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh.parent as THREE.Mesh).isMesh || isPlinthMesh(mesh)) return;
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      box.expandByPoint(v);
    }
  });
  return box.isEmpty() ? new THREE.Box3().setFromObject(object) : box;
}

/** Assigns smooth radial normals around `mid` so ink outlines stay closed at every edge. */
function radialNormals(g: THREE.BufferGeometry, mid: Vec3): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const normal = g.getAttribute('normal');
  const v = new THREE.Vector3();
  const c = new THREE.Vector3(...mid);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(c);
    if (v.lengthSq() > 1e-12) v.normalize();
    else v.set(0, 1, 0);
    normal.setXYZ(i, v.x, v.y, v.z);
  }
  normal.needsUpdate = true;
  return g;
}

/**
 * Builds an 8-sided chamfered frustum (28 triangles when closed) from `y0` to `y1`,
 * staying strictly inside rounded-corner walls and never protruding past eaves.
 */
function chamferedPlinth(
  w: number,
  d: number,
  chamfer: number,
  y0: number,
  y1: number,
  at: [number, number] = [0, 0],
): THREE.BufferGeometry {
  const hx = w / 2;
  const hz = d / 2;
  const c = Math.min(chamfer, hx * 0.45, hz * 0.45);
  const baseRing: [number, number][] = [
    [hx - c, -hz],
    [hx, -hz + c],
    [hx, hz - c],
    [hx - c, hz],
    [-hx + c, hz],
    [-hx, hz - c],
    [-hx, -hz + c],
    [-hx + c, -hz],
  ];
  const n = baseRing.length;
  const flare = 1.02;
  const pos: number[] = [];
  const pushTri = (a: Vec3, b: Vec3, p: Vec3) => {
    pos.push(...a, ...b, ...p);
  };
  for (let i = 0; i < n; i++) {
    const [x0, z0] = baseRing[i]!;
    const [x1, z1] = baseRing[(i + 1) % n]!;
    const t0: Vec3 = [at[0] + x0, y1, at[1] + z0];
    const t1: Vec3 = [at[0] + x1, y1, at[1] + z1];
    const b0: Vec3 = [at[0] + x0 * flare, y0, at[1] + z0 * flare];
    const b1: Vec3 = [at[0] + x1 * flare, y0, at[1] + z1 * flare];
    pushTri(t0, t1, b0);
    pushTri(t1, b1, b0);
  }
  // Fan-cap top and bottom from ring[0] (2 * (n - 2) = 12 triangles).
  const tRoot: Vec3 = [at[0] + baseRing[0]![0], y1, at[1] + baseRing[0]![1]];
  const bRoot: Vec3 = [at[0] + baseRing[0]![0] * flare, y0, at[1] + baseRing[0]![1] * flare];
  for (let i = 1; i + 1 < n; i++) {
    const [xa, za] = baseRing[i]!;
    const [xb, zb] = baseRing[i + 1]!;
    pushTri(tRoot, [at[0] + xb, y1, at[1] + zb], [at[0] + xa, y1, at[1] + za]);
    pushTri(
      bRoot,
      [at[0] + xa * flare, y0, at[1] + za * flare],
      [at[0] + xb * flare, y0, at[1] + zb * flare],
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return radialNormals(g, [at[0], (y0 + y1) / 2, at[1]]);
}

/** Closed round frustum plinth down to `y0`, scaled independently in X and Z. */
function roundPlinth(
  rx: number,
  rz: number,
  y0: number,
  y1: number,
  segments = 8,
  at: [number, number] = [0, 0],
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1.02, y1 - y0, segments, 1, false);
  g.scale(rx, 1, rz);
  g.translate(at[0], (y0 + y1) / 2, at[1]);
  return radialNormals(g, [at[0], (y0 + y1) / 2, at[1]]);
}

/**
 * Adds a 1.5 m foundation plinth (or downward pile extensions) to a shelter or house
 * model, attached to `build-0` (when stepped) or `root` so stepped builds show it on step 0.
 */
export function addPlinth(model: Model, spec: PlinthSpec): Model {
  const mb = new ModelBuilder([], 0);
  const top = spec.top ?? 0.06;
  const bot = -PLINTH_DEPTH_M;
  if (spec.kind === 'round') {
    mb.add(
      roundPlinth(spec.rx, spec.rz, bot, top, spec.segments ?? 8, spec.at ?? [0, 0]),
      spec.colour,
    );
  } else if (spec.kind === 'rect') {
    const chamfer = spec.chamfer ?? Math.min(spec.w, spec.d) * 0.14;
    mb.add(chamferedPlinth(spec.w, spec.d, chamfer, bot, top, spec.at ?? [0, 0]), spec.colour);
  } else if (spec.kind === 'multi-rect') {
    for (const b of spec.boxes) {
      const chamfer = b.chamfer ?? Math.min(b.w, b.d) * 0.1;
      mb.add(chamferedPlinth(b.w, b.d, chamfer, bot, top, b.at ?? [0, 0]), spec.colour);
    }
  } else {
    for (const [x, z] of spec.posts) {
      mb.add(rod([x, bot, z], [x, spec.top ?? 0.08, z], spec.r, 4), spec.colour);
    }
  }
  const built = mb.build('plinth');
  const mesh = built.object.getObjectByProperty('isMesh', true) as THREE.Mesh;
  const parent = model.bones.get('build-0') ?? model.object;
  if (parent !== model.object) {
    model.object.updateMatrixWorld(true);
    const offset = new THREE.Vector3().setFromMatrixPosition(parent.matrixWorld);
    mesh.geometry.translate(-offset.x, -offset.y, -offset.z);
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
  mesh.name = 'plinth';
  mesh.userData.plinth = true;
  for (const child of mesh.children) {
    child.name = 'plinth';
    child.userData.plinth = true;
  }
  parent.add(mesh);
  return { ...model, triangles: model.triangles + built.triangles };
}
