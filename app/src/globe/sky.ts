// The sky behind the globe (spec milestone 1, sections 3.6 and 4.5): a plain
// dark background in orbit and a sky gradient near the ground. There is no
// atmosphere glow, no stars and no day and night.

import * as THREE from 'three';
import { skyFragment, skyVertex } from './shaders.ts';
import { EARTH_RADIUS_KM } from './tileMesh.ts';

/**
 * Light direction for the globe: from the upper left of the view and slightly
 * behind the camera, so the lit side always faces the viewer.
 */
export function cameraLight(camera: THREE.Camera, out = new THREE.Vector3()): THREE.Vector3 {
  const e = camera.matrixWorld.elements;
  const right = new THREE.Vector3(e[0], e[1], e[2]);
  const up = new THREE.Vector3(e[4], e[5], e[6]);
  const back = new THREE.Vector3(e[8], e[9], e[10]);
  return out
    .copy(back)
    .multiplyScalar(0.8)
    .addScaledVector(up, 0.5)
    .addScaledVector(right, -0.35)
    .normalize();
}

export class Sky {
  readonly dome: THREE.Mesh;
  private domeMaterial: THREE.ShaderMaterial;

  constructor() {
    this.domeMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        localUp: { value: new THREE.Vector3(0, 1, 0) },
        atmosphere: { value: 0 },
      },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.domeMaterial);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
  }

  update(camera: THREE.Camera): void {
    const pos = camera.position;
    const altitude = pos.length() - EARTH_RADIUS_KM;
    const d = this.domeMaterial.uniforms;
    d.localUp!.value.copy(pos).normalize();
    d.atmosphere!.value = 1 - THREE.MathUtils.smoothstep(altitude, 60, 600);
    this.dome.position.copy(pos);
  }
}
