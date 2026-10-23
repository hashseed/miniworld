// The crops standing in the fields (spec neolithic/fields-and-crops.md section 1.2): tufts of the crop's
// model, one instanced mesh per crop and stage, coloured by vertex colours with no ink. The tufts of a
// field are placed once on a jittered grid inside its outline and kept; a frame only picks the stage's
// mesh and how many of the tufts to draw for the camera's altitude.

import * as THREE from 'three';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import { LAYOUT_KM_PER_M } from '../world/treeScene.ts';
import { detCos, detSin } from '../core/detmath.ts';
import { hash01 } from '../core/hash.ts';
import { drawable } from '../content/assets.ts';
import { celMaterial } from '../../../assets/src/kit.ts';
import { CROP_SPACING_M, STAGES, cropGeometry, type CropId } from '../../../assets/src/crops.ts';
import { pointInPolygon, type Field } from './fieldShapes.ts';
import type { SurfaceSource } from './surface.ts';

/** Most tufts of one field. */
const FIELD_TUFTS = 220;
/** Every tuft below the first altitude, every second below the next, and so on; none past the last (km). */
/** The ground patch floats this far over the ground (fieldGround.ts), so the tufts stand on it. */
const SOIL_LIFT_KM = 22;
/** Tufts are a little wider than their spacing, so the rows close up into a crop. */
const TUFT_FILL = 3;
/** A field's crop changes by one stage at most this often, in milliseconds of drawing. */
const STAGE_HOLD_MS = 700;
const THIN_KM = [1_500, 3_500, 6_000];

interface Placed {
  /** 16 floats per tuft: the matrix, column-major, at unit scale already applied. */
  matrices: Float32Array;
  count: number;
}

interface Entry {
  key: string;
  crop: CropId;
  stage: number;
  placed: Placed;
}

export class CropLayer {
  readonly group = new THREE.Group();
  /** The cel shading of the models' studio light, without the ink. */
  private material = celMaterial();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private placed = new Map<string, Placed>();
  private entries: Entry[] = [];
  /** The stage each field shows now and since when (performance.now), for the rate limit. */
  private held = new Map<string, { index: number; since: number }>();
  private built = '';
  private version = -1;
  private surface: SurfaceSource;
  private basis = new THREE.Matrix4();
  private m = new THREE.Matrix4();
  private d = new THREE.Vector3();
  private n = new THREE.Vector3();
  private e = new THREE.Vector3();
  private p = new THREE.Vector3();

  constructor(surface: SurfaceSource) {
    this.surface = surface;
    this.group.visible = false;
  }

  begin(): void {
    this.entries.length = 0;
  }

  /** Adds a field of the village drawn at `origin` (a position on the globe), as of this frame's stage. */
  add(origin: THREE.Vector3, field: Field, stage: number): void {
    const crop = field.crop as CropId;
    if (!CROP_SPACING_M[crop] || !drawable.has(`crop-${crop}`)) return;
    const key = `${Math.round(origin.x)},${Math.round(origin.y)},${Math.round(origin.z)}|${field.id}|${field.outline.length}|${field.centre.x.toFixed(3)},${field.centre.z.toFixed(3)}`;
    let placed = this.placed.get(key);
    if (!placed) {
      if (this.placed.size > 2_000) this.placed.clear();
      placed = this.place(origin, field, crop);
      this.placed.set(key, placed);
    }
    // The nearest of the five named stages.
    let want = 0;
    STAGES.forEach((s, i) => {
      if (Math.abs(s - stage) < Math.abs(STAGES[want]! - stage)) want = i;
    });
    // A field changes by one stage at a time, at most one in STAGE_HOLD_MS of drawing, so a clock
    // running through years does not make the crop flicker (the first sight is as the date says).
    const now = performance.now();
    const held = this.held.get(key);
    let shown = want;
    if (held) {
      shown = held.index;
      if (want !== shown && now - held.since >= STAGE_HOLD_MS) {
        shown += Math.sign(want - shown);
        held.index = shown;
        held.since = now;
      }
    } else {
      if (this.held.size > 4_000) this.held.clear();
      this.held.set(key, { index: want, since: now });
    }
    this.entries.push({ key, crop, stage: STAGES[shown]!, placed });
  }

  end(cameraKm: number, groundVersion: number): void {
    const altitude = cameraKm - EARTH_RADIUS_KM;
    let step = 1;
    for (const limit of THIN_KM) {
      if (altitude < limit) break;
      step *= 2;
    }
    const none = altitude >= THIN_KM[THIN_KM.length - 1]! || this.entries.length === 0;
    if (none) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    if (groundVersion !== this.version) {
      this.version = groundVersion;
      this.placed.clear();
      this.built = '';
      this.entries = [];
      // The caller adds again next frame; rebuild now would need the origins, so just wait.
      return;
    }
    const signature = `${step}|${this.entries.map((x) => `${x.key}#${x.stage}`).join(';')}`;
    if (signature === this.built) return;
    this.built = signature;
    // Group the tufts by crop and stage.
    const groups = new Map<string, Entry[]>();
    for (const x of this.entries) {
      const k = `${x.crop}:${x.stage}`;
      const g = groups.get(k);
      if (g) g.push(x);
      else groups.set(k, [x]);
    }
    const grow = Math.sqrt(step);
    for (const [k, mesh] of this.meshes) if (!groups.has(k)) mesh.count = 0;
    for (const [k, list] of groups) {
      let total = 0;
      for (const x of list) total += Math.ceil(x.placed.count / step);
      let mesh = this.meshes.get(k);
      if (!mesh || mesh.instanceMatrix.count < total) {
        if (mesh) {
          this.group.remove(mesh);
          mesh.dispose();
        }
        mesh = new THREE.InstancedMesh(this.geometry(k), this.material, Math.max(64, total * 2));
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.meshes.set(k, mesh);
        this.group.add(mesh);
      }
      const out = mesh.instanceMatrix.array as Float32Array;
      let at = 0;
      for (const x of list)
        for (let i = 0; i < x.placed.count; i += step) {
          out.set(x.placed.matrices.subarray(i * 16, i * 16 + 16), at * 16);
          // Fewer tufts are drawn larger, so a thinned field still closes up into a crop.
          if (grow !== 1) for (let c = 0; c < 12; c++) out[at * 16 + c] = out[at * 16 + c]! * grow;
          at++;
        }
      mesh.count = at;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private geometry(k: string): THREE.BufferGeometry {
    let g = this.geometries.get(k);
    if (!g) {
      const [crop, stage] = k.split(':');
      g = cropGeometry(crop as CropId, Number(stage));
      this.geometries.set(k, g);
    }
    return g;
  }

  /** The tufts of a field on its jittered grid, lifted onto the drawn ground. */
  private place(origin: THREE.Vector3, field: Field, crop: CropId): Placed {
    const { outline, centre } = field;
    let spacing = CROP_SPACING_M[crop];
    spacing = Math.max(spacing, Math.sqrt(field.area / FIELD_TUFTS));
    const dir = this.d.copy(origin).normalize();
    northEast(dir, this.n, this.e);
    const north = this.n.clone();
    const east = this.e.clone();
    const up = dir.clone();
    const fc = detCos(field.furrowAngle);
    const fs = detSin(field.furrowAngle);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of outline) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const r = Math.hypot(maxX - minX, maxZ - minZ) / 2;
    const buffer: number[] = [];
    let index = 0;
    // Grid in the furrow frame (u across, v along), rows following the furrows.
    for (let u = -r; u <= r; u += spacing)
      for (let v = -r; v <= r; v += spacing) {
        index++;
        const ju = (hash01(field.id, index, 31) - 0.5) * 0.4 * spacing;
        const jv = (hash01(field.id, index, 32) - 0.5) * 0.4 * spacing;
        const uu = u + ju;
        const vv = v + jv;
        const x = centre.x + uu * -fs + vv * fc;
        const z = centre.z + uu * fc + vv * fs;
        if (!pointInPolygon(outline, x, z)) continue;
        this.p
          .copy(up)
          .addScaledVector(east, (x * LAYOUT_KM_PER_M) / EARTH_RADIUS_KM)
          .addScaledVector(north, (z * LAYOUT_KM_PER_M) / EARTH_RADIUS_KM)
          .normalize();
        const ground = this.surface.surfaceKm([this.p.x, this.p.y, this.p.z]);
        this.p.multiplyScalar(EARTH_RADIUS_KM + ground + SOIL_LIFT_KM);
        const turn = hash01(field.id, index, 33) * Math.PI * 2;
        const s = spacing * TUFT_FILL * LAYOUT_KM_PER_M;
        const upHere = this.p.clone().normalize();
        const e2 = new THREE.Vector3();
        const n2 = new THREE.Vector3();
        northEast(upHere, n2, e2);
        this.basis.makeBasis(e2, upHere, n2.negate());
        this.m.makeRotationY(turn);
        this.m.premultiply(this.basis);
        this.m.scale(new THREE.Vector3(s, s, s));
        this.m.setPosition(this.p);
        buffer.push(...this.m.elements);
      }
    return { matrices: new Float32Array(buffer), count: buffer.length / 16 };
  }
}
