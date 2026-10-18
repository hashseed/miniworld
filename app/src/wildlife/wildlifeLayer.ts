// Draws the wildlife (spec wildlife.md, section 5): every species is a set of
// instanced meshes, one per moving part of its model with its ink outline.
// Each frame one copy of the model is posed per animal with the animal clips
// and its part matrices are copied into the instances. It only draws; where
// the animals are and what they do comes from world/wildlife.ts.

import * as THREE from 'three';
import { drawable } from '../content/assets.ts';
import { ANIMALS, buildAnimal, type AnimalId } from '../../../assets/src/animals.ts';
import { animateAnimal } from '../../../assets/src/clips.ts';
import { celMaterial, inkMaterial, type Model } from '../../../assets/src/kit.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import { latLonToDir, type Vec3 } from '../geo/cube.ts';
import { wildClearings, wildlifeAt, type WildAnimal } from '../world/wildlife.ts';
import type { SurfaceSource } from '../vignettes/vignetteLayer.ts';

/** Drawn kilometres per life-size metre, as for the figures (milestone 2, section 5.1). */
const KM_PER_M = 50;
/** An animal's size (the larger of its height and half its length) is drawn between these, in metres (section 1). */
const MIN_SIZE_M = 1.8;
const MAX_SIZE_M = 4;
/** Lean towards the top of the screen when seen from above, as for figures. */
const MAX_LEAN = 1.15;
/** Most animals of one species drawn at once. */
const CAPACITY = 12;

interface Part {
  /** The part in the posed template, whose world matrix is the part's pose. */
  source: THREE.Mesh;
  cel: THREE.InstancedMesh;
  ink: THREE.InstancedMesh;
}

interface Species {
  template: Model;
  parts: Part[];
  /** Drawn km per model metre. */
  scale: number;
  /** Body length in model metres, for spacing the group. */
  length: number;
  count: number;
}

export class WildlifeLayer {
  readonly group = new THREE.Group();
  private surface: SurfaceSource;
  private species = new Map<string, Species | null>();
  /** Animals drawn last frame. */
  count = 0;
  private root = new THREE.Matrix4();
  private part = new THREE.Matrix4();
  private basis = new THREE.Matrix4();
  private up = new THREE.Vector3();
  private north = new THREE.Vector3();
  private east = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private leanQ = new THREE.Quaternion();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private scaleV = new THREE.Vector3();

  constructor(surface: SurfaceSource) {
    this.surface = surface;
  }

  /** Clearings in the trees around the groups shown on a day, in true directions. */
  clearings(day: number): { dir: Vec3; km: number }[] {
    return wildClearings(day).map((c) => ({ dir: latLonToDir(c.lat, c.lon), km: c.km }));
  }

  /** The true direction of an animal's spot: km east and north of its group's home. */
  private trueDir(a: WildAnimal): Vec3 {
    const home = latLonToDir(a.lat, a.lon);
    const up = this.up.set(...home);
    northEast(up, this.north, this.east);
    up.multiplyScalar(EARTH_RADIUS_KM)
      .addScaledVector(this.east, a.eastKm)
      .addScaledVector(this.north, a.northKm)
      .normalize();
    return [up.x, up.y, up.z];
  }

  /** Poses the animals of a day at a clock time in milliseconds. */
  update(camera: THREE.Camera, day: number, ms: number): void {
    for (const s of this.species.values()) if (s) s.count = 0;
    const camPos = camera.position;
    const screenUp = this.v1.setFromMatrixColumn(camera.matrixWorld, 1);
    this.count = 0;
    for (const a of wildlifeAt(day, ms / 1000)) {
      const s = this.speciesOf(a.model);
      if (!s || s.count >= CAPACITY) continue;
      // The group's spot on the drawn globe and its compass there.
      const up = this.up.set(...this.surface.toDrawn(this.trueDir(a))).normalize();
      northEast(up, this.north, this.east);
      // Formation offset, in drawn km, so the group keeps its drawn spacing.
      const reach = s.length * s.scale;
      const ox = a.offset[0] * reach;
      const oy = a.offset[1] * reach;
      if (ox !== 0 || oy !== 0) {
        up.multiplyScalar(EARTH_RADIUS_KM)
          .addScaledVector(this.east, ox)
          .addScaledVector(this.north, oy)
          .normalize();
        northEast(up, this.north, this.east);
      }
      const ground = this.surface.surfaceKm([up.x, up.y, up.z]);
      this.pos.copy(up).multiplyScalar(EARTH_RADIUS_KM + ground + a.liftKm);
      // Animals on the far side of the globe are skipped.
      if (this.v2.copy(camPos).sub(this.pos).dot(up) <= 0) continue;

      const f = this.forward
        .copy(this.east)
        .multiplyScalar(a.heading[0])
        .addScaledVector(this.north, a.heading[1])
        .normalize();
      const r = this.right.crossVectors(up, f);
      this.q.setFromRotationMatrix(this.basis.makeBasis(r, up, f));
      if (a.liftKm === 0) {
        const steep = Math.max(0, this.v2.normalize().dot(up));
        this.leanAt(up, screenUp, MAX_LEAN * steep);
        this.q.premultiply(this.leanQ);
      }
      const size = s.scale * a.grow;
      this.root.compose(this.pos, this.q, this.scaleV.set(size, size, size));

      animateAnimal(s.template, a.clip, a.seconds);
      s.template.object.updateMatrixWorld(true);
      for (const p of s.parts) {
        this.part.multiplyMatrices(this.root, p.source.matrixWorld);
        p.cel.setMatrixAt(s.count, this.part);
        p.ink.setMatrixAt(s.count, this.part);
      }
      s.count++;
      this.count++;
    }
    for (const s of this.species.values()) {
      if (!s) continue;
      for (const p of s.parts)
        for (const m of [p.cel, p.ink]) {
          m.count = s.count;
          m.visible = s.count > 0;
          m.instanceMatrix.needsUpdate = true;
        }
    }
  }

  /** Sets leanQ: the turn that tips "up" towards the top of the screen. */
  private leanAt(up: THREE.Vector3, screenUp: THREE.Vector3, lean: number): void {
    this.leanQ.identity();
    if (lean <= 0) return;
    const to = this.v2.copy(screenUp).addScaledVector(up, -screenUp.dot(up));
    if (to.lengthSq() < 1e-8) return;
    to.normalize();
    const tipped = to.multiplyScalar(Math.sin(lean)).addScaledVector(up, Math.cos(lean));
    this.leanQ.setFromUnitVectors(up, tipped);
  }

  /** The instanced meshes of a species, built the first time it is seen; null without an approved model. */
  private speciesOf(model: string): Species | null {
    let s = this.species.get(model);
    if (s !== undefined) return s;
    s = null;
    if ((ANIMALS as readonly string[]).includes(model) && drawable.has(model)) {
      const template = buildAnimal(model as AnimalId);
      template.object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(template.object);
      const sizeM = Math.max(box.max.y - box.min.y, (box.max.z - box.min.z) / 2);
      const drawnM = Math.min(MAX_SIZE_M, Math.max(MIN_SIZE_M, sizeM));
      const parts: Part[] = [];
      template.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        // Ink hulls are children of their coloured mesh and share its geometry.
        if (!mesh.isMesh || (mesh.parent as THREE.Mesh).isMesh) return;
        const make = (material: THREE.Material) => {
          const m = new THREE.InstancedMesh(mesh.geometry, material, CAPACITY);
          m.count = 0;
          m.visible = false;
          m.frustumCulled = false;
          this.group.add(m);
          return m;
        };
        parts.push({ source: mesh, cel: make(celMaterial()), ink: make(inkMaterial()) });
      });
      s = {
        template,
        parts,
        scale: (KM_PER_M * drawnM) / sizeM,
        length: box.max.z - box.min.z,
        count: 0,
      };
    }
    this.species.set(model, s);
    return s;
  }
}
