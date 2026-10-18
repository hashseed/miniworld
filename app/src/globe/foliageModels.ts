// The plant models (spec foliage.md, section 5): chunky clay shapes built in
// code from a few balls, cones and strips, Y up, crown about 1 wide, with
// colours per vertex. Each has at most about 400 triangles.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ACACIA,
  BROADLEAF,
  BUSH,
  CONIFER,
  CYPRESS,
  OLIVE,
  PALM,
  RAINFOREST,
} from './foliageKinds.ts';

const TRUNK = '#7a4f2e';

/** A coloured, flat-shaded part, scaled and moved into place. */
function part(
  g: THREE.BufferGeometry,
  colour: string,
  [x, y, z]: [number, number, number] = [0, 0, 0],
  [sx, sy, sz]: [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  const p = g.index ? g.toNonIndexed() : g;
  p.scale(sx, sy, sz);
  p.translate(x, y, z);
  if (p.getAttribute('uv')) p.deleteAttribute('uv');
  const c = new THREE.Color(colour);
  const n = p.getAttribute('position').count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
  p.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  p.computeVertexNormals();
  return p;
}

const ball = (r: number, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
const trunk = (top: number, bottom: number, height: number, sides = 6) =>
  new THREE.CylinderGeometry(top, bottom, height, sides, 1, true);

/** A trunk segment from a to b, as an open cylinder. */
function limb(
  a: THREE.Vector3,
  b: THREE.Vector3,
  rTop: number,
  rBottom: number,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, a.distanceTo(b), 5, 1, true);
  g.translate(0, a.distanceTo(b) / 2, 0);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    ),
  );
  g.translate(a.x, a.y, a.z);
  return g;
}

/**
 * A palm frond: a strip that rises from the crown and arches down to its
 * tip, folded into a shallow V along its rib and tapering to a point.
 */
function frond(length: number, width: number, segments = 5): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    // Up and out first, then over and down: an arc.
    const x = (length * Math.sin(t * 1.35)) / Math.sin(1.35);
    const y = length * (0.45 * Math.sin(t * Math.PI * 0.75) - 0.55 * t * t);
    const w = width * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) * (1 - 0.15 * t);
    const fold = w * 0.45;
    pos.push(x, y - fold, -w, x, y, 0, x, y - fold, w);
  }
  for (let s = 0; s < segments; s++) {
    const a = s * 3;
    const b = a + 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export function plantGeometry(kind: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  switch (kind) {
    case RAINFOREST:
      parts.push(part(trunk(0.07, 0.12, 0.95), TRUNK, [0, 0.47, 0]));
      parts.push(part(ball(0.32), '#23843a', [0, 1.02, 0], [1, 0.72, 1]));
      parts.push(part(ball(0.26), '#2f9a3f', [0.27, 0.92, 0.08], [1, 0.75, 1]));
      parts.push(part(ball(0.25), '#1f7a35', [-0.24, 0.9, -0.12], [1, 0.75, 1]));
      parts.push(part(ball(0.22), '#33a346', [0.02, 0.9, 0.28], [1, 0.75, 1]));
      break;
    case BROADLEAF:
      parts.push(part(trunk(0.07, 0.11, 0.5), TRUNK, [0, 0.25, 0]));
      parts.push(part(ball(0.4), '#5dae3c', [0, 0.82, 0], [1, 0.92, 1]));
      parts.push(part(ball(0.27), '#6cbd45', [0.27, 0.64, 0.1]));
      parts.push(part(ball(0.25), '#52a033', [-0.25, 0.66, -0.1]));
      break;
    case CONIFER: {
      // Four tiers whose skirts flare out a little below each one.
      parts.push(part(trunk(0.05, 0.08, 0.3), TRUNK, [0, 0.15, 0]));
      const tiers = [
        [0.47, 0.42, 0.42, '#2c6e52'],
        [0.38, 0.4, 0.7, '#317656'],
        [0.29, 0.37, 0.96, '#367e5c'],
        [0.19, 0.33, 1.2, '#3c8762'],
      ] as const;
      for (const [r, h, y, c] of tiers)
        parts.push(part(new THREE.ConeGeometry(r, h, 8), c, [0, y, 0]));
      break;
    }
    case ACACIA: {
      // A trunk that forks into three branches under a wide, flat crown.
      const o = new THREE.Vector3(0, 0, 0);
      const fork = new THREE.Vector3(0.03, 0.32, 0);
      parts.push(part(limb(o, fork, 0.045, 0.065), TRUNK));
      for (const end of [
        new THREE.Vector3(0.3, 0.6, 0.05),
        new THREE.Vector3(-0.25, 0.62, 0.12),
        new THREE.Vector3(0.0, 0.64, -0.24),
      ])
        parts.push(part(limb(fork, end, 0.025, 0.04), TRUNK));
      parts.push(part(ball(0.5), '#86a83c', [0.02, 0.68, -0.02], [1.15, 0.22, 1.05]));
      parts.push(part(ball(0.32), '#93b545', [0.2, 0.74, 0.12], [1, 0.26, 1]));
      parts.push(part(ball(0.28, 0), '#7a9c34', [-0.24, 0.72, 0.06], [1, 0.3, 1]));
      break;
    }
    case PALM: {
      // A trunk that leans and curves, a few coconuts, and arching fronds.
      const t = new THREE.CylinderGeometry(0.035, 0.06, 0.9, 5, 4, true);
      const p = t.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) + 0.45;
        p.setX(i, p.getX(i) + 0.16 * y * y);
      }
      parts.push(part(t, '#9a6a3c', [0, 0.45, 0]));
      parts.push(part(ball(0.06, 0), '#6b4a26', [0.15, 0.86, 0.03]));
      const fronds = 7;
      for (let k = 0; k < fronds; k++) {
        const g = part(frond(0.5 + 0.06 * (k % 2), 0.09), k % 2 ? '#4f9e36' : '#5aab3e');
        g.rotateZ(0.1 * (k % 3));
        g.rotateY((k / fronds) * Math.PI * 2 + 0.3);
        g.translate(0.16, 0.92, 0);
        parts.push(g);
      }
      break;
    }
    case OLIVE: {
      // Two gnarled trunks under a flattened grey-green crown.
      const o = new THREE.Vector3(0, 0, 0);
      parts.push(part(limb(o, new THREE.Vector3(0.1, 0.34, 0.03), 0.05, 0.08), '#6e5a44'));
      parts.push(part(limb(o, new THREE.Vector3(-0.09, 0.3, -0.04), 0.045, 0.07), '#6e5a44'));
      parts.push(part(ball(0.42), '#93a861', [0, 0.5, 0], [1, 0.6, 1]));
      parts.push(part(ball(0.24), '#a1b56d', [0.22, 0.58, 0.08], [1, 0.7, 1]));
      break;
    }
    case CYPRESS:
      parts.push(part(trunk(0.04, 0.05, 0.16, 5), TRUNK, [0, 0.08, 0]));
      parts.push(part(ball(0.5), '#2f6338', [0, 0.72, 0], [0.3, 1.25, 0.3]));
      parts.push(part(ball(0.12, 0), '#356c3e', [0, 1.36, 0], [0.9, 1.6, 0.9]));
      break;
    case BUSH:
    default:
      parts.push(part(ball(0.3), '#6f9a3c', [0, 0.16, 0], [1, 0.75, 1]));
      parts.push(part(ball(0.22), '#7eaa45', [0.22, 0.12, 0.1], [1, 0.75, 1]));
      parts.push(part(ball(0.2, 0), '#628d33', [-0.2, 0.1, -0.08], [1, 0.75, 1]));
  }
  return mergeGeometries(parts)!;
}
