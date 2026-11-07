// The geo-history globe (geo-history.md, section 5.2): the ocean, the land in
// climate colours, the plate boundaries and today's coasts, every moving piece
// placed on the sphere by its plate's pose for the age shown.

import * as THREE from 'three';
import { EARTH_RADIUS_KM } from '../../../engine/geo/earth.ts';
import type { Boundary, GeoData } from '../data.ts';
import { ageToMa } from '../world/age.ts';
import { RotationModel, conjugate, mul, slerp, type Quat } from '../world/poses.ts';
import {
  landFragment,
  landVertex,
  lineFragment,
  lineVertex,
  oceanFragment,
  oceanVertex,
  toothVertex,
} from './shaders.ts';
import { latLonToUnit, tessellate, type V3 } from './tessellate.ts';

const COAST_RAISE = 1.0009;
const LINE_RAISE = 1.0013;

export const BOUNDARY_COLOURS = {
  ridge: '#ff7043',
  subduction: '#c2185b',
  transform: '#ffeb3b',
} as const;

export interface Overlays {
  coasts: boolean;
  boundaries: boolean;
}

/** A pose in the model's frame (z north) as the drawn frame's quaternion (y north, longitude 0 along z). */
function toDrawn(q: Quat): Quat {
  return [q[1], q[2], q[0], q[3]];
}

/** A colour authored in sRGB as the vector the shaders write straight to the screen. */
function srgbVec(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex).getRGB({ r: 0, g: 0, b: 0 } as THREE.RGB, THREE.SRGBColorSpace);
  return new THREE.Vector3(c.r, c.g, c.b);
}

function climateTexture(stops: GeoData['climate']): THREE.DataTexture {
  const n = 256;
  const data = new Uint8Array(n * 4);
  const colours = stops.map((s) => new THREE.Color(s.colour));
  for (let i = 0; i < n; i++) {
    const lat = (i / (n - 1)) * 90;
    let k = 0;
    while (k < stops.length - 2 && lat > stops[k + 1]!.lat) k++;
    const a = stops[k]!;
    const b = stops[k + 1]!;
    const t = THREE.MathUtils.smoothstep(lat, a.lat, b.lat);
    const c = colours[k]!.clone().lerp(colours[k + 1]!, t);
    // Colours are authored in sRGB; the shader writes them straight to the screen.
    const rgb = c.getRGB({ r: 0, g: 0, b: 0 } as THREE.RGB, THREE.SRGBColorSpace);
    data[i * 4] = Math.round(rgb.r * 255);
    data[i * 4 + 1] = Math.round(rgb.g * 255);
    data[i * 4 + 2] = Math.round(rgb.b * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Growable float and index buffers for the merged geometries. */
class Buf {
  readonly data: Record<string, number[]> = {};
  push(name: string, ...v: number[]): void {
    (this.data[name] ??= []).push(...v);
  }
}

export class GeoScene {
  readonly group = new THREE.Group();
  readonly model: RotationModel;
  private readonly slot = new Map<number, number>();
  private readonly poseData: Float32Array;
  private readonly poseTexture: THREE.DataTexture;
  private readonly halfStage: { slot: number; left: number; right: number; inverse: Quat }[] = [];
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly boundaryMeshes: THREE.Object3D[] = [];
  private readonly coastMesh: THREE.Mesh;
  private readonly coastMaterial: THREE.ShaderMaterial;
  private readonly lineMaterials: THREE.ShaderMaterial[] = [];
  private readonly toothMaterials: THREE.ShaderMaterial[] = [];
  private lastAge = Number.NaN;

  readonly data: GeoData;

  constructor(data: GeoData) {
    this.data = data;
    this.model = new RotationModel(data.rotations);
    // Slot 0 is the identity pose, for plates the model gives no rotation.
    this.model.plates().forEach((p, i) => this.slot.set(p, i + 1));
    const half = data.boundaries.filter((b) => b.left !== undefined && b.right !== undefined);
    const total = this.slot.size + 1 + half.length;
    const width = Math.max(64, Math.ceil(total / 64) * 64);
    this.poseData = new Float32Array(width * 4);
    this.poseData.set([0, 0, 0, 1], 0);
    this.poseTexture = new THREE.DataTexture(
      this.poseData,
      width,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this.poseTexture.minFilter = THREE.NearestFilter;
    this.poseTexture.magFilter = THREE.NearestFilter;
    this.poseTexture.needsUpdate = true;
    this.uniforms = {
      uPoses: { value: this.poseTexture },
      uAge: { value: 0 },
      uRadius: { value: EARTH_RADIUS_KM },
      uClimate: { value: climateTexture(data.climate) },
      uLight: { value: new THREE.Vector3(0.4, 0.5, 0.8).normalize() },
      uViewport: { value: new THREE.Vector2(1, 1) },
    };

    this.group.add(this.ocean(), this.land());
    this.coastMesh = this.lines(
      data.coasts.map((c) => ({ plate: c.plate, begin: 1100, end: 0, line: c.line })),
      '#fff8e1',
      0.85,
      1.4,
      COAST_RAISE,
    );
    this.coastMaterial = this.coastMesh.material as THREE.ShaderMaterial;
    this.group.add(this.coastMesh);
    this.buildBoundaries(half);
  }

  private slotOf(plate: number): number {
    return this.slot.get(plate) ?? 0;
  }

  private ocean(): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS_KM, 96, 64),
      new THREE.ShaderMaterial({
        vertexShader: oceanVertex,
        fragmentShader: oceanFragment,
        uniforms: { uLight: this.uniforms.uLight! },
      }),
    );
    mesh.renderOrder = 0;
    return mesh;
  }

  private land(): THREE.Mesh {
    const pos: number[] = [];
    const slot: number[] = [];
    const life: number[] = [];
    for (const f of this.data.land) {
      const tri = tessellate(f.rings);
      pos.push(...tri);
      const s = this.slotOf(f.plate);
      for (let i = 0; i < tri.length / 3; i++) {
        slot.push(s);
        life.push(f.begin, f.end);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('poseSlot', new THREE.Float32BufferAttribute(slot, 1));
    g.setAttribute('life', new THREE.Float32BufferAttribute(life, 2));
    const m = new THREE.ShaderMaterial({
      vertexShader: landVertex,
      fragmentShader: landFragment,
      uniforms: this.uniforms,
      // The pieces of a continent overlap a little, and all have the same colour there.
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    return mesh;
  }

  /** Quad strips for polylines of [lat, lon, ...], each piece with its plate, life and slot. */
  private lines(
    pieces: { plate: number; begin: number; end: number; line: number[]; slot?: number }[],
    colour: string,
    opacity: number,
    width: number,
    raise: number,
  ): THREE.Mesh {
    const b = new Buf();
    const index: number[] = [];
    let v = 0;
    for (const piece of pieces) {
      const slot = piece.slot ?? this.slotOf(piece.plate);
      const pts: V3[] = [];
      for (let i = 0; i + 1 < piece.line.length; i += 2)
        pts.push(latLonToUnit(piece.line[i]!, piece.line[i + 1]!));
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]!;
        const c = pts[i + 1]!;
        for (const [end, side] of [
          [0, -1],
          [0, 1],
          [1, -1],
          [1, 1],
        ] as const) {
          b.push('posA', ...a);
          b.push('posB', ...c);
          b.push('endSel', end);
          b.push('side', side);
          b.push('poseSlot', slot);
          b.push('life', piece.begin, piece.end);
          b.push('position', ...(end === 0 ? a : c));
        }
        index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
        v += 4;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.data.position ?? [], 3));
    g.setAttribute('posA', new THREE.Float32BufferAttribute(b.data.posA ?? [], 3));
    g.setAttribute('posB', new THREE.Float32BufferAttribute(b.data.posB ?? [], 3));
    g.setAttribute('endSel', new THREE.Float32BufferAttribute(b.data.endSel ?? [], 1));
    g.setAttribute('side', new THREE.Float32BufferAttribute(b.data.side ?? [], 1));
    g.setAttribute('poseSlot', new THREE.Float32BufferAttribute(b.data.poseSlot ?? [], 1));
    g.setAttribute('life', new THREE.Float32BufferAttribute(b.data.life ?? [], 2));
    g.setIndex(index);
    const m = new THREE.ShaderMaterial({
      vertexShader: lineVertex,
      fragmentShader: lineFragment,
      transparent: opacity < 1,
      depthWrite: false,
      // Quads flip as the line turns, so both faces are drawn.
      side: THREE.DoubleSide,
      uniforms: {
        ...this.uniforms,
        uColour: { value: srgbVec(colour) },
        uOpacity: { value: opacity },
        uWidth: { value: width },
        uRaise: { value: raise },
      },
    });
    this.lineMaterials.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    return mesh;
  }

  private teeth(features: (Boundary & { slot: number })[]): THREE.Mesh {
    const pos: number[] = [];
    const nrm: number[] = [];
    const apex: number[] = [];
    const slot: number[] = [];
    const life: number[] = [];
    const spacing = 0.035;
    const baseHalf = 0.009;
    for (const f of features) {
      const sign = f.side === 'R' ? -1 : 1;
      for (const line of f.lines) {
        const pts: V3[] = [];
        for (let i = 0; i + 1 < line.length; i += 2) pts.push(latLonToUnit(line[i]!, line[i + 1]!));
        let carry = spacing / 2;
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i]!;
          const c = pts[i + 1]!;
          const dot = Math.min(1, Math.max(-1, a[0] * c[0] + a[1] * c[1] + a[2] * c[2]));
          const len = Math.acos(dot);
          if (len < 1e-6) continue;
          let at = carry;
          while (at < len) {
            const t = at / len;
            const m: V3 = norm([
              a[0] + (c[0] - a[0]) * t,
              a[1] + (c[1] - a[1]) * t,
              a[2] + (c[2] - a[2]) * t,
            ]);
            const tang = norm([c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
            // Direction along the line at m, made tangent to the sphere, then the side normal.
            const along = norm(sub(tang, scale(m, dotv(tang, m))));
            const side = scale(cross(m, along), sign);
            const p0 = add(m, scale(along, -baseHalf));
            const p1 = add(m, scale(along, baseHalf));
            for (const [p, ap] of [
              [p0, 0],
              [p1, 0],
              [m, 1],
            ] as const) {
              pos.push(...p);
              nrm.push(...side);
              apex.push(ap);
              slot.push(f.slot);
              life.push(f.begin, f.end);
            }
            at += spacing;
          }
          carry = at - len;
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normalDir', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('apex', new THREE.Float32BufferAttribute(apex, 1));
    g.setAttribute('poseSlot', new THREE.Float32BufferAttribute(slot, 1));
    g.setAttribute('life', new THREE.Float32BufferAttribute(life, 2));
    const m = new THREE.ShaderMaterial({
      vertexShader: toothVertex,
      fragmentShader: lineFragment,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: {
        ...this.uniforms,
        uColour: { value: srgbVec(BOUNDARY_COLOURS.subduction) },
        uOpacity: { value: 1 },
        uTooth: { value: 0.012 },
        uRaise: { value: LINE_RAISE },
      },
    });
    this.toothMaterials.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    return mesh;
  }

  private buildBoundaries(half: Boundary[]): void {
    const halfSet = new Set(half);
    const slotOfFeature = new Map<Boundary, number>();
    half.forEach((f, k) => {
      const slot = this.slot.size + 1 + k;
      slotOfFeature.set(f, slot);
      // Geometry of a half-stage feature is placed as it was when digitised, at `at`.
      const at = f.at ?? 0;
      const l0 = this.model.absolute(f.left!, at);
      const r0 = this.model.absolute(f.right!, at);
      this.halfStage.push({
        slot,
        left: f.left!,
        right: f.right!,
        inverse: conjugate(slerp(l0, r0, 0.5)),
      });
    });
    for (const kind of ['ridge', 'transform', 'subduction'] as const) {
      const features = this.data.boundaries.filter((f) => f.kind === kind);
      const pieces = features.flatMap((f) =>
        f.lines.map((line) => ({
          plate: f.plate,
          begin: f.begin,
          end: f.end,
          line,
          slot: halfSet.has(f) ? slotOfFeature.get(f)! : this.slotOf(f.plate),
        })),
      );
      const lines = this.lines(pieces, BOUNDARY_COLOURS[kind], 0.95, 2.2, LINE_RAISE);
      this.boundaryMeshes.push(lines);
      this.group.add(lines);
      if (kind === 'subduction') {
        const teeth = this.teeth(
          features.map((f) => ({
            ...f,
            slot: halfSet.has(f) ? slotOfFeature.get(f)! : this.slotOf(f.plate),
          })),
        );
        this.boundaryMeshes.push(teeth);
        this.group.add(teeth);
      }
    }
  }

  setOverlays(o: Overlays): void {
    this.coastMesh.visible = o.coasts;
    for (const m of this.boundaryMeshes) m.visible = o.boundaries;
  }

  setLight(dir: THREE.Vector3): void {
    (this.uniforms.uLight!.value as THREE.Vector3).copy(dir);
  }

  setViewport(width: number, height: number, tooth: number): void {
    (this.uniforms.uViewport!.value as THREE.Vector2).set(width, height);
    for (const m of this.toothMaterials) m.uniforms.uTooth!.value = tooth;
  }

  /** Places every plate for `age` (years before today). */
  setAge(age: number): void {
    if (age === this.lastAge) return;
    this.lastAge = age;
    const ma = ageToMa(age);
    this.uniforms.uAge!.value = ma;
    // Today's coasts say less the further back they are carried: the old continents were not these.
    this.coastMaterial.uniforms.uOpacity!.value = 0.85 - 0.5 * Math.min(1, ma / 1000);
    const poses = this.model.poses(ma);
    for (const [plate, slot] of this.slot) {
      const q = toDrawn(poses.get(plate) ?? [0, 0, 0, 1]);
      this.poseData.set(q, slot * 4);
    }
    for (const h of this.halfStage) {
      const l = poses.get(h.left) ?? this.model.absolute(h.left, ma);
      const r = poses.get(h.right) ?? this.model.absolute(h.right, ma);
      this.poseData.set(toDrawn(mul(slerp(l, r, 0.5), h.inverse)), h.slot * 4);
    }
    this.poseTexture.needsUpdate = true;
  }

  /** The drawn direction of a present-day point on a plate at `age`. */
  followPoint(plate: number, lat: number, lon: number, age: number): { lat: number; lon: number } {
    const q = toDrawn(this.model.absolute(plate, ageToMa(age)));
    return dirToLatLon(rotateDrawn(q, latLonToUnit(lat, lon)));
  }

  /** The middle of all the land at `age`, as a latitude and longitude. */
  landCentre(age: number): { lat: number; lon: number } {
    const ma = ageToMa(age);
    const poses = this.model.poses(ma);
    const s: V3 = [0, 0, 0];
    for (const f of this.data.land) {
      if (!(ma <= f.begin && ma >= f.end)) continue;
      const q = toDrawn(poses.get(f.plate) ?? [0, 0, 0, 1]);
      const r = f.rings[0]!;
      for (let i = 0; i + 1 < r.length; i += 2) {
        const p = rotateDrawn(q, latLonToUnit(r[i]!, r[i + 1]!));
        s[0] += p[0];
        s[1] += p[1];
        s[2] += p[2];
      }
    }
    return Math.hypot(...s) < 1e-6 ? { lat: 0, lon: 0 } : dirToLatLon(norm(s));
  }
}

function rotateDrawn(q: Quat, v: V3): V3 {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ];
}

function dirToLatLon(d: V3): { lat: number; lon: number } {
  return {
    lat: (Math.asin(Math.max(-1, Math.min(1, d[1]))) * 180) / Math.PI,
    lon: (Math.atan2(d[0], d[2]) * 180) / Math.PI,
  };
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dotv = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function norm(a: V3): V3 {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}
