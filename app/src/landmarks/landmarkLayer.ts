// Draws landmarks on the globe (spec milestone 2, section 8, and giza.md
// section 11): every part of a landmark at the model of its stage on the
// current day, rising with the date while it is built, at one fixed drawn
// size at every zoom, like the trees and the vignettes. It also tells the
// vignette layer where each part stands and how high its surface is, so the
// building crews stand on what is drawn.

import * as THREE from 'three';
import manifest from '../../../data/assets/manifest.json';
import {
  LANDMARK_ASSETS,
  PYRAMIDS,
  SPHINX_LENGTH,
  buildLandmarkAsset,
  buildPyramid,
  pyramidShape,
  pyramidSurface,
  type LandmarkAssetId,
  type PyramidId,
  type PyramidShape,
  type PyramidState,
} from '../../../assets/src/landmarks.ts';
import type { Model } from '../../../assets/src/kit.ts';
import type { ContentLoader } from '../content/loader.ts';
import type { VignetteEntry } from '../content/types.ts';
import { latLonToDir } from '../globe/cube.ts';
import { EARTH_RADIUS_KM } from '../globe/tileMesh.ts';
import { partAt, type CompiledLandmark } from '../world/landmark.ts';
import type { SurfaceSource } from '../vignettes/vignetteLayer.ts';
/** Taps within this share of a part's drawn base count as hits. */
const HIT_SHARE = 0.6;

const approved = new Set(
  (manifest as { assets: { id: string; status: string }[] }).assets
    .filter((a) => a.status === 'approved')
    .map((a) => a.id),
);

/** Where a landmark part stands this frame, for the vignettes that build it. */
export interface PartFrame {
  centre: THREE.Vector3;
  up: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  /** Drawn kilometres per life-size metre across the ground. */
  kmPerM: number;
  /** ... and upwards. */
  upKmPerM: number;
  /** Height in metres of the part's drawn surface over a point x east, z north of its centre, in metres. */
  surfaceM(x: number, z: number): number;
}

interface DrawnPart {
  key: string;
  model: Model;
  baseM: number;
  frame: PartFrame;
  shape?: PyramidShape;
  pyramid?: PyramidId;
}

let flat: THREE.MeshToonMaterial | undefined;
/** Unapproved models are drawn flat-coloured, as stand-ins of the same shape (giza.md section 11.1). */
function standIn(model: Model): void {
  flat ??= new THREE.MeshToonMaterial({ vertexColors: true });
  model.object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(mesh.parent as THREE.Mesh).isMesh) {
      mesh.material = flat!;
      for (const child of [...mesh.children]) mesh.remove(child);
    }
  });
}

export class LandmarkLayer {
  readonly group = new THREE.Group();

  private loader: ContentLoader;
  private surface: SurfaceSource;
  private entries: VignetteEntry[] = [];
  private structures = new Map<string, CompiledLandmark>();
  private requested = new Set<string>();
  /** Drawn parts by landmark id and part name. */
  private drawn = new Map<string, DrawnPart>();
  private camera: THREE.PerspectiveCamera | undefined;
  private basis = new THREE.Matrix4();
  private v1 = new THREE.Vector3();

  constructor(loader: ContentLoader, surface: SurfaceSource) {
    this.loader = loader;
    this.surface = surface;
  }

  setIndex(entries: VignetteEntry[]): void {
    this.entries = entries;
  }

  /** Where a part stands this frame, if it is drawn. */
  frame(landmark: string, part: string): PartFrame | undefined {
    return this.drawn.get(`${landmark}/${part}`)?.frame;
  }

  update(camera: THREE.PerspectiveCamera, day: number): void {
    this.camera = camera;
    const wanted = new Set<string>();
    for (const entry of this.entries) {
      if (day < entry.fromDay || day >= entry.toDay) continue;
      const l = this.structures.get(entry.structure);
      if (!l) {
        this.request(entry);
        continue;
      }
      // The group's frame at its drawn point.
      const up = new THREE.Vector3(
        ...this.surface.toDrawn(latLonToDir(l.drawnLat / 1e6, l.drawnLon / 1e6)),
      ).normalize();
      const north0 = new THREE.Vector3(0, 1, 0).addScaledVector(up, -up.y).normalize();
      const east0 = new THREE.Vector3().crossVectors(north0, up).normalize();
      for (const p of l.parts) {
        const s = partAt(p, day);
        if (!s) continue;
        const id = `${l.id}/${p.name}`;
        wanted.add(id);
        const asset = s.asset as LandmarkAssetId;
        const a = LANDMARK_ASSETS[asset] as { pyramid?: PyramidId; state?: PyramidState };
        const shape = a.pyramid ? pyramidShape(a.pyramid, s.rise ?? a.state!) : undefined;
        const key = `${asset}:${JSON.stringify(shape ?? null)}`;
        let d = this.drawn.get(id);
        if (!d || d.key !== key) {
          if (d) this.dispose(d);
          const model = shape ? buildPyramid(a.pyramid!, shape) : buildLandmarkAsset(asset);
          if (!approved.has(asset)) standIn(model);
          this.group.add(model.object);
          d = {
            key,
            model,
            baseM: assetBase(asset),
            shape,
            pyramid: a.pyramid,
            frame: {
              centre: new THREE.Vector3(),
              up: new THREE.Vector3(),
              east: new THREE.Vector3(),
              north: new THREE.Vector3(),
              kmPerM: l.kmPerM,
              upKmPerM: l.upKmPerM,
              surfaceM: () => 0,
            },
          };
          const part = d;
          d.frame.surfaceM = (x, z) =>
            part.pyramid && part.shape ? pyramidSurface(part.pyramid, part.shape, x, z) : 0;
          this.drawn.set(id, d);
        }
        // The part's own point, at the group's spacing, upright on the globe there.
        const f = d.frame;
        const spread = l.spacing * l.kmPerM;
        f.up
          .copy(up)
          .multiplyScalar(EARTH_RADIUS_KM)
          .addScaledVector(east0, (p.east / 100) * spread)
          .addScaledVector(north0, (p.north / 100) * spread)
          .normalize();
        f.north.set(0, 1, 0).addScaledVector(f.up, -f.up.y).normalize();
        f.east.crossVectors(f.north, f.up).normalize();
        const g = this.surface.surfaceKm([f.up.x, f.up.y, f.up.z]);
        f.centre.copy(f.up).multiplyScalar(EARTH_RADIUS_KM + g);
        const o = d.model.object;
        o.position.copy(f.centre);
        o.quaternion.setFromRotationMatrix(
          this.basis.makeBasis(f.east, f.up, this.v1.copy(f.north).negate()),
        );
        // Pyramids are drawn steeper than life; other parts keep their shape (giza.md section 11.2).
        if (d.pyramid) o.scale.set(l.kmPerM, l.upKmPerM, l.kmPerM);
        else o.scale.setScalar(l.upKmPerM);
        o.visible = this.v1.copy(camera.position).sub(f.centre).dot(f.up) > 0;
      }
    }
    for (const [id, d] of this.drawn) {
      if (wanted.has(id)) continue;
      this.dispose(d);
      this.drawn.delete(id);
    }
  }

  /** The landmark whose part is under a screen point, if any. */
  hit(clientX: number, clientY: number): VignetteEntry | undefined {
    const camera = this.camera;
    if (!camera) return undefined;
    const pxAtKm = (camera.projectionMatrix.elements[5]! * innerHeight) / 2;
    const p = new THREE.Vector3();
    let best: string | undefined;
    let bestD = Infinity;
    for (const [id, d] of this.drawn) {
      if (!d.model.object.visible) continue;
      // Aim at the middle of the part, not its foot.
      p.copy(d.frame.centre).addScaledVector(d.frame.up, d.baseM * 0.25 * d.frame.upKmPerM);
      const distance = p.distanceTo(camera.position);
      p.project(camera);
      if (p.z >= 1) continue;
      const x = ((p.x + 1) / 2) * innerWidth;
      const y = ((1 - p.y) / 2) * innerHeight;
      const radius = Math.max(20, (d.baseM * HIT_SHARE * d.frame.kmPerM * pxAtKm) / distance);
      const dist = Math.hypot(clientX - x, clientY - y);
      if (dist < radius && dist < bestD) [best, bestD] = [id.split('/')[0], dist];
    }
    return best === undefined ? undefined : this.entries.find((e) => e.id === best);
  }

  /** The drawn parts, for browser tests: landmark, part, asset and screen position. */
  debug(): { id: string; key: string; screen?: [number, number]; kmPerM: number }[] {
    const camera = this.camera;
    return [...this.drawn].map(([id, d]) => {
      let screen: [number, number] | undefined;
      if (camera && d.model.object.visible) {
        const p = d.frame.centre
          .clone()
          .addScaledVector(d.frame.up, d.baseM * 0.25 * d.frame.upKmPerM)
          .project(camera);
        if (p.z < 1) screen = [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight];
      }
      return { id, key: d.key, screen, kmPerM: d.frame.kmPerM };
    });
  }

  private request(entry: VignetteEntry): void {
    if (this.requested.has(entry.structure)) return;
    this.requested.add(entry.structure);
    this.loader.json<CompiledLandmark>(entry.structure).then(
      (l) => this.structures.set(entry.structure, l),
      () => this.requested.delete(entry.structure),
    );
  }

  private dispose(d: DrawnPart): void {
    this.group.remove(d.model.object);
    d.model.object.traverse((o) => {
      if (o instanceof THREE.Mesh && !(o.parent instanceof THREE.Mesh)) o.geometry.dispose();
    });
  }
}

/** The base of a landmark asset in metres: what the beacon keeps visible. */
function assetBase(asset: LandmarkAssetId): number {
  const a = LANDMARK_ASSETS[asset] as { pyramid?: PyramidId };
  return a.pyramid ? PYRAMIDS[a.pyramid].base : SPHINX_LENGTH;
}
