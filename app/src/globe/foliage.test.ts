import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { plantRotation } from './foliage.ts';

describe('plantRotation', () => {
  it('stands every plant straight up from the globe, at any turn', () => {
    for (const [x, y, z, turn] of [
      [1, 0, 0, 0],
      [0.3, 0.8, -0.5, 1.2],
      [-0.7, -0.2, 0.6, 4],
      [0.1, -0.95, 0.2, 2.5],
    ]) {
      const up = new THREE.Vector3(x, y, z).normalize();
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(plantRotation(up, turn!));
      expect(axis.distanceTo(up)).toBeLessThan(1e-6);
    }
  });

  it('faces the plants west along x and north along z at no turn', () => {
    const q = plantRotation(new THREE.Vector3(1, 0, 0), 0);
    expect(
      new THREE.Vector3(1, 0, 0).applyQuaternion(q).distanceTo(new THREE.Vector3(0, 0, 1)),
    ).toBeLessThan(1e-6);
    expect(
      new THREE.Vector3(0, 0, 1).applyQuaternion(q).distanceTo(new THREE.Vector3(0, 1, 0)),
    ).toBeLessThan(1e-6);
  });
});
