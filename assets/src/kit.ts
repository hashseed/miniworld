// The modelling kit (spec milestone 2, section 13.1): rounded primitives with
// flat vertex colours, collected per bone and turned into a posable group.
// Models are authored at life size in metres in their rest pose, facing +Z
// with their feet on y = 0 (section 13.3).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { valueNoise3 } from '../../app/src/core/hash.ts';

export type Vec3 = [number, number, number];

/** A bone of a model: a pivot in model space and an optional parent. */
export interface BoneDef {
  name: string;
  pivot: Vec3;
  parent?: string;
}

const ROOT = 'root';

/** Collects coloured parts per bone and builds the model. */
export class ModelBuilder {
  private bones = new Map<string, BoneDef>([[ROOT, { name: ROOT, pivot: [0, 0, 0] }]]);
  private parts = new Map<string, THREE.BufferGeometry[]>();
  private seed = 0;
  private clay: number;

  /** `clay` sets how lumpy the surfaces are, as a share of each part's thickness. */
  constructor(bones: BoneDef[] = [], clay = 1) {
    this.clay = clay;
    for (const b of bones) this.bones.set(b.name, b);
  }

  /** Adds a part in model space to a bone, painted one flat colour. */
  add(geometry: THREE.BufferGeometry, colour: THREE.ColorRepresentation, bone = ROOT): this {
    if (!this.bones.has(bone)) throw new Error(`Unknown bone ${bone}`);
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    clayWobble(g, this.clay, this.seed++);
    const c = new THREE.Color(colour);
    const n = g.getAttribute('position').count;
    const colours = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colours.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const list = this.parts.get(bone) ?? [];
    list.push(g);
    this.parts.set(bone, list);
    return this;
  }

  /** Builds the model: one mesh per bone, each with an ink outline. */
  build(name: string): Model {
    const root = new THREE.Group();
    root.name = name;
    const nodes = new Map<string, THREE.Object3D>();
    const world = (b: BoneDef): THREE.Vector3 => new THREE.Vector3(...b.pivot);
    const node = (bname: string): THREE.Object3D => {
      const found = nodes.get(bname);
      if (found) return found;
      const def = this.bones.get(bname)!;
      const o = new THREE.Group();
      o.name = bname;
      const parentDef = def.parent ? this.bones.get(def.parent)! : undefined;
      const parent = def.parent ? node(def.parent) : root;
      o.position.copy(world(def)).sub(parentDef ? world(parentDef) : new THREE.Vector3());
      parent.add(o);
      o.userData.rest = o.position.clone();
      nodes.set(bname, o);
      return o;
    };
    let triangles = 0;
    for (const [bname, list] of this.parts) {
      const geometry = mergeGeometries(list)!;
      const p = this.bones.get(bname)!.pivot;
      geometry.translate(-p[0], -p[1], -p[2]);
      geometry.computeBoundingSphere();
      triangles += geometry.getAttribute('position').count / 3;
      const mesh = new THREE.Mesh(geometry, celMaterial());
      mesh.add(new THREE.Mesh(geometry, inkMaterial()));
      node(bname).add(mesh);
    }
    for (const bname of this.bones.keys()) node(bname);
    return { object: root, triangles, bones: nodes };
  }
}

export interface Model {
  object: THREE.Group;
  triangles: number;
  bones: Map<string, THREE.Object3D>;
}

/** Grey stone, shared by tools, hearths and walls. */
export const STONE = '#9a958c';

// --- Claymation: hand-pressed lumps (Yang, 2026-10-18: "lean into claymation"). ---

/**
 * Pushes vertices in and out along their normals by a smooth noise of their
 * position, so every part looks pressed by hand. The amplitude follows the
 * part's thinnest extent, so spear shafts stay straight and bodies go lumpy.
 * Vertices at the same position move the same way, so seams stay closed.
 */
function clayWobble(g: THREE.BufferGeometry, clay: number, seed: number): void {
  if (clay <= 0) return;
  g.computeBoundingBox();
  const size = g.boundingBox!.getSize(new THREE.Vector3());
  const thin = Math.min(size.x, size.y, size.z);
  const big = Math.max(size.x, size.y, size.z);
  const amp = Math.min(thin * 0.06, 0.04) * clay;
  if (amp < 1e-4) return;
  const freq = 3.2 / Math.max(thin, big * 0.35);
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const d =
      amp *
      (valueNoise3(x * freq, y * freq, z * freq, seed) +
        0.5 * valueNoise3(x * freq * 2.3, y * freq * 2.3, z * freq * 2.3, seed + 99));
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
  }
}

// --- Primitives. All return geometry in model space. ---

const up = new THREE.Vector3(0, 1, 0);

/** An ellipsoid: a low sphere scaled per axis, the kit's clay blob. */
export function blob(at: Vec3, radii: Vec3, segments = 7): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, segments, Math.max(3, Math.round(segments * 0.6)));
  g.scale(...radii);
  g.translate(...at);
  return g;
}

/** A tapered capsule from a to b with end radii ra and rb. */
export function limb(a: Vec3, b: Vec3, ra: number, rb = ra, segments = 5): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const pts: THREE.Vector2[] = [];
  const caps = 1;
  for (let i = 0; i <= caps; i++) {
    const t = (i / caps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(t) * ra, -Math.cos(t) * ra));
  }
  for (let i = 0; i <= caps; i++) {
    const t = (i / caps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(t) * rb, len + Math.sin(t) * rb));
  }
  const g = new THREE.LatheGeometry(pts, segments);
  orient(g, va, vb);
  return g;
}

/** A lathed shape around the y axis from (radius, height) pairs, then moved. */
export function lathe(
  profile: [number, number][],
  at: Vec3 = [0, 0, 0],
  segments = 8,
  scale: Vec3 = [1, 1, 1],
): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, h]) => new THREE.Vector2(r, h)),
    segments,
  );
  g.scale(...scale);
  g.translate(...at);
  return g;
}

/** A straight rod (pole, spear shaft, bone) from a to b. */
export function rod(a: Vec3, b: Vec3, r: number, segments = 4): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, va.distanceTo(vb), segments, 1, false);
  g.translate(0, va.distanceTo(vb) / 2, 0);
  orient(g, va, vb);
  return g;
}

/** A cone from a base centre to a tip. */
export function cone(
  base: Vec3,
  tip: Vec3,
  r: number,
  segments = 6,
  open = false,
): THREE.BufferGeometry {
  const va = new THREE.Vector3(...base);
  const vb = new THREE.Vector3(...tip);
  const h = va.distanceTo(vb);
  const g = new THREE.ConeGeometry(r, h, segments, 1, open);
  g.translate(0, h / 2, 0);
  orient(g, va, vb);
  return g;
}

/** A curved tusk or horn: a tapering tube along a quadratic curve. */
export function horn(
  a: Vec3,
  control: Vec3,
  b: Vec3,
  ra: number,
  rb: number,
  steps = 6,
  segments = 5,
) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(...a),
    new THREE.Vector3(...control),
    new THREE.Vector3(...b),
  );
  const g = new THREE.TubeGeometry(curve, steps, 1, segments, false);
  // Taper: scale each ring towards the curve by its position along it.
  const pos = g.getAttribute('position');
  const ring = segments + 1;
  const p = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const c = curve.getPoint(t);
    const r = ra + (rb - ra) * t;
    for (let j = 0; j < ring; j++) {
      const k = i * ring + j;
      p.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
  }
  return g;
}

/** A thin curved sheet (hide, bark, roof) given as a grid of points. */
export function sheet(rows: Vec3[][]): THREE.BufferGeometry {
  const h = rows.length;
  const w = rows[0]!.length;
  const pos: number[] = [];
  for (const r of rows) for (const p of r) pos.push(...p);
  const index: number[] = [];
  for (let i = 0; i < h - 1; i++) {
    for (let j = 0; j < w - 1; j++) {
      const a = i * w + j;
      const b = a + 1;
      const c = a + w;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
      index.push(a, b, c, b, d, c); // back face, so sheets read from both sides
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Mirrors a geometry across the x = 0 plane, for left and right parts. */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone();
  m.scale(-1, 1, 1);
  // Flip the winding so faces still point outwards.
  if (m.index) {
    const idx = m.index.array as unknown as number[];
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2]!, idx[i + 1]!];
    m.index.needsUpdate = true;
  } else {
    const pos = m.getAttribute('position');
    const nor = m.getAttribute('normal');
    for (let i = 0; i < pos.count; i += 3) {
      for (const attr of [pos, nor]) {
        if (!attr) continue;
        const x = attr.getX(i + 1),
          y = attr.getY(i + 1),
          z = attr.getZ(i + 1);
        attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
        attr.setXYZ(i + 2, x, y, z);
      }
    }
  }
  return m;
}

function orient(g: THREE.BufferGeometry, a: THREE.Vector3, b: THREE.Vector3): void {
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
}

// --- Materials: the globe's cel-shaded studio light and ink (milestone 1, section 3.6). ---

/** Shared by every model material; the sheet or app updates them per frame. */
export const lightUniforms = {
  lightDir: { value: new THREE.Vector3(-0.35, 0.5, 0.8).normalize() },
  screenUp: { value: new THREE.Vector3(0, 1, 0) },
  inkPixels: { value: 2.0 },
  clayScale: { value: 9.0 },
  viewport: { value: new THREE.Vector2(1280, 800) },
};

// The log-depth chunks match the globe's logarithmic depth buffer in the app;
// they are empty where the renderer has none, as in the review sheets.
const celVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vColour;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
void main() {
  vColour = color;
  vLocal = position;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;

const celFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 lightDir;
uniform vec3 screenUp;
uniform float clayScale;
varying vec3 vColour;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;

// Claymation: the globe's three light bands with softer edges, so forms read
// as pressed clay rather than flat paper.
float cel(float x) {
  return 0.5 * (smoothstep(0.24, 0.34, x) + smoothstep(0.57, 0.67, x));
}

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  if (!gl_FrontFacing) n = -n;
  // Thumb-pressed dents bend the normal a little; mottling varies the clay colour.
  vec3 q = vLocal * clayScale;
  vec3 dent = vec3(noise3(q), noise3(q + 17.3), noise3(q + 41.7)) - 0.5;
  n = normalize(n + dent * 0.35);
  float mottle = noise3(q * 2.7 + 5.0) * 0.6 + noise3(q * 7.1) * 0.4;
  vec3 albedo = vColour * (0.93 + 0.14 * mottle);
  float wrap = clamp((dot(n, lightDir) + 0.45) / 1.45, 0.0, 1.0);
  float fillT = dot(n, screenUp) * 0.5 + 0.5;
  vec3 fill = mix(vec3(0.42, 0.30, 0.24), vec3(0.30, 0.36, 0.48), fillT);
  vec3 c = albedo * (vec3(1.0, 0.96, 0.9) * (0.25 + 0.6 * cel(wrap)) + fill);
  float rim = smoothstep(0.62, 0.66, 1.0 - clamp(dot(n, viewDir), 0.0, 1.0)) * (1.0 - cel(wrap) * 0.7);
  c += vec3(1.0, 0.95, 0.92) * rim * 0.22;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

// Inverted hull: back faces pushed out along the normal by a fixed number of
// pixels, so the outline keeps its width at every zoom like the globe's ink.
const inkVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float inkPixels;
uniform vec2 viewport;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec3 nView = normalize(normalMatrix * normal);
  vec2 dir = normalize((projectionMatrix * vec4(nView, 0.0)).xy + 1e-6);
  clip.xy += dir * inkPixels * 2.0 / viewport * clip.w;
  gl_Position = clip;
  #include <logdepthbuf_vertex>
}
`;

const inkFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(vec3(0.23, 0.15, 0.11), 1.0);
  #include <colorspace_fragment>
}
`;

let cel: THREE.ShaderMaterial | undefined;
let ink: THREE.ShaderMaterial | undefined;

export function celMaterial(): THREE.ShaderMaterial {
  cel ??= new THREE.ShaderMaterial({
    uniforms: lightUniforms,
    vertexShader: celVertex,
    fragmentShader: celFragment,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  return cel;
}

export function inkMaterial(): THREE.ShaderMaterial {
  ink ??= new THREE.ShaderMaterial({
    uniforms: lightUniforms,
    vertexShader: inkVertex,
    fragmentShader: inkFragment,
    side: THREE.BackSide,
  });
  return ink;
}

// --- Colour helpers. ---

/** Picks from a list by a stable integer, for per-figure variety without randomness. */
export function pick<T>(list: readonly T[], n: number): T {
  return list[((n % list.length) + list.length) % list.length]!;
}

/** Lightens (amount > 0) or darkens (amount < 0) a colour, for trims and shading regions. */
export function shade(colour: THREE.ColorRepresentation, amount: number): THREE.Color {
  const c = new THREE.Color(colour);
  return amount >= 0 ? c.lerp(new THREE.Color(1, 1, 1), amount) : c.multiplyScalar(1 + amount);
}
