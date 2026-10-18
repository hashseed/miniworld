// Draws the tree of humankind on the globe (spec humankind.md, section 8.1):
// loads the tree chunk of the time window in view, asks the scene who stands
// where at the clock time, and places hearths, lodgings and figures like a
// vignette stage: one drawn size at every zoom, upright on the ground whatever
// the camera does. It only draws; the scene decides everything.

import * as THREE from 'three';
import type { ContentLoader } from '../content/loader.ts';
import { latLonToDir } from '../geo/cube.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import { dayAtMs } from '../time/rate.ts';
import type { Clearing } from '../globe/foliage.ts';
import {
  CAMP_CLEARING_KM,
  FIGURE_KM_PER_M,
  LAYOUT_KM_PER_M,
  TEMPO,
  treeScene,
  type Placed,
  type TreeChunk,
} from '../world/treeScene.ts';
import { buildLodging, buildProp, buildTreeFigure, type TreeActor } from '../vignettes/figures.ts';
import type { StandIn } from '../vignettes/standIns.ts';
import type { SurfaceSource } from '../vignettes/vignetteLayer.ts';

export class TreeLayer {
  readonly group = new THREE.Group();

  private loader: ContentLoader;
  private surface: SurfaceSource;
  private files: (string | null)[] = [];
  private windows: number[] = [];
  private chunks = new Map<number, TreeChunk>();
  private requested = new Set<number>();
  private figures = new Map<number, TreeActor>();
  private lodgings = new Map<number, StandIn | undefined>();
  private hearths = new Map<number, StandIn | undefined>();
  private camera: THREE.PerspectiveCamera | undefined;
  private cleared: Clearing[] = [];
  private basis = new THREE.Matrix4();
  private turn = new THREE.Quaternion();
  private yAxis = new THREE.Vector3(0, 1, 0);
  private up = new THREE.Vector3();
  private east = new THREE.Vector3();
  private north = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private e2 = new THREE.Vector3();
  private n2 = new THREE.Vector3();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();

  constructor(loader: ContentLoader, surface: SurfaceSource) {
    this.loader = loader;
    this.surface = surface;
  }

  /** The tree chunk files of the manifest, one per time window starting on `windows[i]`. */
  setChunks(files: (string | null)[], windows: number[]): void {
    this.files = files;
    this.windows = windows;
  }

  /** Where the trees make way for camps now, for the foliage. */
  clearings(): Clearing[] {
    return this.cleared;
  }

  update(camera: THREE.PerspectiveCamera, ms: number, startDay: number): void {
    this.camera = camera;
    const day = dayAtMs(ms, startDay);
    let w = -1;
    while (w + 1 < this.windows.length && this.windows[w + 1]! <= day) w++;
    const chunk = this.chunks.get(w);
    if (!chunk) {
      this.request(w);
      this.clear();
      return;
    }
    this.request(w + 1);
    const scene = treeScene(chunk, ms, startDay);

    const seen = new Set<number>();
    for (const f of scene.figures) {
      seen.add(f.id);
      let actor = this.figures.get(f.id);
      if (!actor) {
        actor = buildTreeFigure(f.look, f.id);
        this.figures.set(f.id, actor);
        this.group.add(actor.root);
      }
      if (!this.place(actor.root, f)) continue;
      actor.root.scale.setScalar(FIGURE_KM_PER_M);
      // Clips play TEMPO times faster, matching the faster pace on the ground.
      const sec = (clipMs: number) => (clipMs * TEMPO) / 1000;
      if (f.from)
        actor.blend(f.from.clip, sec(f.from.clipMs), f.clip, sec(f.clipMs), f.from.weight);
      else actor.pose(f.clip, sec(f.clipMs));
    }
    this.prune(this.figures, seen);

    seen.clear();
    for (const l of scene.lodgings) {
      seen.add(l.id);
      if (!this.lodgings.has(l.id)) {
        const prop = buildLodging(l.kind);
        if (prop) this.group.add(prop.root);
        this.lodgings.set(l.id, prop);
      }
      const prop = this.lodgings.get(l.id);
      if (!prop || !this.place(prop.root, l)) continue;
      // While the band builds it, the lodging goes up step by step, or rises whole.
      if (prop.setBuilt) {
        prop.setBuilt(l.built);
        prop.root.scale.setScalar(FIGURE_KM_PER_M);
      } else {
        const rise = l.built * l.built * (3 - 2 * l.built);
        const wide = FIGURE_KM_PER_M * (0.5 + 0.5 * rise);
        prop.root.scale.set(wide, FIGURE_KM_PER_M * Math.max(0.04, rise), wide);
      }
    }
    this.prune(this.lodgings, seen);

    seen.clear();
    this.cleared = scene.clearings.map((c) => ({
      dir: latLonToDir(c.lat, c.lon),
      km: CAMP_CLEARING_KM,
      amount: c.amount,
      felling: c.felling,
    }));
    for (const h of scene.hearths) {
      seen.add(h.camp);
      if (!this.hearths.has(h.camp)) {
        const prop = buildProp('asset', 'prop-hearth');
        if (prop) this.group.add(prop.root);
        this.hearths.set(h.camp, prop);
      }
      const prop = this.hearths.get(h.camp);
      if (!prop) continue;
      this.place(prop.root, { lat: h.lat, lon: h.lon, x: 0, z: 0, dirX: 1, dirZ: 0 });
      prop.root.scale.setScalar(FIGURE_KM_PER_M);
      // The fire flickers with the clock, so a paused world holds still.
      prop.pose('idle', ms / 1000);
    }
    this.prune(this.hearths, seen);
  }

  private request(w: number): void {
    const file = this.files[w];
    if (!file || this.requested.has(w)) return;
    this.requested.add(w);
    this.loader.json<TreeChunk>(file).then(
      (chunk) => this.chunks.set(w, chunk),
      () => this.requested.delete(w),
    );
  }

  private clear(): void {
    this.prune(this.figures, new Set());
    this.prune(this.lodgings, new Set());
    this.prune(this.hearths, new Set());
    this.cleared = [];
  }

  private prune<T extends StandIn | undefined>(objects: Map<number, T>, keep: Set<number>): void {
    for (const [id, o] of objects) {
      if (keep.has(id)) continue;
      if (o) {
        this.group.remove(o.root);
        o.root.traverse((m) => {
          if (m instanceof THREE.Mesh) m.geometry.dispose();
        });
      }
      objects.delete(id);
    }
  }

  /**
   * Stands an object on the ground at a point of the scene, upright there and
   * facing along its direction, whatever the camera does.
   * Returns false, and hides it, when it is on the far side of the globe.
   */
  private place(root: THREE.Object3D, p: Placed): boolean {
    const { up, east, north, dir } = this;
    up.set(...this.surface.toDrawn(latLonToDir(p.lat, p.lon))).normalize();
    northEast(up, north, east);
    dir
      .copy(up)
      .multiplyScalar(EARTH_RADIUS_KM)
      .addScaledVector(east, p.x * LAYOUT_KM_PER_M)
      .addScaledVector(north, p.z * LAYOUT_KM_PER_M)
      .normalize();
    const ground = EARTH_RADIUS_KM + this.surface.surfaceKm([dir.x, dir.y, dir.z]);
    root.position.copy(dir).multiplyScalar(ground);
    const toCam = this.v1.copy(this.camera!.position).sub(root.position);
    root.visible = toCam.dot(dir) > 0;
    if (!root.visible) return false;
    northEast(dir, this.n2, this.e2);
    // Local frame x east, y up, z south; then turn to face along (dirX east, dirZ north).
    root.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.e2, dir, this.n2.negate()));
    root.quaternion.multiply(this.turn.setFromAxisAngle(this.yAxis, Math.atan2(p.dirZ, p.dirX)));
    return true;
  }
}
