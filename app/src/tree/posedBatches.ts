// Many posed copies of a few clay models, drawn as one instanced mesh per model (spec
// humankind.md, section 8): each model's parts are merged into one geometry whose
// vertices name their part, and a texture holds every copy's part matrices, a row per
// copy, as the wildlife layer draws its animals (wildlife.md section 5). Two draw calls
// a model, the clay and its ink, however many copies stand on the globe.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lightUniforms, posedMaterials, type Model } from '../../../assets/src/kit.ts';

interface Batch {
  template: Model;
  /** For a model that is never posed: each part's matrix at rest, or undefined where hidden. */
  rest?: (THREE.Matrix4 | undefined)[];
  /** The parts in the posed template, whose world matrices are the parts' poses. */
  parts: THREE.Mesh[];
  geometry: THREE.BufferGeometry;
  cel: THREE.InstancedMesh;
  ink: THREE.InstancedMesh;
  poses: Float32Array;
  poseTex: THREE.DataTexture;
  capacity: number;
  count: number;
}

/** Copies a batch holds before it grows, and the matrix that hides a part. */
const FIRST_CAPACITY = 16;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class PosedBatches {
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private part = new THREE.Matrix4();

  /** Starts a frame: every batch is empty until its copies are added. */
  begin(): void {
    for (const b of this.batches.values()) b.count = 0;
  }

  /**
   * Adds a copy of the model `key` (built once by `build`) placed by `root` and posed by
   * `pose`, which sets the template's bones; a part whose bone chain is hidden is hidden.
   * Without `pose` the model stands as built, and its parts' matrices are worked out once
   * (huts, racks and props: most copies of a camp).
   */
  add(key: string, build: () => Model, root: THREE.Matrix4, pose?: (m: Model) => void): void {
    let b = this.batches.get(key);
    if (!b) {
      b = this.make(build());
      this.batches.set(key, b);
    }
    if (b.count === b.capacity) this.grow(b);
    const row = b.count * b.parts.length * 16;
    if (!pose) {
      if (!b.rest) {
        b.template.object.updateMatrixWorld(true);
        b.rest = b.parts.map((p) =>
          shown(p, b!.template.object) ? p.matrixWorld.clone() : undefined,
        );
      }
      b.rest.forEach((m, k) => {
        if (m) this.part.multiplyMatrices(root, m);
        else this.part.copy(HIDDEN);
        this.part.toArray(b!.poses, row + k * 16);
      });
      b.count++;
      return;
    }
    pose(b.template);
    b.template.object.updateMatrixWorld(true);
    b.parts.forEach((p, k) => {
      if (shown(p, b.template.object)) this.part.multiplyMatrices(root, p.matrixWorld);
      else this.part.copy(HIDDEN);
      this.part.toArray(b.poses, row + k * 16);
    });
    b.count++;
  }

  /**
   * Fades every copy of a model in the screen-door way, 1 drawn in full: for a model with a
   * single copy in the world, such as a scene's cave or grave (humankind.md section 8.2).
   */
  fade(key: string, value: number): void {
    const b = this.batches.get(key);
    if (!b) return;
    // Its own fade, not the one every model shares.
    const u = (b.cel.material as THREE.ShaderMaterial).uniforms;
    if (u.fade === lightUniforms.fade) u.fade = { value };
    else u.fade!.value = value;
  }

  /** Ends a frame: draws as many copies as were added. */
  end(): void {
    for (const b of this.batches.values()) {
      for (const m of [b.cel, b.ink]) {
        m.count = b.count;
        m.visible = b.count > 0;
      }
      if (b.count > 0) b.poseTex.needsUpdate = true;
    }
  }

  private make(template: Model): Batch {
    template.object.updateMatrixWorld(true);
    const parts: THREE.Mesh[] = [];
    template.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      // Ink hulls are children of their coloured mesh and share its geometry.
      if (!mesh.isMesh || (mesh.parent as THREE.Mesh).isMesh) return;
      parts.push(mesh);
    });
    const geometry = mergeGeometries(
      parts.map((mesh, k) => {
        const g = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'color'])
          g.setAttribute(name, mesh.geometry.getAttribute(name));
        const n = mesh.geometry.getAttribute('position').count;
        g.setAttribute('part', new THREE.BufferAttribute(new Float32Array(n).fill(k), 1));
        return g;
      }),
    )!;
    const b = { template, parts, geometry, capacity: 0, count: 0 } as Batch;
    this.alloc(b, FIRST_CAPACITY);
    return b;
  }

  /** Twice the room, keeping the copies already added this frame. */
  private grow(b: Batch): void {
    const old = b.poses;
    for (const m of [b.cel, b.ink]) {
      this.group.remove(m);
      m.dispose();
    }
    b.poseTex.dispose();
    this.alloc(b, b.capacity * 2);
    b.poses.set(old);
  }

  private alloc(b: Batch, capacity: number): void {
    b.capacity = capacity;
    b.poses = new Float32Array(capacity * b.parts.length * 16);
    b.poseTex = new THREE.DataTexture(
      b.poses,
      b.parts.length * 4,
      capacity,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    const materials = posedMaterials(b.poseTex);
    const mesh = (material: THREE.Material) => {
      const m = new THREE.InstancedMesh(b.geometry, material, capacity);
      m.count = 0;
      m.visible = false;
      // The copies are spread over the globe; the camera sees what the layer keeps.
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    b.cel = mesh(materials.cel);
    b.ink = mesh(materials.ink);
  }
}

/** Whether a part and every bone above it are shown. */
function shown(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent)
    if (!p.visible) return false;
  return true;
}
