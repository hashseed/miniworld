// The rock faces of the caves' cut hills (humankind.md section 8.2): a smooth wall along each
// cut, leaning back from the lowered ground in front up to the hill's brow behind, its top and foot following the
// cut's dome-shaped profile, so its edges are smooth curves rather than the steps of the coarse
// terrain mesh. It stands as high as the cut is deep, so it is nothing while the ground is flat.

import * as THREE from 'three';
import { lightUniforms } from '../../../assets/src/kit.ts';
import { EARTH_RADIUS_KM } from '../geo/earth.ts';
import type { Mound } from '../globe/globe.ts';

/** Columns along the cut and rows up the face. */
const COLUMNS = 64;
const ROWS = 6;
/** The face stands this far behind the cut, as a share of the cut's radius, before the slope behind it. */
const FACE_AT = 0.04;
/** The wall leans back this far, as a share of the cut's radius, to the hill's brow (moundAt in shaders.ts). */
const TOP_E = 0.34;
/** The wall spans the terrain's hole along the cut out to this share of the radius (moundHole in shaders.ts). */
const SIDE = Math.sqrt(0.55);

const vertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec2 face;
attribute float low;
varying float vLow;
varying vec2 vFace;
varying vec3 vNormal;
void main() {
  vFace = face;
  vLow = low;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
const fragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 lightDir;
uniform float style;
varying vec2 vFace;
varying float vLow;
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
  // The face's coordinates run about four times finer up than across: evened out.
  vec2 p = vFace * vec2(2.0, 0.5);
  float mottle = noise(p * 1.6) * 0.55 + noise(p * 4.5) * 0.3 + noise(p * 12.0) * 0.15;
  vec3 rock;
  if (style < 0.5) {
    // Chauvet (Yang, 2026-10-21: strata "looks like a brick wall"): pale limestone, broad
    // mottling, faint calcite runs, warm ochre patches and darker hollows.
    float runs = noise(vec2(p.x * 6.0 + noise(p * 2.0) * 1.5, p.y * 0.12));
    float stain = smoothstep(0.62, 0.85, noise(p * 0.9 + 3.0));
    float hollow = smoothstep(0.7, 0.9, noise(p * 2.4 + 11.0));
    rock = mix(vec3(0.74, 0.68, 0.58), vec3(0.86, 0.81, 0.72), mottle);
    rock = mix(rock, vec3(0.9, 0.87, 0.8), smoothstep(0.6, 0.85, runs) * 0.3);
    rock = mix(rock, vec3(0.7, 0.48, 0.33), stain * 0.45);
    rock = mix(rock, vec3(0.52, 0.47, 0.41), hollow * 0.4);
  } else {
    // Leang Karampuang, Maros karst: warm tan to orange-brown limestone with grey weathered
    // patches and pale knobbly coralloid crusts ("cave popcorn") grown over it (Oktaviana et
    // al. 2024, Figure 2).
    float grey = smoothstep(0.55, 0.8, noise(p * 1.2 + 5.0));
    float knobs = smoothstep(0.78, 0.9, noise(p * 22.0)) * smoothstep(0.45, 0.7, noise(p * 2.0 + 9.0));
    rock = mix(vec3(0.66, 0.48, 0.32), vec3(0.8, 0.62, 0.43), mottle);
    rock = mix(rock, vec3(0.52, 0.5, 0.48), grey * 0.6);
    rock = mix(rock, vec3(0.9, 0.86, 0.78), knobs * 0.8);
  }
  // Where the face runs out at its ends it is the ground's grass, as the hill round it.
  rock = mix(rock, vec3(0.38, 0.6, 0.33) * (0.94 + 0.12 * mottle), vLow);
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
    uniforms: { lightDir: lightUniforms.lightDir, style: { value: 0 } },
    side: THREE.DoubleSide,
  });
  /** The ground height along each cut before it was cut, by the cut's place, looked up once. */
  private grounds = new Map<string, Float32Array>();

  private surfaceKm: (dir: [number, number, number]) => number;
  private seaKm: () => number;
  constructor(surfaceKm: (dir: [number, number, number]) => number, seaKm: () => number) {
    this.surfaceKm = surfaceKm;
    this.seaKm = seaKm;
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
      const n = (COLUMNS + 1) * (ROWS + 1);
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('face', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      g.setAttribute('low', new THREE.BufferAttribute(new Float32Array(n), 1));
      const index: number[] = [];
      for (let c = 0; c < COLUMNS; c++)
        for (let r = 0; r < ROWS; r++) {
          const a = c * (ROWS + 1) + r;
          const b = a + ROWS + 1;
          index.push(a, b, a + 1, b, b + 1, a + 1);
        }
      g.setIndex(index);
      // Each wall its own material, for its cave's rock.
      mesh = new THREE.Mesh(g, this.material.clone());
      mesh.material.uniforms.lightDir = lightUniforms.lightDir;
      mesh.frustumCulled = false;
      this.meshes[i] = mesh;
      this.group.add(mesh);
    }
    mesh.material.uniforms.style!.value = m.rock ?? 0;
    const c = new THREE.Vector3(...m.centre);
    const f = new THREE.Vector3(...m.toward);
    const side = new THREE.Vector3().crossVectors(c, f);
    const r = m.radiusKm;
    // Where the ground stood before it was cut, along the cut: looked up once per cut.
    const key = m.centre.map((x) => x.toFixed(6)).join(',');
    let ground = this.grounds.get(key);
    if (!ground) {
      if (this.grounds.size > 64) this.grounds.clear();
      // At every row of the wall, from its foot to the brow behind where it meets the hill,
      // so it follows the ground's own curve rather than a straight line across it.
      ground = new Float32Array((COLUMNS + 1) * (ROWS + 1));
      for (let k = 0; k <= COLUMNS; k++)
        for (let row = 0; row <= ROWS; row++) {
          const s = ((k / COLUMNS) * 2 - 1) * SIDE;
          const d = c
            .clone()
            .multiplyScalar(EARTH_RADIUS_KM)
            .addScaledVector(f, (FACE_AT - TOP_E * (row / ROWS)) * r)
            .addScaledVector(side, s * r)
            .normalize();
          ground[k * (ROWS + 1) + row] = this.surfaceKm([d.x, d.y, d.z]);
        }
      this.grounds.set(key, ground);
    }
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const uv = mesh.geometry.getAttribute('face') as THREE.BufferAttribute;
    const low = mesh.geometry.getAttribute('low') as THREE.BufferAttribute;
    const h = m.depthKm;
    for (let k = 0; k <= COLUMNS; k++) {
      const s = ((k / COLUMNS) * 2 - 1) * SIDE;
      const across = Math.max(0, 1 - s * s);
      // From the lowered ground (moundAt in front of the cut) up to the hill's height behind.
      // The floor sinks no lower than just above the sea, as the terrain's (moundAt's room).
      const room = Math.max(0, ground[k * (ROWS + 1)]! - this.seaKm() - 1.5);
      const foot = -Math.min(h * across * across, room);
      const top = 0.8 * h * Math.max(0, 1 - (FACE_AT - TOP_E) ** 2 - s * s) ** 1.5;
      // As the terrain's cut, faded out before the wall's ends (moundAt in shaders.ts).
      const v = Math.min(1, Math.max(0, (s * s - 0.3) / 0.2));
      const ends = 1 - v * v * (3 - 2 * v);
      for (let row = 0; row <= ROWS; row++) {
        const t = row / ROWS;
        // Leaning back from the floor at the cut to the hill's brow, where the ground stands
        // at the face's top, so the terrain's grass runs over its top edge (Yang, 2026-10-21).
        const at = c
          .clone()
          .multiplyScalar(EARTH_RADIUS_KM)
          .addScaledVector(f, (FACE_AT - TOP_E * t) * r)
          .addScaledVector(side, s * r)
          .normalize();
        // A little below the floor at the foot and the brow at the top, so neither shows a gap.
        const height =
          ground[k * (ROWS + 1) + row]! + (foot - h * 0.1) * ends * (1 - t) + top * ends * t;
        const j = k * (ROWS + 1) + row;
        pos.setXYZ(
          j,
          ...at
            .clone()
            .multiplyScalar(EARTH_RADIUS_KM + height)
            .toArray(),
        );
        // Grass where the face is less than a third of its full height.
        const tall = h > 0 ? ((top - foot) * ends) / (1.8 * h) : 0;
        const grassy = 1 - Math.min(1, Math.max(0, (tall - 0.15) / 0.2));
        low.setX(j, grassy);
        // Facing the hearth and a little up, as it leans back; lit as the ground where grassy.
        const up = at.clone().multiplyScalar(0.45).add(f).normalize().lerp(at, grassy).normalize();
        nor.setXYZ(j, up.x, up.y, up.z);
        // The face's own coordinates in drawn km across 20, for the rock's pattern.
        uv.setXY(j, (s * r) / 20, ((foot + (top - foot) * t) / 20) * 6);
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    uv.needsUpdate = true;
    low.needsUpdate = true;
    mesh.visible = h > 0;
  }
}
