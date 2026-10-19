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
  POLE_ON_GROUND_M,
  TEMPO,
  treeScene,
  type Placed,
  type TreeChunk,
} from '../world/treeScene.ts';
import {
  buildLodging,
  buildProp,
  buildSpearObject,
  buildTreeFigure,
  buildTreePrey,
  type TreeActor,
} from '../vignettes/figures.ts';
import type { StandIn } from '../vignettes/standIns.ts';
import type { Profile } from '../world/cultures.ts';
import type { SurfaceSource } from '../vignettes/vignetteLayer.ts';
import type { Obstacle } from '../wildlife/wildlifeLayer.ts';

/** Camps this far beyond the horizon, in radians, are still worked out, for the history lens. */
const NEAR_MARGIN = 0.3;
/** Half sizes of what wild animals keep clear of, in life-size metres (wildlife.md section 4). */
const FIGURE_HALF_M = 0.4;
const PREY_HALF_M = 1.3;
const LODGING_HALF_M = 1.4;
const HEARTH_HALF_M = 1;

export class TreeLayer {
  readonly group = new THREE.Group();

  private loader: ContentLoader;
  private surface: SurfaceSource;
  private files: (string | null)[] = [];
  private windows: number[] = [];
  private chunks = new Map<number, TreeChunk>();
  private requested = new Set<number>();
  private figures = new Map<number, TreeActor>();
  /** The culture each figure's model was built for. */
  private profiles = new Map<number, Profile>();
  private lodgings = new Map<number, StandIn | undefined>();
  private hearths = new Map<number, StandIn | undefined>();
  private prey = new Map<string, StandIn | undefined>();
  private spears = new Map<string, THREE.Object3D>();
  private props = new Map<string, StandIn | undefined>();
  /** Sparks of fires being lit: small glowing beads, reused frame to frame. */
  private sparks: THREE.Mesh[] = [];
  private sparkGeometry = new THREE.SphereGeometry(0.07, 6, 4);
  private sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffc04a });
  private poles = new Map<string, StandIn | undefined>();
  private camera: THREE.PerspectiveCamera | undefined;
  private cleared: Clearing[] = [];
  private blocking: Obstacle[] = [];
  private blocked = 0;
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

  /** Where the people, their prey, lodgings and hearths stand now, for the animals to keep clear of. */
  obstacles(): Obstacle[] {
    return this.blocking.slice(0, this.blocked);
  }

  /** Notes an object just placed as one the animals keep clear of. */
  private block(root: THREE.Object3D, halfM: number): void {
    const o = (this.blocking[this.blocked++] ??= { dir: new THREE.Vector3(), km: 0 });
    o.dir.copy(root.position).normalize();
    o.km = halfM * FIGURE_KM_PER_M;
  }

  /** Where the trees make way for camps now, for the foliage. */
  clearings(): Clearing[] {
    return this.cleared;
  }

  update(camera: THREE.PerspectiveCamera, ms: number, startDay: number): void {
    this.camera = camera;
    this.blocked = 0;
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
    // Only the camps on the camera's side of the globe, with a margin for the history lens.
    const camDir = this.v2.copy(camera.position).normalize();
    const limit = Math.acos(Math.min(1, EARTH_RADIUS_KM / camera.position.length())) + NEAR_MARGIN;
    const cosLimit = Math.cos(Math.min(Math.PI, limit));
    const near = (lat: number, lon: number) => {
      const [x, y, z] = latLonToDir(lat, lon);
      return x * camDir.x + y * camDir.y + z * camDir.z >= cosLimit;
    };
    const scene = treeScene(chunk, ms, startDay, near);

    const seen = new Set<number>();
    for (const f of scene.figures) {
      seen.add(f.id);
      let actor = this.figures.get(f.id);
      // A figure in new clothes is a new model (peopling.md section 5.3).
      const profile = (f.profile ?? 'african-stone-age') as Profile;
      if (actor && this.profiles.get(f.id) !== profile) {
        this.prune(this.figures, new Set([...this.figures.keys()].filter((id) => id !== f.id)));
        actor = undefined;
      }
      if (!actor) {
        actor = buildTreeFigure(f.look, f.id, profile);
        this.figures.set(f.id, actor);
        this.profiles.set(f.id, profile);
        this.group.add(actor.root);
      }
      if (!this.place(actor.root, f)) continue;
      // Inside its hut, out of sight (humankind.md section 8.1).
      if (f.hidden) {
        actor.root.visible = false;
        continue;
      }
      this.block(actor.root, FIGURE_HALF_M);
      actor.root.scale.setScalar(FIGURE_KM_PER_M);
      // Clips play TEMPO times faster, matching the faster pace on the ground.
      const sec = (clipMs: number) => (clipMs * TEMPO) / 1000;
      if (f.from)
        actor.blend(f.from.clip, sec(f.from.clipMs), f.clip, sec(f.clipMs), f.from.weight);
      else actor.pose(f.clip, sec(f.clipMs));
      if (f.unarmed) actor.hideTool();
    }
    this.prune(this.figures, seen);

    // Spears away from the hand: their middle at its height, along their flight.
    const flying = new Set<string>();
    for (const sp of scene.spears) {
      flying.add(sp.id);
      let pivot = this.spears.get(sp.id);
      if (!pivot) {
        pivot = new THREE.Group();
        const spear = buildSpearObject();
        // The model's shaft runs up from its grip; its middle goes to the pivot.
        spear.position.set(0, -1.1, 0);
        pivot.add(spear);
        this.group.add(pivot);
        this.spears.set(sp.id, pivot);
      }
      if (!this.place(pivot, sp)) continue;
      const up = this.v1.copy(this.dir);
      northEast(up, this.n2, this.e2);
      const ahead = this.e2.multiplyScalar(sp.dirX).addScaledVector(this.n2, sp.dirZ);
      const along = ahead.addScaledVector(up, sp.slope).normalize();
      pivot.quaternion.setFromUnitVectors(this.yAxis, along);
      pivot.position.addScaledVector(up, sp.height * FIGURE_KM_PER_M);
      pivot.scale.setScalar(FIGURE_KM_PER_M);
    }
    for (const [id, pivot] of this.spears)
      if (!flying.has(id)) {
        this.group.remove(pivot);
        this.spears.delete(id);
      }

    // Drying racks beside the lodgings, the spit over a fire while meat roasts, canoes on
    // the water and red flags at the Neolithic thresholds.
    const standing = new Set<string>();
    for (const q of scene.props) {
      standing.add(q.id);
      if (!this.props.has(q.id)) {
        const prop = buildProp('asset', q.kind);
        if (prop) this.group.add(prop.root);
        this.props.set(q.id, prop);
      }
      const prop = this.props.get(q.id);
      if (!prop || !this.place(prop.root, q)) continue;
      prop.root.scale.setScalar(FIGURE_KM_PER_M);
    }
    this.prune(this.props, standing);

    // Sparks from the flint stones while a new fire is lit, shrinking as they die.
    scene.sparks.forEach((sp, k) => {
      let bead = this.sparks[k];
      if (!bead) {
        bead = new THREE.Mesh(this.sparkGeometry, this.sparkMaterial);
        this.sparks.push(bead);
        this.group.add(bead);
      }
      if (!this.place(bead, { ...sp, dirX: 1, dirZ: 0 })) return;
      bead.position.addScaledVector(this.dir, sp.height * FIGURE_KM_PER_M);
      bead.scale.setScalar(FIGURE_KM_PER_M * (1 - sp.life));
    });
    for (let k = scene.sparks.length; k < this.sparks.length; k++) this.sparks[k]!.visible = false;

    // Carrying poles: on the ground, lifted, carried and laid down again.
    const carried = new Set<string>();
    for (const pole of scene.poles) {
      carried.add(pole.id);
      if (!this.poles.has(pole.id)) {
        const prop = buildProp('asset', 'prop-carry-pole');
        if (prop) this.group.add(prop.root);
        this.poles.set(pole.id, prop);
      }
      const prop = this.poles.get(pole.id);
      if (!prop || !this.place(prop.root, pole)) continue;
      prop.root.position.addScaledVector(
        this.dir,
        (pole.height - POLE_ON_GROUND_M) * FIGURE_KM_PER_M,
      );
      prop.root.scale.setScalar(FIGURE_KM_PER_M);
    }
    this.prune(this.poles, carried);

    const hunted = new Set<string>();
    for (const p of scene.prey) {
      hunted.add(p.id);
      if (!this.prey.has(p.id)) {
        const animal = buildTreePrey(p.kind);
        if (animal) this.group.add(animal.root);
        this.prey.set(p.id, animal);
      }
      const animal = this.prey.get(p.id);
      if (!animal || !this.place(animal.root, p)) continue;
      animal.root.visible = p.visibility > 0;
      if (animal.root.visible) this.block(animal.root, PREY_HALF_M);
      animal.setFade?.(p.visibility);
      animal.root.scale.setScalar(FIGURE_KM_PER_M);
      animal.pose(p.clip, (p.clipMs * TEMPO) / 1000);
    }
    this.prune(this.prey, hunted);

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
      this.block(prop.root, LODGING_HALF_M);
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
      dir: c.x === undefined ? latLonToDir(c.lat, c.lon) : this.offsetDir(c.lat, c.lon, c.x, c.z!),
      km: c.km ?? CAMP_CLEARING_KM,
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
      if (this.place(prop.root, { lat: h.lat, lon: h.lon, x: 0, z: 0, dirX: 1, dirZ: 0 }))
        this.block(prop.root, HEARTH_HALF_M);
      prop.root.scale.setScalar(FIGURE_KM_PER_M);
      // The fire flickers with the clock, so a paused world holds still, and grows from
      // nothing while a new fire is lit.
      prop.pose('idle', ms / 1000);
      prop.setLit?.(h.lit);
    }
    this.prune(this.hearths, seen);
  }

  /** The true direction of a point of the scene: layout metres east and north of a place. */
  private offsetDir(lat: number, lon: number, x: number, z: number): [number, number, number] {
    const up = this.v1.set(...latLonToDir(lat, lon));
    northEast(up, this.n2, this.e2);
    up.multiplyScalar(EARTH_RADIUS_KM)
      .addScaledVector(this.e2, x * LAYOUT_KM_PER_M)
      .addScaledVector(this.n2, z * LAYOUT_KM_PER_M)
      .normalize();
    return [up.x, up.y, up.z];
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
    this.prune(this.prey, new Set());
    this.prune(this.poles, new Set());
    this.prune(this.props, new Set());
    for (const bead of this.sparks) bead.visible = false;
    for (const pivot of this.spears.values()) this.group.remove(pivot);
    this.spears.clear();
    this.cleared = [];
  }

  private prune<K, T extends StandIn | undefined>(objects: Map<K, T>, keep: Set<K>): void {
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
