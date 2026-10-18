// Draws vignettes on the globe (spec milestone 2, sections 5.1 and 18): asks
// the player which instances stand on the current day, places a stage of
// stand-ins at each site and poses them from the life clock. Close up the
// stage is at the miniature factor; further out it grows so its cast stays
// visible and moving up to orbit. It only draws; the player decides everything.

import * as THREE from 'three';
import type { ContentLoader } from '../content/loader.ts';
import type { VignetteEntry } from '../content/types.ts';
import { MIN_DISTANCE_KM } from '../globe/cameraController.ts';
import { latLonToDir, type Vec3 } from '../globe/cube.ts';
import { EARTH_RADIUS_KM } from '../globe/tileMesh.ts';
import {
  buildMembers,
  instancesAt,
  phaseOf,
  posesAt,
  type CompiledVignette,
  type Instance,
  type Member,
} from '../world/vignette.ts';
import { buildActor, lightModels } from './figures.ts';
import type { StandIn } from './standIns.ts';

/** People and everything they make are drawn 90 times life size (section 5.1). */
const MINIATURE = 90;
/** Life-size metres to drawn kilometres at the miniature factor. */
const M_TO_KM = MINIATURE / 1000;
/** Smallest on-screen height of an adult figure, in CSS pixels (section 5.1). */
const FIGURE_MIN_PX = 22;
/** From afar, an animal is drawn at most this many times an adult's height (section 5.1). */
const ANIMAL_MAX_ADULTS = 1.6;
const ADULT_M = 1.75;
/** From afar, figures are drawn at most this many times larger than the stage layout (section 5.1). */
const MAX_OVERSIZE = 6;
/** From afar, figures lean up to this far (radians) towards the top of the screen, like pop-up cut-outs. */
const MAX_LEAN = 1.15;
/** Taps within this many pixels of a cast member count as hits. */
const HIT_PX = 26;
/** Distance the camera flies down to on a double-tap: the closest zoom (milestone 1, section 6.1). */
const FLY_ALTITUDE_KM = MIN_DISTANCE_KM;

export interface SurfaceSource {
  /** Drawn surface height in km over a drawn direction. */
  surfaceKm(dir: Vec3): number;
  /** Where a true direction is drawn, through the history lens (history-lens.md section 4). */
  toDrawn(dir: Vec3): Vec3;
}

interface Stage {
  instance: Instance;
  entry: VignetteEntry;
  members: Member[];
  /** Holds the actors, each placed in world coordinates on the globe. */
  cast: THREE.Group;
  actors: StandIn[];
  /** The site in true coordinates; the stage stands at its drawn position. */
  trueDir: Vec3;
  up: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  /** World position of the stage centre, on the ground. */
  centre: THREE.Vector3;
}

export class VignetteLayer {
  readonly group = new THREE.Group();
  /** Called when the cast is tapped. */
  onOpen: (entry: VignetteEntry) => void = () => {};
  /** Called when the cast is double-tapped, with the stage's position. */
  onFly: (lat: number, lon: number, altitudeKm: number) => void = () => {};

  private loader: ContentLoader;
  private surface: SurfaceSource;
  private entries: VignetteEntry[] = [];
  private structures = new Map<string, CompiledVignette>();
  private requested = new Set<string>();
  private members = new Map<string, Member[]>();
  private stages = new Map<string, Stage>();
  private light = new THREE.DirectionalLight(0xffffff, 2.2);
  private ambient = new THREE.AmbientLight(0xffffff, 0.9);
  private camera: THREE.PerspectiveCamera | undefined;
  private lifeMs = 0;
  private down: { x: number; y: number; t: number } | undefined;
  private basis = new THREE.Matrix4();
  private turn = new THREE.Quaternion();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private v4 = new THREE.Vector3();
  private v5 = new THREE.Vector3();
  private v6 = new THREE.Vector3();
  private v7 = new THREE.Vector3();
  private yAxis = new THREE.Vector3(0, 1, 0);

  private readonly element: HTMLElement;

  constructor(loader: ContentLoader, surface: SurfaceSource, element: HTMLElement) {
    this.loader = loader;
    this.surface = surface;
    this.group.add(this.light, this.light.target, this.ambient);
    this.element = element;
    this.attach(element);
  }

  setIndex(entries: VignetteEntry[]): void {
    this.entries = entries;
    for (const stage of this.stages.values()) {
      const entry = entries.find((e) => e.id === stage.entry.id);
      if (entry) stage.entry = entry;
    }
  }

  /** Number of stages on the current day, for tests and stats. */
  get stageCount(): number {
    return this.stages.size;
  }

  update(
    camera: THREE.PerspectiveCamera,
    day: number,
    lifeMs: number,
    lightDir: THREE.Vector3,
  ): void {
    this.camera = camera;
    this.lifeMs = lifeMs;
    this.light.position.copy(lightDir);
    this.light.target.position.set(0, 0, 0);
    if (this.element instanceof HTMLCanvasElement) lightModels(lightDir, camera, this.element);

    const wanted = new Set<string>();
    for (const entry of this.entries) {
      if (day < entry.fromDay || day >= entry.toDay) continue;
      const v = this.structures.get(entry.structure);
      if (!v) {
        this.request(entry);
        continue;
      }
      for (const instance of instancesAt(v, day)) {
        wanted.add(instance.id);
        if (!this.stages.has(instance.id))
          this.stages.set(instance.id, this.makeStage(entry, v, instance));
      }
    }
    for (const [id, stage] of this.stages) {
      if (wanted.has(id)) continue;
      this.disposeStage(stage);
      this.stages.delete(id);
    }

    // CSS pixels per kilometre at one kilometre's distance.
    const pxAtKm = (camera.projectionMatrix.elements[5]! * innerHeight) / 2;
    for (const stage of this.stages.values()) {
      this.place(stage);
      const toCam = this.v1.copy(camera.position).sub(stage.centre);
      const distance = toCam.length();
      const facing = toCam.dot(stage.up) > 0;
      stage.cast.visible = facing;
      if (!facing) continue;
      // Section 5.1: figures and layout keep their minimum sizes on screen.
      const kmPerPx = distance / pxAtKm;
      const figureKmPerM = Math.max(M_TO_KM, (FIGURE_MIN_PX * kmPerPx) / ADULT_M);
      const layoutKmPerM = Math.max(M_TO_KM, figureKmPerM / MAX_OVERSIZE);
      this.pose(stage, lifeMs, figureKmPerM, layoutKmPerM, pxAtKm);
    }
  }

  private request(entry: VignetteEntry): void {
    if (this.requested.has(entry.structure)) return;
    this.requested.add(entry.structure);
    this.loader.json<CompiledVignette>(entry.structure).then(
      (v) => this.structures.set(entry.structure, v),
      () => this.requested.delete(entry.structure),
    );
  }

  private makeStage(entry: VignetteEntry, v: CompiledVignette, instance: Instance): Stage {
    let members = this.members.get(entry.structure);
    if (!members) {
      members = buildMembers(v.template);
      this.members.set(entry.structure, members);
    }
    const cast = new THREE.Group();
    const actors = members.map((m) => {
      const key = `${instance.id}:${m.group}:${m.index}`;
      const actor = buildActor(m.kind, m.look, key, m.index, m.role);
      cast.add(actor.root);
      return actor;
    });
    this.group.add(cast);
    const stage: Stage = {
      instance,
      entry,
      members,
      cast,
      actors,
      trueDir: latLonToDir(instance.site.lat / 1e6, instance.site.lon / 1e6),
      up: new THREE.Vector3(),
      east: new THREE.Vector3(),
      north: new THREE.Vector3(),
      centre: new THREE.Vector3(),
    };
    this.place(stage);
    return stage;
  }

  /**
   * Finds the drawn position of a stage's site and its compass directions.
   * The lens and the terrain can change from frame to frame (finer tiles
   * arrive, the lens morphs), so this runs every frame.
   */
  private place(stage: Stage): void {
    const { up, east, north } = stage;
    up.set(...this.surface.toDrawn(stage.trueDir)).normalize();
    north.set(0, 1, 0).addScaledVector(up, -up.y).normalize();
    east.crossVectors(north, up).normalize();
    const ground = this.surface.surfaceKm([up.x, up.y, up.z]);
    stage.centre.copy(up).multiplyScalar(EARTH_RADIUS_KM + ground);
  }

  /**
   * Poses every actor. Each stands on the ground at its own point of the
   * globe, upright there, so a stage grown to hundreds of kilometres still
   * follows the curve of the Earth.
   */
  private pose(
    stage: Stage,
    lifeMs: number,
    figureKmPerM: number,
    layoutKmPerM: number,
    pxAtKm: number,
  ): void {
    const v = this.structures.get(stage.entry.structure);
    if (!v) return;
    const poses = posesAt(v.template, stage.members, stage.instance, lifeMs);
    // Section 5.1: the further the figures are enlarged, the more they lean, up to MAX_LEAN.
    const grown = Math.min(1, Math.max(0, Math.log(figureKmPerM / M_TO_KM) / Math.log(8)));
    const screenUp = this.v6.setFromMatrixColumn(this.camera!.matrixWorld, 1);
    const steep = Math.max(
      0,
      this.v7.copy(this.camera!.position).sub(stage.centre).normalize().dot(stage.up),
    );
    const lean = MAX_LEAN * grown * steep;
    const dir = this.v2;
    const north = this.v3;
    const east = this.v4;
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i]!;
      const actor = stage.actors[i]!;
      actor.root.visible = p.visibility > 0;
      if (!actor.root.visible) continue;
      const eastKm = (p.x / 100) * layoutKmPerM;
      const northKm = (p.z / 100) * layoutKmPerM;
      dir
        .copy(stage.up)
        .multiplyScalar(EARTH_RADIUS_KM)
        .addScaledVector(stage.east, eastKm)
        .addScaledVector(stage.north, northKm)
        .normalize();
      north.set(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
      east.crossVectors(north, dir).normalize();
      // Local frame x east, y up, z south; then turn to face along (dirX east, dirZ north).
      actor.root.quaternion.setFromRotationMatrix(this.basis.makeBasis(east, dir, north.negate()));
      actor.root.quaternion.multiply(
        this.turn.setFromAxisAngle(this.yAxis, Math.atan2(p.dirZ, p.dirX)),
      );
      if (lean > 0) {
        // Tip the figure over its feet towards the top of the screen, so it is seen from the side.
        const leanTo = this.v1.copy(screenUp).addScaledVector(dir, -screenUp.dot(dir));
        if (leanTo.lengthSq() > 1e-8) {
          leanTo.normalize();
          const tipped = this.v5.copy(dir).multiplyScalar(Math.cos(lean));
          tipped.addScaledVector(leanTo, Math.sin(lean));
          actor.root.quaternion.premultiply(this.turn.setFromUnitVectors(dir, tipped));
        }
      }
      // Big animals shrink towards ANIMAL_MAX_ADULTS as the cast grows, so people stay readable.
      const cap = Math.min(1, (ANIMAL_MAX_ADULTS * ADULT_M) / actor.height);
      const ground = this.surface.surfaceKm([dir.x, dir.y, dir.z]);
      actor.root.position.copy(dir).multiplyScalar(EARTH_RADIUS_KM + ground);
      // The minimum size holds for each figure at its own distance, not only at the stage centre.
      const own = (FIGURE_MIN_PX * actor.root.position.distanceTo(this.camera!.position)) / pxAtKm;
      const scale = Math.max(figureKmPerM, own / ADULT_M) * (1 + (cap - 1) * grown);
      const sink = (1 - p.visibility) * actor.height * scale;
      actor.root.position.addScaledVector(dir, -sink);
      actor.root.scale.setScalar(scale);
      actor.pose(p.clip, p.clipMs / 1000);
    }
  }

  private disposeStage(stage: Stage): void {
    this.group.remove(stage.cast);
    stage.cast.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }

  /** The current stages, for browser tests: site, the first visible actor on screen and cast positions. */
  debug(): {
    entries: VignetteEntry[];
    stages: {
      id: string;
      lat: number;
      lon: number;
      actor?: [number, number];
      heightPx?: number;
      /** Loop phase in milliseconds at the last frame. */
      phase?: number;
      cast: number[];
    }[];
  } {
    const camera = this.camera;
    return {
      entries: this.entries,
      stages: [...this.stages.values()].map((stage) => {
        let actor: [number, number] | undefined;
        let heightPx: number | undefined;
        // The tallest hunter: an adult, so it shows the minimum figure size.
        const first = stage.actors.find(
          (a, i) => a.root.visible && stage.members[i]!.role === 'hunter',
        );
        if (camera && stage.cast.visible && first) {
          const p = first.root.position.clone().project(camera);
          actor = [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight];
          const distance = first.root.position.distanceTo(camera.position);
          const pxAtKm = (camera.projectionMatrix.elements[5]! * innerHeight) / 2;
          heightPx = (first.height * first.root.scale.x * pxAtKm) / distance;
        }
        return {
          id: stage.instance.id,
          lat: stage.instance.site.lat / 1e6,
          lon: stage.instance.site.lon / 1e6,
          actor,
          heightPx,
          phase: (() => {
            const v = this.structures.get(stage.entry.structure);
            return v ? phaseOf(v.template, stage.instance, this.lifeMs) : undefined;
          })(),
          cast: stage.actors.flatMap((a) => [
            a.root.position.x,
            a.root.position.y,
            a.root.position.z,
          ]),
        };
      }),
    };
  }

  // --- Taps -------------------------------------------------------------------------

  /** The stage with a cast member under a screen point, if any. */
  hit(clientX: number, clientY: number): Stage | undefined {
    const camera = this.camera;
    if (!camera) return undefined;
    let best: Stage | undefined;
    let bestD = HIT_PX;
    const p = new THREE.Vector3();
    const screen = (v: THREE.Vector3): [number, number, boolean] => {
      p.copy(v).project(camera);
      return [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight, p.z < 1];
    };
    for (const stage of this.stages.values()) {
      if (stage.cast.visible) {
        for (const actor of stage.actors) {
          if (!actor.root.visible) continue;
          const [x, y, front] = screen(actor.root.getWorldPosition(new THREE.Vector3()));
          const d = Math.hypot(clientX - x, clientY - y);
          if (front && d < bestD) [best, bestD] = [stage, d];
        }
      }
    }
    return best;
  }

  private attach(el: HTMLElement): void {
    el.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = undefined;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      if (performance.now() - d.t > 500) return;
      const stage = this.hit(e.clientX, e.clientY);
      if (stage) this.onOpen(stage.entry);
    });
    // Capture before the camera's own double-click zoom, so a double-tap on the cast flies to its stage.
    window.addEventListener(
      'dblclick',
      (e) => {
        if (e.target !== el) return;
        const stage = this.hit(e.clientX, e.clientY);
        if (!stage) return;
        e.stopPropagation();
        e.preventDefault();
        this.onFly(stage.instance.site.lat / 1e6, stage.instance.site.lon / 1e6, FLY_ALTITUDE_KM);
      },
      { capture: true },
    );
  }
}
