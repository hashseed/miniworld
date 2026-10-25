// The tilled ground of the fields around a village (spec neolithic/fields-and-crops.md section 4): a
// patch per field, triangulated from its outline, draped on the drawn terrain, with furrow stripes and
// the colour of the crop's stage painted in the fragment shader. Same technique as campGround.ts.

import * as THREE from 'three';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import { LAYOUT_KM_PER_M } from '../world/treeScene.ts';
import { detCos, detSin } from '../core/detmath.ts';
import type { Field, Pt } from '../world/fieldShapes.ts';
import type { SurfaceSource } from './surface.ts';

/** Rings of the patch as shares of the outline's radius; the last is the outline itself. */
const RINGS = [0.2, 0.4, 0.6, 0.8, 1];
/** The patch floats this far over the ground, in km: just enough to clear the drawn terrain. */
const LIFT_KM = 4;
/** Whole stage steps the ground colour is rewritten at (stage times this, rounded). */
const STAGE_STEPS = 48;

/** Colours of a crop's leaves in the green stage and of its ripe field, as hex. */
export const CROP_COLOURS: Record<string, [number, number]> = {
  emmer: [0x6fa83a, 0xd9b04a],
  einkorn: [0x78ad3c, 0xd2a845],
  barley: [0x76b33f, 0xe0c060],
  millet: [0x6aa83a, 0xc99a3c],
  rice: [0x5fb34a, 0xd6bd4e],
  maize: [0x4f9c35, 0xd8b23c],
  squash: [0x4c9a3a, 0xd9852c],
  potato: [0x3f8a3f, 0xb7a640],
  quinoa: [0x6aa545, 0xc4544a],
  taro: [0x2f8a45, 0x3a9a4c],
  banana: [0x58a838, 0x8cb840],
  flax: [0x7aa84a, 0xc9b469],
  lentil: [0x72a63e, 0xb89a48],
};
const FALLBACK: [number, number] = [0x6fa83a, 0xd9b04a];

interface Patch {
  position: Float32Array;
  local: Float32Array;
  rim: Float32Array;
  alpha: Float32Array;
}

interface Entry {
  key: string;
  patch: Patch;
  stage: number;
  water: number;
  crop: string;
  vertexCount: number;
  origin: THREE.Vector3;
  village: Pt;
  field: Field;
}

export class FieldGround {
  readonly mesh: THREE.Mesh;
  private patches = new Map<string, Patch>();
  private entries: Entry[] = [];
  private version = -1;
  private built = '';
  private n = new THREE.Vector3();
  private e = new THREE.Vector3();
  private p = new THREE.Vector3();
  private d = new THREE.Vector3();
  private surface: SurfaceSource;

  constructor(surface: SurfaceSource) {
    this.surface = surface;
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec2 local;
        attribute float rim;
        attribute float alpha;
        attribute float stage;
        attribute float water;
        attribute vec3 greenColour;
        attribute vec3 ripeColour;
        varying vec2 vLocal;
        varying float vRim;
        varying float vAlpha;
        varying float vStage;
        varying float vWater;
        varying vec3 vGreen;
        varying vec3 vRipe;
        void main() {
          vLocal = local;
          vRim = rim;
          vAlpha = alpha;
          vStage = stage;
          vWater = water;
          vGreen = greenColour;
          vRipe = ripeColour;
          // Drawn at its own size from every altitude (issue: fields grew when zoomed out).
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        varying vec2 vLocal;
        varying float vRim;
        varying float vAlpha;
        varying float vStage;
        varying float vWater;
        varying vec3 vGreen;
        varying vec3 vRipe;
        void main() {
          #include <logdepthbuf_fragment>
          // Furrows: one band per 0.07 layout metres across the furrow frame, softened before they shimmer.
          float band = vLocal.x / 0.07;
          float width = max(fwidth(band), 0.001);
          float ridge = 0.5 + 0.5 * cos(6.2831853 * band);
          float crisp = 1.0 - smoothstep(0.25, 0.9, width);
          ridge = mix(0.5, ridge, crisp);
          vec3 soil = mix(vec3(0.42, 0.28, 0.16), vec3(0.66, 0.48, 0.28), ridge);
          vec3 water = mix(vec3(0.36, 0.52, 0.6), vec3(0.5, 0.68, 0.72), ridge);
          vec3 base = mix(soil, water, vWater);
          // Crop colour by stage: bare, sprout, green, ripe, stubble.
          float s = vStage;
          vec3 straw = vec3(0.78, 0.68, 0.4);
          vec3 sprout = mix(vec3(0.62, 0.78, 0.36), vGreen, 0.35);
          vec3 crop = s < 0.25 ? sprout
            : s < 0.5 ? mix(sprout, vGreen, (s - 0.25) * 4.0)
            : s < 0.75 ? mix(vGreen, vRipe, (s - 0.5) * 4.0)
            : s < 0.95 ? vRipe
            : straw;
          float cover = s > 0.95 ? 0.55 : min(1.0, s * 4.0) * (0.35 + 0.6 * smoothstep(0.2, 0.5, s));
          // The rows show as stripes in young crops and fill in as it grows.
          float rows = mix(ridge, 1.0, smoothstep(0.3, 0.7, s));
          vec3 colour = mix(base, crop * (0.85 + 0.2 * ridge), cover * rows);
          // No hard boundary (Yang, 2026-10-24): the tilled earth thins out into the ground over the
          // outer metre or two, ragged where a plough and a hoe would stop.
          float n = 0.5 + 0.25 * sin(vLocal.x * 1.9 + vLocal.y * 0.7) * cos(vLocal.y * 2.3 - vLocal.x * 0.6)
            + 0.25 * sin(vLocal.x * 5.1 - vLocal.y * 4.3);
          float edge = smoothstep(0.0, 1.5, vRim + 0.9 * (n - 0.5));
          gl_FragColor = vec4(colour, vAlpha * edge * edge * 0.95);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  /** Starts a frame's list of fields. */
  begin(): void {
    this.entries.length = 0;
  }

  /**
   * Adds a field of a village. `origin` is where the village's centre is drawn (a position on the
   * globe), `village` its centre in the layout space of the field's outline (the `centre` given to
   * layoutFields). `stage` is the crop's stage from fieldStage (fieldWork.ts); a flooded rice paddy
   * shows water.
   */
  add(origin: THREE.Vector3, field: Field, stage: number, village: Pt): void {
    const key = `${Math.round(origin.x)},${Math.round(origin.y)},${Math.round(origin.z)}|${field.id}|${field.outline.length}|${field.centre.x.toFixed(3)},${field.centre.z.toFixed(3)}|${field.furrowAngle.toFixed(3)}`;
    let patch = this.patches.get(key);
    if (!patch) {
      if (this.patches.size > 4_000) this.patches.clear();
      patch = this.build(origin, field, village);
      this.patches.set(key, patch);
    }
    const q = Math.round(Math.min(1, Math.max(0, stage)) * STAGE_STEPS) / STAGE_STEPS;
    this.entries.push({
      key,
      patch,
      stage: q,
      water: field.crop === 'rice' && q < 0.99 ? 1 : 0,
      crop: field.crop,
      vertexCount: patch.rim.length,
      origin: origin.clone(),
      village,
      field,
    });
  }

  /** Builds the mesh if the list or any stage changed. */
  end(_cameraKm: number, groundVersion: number): void {
    this.mesh.visible = this.entries.length > 0;
    if (!this.mesh.visible) return;
    if (groundVersion !== this.version) {
      // The ground changed: every patch is lifted again.
      this.patches.clear();
      this.version = groundVersion;
      this.built = '';
      for (const x of this.entries) {
        x.patch = this.build(x.origin, x.field, x.village);
        this.patches.set(x.key, x.patch);
      }
    }
    const signature = this.entries.map((x) => `${x.key}#${x.stage}#${x.water}`).join(';');
    if (signature === this.built) return;
    this.built = signature;
    this.assemble();
  }

  private assemble(): void {
    let total = 0;
    for (const x of this.entries) total += x.vertexCount;
    const position = new Float32Array(total * 3);
    const local = new Float32Array(total * 2);
    const rim = new Float32Array(total);
    const alpha = new Float32Array(total);
    const stage = new Float32Array(total);
    const water = new Float32Array(total);
    const green = new Float32Array(total * 3);
    const ripe = new Float32Array(total * 3);
    const index: number[] = [];
    const colour = new THREE.Color();
    let at = 0;
    for (const x of this.entries) {
      const count = x.vertexCount;
      position.set(x.patch.position, at * 3);
      local.set(x.patch.local, at * 2);
      rim.set(x.patch.rim, at);
      alpha.set(x.patch.alpha, at);
      stage.fill(x.stage, at, at + count);
      water.fill(x.water, at, at + count);
      const [g, r] = CROP_COLOURS[x.crop] ?? FALLBACK;
      colour.setHex(g);
      for (let i = 0; i < count; i++) green.set([colour.r, colour.g, colour.b], (at + i) * 3);
      colour.setHex(r);
      for (let i = 0; i < count; i++) ripe.set([colour.r, colour.g, colour.b], (at + i) * 3);
      // Vertex 0 is the centre, then RINGS.length rings of `ring` outline points each.
      const ring = (count - 1) / RINGS.length;
      for (let s = 0; s < ring; s++) {
        const t = (s + 1) % ring;
        index.push(at, at + 1 + s, at + 1 + t);
        for (let k = 0; k < RINGS.length - 1; k++) {
          const a = at + 1 + k * ring;
          const b = a + ring;
          index.push(a + s, b + s, b + t, a + s, b + t, a + t);
        }
      }
      at += count;
    }
    const geometry = this.mesh.geometry;
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('local', new THREE.BufferAttribute(local, 2));
    geometry.setAttribute('rim', new THREE.BufferAttribute(rim, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    geometry.setAttribute('stage', new THREE.BufferAttribute(stage, 1));
    geometry.setAttribute('water', new THREE.BufferAttribute(water, 1));
    geometry.setAttribute('greenColour', new THREE.BufferAttribute(green, 3));
    geometry.setAttribute('ripeColour', new THREE.BufferAttribute(ripe, 3));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
  }

  private build(origin: THREE.Vector3, field: Field, village: Pt): Patch {
    const outline = field.outline;
    const ring = outline.length;
    const count = 1 + RINGS.length * ring;
    const position = new Float32Array(count * 3);
    const local = new Float32Array(count * 2);
    const rim = new Float32Array(count);
    const alpha = new Float32Array(count);
    const sea = this.surface.seaKm?.() ?? -Infinity;
    const dir = this.d.copy(origin).normalize();
    northEast(dir, this.n, this.e);
    // The furrow frame: u across the furrows, v along them.
    const fc = detCos(field.furrowAngle);
    const fs = detSin(field.furrowAngle);
    let v = 0;
    const put = (x: number, z: number, rimM: number) => {
      this.p
        .copy(dir)
        .addScaledVector(this.e, ((x - village.x) * LAYOUT_KM_PER_M) / EARTH_RADIUS_KM)
        .addScaledVector(this.n, ((z - village.z) * LAYOUT_KM_PER_M) / EARTH_RADIUS_KM)
        .normalize();
      const ground = this.surface.surfaceKm([this.p.x, this.p.y, this.p.z]);
      this.p.multiplyScalar(EARTH_RADIUS_KM + ground + LIFT_KM);
      position.set([this.p.x, this.p.y, this.p.z], v * 3);
      const dx = x - field.centre.x;
      const dz = z - field.centre.z;
      local[v * 2] = -dx * fs + dz * fc;
      local[v * 2 + 1] = dx * fc + dz * fs;
      rim[v] = rimM;
      alpha[v] = ground > sea + 0.05 ? 1 : 0;
      v++;
    };
    let mean = 0;
    for (const p of outline) mean += Math.hypot(p.x - field.centre.x, p.z - field.centre.z);
    mean /= ring;
    put(field.centre.x, field.centre.z, mean);
    for (const share of RINGS) {
      for (const p of outline) {
        const x = field.centre.x + (p.x - field.centre.x) * share;
        const z = field.centre.z + (p.z - field.centre.z) * share;
        put(x, z, (1 - share) * Math.hypot(p.x - field.centre.x, p.z - field.centre.z));
      }
    }
    return { position, local, rim, alpha };
  }
}
