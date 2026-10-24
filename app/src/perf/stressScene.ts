// The stress scene (spec milestone 1, section 11.4): 20,000 placeholder
// figures and 1,000 placeholder buildings over about 30 × 30 km of the Nile
// delta, with the nearest figures animated on the GPU and the rest drawn as
// marks. Positions and animations come from seeded hashes, never Math.random.

import * as THREE from 'three';
import { hash01 } from '../core/hash.ts';
import { latLonToDir } from '../geo/cube.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import { ANIMATIONS, FRAMES_PER_ANIM, buildPlaceholderFigure } from './placeholderFigure.ts';

export const STRESS_CENTRE = { lat: 31.0, lon: 31.0 };
export const STRESS_FIGURES = 20000;
export const STRESS_BUILDINGS = 1000;
const AREA_KM = 30;
/**
 * Below these sizes on screen (pixels, in a nominal 800-pixel-high view) a
 * figure or building is drawn at its simple level (spec milestone 1, section 11.4).
 */
export const STRESS_LOD_FIGURE_PX = 16;
export const STRESS_LOD_BUILDING_PX = 24;
const NOMINAL_VIEW_PX = 800;
const BUILDING_WIDTH_KM = 0.04;

/** The distance (km) beyond which something `sizeKm` tall or wide is under `px` pixels on screen. */
export function lodDistanceKm(sizeKm: number, px: number, fovDeg: number): number {
  return (sizeKm * (NOMINAL_VIEW_PX / 2)) / (Math.tan((fovDeg * Math.PI) / 360) * px);
}
const FIGURE_HEIGHT_KM = 0.03; // miniature scale: a figure stands about 30 m tall

const figureVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float vid;
attribute vec4 inst;   // x, z (km), heading, seed
attribute vec3 tint;
uniform sampler2D anim;
uniform float time;     // clock time in seconds, wrapped to an hour
uniform float scale;
varying vec3 vColour;
varying float vShade;

float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void main() {
  // Each figure picks an action per slot of 10 to 30 seconds from a hash of its seed and slot.
  float slotLen = 10.0 + 20.0 * h1(inst.w);
  float slot = floor((time + inst.w * 37.0) / slotLen);
  float t = fract((time + inst.w * 37.0) / slotLen);
  float r = h1(inst.w * 7.1 + slot);
  float animId = r < 0.6 ? 0.0 : (r < 0.85 ? 1.0 : 2.0);
  vec2 home = inst.xy;
  vec2 a = home + (vec2(h1(inst.w + slot), h1(inst.w * 3.3 + slot)) - 0.5) * 0.3;
  vec2 b = home + (vec2(h1(inst.w + slot + 1.0), h1(inst.w * 3.3 + slot + 1.0)) - 0.5) * 0.3;
  vec2 p = animId == 0.0 ? mix(a, b, t) : a;
  float heading = animId == 0.0 ? atan(b.x - a.x, b.y - a.y) : inst.z;

  float frameF = mod(time * 12.0 + inst.w * 24.0, ${FRAMES_PER_ANIM}.0);
  float f0 = floor(frameF);
  float f1 = mod(f0 + 1.0, ${FRAMES_PER_ANIM}.0);
  float row0 = animId * ${FRAMES_PER_ANIM}.0 + f0;
  float row1 = animId * ${FRAMES_PER_ANIM}.0 + f1;
  vec3 v0 = texelFetch(anim, ivec2(int(vid), int(row0)), 0).xyz;
  vec3 v1 = texelFetch(anim, ivec2(int(vid), int(row1)), 0).xyz;
  vec3 local = mix(v0, v1, frameF - f0) * scale;
  float cs = cos(heading), sn = sin(heading);
  local = vec3(local.x * cs + local.z * sn, local.y, -local.x * sn + local.z * cs);
  vec3 world = vec3(p.x, 0.0, p.y) + local;
  vColour = tint;
  vShade = 0.7 + 0.3 * clamp(local.y / scale / 1.8, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const figureFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColour;
varying float vShade;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(vColour * vShade, 1.0);
  #include <colorspace_fragment>
}
`;

export class StressScene {
  readonly group = new THREE.Group();
  readonly figureTriangles: number;
  private animated: THREE.InstancedMesh;
  private animatedFar: THREE.InstancedMesh;
  private houses: THREE.InstancedMesh;
  private housesFar: THREE.InstancedMesh;
  private houseMatrices: Float32Array;
  private marks: THREE.Points;
  private homes: Float32Array;
  private material: THREE.ShaderMaterial;
  private materialFar: THREE.ShaderMaterial;
  private animatedLimit: number;
  private lastSort = -1e9;
  private placedGround = false;
  private groundKm = 0;

  constructor(animatedLimit: number) {
    this.animatedLimit = animatedLimit;
    const centre = new THREE.Vector3(...latLonToDir(STRESS_CENTRE.lat, STRESS_CENTRE.lon));
    // Local frame: y up, x east, z south.
    const up = centre.clone();
    const north = new THREE.Vector3();
    const east = new THREE.Vector3();
    northEast(up, north, east);
    const basis = new THREE.Matrix4().makeBasis(east, up, north.clone().negate());
    this.group.quaternion.setFromRotationMatrix(basis);
    this.group.position.copy(centre.multiplyScalar(EARTH_RADIUS_KM));

    // Homes clustered in villages, from seeded hashes.
    this.homes = new Float32Array(STRESS_FIGURES * 2);
    for (let i = 0; i < STRESS_FIGURES; i++) {
      const village = Math.floor(hash01(i, 1) * 60);
      const vx = (hash01(village, 2) - 0.5) * AREA_KM;
      const vz = (hash01(village, 3) - 0.5) * AREA_KM;
      const r = Math.sqrt(hash01(i, 4)) * 1.5;
      const a = hash01(i, 5) * Math.PI * 2;
      this.homes[i * 2] = vx + Math.cos(a) * r;
      this.homes[i * 2 + 1] = vz + Math.sin(a) * r;
    }

    const near = this.makeFigures(buildPlaceholderFigure(false));
    const far = this.makeFigures(buildPlaceholderFigure(true));
    this.figureTriangles = near.triangles;
    this.material = near.material;
    this.animated = near.mesh;
    this.materialFar = far.material;
    this.animatedFar = far.mesh;
    this.group.add(this.animated, this.animatedFar);

    const markPos = new Float32Array(STRESS_FIGURES * 3);
    const markCol = new Float32Array(STRESS_FIGURES * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(markPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(markCol, 3));
    this.marks = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true }),
    );
    this.marks.frustumCulled = false;
    this.group.add(this.marks);

    // Buildings: about 2,000 triangles each, and about 200 when small on screen.
    const buildHouse = (segments: number) => {
      const house = new THREE.BoxGeometry(
        0.04,
        0.025,
        0.04,
        segments,
        segments / 2,
        segments,
      ).translate(0, 0.0125, 0);
      const roof = new THREE.ConeGeometry(0.034, 0.02, 4)
        .rotateY(Math.PI / 4)
        .translate(0, 0.035, 0);
      return mergeHouse(house, roof);
    };
    const houseMaterial = new THREE.MeshLambertMaterial({ color: 0xc9a77a });
    this.houses = new THREE.InstancedMesh(buildHouse(16), houseMaterial, STRESS_BUILDINGS);
    this.housesFar = new THREE.InstancedMesh(buildHouse(4), houseMaterial, STRESS_BUILDINGS);
    this.houseMatrices = new Float32Array(STRESS_BUILDINGS * 16);
    const m = new THREE.Matrix4();
    for (let i = 0; i < STRESS_BUILDINGS; i++) {
      const home = Math.floor(hash01(i, 9) * STRESS_FIGURES);
      m.makeRotationY(hash01(i, 10) * Math.PI);
      m.setPosition(
        this.homes[home * 2]! + (hash01(i, 11) - 0.5) * 0.1,
        0,
        this.homes[home * 2 + 1]! + (hash01(i, 12) - 0.5) * 0.1,
      );
      m.toArray(this.houseMatrices, i * 16);
    }
    for (const h of [this.houses, this.housesFar]) {
      h.frustumCulled = false;
      h.count = 0;
      h.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(h);
    }
    this.group.add(new THREE.HemisphereLight(0xffffff, 0x445533, 2.2));
  }

  /** One level of the animated figures: its instanced mesh, material and per-copy attributes. */
  private makeFigures(fig: ReturnType<typeof buildPlaceholderFigure>): {
    mesh: THREE.InstancedMesh;
    material: THREE.ShaderMaterial;
    triangles: number;
  } {
    const material = new THREE.ShaderMaterial({
      vertexShader: figureVertex,
      fragmentShader: figureFragment,
      uniforms: {
        anim: { value: fig.animation },
        time: { value: 0 },
        scale: { value: FIGURE_HEIGHT_KM / 1.8 },
      },
    });
    const max = 5000;
    const mesh = new THREE.InstancedMesh(fig.geometry, material, max);
    mesh.frustumCulled = false;
    const inst = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    const tint = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    inst.setUsage(THREE.DynamicDrawUsage);
    tint.setUsage(THREE.DynamicDrawUsage);
    fig.geometry.setAttribute('inst', inst);
    fig.geometry.setAttribute('tint', tint);
    mesh.count = 0;
    return { mesh, material, triangles: fig.triangles };
  }

  /** Raises the scene onto the terrain once its height is known. */
  setGround(heightKm: number): void {
    if (this.placedGround) return;
    this.groundKm = heightKm;
    this.place(this.group.position.clone().normalize());
    this.placedGround = true;
  }

  /**
   * Stands the scene at a drawn direction, so it follows the history lens;
   * the figures keep their miniature size (history-lens.md, section 4).
   */
  place(dir: THREE.Vector3): void {
    const up = dir.clone().normalize();
    const north = new THREE.Vector3();
    const east = new THREE.Vector3();
    northEast(up, north, east);
    const basis = new THREE.Matrix4().makeBasis(east, up, north.clone().negate());
    this.group.quaternion.setFromRotationMatrix(basis);
    this.group.position.copy(up.multiplyScalar(EARTH_RADIUS_KM + this.groundKm));
  }

  setAnimatedLimit(n: number): void {
    this.animatedLimit = n;
    this.lastSort = -1e9;
  }

  update(camera: THREE.Camera, clockMs: number, nowMs: number): void {
    const time = (clockMs % 3_600_000) / 1000;
    this.material.uniforms.time!.value = time;
    this.materialFar.uniforms.time!.value = time;
    if (nowMs - this.lastSort < 500) return;
    this.lastSort = nowMs;
    // Pick the figures nearest the camera to animate; the rest become marks.
    this.group.updateWorldMatrix(true, false);
    const local = this.group.worldToLocal(camera.position.clone());
    const n = STRESS_FIGURES;
    const dist = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const dx = this.homes[i * 2]! - local.x;
      const dz = this.homes[i * 2 + 1]! - local.z;
      dist[i] = dx * dx + dz * dz + local.y * local.y;
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => dist[a]! - dist[b]!);
    const limit = Math.min(this.animatedLimit, 5000);
    // The figures are sorted by distance, so the nearest ones take the full level.
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 45;
    const figureKm = lodDistanceKm(FIGURE_HEIGHT_KM, STRESS_LOD_FIGURE_PX, fov);
    const buildingKm = lodDistanceKm(BUILDING_WIDTH_KM, STRESS_LOD_BUILDING_PX, fov);
    const lod2 = figureKm * figureKm;
    let nearCount = 0;
    while (nearCount < limit && dist[order[nearCount]!]! <= lod2) nearCount++;
    const fill = (mesh: THREE.InstancedMesh, from: number, to: number): void => {
      const geo = mesh.geometry;
      const inst = geo.getAttribute('inst') as THREE.InstancedBufferAttribute;
      const tint = geo.getAttribute('tint') as THREE.InstancedBufferAttribute;
      for (let k = from; k < to; k++) {
        const i = order[k]!;
        inst.setXYZW(
          k - from,
          this.homes[i * 2]!,
          this.homes[i * 2 + 1]!,
          hash01(i, 6) * Math.PI * 2,
          hash01(i, 7) * 100,
        );
        tint.setXYZ(
          k - from,
          0.4 + hash01(i, 13) * 0.6,
          0.3 + hash01(i, 14) * 0.5,
          0.2 + hash01(i, 15) * 0.6,
        );
      }
      inst.needsUpdate = true;
      tint.needsUpdate = true;
      mesh.count = to - from;
    };
    fill(this.animated, 0, nearCount);
    fill(this.animatedFar, nearCount, limit);
    this.sortHouses(local, buildingKm * buildingKm);
    const mp = this.marks.geometry.getAttribute('position') as THREE.BufferAttribute;
    const mc = this.marks.geometry.getAttribute('color') as THREE.BufferAttribute;
    let c = 0;
    for (let k = limit; k < n; k++) {
      const i = order[k]!;
      mp.setXYZ(c, this.homes[i * 2]!, 0.005, this.homes[i * 2 + 1]!);
      mc.setXYZ(c, 0.4 + hash01(i, 13) * 0.6, 0.3 + hash01(i, 14) * 0.5, 0.2 + hash01(i, 15) * 0.6);
      c++;
    }
    mp.needsUpdate = true;
    mc.needsUpdate = true;
    this.marks.geometry.setDrawRange(0, c);
  }

  /** Hands each building to the full or the simple level by its distance from the camera. */
  private sortHouses(local: THREE.Vector3, lod2: number): void {
    const near = this.houses.instanceMatrix;
    const far = this.housesFar.instanceMatrix;
    let nearCount = 0;
    let farCount = 0;
    const src = this.houseMatrices;
    for (let i = 0; i < STRESS_BUILDINGS; i++) {
      const dx = src[i * 16 + 12]! - local.x;
      const dz = src[i * 16 + 14]! - local.z;
      const isNear = dx * dx + dz * dz + local.y * local.y <= lod2;
      const target = isNear ? near : far;
      const slot = isNear ? nearCount++ : farCount++;
      target.array.set(src.subarray(i * 16, i * 16 + 16), slot * 16);
    }
    near.needsUpdate = true;
    far.needsUpdate = true;
    this.houses.count = nearCount;
    this.housesFar.count = farCount;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose();
    });
  }
}

function mergeHouse(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const ga = a.toNonIndexed();
  const gb = b.toNonIndexed();
  const pos = new Float32Array([
    ...(ga.getAttribute('position').array as Float32Array),
    ...(gb.getAttribute('position').array as Float32Array),
  ]);
  const nor = new Float32Array([
    ...(ga.getAttribute('normal').array as Float32Array),
    ...(gb.getAttribute('normal').array as Float32Array),
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

export const ANIMATION_NAMES = ANIMATIONS;
