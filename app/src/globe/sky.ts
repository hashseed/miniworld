// Sky, atmosphere glow, stars and the sun (spec milestone 1, sections 3.6 and 4.5).

import * as THREE from 'three';
import { hash01 } from '../core/hash.ts';
import { atmosphereFragment, atmosphereVertex, skyFragment, skyVertex } from './shaders.ts';
import { EARTH_RADIUS_KM } from './tileMesh.ts';

/** One day lasts four real minutes of life-clock time. */
export const DAY_LENGTH_MS = 4 * 60 * 1000;

/** Sun direction from the life clock: the sun circles over the equator. */
export function sunDirection(lifeMs: number, out = new THREE.Vector3()): THREE.Vector3 {
  const lon = -((lifeMs % DAY_LENGTH_MS) / DAY_LENGTH_MS) * Math.PI * 2;
  return out.set(Math.sin(lon), 0, Math.cos(lon));
}

/** Life-clock time at which it is mid-morning (about 9:30) at a longitude. */
export function lifeMsForMorning(lonDeg: number): number {
  // Local noon is when the sun's longitude equals the place's longitude.
  const noonFraction = (((-lonDeg / 360) % 1) + 1) % 1;
  const morning = noonFraction - 2.5 / 24;
  return Math.round((((morning % 1) + 1) % 1) * DAY_LENGTH_MS);
}

export class Sky {
  readonly dome: THREE.Mesh;
  readonly atmosphere: THREE.Mesh;
  readonly stars: THREE.Points;
  private domeMaterial: THREE.ShaderMaterial;
  private atmosphereMaterial: THREE.ShaderMaterial;
  private starMaterial: THREE.PointsMaterial;

  constructor() {
    this.domeMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        localUp: { value: new THREE.Vector3(0, 1, 0) },
        daylight: { value: 1 },
        atmosphere: { value: 0 },
      },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.domeMaterial);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;

    this.atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex,
      fragmentShader: atmosphereFragment,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        cameraWorld: { value: new THREE.Vector3() },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        alwaysDay: { value: 0 },
        strength: { value: 1 },
      },
    });
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS_KM * 1.035, 96, 48),
      this.atmosphereMaterial,
    );
    this.atmosphere.renderOrder = 5;

    const count = 1800;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const z = hash01(i, 1) * 2 - 1;
      const a = hash01(i, 2) * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      positions.set([r * Math.cos(a), z, r * Math.sin(a)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      size: 1.6,
      sizeAttenuation: false,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
    });
    this.stars = new THREE.Points(g, this.starMaterial);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
  }

  update(camera: THREE.Camera, sun: THREE.Vector3, alwaysDay: boolean): void {
    const pos = camera.position;
    const up = pos.clone().normalize();
    const altitude = pos.length() - EARTH_RADIUS_KM;
    const daylight = alwaysDay ? 1 : THREE.MathUtils.smoothstep(up.dot(sun), -0.15, 0.2);
    const atmosphere = 1 - THREE.MathUtils.smoothstep(altitude, 60, 600);
    const d = this.domeMaterial.uniforms;
    d.localUp!.value.copy(up);
    d.daylight!.value = daylight;
    d.atmosphere!.value = atmosphere;
    this.dome.position.copy(pos);

    const a = this.atmosphereMaterial.uniforms;
    a.cameraWorld!.value.copy(pos);
    a.sunDir!.value.copy(sun);
    a.alwaysDay!.value = alwaysDay ? 1 : 0;
    a.strength!.value = THREE.MathUtils.smoothstep(altitude, 200, 2500);

    this.stars.position.copy(pos);
    this.stars.scale.setScalar(EARTH_RADIUS_KM * 20);
    this.starMaterial.opacity =
      (1 - atmosphere * Math.max(daylight, 0.3)) * THREE.MathUtils.smoothstep(altitude, 300, 3000);
    this.stars.visible = this.starMaterial.opacity > 0.01;
  }
}
