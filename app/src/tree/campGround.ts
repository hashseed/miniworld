// The lighter ground under every camp when seen from orbit (spec humankind.md section 8.1,
// "Lighter ground"): a soft warm patch draped on the drawn terrain, fading out at its rim.

import * as THREE from 'three';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import type { SurfaceSource } from './surface.ts';

const RINGS = [0.33, 0.66, 1];
const SEGMENTS = 16;
const PER_CAMP = 1 + RINGS.length * SEGMENTS;
/** The patch floats this far over the ground, in km, so the terrain never cuts through it. */
const LIFT_KM = 30;
/** The patch fades in between these camera altitudes, in km. */
const FADE_FROM_KM = 1_500;
const FADE_TO_KM = 4_500;

interface Patch {
  position: Float32Array;
  alpha: Float32Array;
}

export class CampGround {
  readonly mesh: THREE.Mesh;
  private patches = new Map<string, Patch>();
  private key = '';
  private version = -1;
  private centers: number[] = [];
  private amount = { value: 0 };
  private n = new THREE.Vector3();
  private e = new THREE.Vector3();
  private p = new THREE.Vector3();
  private d = new THREE.Vector3();

  private surface: SurfaceSource;
  private radiusKm: number;

  constructor(surface: SurfaceSource, radiusKm: number) {
    this.surface = surface;
    this.radiusKm = radiusKm;
    const material = new THREE.ShaderMaterial({
      uniforms: { amount: this.amount },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform float amount;
        varying float vAlpha;
        void main() {
          #include <logdepthbuf_fragment>
          gl_FragColor = vec4(1.0, 0.95, 0.72, vAlpha * amount * 0.9);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  /** Starts a frame's list of camp middles, as drawn positions on the globe. */
  begin(): void {
    this.centers.length = 0;
  }

  add(position: THREE.Vector3): void {
    this.centers.push(position.x, position.y, position.z);
  }

  /** Builds the patches that changed and sets the strength for the camera's altitude. */
  end(cameraKm: number, groundVersion: number): void {
    const altitude = cameraKm - EARTH_RADIUS_KM;
    this.amount.value = Math.min(
      1,
      Math.max(0, (altitude - FADE_FROM_KM) / (FADE_TO_KM - FADE_FROM_KM)),
    );
    this.mesh.visible = this.amount.value > 0 && this.centers.length > 0;
    if (!this.mesh.visible) return;
    if (groundVersion !== this.version) {
      this.patches.clear();
      this.version = groundVersion;
      this.key = '';
    }
    const keys: string[] = [];
    for (let i = 0; i < this.centers.length; i += 3)
      keys.push(
        `${Math.round(this.centers[i]!)},${Math.round(this.centers[i + 1]!)},${Math.round(this.centers[i + 2]!)}`,
      );
    const key = keys.join(';');
    if (key === this.key) return;
    this.key = key;
    if (this.patches.size > 2_000) this.patches.clear();
    const count = keys.length;
    const position = new Float32Array(count * PER_CAMP * 3);
    const alpha = new Float32Array(count * PER_CAMP);
    const index: number[] = [];
    keys.forEach((k, c) => {
      let patch = this.patches.get(k);
      if (!patch) {
        patch = this.build(
          this.centers[c * 3]!,
          this.centers[c * 3 + 1]!,
          this.centers[c * 3 + 2]!,
        );
        this.patches.set(k, patch);
      }
      position.set(patch.position, c * PER_CAMP * 3);
      alpha.set(patch.alpha, c * PER_CAMP);
      const base = c * PER_CAMP;
      for (let s = 0; s < SEGMENTS; s++) {
        const t = (s + 1) % SEGMENTS;
        index.push(base, base + 1 + s, base + 1 + t);
        for (let r = 0; r < RINGS.length - 1; r++) {
          const a = base + 1 + r * SEGMENTS;
          const b = a + SEGMENTS;
          index.push(a + s, b + s, b + t, a + s, b + t, a + t);
        }
      }
    });
    const geometry = this.mesh.geometry;
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
  }

  private build(x: number, y: number, z: number): Patch {
    const position = new Float32Array(PER_CAMP * 3);
    const alpha = new Float32Array(PER_CAMP);
    const sea = this.surface.seaKm?.() ?? -Infinity;
    const dir = this.d.set(x, y, z).normalize();
    northEast(dir, this.n, this.e);
    let v = 0;
    const put = (offsetE: number, offsetN: number, weight: number) => {
      this.p
        .copy(dir)
        .addScaledVector(this.e, offsetE / EARTH_RADIUS_KM)
        .addScaledVector(this.n, offsetN / EARTH_RADIUS_KM)
        .normalize();
      const ground = this.surface.surfaceKm([this.p.x, this.p.y, this.p.z]);
      this.p.multiplyScalar(EARTH_RADIUS_KM + ground + LIFT_KM);
      position.set([this.p.x, this.p.y, this.p.z], v * 3);
      alpha[v] = ground > sea + 0.05 ? weight : 0;
      v++;
    };
    put(0, 0, 1);
    for (const ring of RINGS) {
      const weight = 1 - ring * ring;
      for (let s = 0; s < SEGMENTS; s++) {
        const angle = (s / SEGMENTS) * Math.PI * 2;
        put(this.radiusKm * ring * Math.cos(angle), this.radiusKm * ring * Math.sin(angle), weight);
      }
    }
    return { position, alpha };
  }
}
