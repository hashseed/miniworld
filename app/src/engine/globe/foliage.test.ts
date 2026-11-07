import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { plantRotation, treeLine } from './foliage.ts';
import { CAP_CLEARANCE_M } from './foliagePlace.ts';
import { snowCap } from './snowCap.ts';

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

describe('tree limits on mountains (issue 130)', () => {
  it('stops the forest at about 3,000 m in the tropics and lower towards the poles', () => {
    expect(treeLine(0)).toBe(3000);
    expect(treeLine(3)).toBeLessThan(3200);
    expect(treeLine(50)).toBeLessThan(treeLine(30));
  });

  it('keeps trees 600 m below the snow line, so Kilimanjaro has none on its upper flank', () => {
    // Kilimanjaro as drawn: 70% of 5,895 m, over a bed near 1,000 m.
    const flank = (h: number) => snowCap(h, 1000, 3.07, 0) > -CAP_CLEARANCE_M;
    expect(flank(3500)).toBe(true);
    expect(flank(3100)).toBe(true);
    expect(flank(2800)).toBe(false);
  });
});
