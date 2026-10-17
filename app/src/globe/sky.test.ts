import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cameraLight } from './sky.ts';

describe('camera light', () => {
  it('comes from behind the camera, from above and from the left', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10000);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const light = cameraLight(camera);
    expect(light.length()).toBeCloseTo(1);
    expect(light.z).toBeGreaterThan(0.5); // towards the camera
    expect(light.y).toBeGreaterThan(0); // above
    expect(light.x).toBeLessThan(0); // left
  });
});
