// Puffy cartoon clouds floating around the toy planet (spec milestone 1,
// section 4.5). Each cloud is a cluster of soft balls placed by a seeded
// hash; the clouds drift on the life clock and carry no weather meaning.
// All of them are one instanced mesh, so they cost one draw call.

import * as THREE from 'three';
import { hash01 } from '../core/hash.ts';
import { cloudFragment, cloudVertex } from './shaders.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';

export const CLOUD_COUNT = 30;
const PUFFS = 7;
/** Height of the cloud centres above sea level, in km on the exaggerated globe. */
export const CLOUD_ALTITUDE_KM = 650;
/** One full trip around the globe takes this long on the life clock. */
const ORBIT_MS = 30 * 60 * 1000;

export interface Puff {
  cloud: number;
  /** Offset from the cloud centre in km: east, north, up. */
  offset: [number, number, number];
  radiusKm: number;
}

/** The balls of every cloud, from the seeded hash. */
export function cloudPuffs(): Puff[] {
  const puffs: Puff[] = [];
  for (let c = 0; c < CLOUD_COUNT; c++) {
    const size = 0.7 + hash01(c, 11) * 0.6;
    for (let p = 0; p < PUFFS; p++) {
      // Balls along a short line, biggest in the middle, flattened at the bottom.
      const t = (p / (PUFFS - 1)) * 2 - 1;
      const r = (300 - Math.abs(t) * 140 + hash01(c, p, 12) * 80) * size;
      puffs.push({
        cloud: c,
        offset: [t * 480 * size, (hash01(c, p, 13) - 0.5) * 260 * size, r * 0.3],
        radiusKm: r,
      });
    }
  }
  return puffs;
}

/** Latitude, starting longitude and drift speed factor of a cloud. */
export function cloudPlace(c: number): { lat: number; lon: number; speed: number } {
  const lat = -55 + hash01(c, 21) * 125;
  return { lat, lon: hash01(c, 22) * 360 - 180, speed: 0.7 + hash01(c, 23) * 0.6 };
}

export class Clouds {
  readonly mesh: THREE.InstancedMesh;
  readonly material: THREE.ShaderMaterial;
  private puffs = cloudPuffs();
  private matrix = new THREE.Matrix4();
  private lastLifeMs = -1;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      uniforms: {
        lightDir: { value: new THREE.Vector3(0, 0, 1) },
        screenUp: { value: new THREE.Vector3(0, 1, 0) },
        cameraWorld: { value: new THREE.Vector3() },
        fade: { value: 1 },
      },
    });
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 3),
      this.material,
      this.puffs.length,
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  update(camera: THREE.Camera, lifeMs: number, lightDir: THREE.Vector3): void {
    const u = this.material.uniforms;
    u.lightDir!.value.copy(lightDir);
    const e = camera.matrixWorld.elements;
    u.screenUp!.value.set(e[4]!, e[5]!, e[6]!);
    u.cameraWorld!.value.copy(camera.position);
    const altitude = camera.position.length() - EARTH_RADIUS_KM;
    // Fade out as the camera comes down to the clouds, so low views stay clear.
    u.fade!.value = THREE.MathUtils.smoothstep(
      altitude,
      CLOUD_ALTITUDE_KM * 1.6,
      CLOUD_ALTITUDE_KM * 3.5,
    );
    this.mesh.visible = u.fade!.value > 0.01;
    if (!this.mesh.visible || lifeMs === this.lastLifeMs) return;
    this.lastLifeMs = lifeMs;

    const centre = new THREE.Vector3();
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    const up = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const basis = new THREE.Matrix4();
    let current = -1;
    this.puffs.forEach((puff, i) => {
      if (puff.cloud !== current) {
        current = puff.cloud;
        const { lat, lon, speed } = cloudPlace(puff.cloud);
        const drift = ((lifeMs * speed) / ORBIT_MS) * 360;
        const phi = THREE.MathUtils.degToRad(lat);
        const lambda = THREE.MathUtils.degToRad(lon + drift);
        up.set(Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda));
        northEast(up, north, east);
        centre.copy(up).multiplyScalar(EARTH_RADIUS_KM + CLOUD_ALTITUDE_KM);
        basis.makeBasis(east, north, up);
        q.setFromRotationMatrix(basis);
      }
      pos
        .copy(centre)
        .addScaledVector(east, puff.offset[0])
        .addScaledVector(north, puff.offset[1])
        .addScaledVector(up, puff.offset[2]);
      scale.set(puff.radiusKm, puff.radiusKm, puff.radiusKm * 0.8);
      this.matrix.compose(pos, q, scale);
      this.mesh.setMatrixAt(i, this.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
