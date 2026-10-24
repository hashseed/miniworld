// Many copies of a few models, people or animals, playing baked clips (spec milestone 2,
// section 5.3; wildlife.md section 5):
// each model's parts are merged into one geometry whose vertices name their part, as in
// posedBatches.ts, but instead of posing every copy on the CPU each frame, every clip a
// model plays is baked once, the first time it is needed, into a texture of the parts'
// matrices, a row per frame. Per copy the CPU writes only where it stands and which two
// frames of which clips it is between; the vertex shader does the rest. Two draw calls a
// model, the clay and its ink, however many copies stand on the globe.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PERSON_LOOPS, animatePerson, type Clip } from '../../../assets/src/clips.ts';

/** Poses a model for a clip at a time, as animatePerson and animateAnimal do. */
export type Animate = (m: Model, clip: Clip, seconds: number) => void;
/** How a model's clip repeats: a loop, or a one-off that then holds still. */
export type LoopOf = (m: Model, clip: Clip) => { loop: number } | { once: number } | undefined;
import { clipMaterials, type Model } from '../../../assets/src/kit.ts';

/** Colourings of one model a batch can hold (skin, hair and hide colours repeat after this many). */
export const LOOKS_PER_MODEL = 12;
/** Texels in a row of a look texture (the shader reads it with the same 2048). */
const LOOK_ROW = 2048;

/** Frames baked per second of a clip; the shader blends between neighbouring frames. */
export const CLIP_FPS = 30;

/** What a copy plays: a clip at a time, maybe blending in from another, and a part it hides. */
export interface ClipCopy {
  clip: Clip;
  seconds: number;
  /** The clip it is leaving, and how far (0 to 1) it has blended into `clip`. */
  from?: { clip: Clip; seconds: number; weight: number };
  /** A bone whose part the copy hides (an unarmed figure's tool). */
  hide?: string;
}

/** Where a clip's frames lie in a batch's clip texture. */
interface Span {
  start: number;
  frames: number;
  /** Seconds of the loop, or of a one-off gesture before it holds still. */
  seconds: number;
  loop: boolean;
}

interface Batch {
  template: Model;
  parts: THREE.Mesh[];
  /** The part of each bone that a copy may hide. */
  partOf: Map<string, number>;
  geometry: THREE.BufferGeometry;
  cel: THREE.InstancedMesh;
  ink: THREE.InstancedMesh;
  capacity: number;
  count: number;
  roots: THREE.InstancedBufferAttribute;
  from: THREE.InstancedBufferAttribute;
  to: THREE.InstancedBufferAttribute;
  spans: Map<Clip, Span>;
  rows: number;
  clipData: Float32Array;
  clipTex: THREE.DataTexture;
  /** For a model drawn in several looks: one colour per vertex and look, in a texture. */
  looks?: { verts: number; data: Float32Array; tex: THREE.DataTexture; have: Set<number> };
  lookAttr?: THREE.InstancedBufferAttribute;
  materials: { cel: THREE.ShaderMaterial; ink: THREE.ShaderMaterial };
}

const FIRST_CAPACITY = 16;
const FIRST_ROWS = 256;

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export class ClipBatches {
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();

  /** Starts a frame: every batch is empty until its copies are added. */
  begin(): void {
    for (const b of this.batches.values()) b.count = 0;
  }

  /**
   * People by default; animals with animateAnimal and animalLoop. A clip with no loop is
   * baked as a still pose.
   */
  private animate: Animate;
  private loopOf: LoopOf;
  constructor(animate: Animate = animatePerson, loopOf: LoopOf = (_m, clip) => PERSON_LOOPS[clip]) {
    this.animate = animate;
    this.loopOf = loopOf;
  }

  /**
   * Adds a copy of the model `key` (built by `build`) standing at `root`. A model with
   * several colourings gives `look`, and `build(look)` builds the one coloured that way: the
   * looks must share their geometry, and all copies of the model are one draw call.
   */
  add(
    key: string,
    build: (look: number) => Model,
    root: THREE.Matrix4,
    copy: ClipCopy,
    look?: number,
  ): void {
    let b = this.batches.get(key);
    if (!b) {
      b = this.make(build(look ?? 0), look !== undefined);
      this.batches.set(key, b);
    }
    if (look !== undefined) this.addLook(b, build, look);
    if (b.count === b.capacity) this.grow(b);
    const i = b.count++;
    if (b.lookAttr) b.lookAttr.array[i] = look ?? 0;
    root.toArray(b.roots.array, i * 16);
    const to = this.frame(b, copy.clip, copy.seconds);
    const hide = copy.hide === undefined ? -1 : (b.partOf.get(copy.hide) ?? -1);
    const from = b.from.array as Float32Array;
    const into = b.to.array as Float32Array;
    if (copy.from) {
      // The shader blends from the old clip's frames (clipFrom) into the new (clipTo).
      const old = this.frame(b, copy.from.clip, copy.from.seconds);
      from.set([old[0], old[1], old[2], Math.max(1e-6, smooth(copy.from.weight))], i * 4);
      into.set([to[0], to[1], to[2], hide], i * 4);
    } else {
      from.set([to[0], to[1], to[2], 0], i * 4);
      into.set([to[0], to[1], to[2], hide], i * 4);
    }
  }

  /** Ends a frame: draws as many copies as were added. */
  end(): void {
    for (const b of this.batches.values()) {
      for (const m of [b.cel, b.ink]) {
        m.count = b.count;
        m.visible = b.count > 0;
      }
      if (b.count === 0) continue;
      for (const a of b.lookAttr ? [b.roots, b.from, b.to, b.lookAttr] : [b.roots, b.from, b.to]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, b.count * a.itemSize);
        a.needsUpdate = true;
      }
    }
  }

  /** The two baked frames a clip's time lies between, as rows, and how far between. */
  private frame(b: Batch, clip: Clip, seconds: number): [number, number, number] {
    const s = b.spans.get(clip) ?? this.bake(b, clip);
    if (s.frames === 1) return [s.start, s.start, 0];
    if (s.loop) {
      // Frame k shows the middle of its slice of the loop.
      const u = ((seconds % s.seconds) + s.seconds) % s.seconds;
      const x = (u / s.seconds) * s.frames - 0.5;
      const k = Math.floor(x);
      const a = (k + s.frames) % s.frames;
      return [s.start + a, s.start + ((a + 1) % s.frames), x - k];
    }
    const x = Math.min(s.frames - 1, Math.max(0, (seconds / s.seconds) * (s.frames - 1)));
    const k = Math.min(s.frames - 2, Math.floor(x));
    return [s.start + k, s.start + k + 1, x - k];
  }

  /** Bakes a clip into the batch's clip texture (milestone 2, section 5.3). */
  private bake(b: Batch, clip: Clip): Span {
    const how = this.loopOf(b.template, clip) ?? { once: 0 };
    const loop = 'loop' in how;
    const seconds = loop ? how.loop : how.once;
    const frames = Math.max(1, Math.round(seconds * CLIP_FPS) + (loop ? 0 : 1));
    const span: Span = { start: b.rows, frames, seconds, loop };
    this.room(b, b.rows + frames);
    const n = b.parts.length;
    for (let k = 0; k < frames; k++) {
      const t = loop
        ? ((k + 0.5) / frames) * seconds
        : frames > 1
          ? (k / (frames - 1)) * seconds
          : 0;
      this.animate(b.template, clip, t);
      b.template.object.updateMatrixWorld(true);
      const row = (span.start + k) * n * 16;
      b.parts.forEach((p, j) => {
        // A hidden part is an all-zero matrix, which the shader knows.
        if (shown(p, b.template.object)) p.matrixWorld.toArray(b.clipData, row + j * 16);
        else b.clipData.fill(0, row + j * 16, row + j * 16 + 16);
      });
    }
    b.rows += frames;
    b.clipTex.needsUpdate = true;
    b.spans.set(clip, span);
    return span;
  }

  /** Room in the clip texture for this many rows, doubling it as needed. */
  private room(b: Batch, rows: number): void {
    const have = b.clipData.length / (b.parts.length * 16);
    if (rows <= have) return;
    let size = have;
    while (size < rows) size *= 2;
    const data = new Float32Array(size * b.parts.length * 16);
    data.set(b.clipData);
    b.clipData = data;
    b.clipTex.dispose();
    b.clipTex = clipTexture(data, b.parts.length, size);
    b.materials.cel.uniforms.clipTex!.value = b.clipTex;
  }

  /** Writes a look's colours into the look texture, the first time a copy has it. */
  private addLook(b: Batch, build: (look: number) => Model, look: number): void {
    const l = b.looks!;
    if (l.have.has(look)) return;
    const colours = partColours(build(look));
    if (colours.length !== l.verts * 3)
      throw new Error(`look ${look} of a model has a different shape from look 0`);
    for (let v = 0; v < l.verts; v++) {
      const at = (look * l.verts + v) * 4;
      l.data.set([colours[v * 3]!, colours[v * 3 + 1]!, colours[v * 3 + 2]!, 1], at);
    }
    l.have.add(look);
    l.tex.needsUpdate = true;
  }

  private make(template: Model, looked = false): Batch {
    template.object.updateMatrixWorld(true);
    const parts: THREE.Mesh[] = [];
    template.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      // Ink hulls are children of their coloured mesh and share its geometry.
      if (!mesh.isMesh || (mesh.parent as THREE.Mesh).isMesh) return;
      parts.push(mesh);
    });
    const partOf = new Map<string, number>();
    for (const [name, bone] of template.bones) {
      const k = parts.findIndex((p) => isUnder(p, bone));
      if (k >= 0) partOf.set(name, k);
    }
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
    let looks: Batch['looks'];
    if (looked) {
      const verts = geometry.getAttribute('position').count;
      const rows = Math.ceil((verts * LOOKS_PER_MODEL) / LOOK_ROW);
      const data = new Float32Array(rows * LOOK_ROW * 4);
      const tex = new THREE.DataTexture(data, LOOK_ROW, rows, THREE.RGBAFormat, THREE.FloatType);
      looks = { verts, data, tex, have: new Set() };
      const first = partColours(template);
      for (let v = 0; v < verts; v++)
        data.set([first[v * 3]!, first[v * 3 + 1]!, first[v * 3 + 2]!, 1], v * 4);
      looks.have.add(0);
      tex.needsUpdate = true;
    }
    const clipData = new Float32Array(FIRST_ROWS * parts.length * 16);
    const clipTex = clipTexture(clipData, parts.length, FIRST_ROWS);
    const b = {
      template,
      parts,
      partOf,
      geometry,
      capacity: 0,
      count: 0,
      spans: new Map(),
      rows: 0,
      clipData,
      clipTex,
      // The clay and ink share their uniforms, so one clip texture serves both.
      ...(looks ? { looks } : {}),
      materials: clipMaterials(clipTex, looks),
    } as unknown as Batch;
    this.alloc(b, FIRST_CAPACITY);
    return b;
  }

  /** Twice the room, keeping the copies already added this frame. */
  private grow(b: Batch): void {
    const old = [b.roots.array, b.from.array, b.to.array];
    const oldLook = b.lookAttr?.array;
    for (const m of [b.cel, b.ink]) {
      this.group.remove(m);
      m.dispose();
    }
    this.alloc(b, b.capacity * 2);
    b.roots.array.set(old[0]!);
    b.from.array.set(old[1]!);
    b.to.array.set(old[2]!);
    if (oldLook) b.lookAttr!.array.set(oldLook);
  }

  private alloc(b: Batch, capacity: number): void {
    b.capacity = capacity;
    const attribute = (size: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    b.roots = attribute(16);
    b.from = attribute(4);
    b.to = attribute(4);
    b.geometry.setAttribute('clipFrom', b.from);
    b.geometry.setAttribute('clipTo', b.to);
    if (b.looks) {
      b.lookAttr = attribute(1);
      b.geometry.setAttribute('look', b.lookAttr);
    }
    const mesh = (material: THREE.Material) => {
      const m = new THREE.InstancedMesh(b.geometry, material, capacity);
      m.instanceMatrix = b.roots;
      m.count = 0;
      m.visible = false;
      // The copies are spread over the globe; the camera sees what the layer keeps.
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    b.cel = mesh(b.materials.cel);
    b.ink = mesh(b.materials.ink);
  }
}

/** The vertex colours of a model's parts, in the order its batch merges them. */
function partColours(template: Model): Float32Array {
  const out: number[] = [];
  template.object.updateMatrixWorld(true);
  template.object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh.parent as THREE.Mesh).isMesh) return;
    const c = mesh.geometry.getAttribute('color');
    for (let v = 0; v < c.count; v++) out.push(c.getX(v), c.getY(v), c.getZ(v));
  });
  return new Float32Array(out);
}

function clipTexture(data: Float32Array, parts: number, rows: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, parts * 4, rows, THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
}

/** Whether a part and every bone above it are shown. */
function shown(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent)
    if (!p.visible) return false;
  return true;
}

/** Whether an object hangs under another. */
function isUnder(o: THREE.Object3D, above: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === above) return true;
  return false;
}
