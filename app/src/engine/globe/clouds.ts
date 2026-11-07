// Puffy cartoon clouds floating around the toy planet (spec milestone 1,
// section 4.5). Each cloud is a cluster of soft balls placed by a seeded
// hash; the clouds drift on the clock and carry no weather meaning.
// All of them are one instanced mesh, so they cost one draw call.

import * as THREE from 'three';
import { hash01 } from '../core/hash.ts';
import { cloudFragment, cloudVertex } from './shaders.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';

export const CLOUD_COUNT = 30;
const PUFFS = 7;
/** Height of the cloud centres above sea level, in km on the exaggerated globe: well above the
 * highest peak (about 880 km at 100x) with room for the clouds' own thickness. */
export const CLOUD_ALTITUDE_KM = 1400;
/** Camera altitudes (km) below which the clouds are gone, and above which they are fully drawn. */
const CLOUD_GONE_KM = 3000;
const CLOUD_FULL_KM = 5000;
/** One full trip around the globe takes this long on the clock. */
const ORBIT_MS = 30 * 60 * 1000;

export interface Puff {
  cloud: number;
  /** Which ball of the cloud, 0 to PUFFS - 1. */
  ball: number;
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
        ball: p,
        offset: [t * 480 * size, (hash01(c, p, 13) - 0.5) * 260 * size, r * 0.3],
        radiusKm: r,
      });
    }
  }
  return puffs;
}

/** Latitude, starting longitude and drift speed factor of a cloud in its life number `life`. */
export function cloudPlace(c: number, life = 0): { lat: number; lon: number; speed: number } {
  const lat = -55 + hash01(c, 21, life) * 125;
  return { lat, lon: hash01(c, 22, life) * 360 - 180, speed: 0.7 + hash01(c, 23) * 0.6 };
}

/** A cloud's life on the clock: which life it is in, and how far through it (0 to 1). */
export function cloudLife(c: number, clockMs: number): { life: number; u: number } {
  const length = (6 + hash01(c, 31) * 4) * 60 * 1000;
  const t = clockMs / length + hash01(c, 32);
  const life = Math.floor(t);
  return { life, u: t - life };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * How big a ball stands, as a share of its full size (0 to 1), at a point u through its cloud's
 * life: balls swell in from the middle outwards, then shrink away from the outside in.
 */
export function puffGrowth(cloud: number, ball: number, u: number): number {
  const t = Math.abs((ball / (PUFFS - 1)) * 2 - 1);
  const jitter = hash01(cloud, ball, 33) * 0.08;
  const born = t * 0.3 + jitter;
  const dies = 0.95 - t * 0.3 - jitter;
  return smooth(born, born + 0.15, u) * (1 - smooth(dies - 0.15, dies, u));
}

export class Clouds {
  readonly mesh: THREE.InstancedMesh;
  readonly material: THREE.ShaderMaterial;
  private puffs = cloudPuffs();
  private matrix = new THREE.Matrix4();
  private lastClockMs = -1;
  private lastFade = -1;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      uniforms: {
        lightDir: { value: new THREE.Vector3(0, 0, 1) },
        screenUp: { value: new THREE.Vector3(0, 1, 0) },
        cameraWorld: { value: new THREE.Vector3() },
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

  update(camera: THREE.Camera, clockMs: number, lightDir: THREE.Vector3): void {
    const u = this.material.uniforms;
    u.lightDir!.value.copy(lightDir);
    const e = camera.matrixWorld.elements;
    u.screenUp!.value.set(e[4]!, e[5]!, e[6]!);
    u.cameraWorld!.value.copy(camera.position);
    const altitude = camera.position.length() - EARTH_RADIUS_KM;
    // Shrink away as the camera comes closer, gone about when Europe fills the
    // screen, so close views stay clear (section 4.5).
    const fade = THREE.MathUtils.smoothstep(altitude, CLOUD_GONE_KM, CLOUD_FULL_KM);
    this.mesh.visible = fade > 0.01;
    if (!this.mesh.visible || (clockMs === this.lastClockMs && fade === this.lastFade)) return;
    this.lastClockMs = clockMs;
    this.lastFade = fade;

    const { centre, east, north, up, pos, scale, q, basis } = SCRATCH;
    let current = -1;
    let lifeU = 0;
    this.puffs.forEach((puff, i) => {
      if (puff.cloud !== current) {
        current = puff.cloud;
        const { life, u } = cloudLife(puff.cloud, clockMs);
        lifeU = u;
        const { lat, lon, speed } = cloudPlace(puff.cloud, life);
        const drift = ((clockMs * speed) / ORBIT_MS) * 360;
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
      const g = puffGrowth(puff.cloud, puff.ball, lifeU) * fade;
      scale.set(puff.radiusKm * g, puff.radiusKm * g, puff.radiusKm * g * 0.8);
      this.matrix.compose(pos, q, scale);
      this.mesh.setMatrixAt(i, this.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Scratch objects for placing the puffs, which runs every frame. */
const SCRATCH = {
  centre: new THREE.Vector3(),
  east: new THREE.Vector3(),
  north: new THREE.Vector3(),
  up: new THREE.Vector3(),
  pos: new THREE.Vector3(),
  scale: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  basis: new THREE.Matrix4(),
};
