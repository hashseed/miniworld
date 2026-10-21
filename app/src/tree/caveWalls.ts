// The rock faces of the caves' cut hills (humankind.md section 8.2): a smooth wall along each
// cut, from the lowered ground in front up to the hill behind, its top and foot following the
// cut's dome-shaped profile, so its edges are smooth curves rather than the steps of the coarse
// terrain mesh. It stands as high as the cut is deep, so it is nothing while the ground is flat.

import * as THREE from 'three';
import { lightUniforms } from '../../../assets/src/kit.ts';
import { EARTH_RADIUS_KM } from '../geo/earth.ts';
import type { Mound } from '../globe/globe.ts';

/** Columns along the cut and rows up the face. */
const COLUMNS = 64;
const ROWS = 6;
/** Rows of the wall's top, a lip of rock reaching back over the slope behind it to the hill. */
const LIP = 4;
const ALL = ROWS + LIP;
/** The face stands this far behind the cut, as a share of the cut's radius, before the slope behind it. */
const FACE_AT = 0;
/** The top meets the hill behind at the end of its slope (moundAt in shaders.ts). */
const TOP_E = 0.2;

const vertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec2 face;
attribute float grass;
varying vec2 vFace;
varying float vGrass;
varying vec3 vNormal;
void main() {
  vFace = face;
  vGrass = grass;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
const fragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 lightDir;
varying vec2 vFace;
varying float vGrass;
varying vec3 vNormal;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  #include <logdepthbuf_fragment>
  // Rock: layered strata along the face, mottling and a few cracks, in the face's own metres.
  vec2 p = vFace;
  float strata = sin(p.y * 7.0 + (noise(p * vec2(1.5, 3.0)) - 0.5) * 3.0);
  float mottle = noise(p * 4.0) * 0.6 + noise(p * 11.0) * 0.4;
  float crack = 1.0 - smoothstep(0.0, 0.04, abs(noise(p * vec2(2.2, 0.9) + 7.0) - 0.5));
  vec3 rock = mix(vec3(0.52, 0.49, 0.46), vec3(0.7, 0.67, 0.62), 0.5 + 0.3 * strata);
  rock *= 0.84 + 0.3 * mottle;
  rock = mix(rock, vec3(0.3, 0.28, 0.27), crack * 0.7);
  // The lip back from the edge is the hill's grass, as the ground round it.
  // Toned and speckled as the terrain's grass (shaders.ts), so the top reads as the ground.
  float speck = step(0.86, noise(p * 26.0));
  vec3 grassC = vec3(0.38, 0.6, 0.33) * (0.94 + 0.12 * mottle) * (1.0 + 0.12 * speck);
  rock = mix(rock, grassC, vGrass);
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float wrap = clamp((dot(n, lightDir) + 0.45) / 1.45, 0.0, 1.0);
  vec3 c = rock * (0.45 + 0.55 * wrap) + vec3(0.04, 0.05, 0.07);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

export class CaveWalls {
  readonly group = new THREE.Group();
  private meshes: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  private material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { lightDir: lightUniforms.lightDir },
    side: THREE.DoubleSide,
  });
  /** The ground height along each cut before it was cut, by the cut's place, looked up once. */
  private grounds = new Map<string, Float32Array>();

  private surfaceKm: (dir: [number, number, number]) => number;
  constructor(surfaceKm: (dir: [number, number, number]) => number) {
    this.surfaceKm = surfaceKm;
  }

  /** Builds this frame's walls, one per cut, from the cuts the globe draws. */
  update(mounds: readonly Mound[]): void {
    mounds.forEach((m, i) => this.wall(m, i));
    for (let i = mounds.length; i < this.meshes.length; i++) this.meshes[i]!.visible = false;
  }

  private wall(m: Mound, i: number): void {
    let mesh = this.meshes[i];
    if (!mesh) {
      const g = new THREE.BufferGeometry();
      const n = (COLUMNS + 1) * (ALL + 1);
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('face', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      // Rock on the face, the ground's grass on its top (Yang, 2026-10-21).
      const grass = new Float32Array(n);
      for (let k = 0; k <= COLUMNS; k++)
        for (let l = 1; l <= LIP; l++) grass[k * (ALL + 1) + ROWS + l] = 1;
      g.setAttribute('grass', new THREE.BufferAttribute(grass, 1));
      const index: number[] = [];
      for (let c = 0; c < COLUMNS; c++)
        for (let r = 0; r < ALL; r++) {
          const a = c * (ALL + 1) + r;
          const b = a + ALL + 1;
          index.push(a, b, a + 1, b, b + 1, a + 1);
        }
      g.setIndex(index);
      mesh = new THREE.Mesh(g, this.material);
      mesh.frustumCulled = false;
      this.meshes[i] = mesh;
      this.group.add(mesh);
    }
    const c = new THREE.Vector3(...m.centre);
    const f = new THREE.Vector3(...m.toward);
    const side = new THREE.Vector3().crossVectors(c, f);
    const r = m.radiusKm;
    // Where the ground stood before it was cut, along the cut: looked up once per cut.
    const key = m.centre.map((x) => x.toFixed(6)).join(',');
    let ground = this.grounds.get(key);
    if (!ground) {
      if (this.grounds.size > 64) this.grounds.clear();
      // At the face, and at the back of its lip, where the hill stands at full height.
      ground = new Float32Array(2 * (COLUMNS + 1));
      for (let k = 0; k <= COLUMNS; k++)
        for (const [n, e] of [
          [0, FACE_AT],
          [1, -TOP_E],
        ] as const) {
          const s = (k / COLUMNS) * 2 - 1;
          const d = c
            .clone()
            .multiplyScalar(EARTH_RADIUS_KM)
            .addScaledVector(f, e * r)
            .addScaledVector(side, s * r)
            .normalize();
          ground[n * (COLUMNS + 1) + k] = this.surfaceKm([d.x, d.y, d.z]);
        }
      this.grounds.set(key, ground);
    }
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const uv = mesh.geometry.getAttribute('face') as THREE.BufferAttribute;
    const h = m.depthKm;
    const d = new THREE.Vector3();
    for (let k = 0; k <= COLUMNS; k++) {
      const s = (k / COLUMNS) * 2 - 1;
      const across = Math.max(0, 1 - s * s);
      // From the lowered ground (moundAt in front of the cut) up to the hill's height behind.
      const foot = -h * across * across;
      const top = 0.8 * h * Math.max(0, 1 - TOP_E * TOP_E - s * s) ** 1.5;
      d.copy(c)
        .multiplyScalar(EARTH_RADIUS_KM)
        .addScaledVector(f, FACE_AT * r)
        .addScaledVector(side, s * r)
        .normalize();
      const g0 = ground[k]!;
      for (let row = 0; row <= ROWS; row++) {
        const t = row / ROWS;
        // A little below the lowered ground, so no gap shows at the foot.
        const height = g0 + (foot - h * 0.03) + (top - foot + h * 0.03) * t;
        const j = k * (ALL + 1) + row;
        pos.setXYZ(
          j,
          ...d
            .clone()
            .multiplyScalar(EARTH_RADIUS_KM + height)
            .toArray(),
        );
        nor.setXYZ(j, f.x, f.y, f.z);
        // The face's own coordinates in drawn km across 20, for the rock's pattern.
        uv.setXY(j, (s * r) / 20, ((height - g0) / 20) * 6);
      }
      // The lip: flat at the face's top, back over the slope to where the hill stands at the
      // same height, a little above the ground so the slope under it never shows.
      const g1 = ground[COLUMNS + 1 + k]!;
      for (let l = 1; l <= LIP; l++) {
        const u = l / LIP;
        const back = c
          .clone()
          .multiplyScalar(EARTH_RADIUS_KM)
          .addScaledVector(f, (FACE_AT - TOP_E * u) * r)
          .addScaledVector(side, s * r)
          .normalize();
        const height = g0 + (g1 - g0) * u + top + h * 0.02 * (1 - u);
        const j = k * (ALL + 1) + ROWS + l;
        pos.setXYZ(
          j,
          ...back
            .clone()
            .multiplyScalar(EARTH_RADIUS_KM + height)
            .toArray(),
        );
        nor.setXYZ(j, back.x, back.y, back.z);
        uv.setXY(j, (s * r) / 20, ((top + TOP_E * r * u) / 20) * 6);
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    uv.needsUpdate = true;
    mesh.visible = h > 0;
  }
}
