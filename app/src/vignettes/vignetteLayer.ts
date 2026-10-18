// Draws vignettes on the globe (spec milestone 2, sections 5.1 and 18): asks
// the player which instances stand on the current day, places a stage of
// figures at each site and poses them from the life clock. Like the trees, a
// stage keeps one drawn size at every zoom, large enough to be seen moving
// from orbit. It only draws; the player decides everything.

import * as THREE from 'three';
import type { ContentLoader } from '../content/loader.ts';
import type { VignetteEntry } from '../content/types.ts';
import { latLonToDir, type Vec3 } from '../geo/cube.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import {
  buildMembers,
  formationOffset,
  instancesAt,
  phaseOf,
  posesAt,
  type CompiledVignette,
  type Instance,
  type Member,
} from '../world/vignette.ts';
import type { PartFrame } from '../landmarks/landmarkLayer.ts';
import { buildActor, lightModels } from './figures.ts';
import type { StandIn } from './standIns.ts';

/** Drawn kilometres per life-size metre of a figure, at every zoom (section 5.1). */
const FIGURE_KM_PER_M = 50;
/** Figures are drawn this many times larger than the stage layout (section 5.1). */
const OVERSIZE = 3;
/** Drawn kilometres per life-size metre of the stage layout. */
const LAYOUT_KM_PER_M = FIGURE_KM_PER_M / OVERSIZE;
/** An animal is drawn at most this many times an adult's height (section 5.1). */
const ANIMAL_MAX_ADULTS = 1.6;
const ADULT_M = 1.75;
/** Figures lean up to this far (radians) towards the top of the screen when seen from above, like pop-up cut-outs. */
const MAX_LEAN = 1.15;
/** Taps within this many pixels of a cast member count as hits. */
const HIT_PX = 26;
/** Altitude the camera flies down to on a double-tap: the whole stage in view. */
const FLY_ALTITUDE_KM = 2000;

/** Where the landmark parts stand that singular vignettes build (giza.md section 11.4). */
export interface PartFrames {
  frame(landmark: string, part: string): PartFrame | undefined;
}

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
  /** Each member's formation offset in centimetres, spread apart on a landmark's stage. */
  offsets: [number, number][];
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
  /** The landmark part a singular vignette stands on. */
  progress?: { landmark: string; part: string };
}

export class VignetteLayer {
  readonly group = new THREE.Group();
  /** Called when the cast is tapped. */
  onOpen: (entry: VignetteEntry) => void = () => {};
  /** Called when the cast is double-tapped, with the stage's position. */
  onFly: (lat: number, lon: number, altitudeKm: number) => void = () => {};
  /** Called when a tap hits no cast, so other layers can take it. */
  onMiss: (clientX: number, clientY: number) => void = () => {};
  /** Landmark parts, for vignettes that build them. */
  landmarks: PartFrames | undefined;

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

  /** True directions of the stages standing now, for the foliage's clearings. */
  clearings(): Vec3[] {
    return [...this.stages.values()].map((s) => s.trueDir);
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

    for (const stage of this.stages.values()) {
      const frame = this.place(stage);
      const toCam = this.v1.copy(camera.position).sub(stage.centre);
      const facing = toCam.dot(stage.up) > 0 && (!stage.progress || !!frame);
      stage.cast.visible = facing;
      if (facing) this.pose(stage, lifeMs, frame);
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
      progress: v.progress,
      offsets: members.map((m) =>
        formationOffset(
          v.template.groups.find((g) => g.name === m.group)!,
          m.index,
        ),
      ),
    };
    this.place(stage);
    return stage;
  }

  /**
   * Finds the drawn position of a stage's site and its compass directions.
   * The lens and the terrain can change from frame to frame (finer tiles
   * arrive, the lens morphs), so this runs every frame.
   */
  private place(stage: Stage): PartFrame | undefined {
    const { up, east, north } = stage;
    if (stage.progress) {
      const frame = this.landmarks?.frame(stage.progress.landmark, stage.progress.part);
      if (frame) {
        up.copy(frame.up);
        east.copy(frame.east);
        north.copy(frame.north);
        stage.centre.copy(frame.centre);
      }
      return frame;
    }
    up.set(...this.surface.toDrawn(stage.trueDir)).normalize();
    northEast(up, north, east);
    const ground = this.surface.surfaceKm([up.x, up.y, up.z]);
    stage.centre.copy(up).multiplyScalar(EARTH_RADIUS_KM + ground);
    return undefined;
  }

  /**
   * Poses every actor. Each stands on the ground at its own point of the
   * globe, upright there, so a stage grown to hundreds of kilometres still
   * follows the curve of the Earth.
   */
  private pose(stage: Stage, lifeMs: number, frame?: PartFrame): void {
    const v = this.structures.get(stage.entry.structure);
    if (!v) return;
    const poses = posesAt(v.template, stage.members, stage.instance, lifeMs);
    const screenUp = this.v6.setFromMatrixColumn(this.camera!.matrixWorld, 1);
    const steep = Math.max(
      0,
      this.v7.copy(this.camera!.position).sub(stage.centre).normalize().dot(stage.up),
    );
    const lean = MAX_LEAN * steep;
    const dir = this.v2;
    const north = this.v3;
    const east = this.v4;
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i]!;
      const actor = stage.actors[i]!;
      actor.root.visible = p.visibility > 0;
      if (!actor.root.visible) continue;
      // A stage on a landmark is laid out at the landmark's scale (giza.md section 11.4),
      // and a group's members are spread as on any other stage, so they do not merge into a blob.
      const layoutKmPerM = frame ? frame.kmPerM : LAYOUT_KM_PER_M;
      const spread = frame ? LAYOUT_KM_PER_M / layoutKmPerM - 1 : 0;
      const [ox, oz] = stage.offsets[i]!;
      const xM = (p.x + ox * spread) / 100;
      const zM = (p.z + oz * spread) / 100;
      const eastKm = xM * layoutKmPerM;
      const northKm = zM * layoutKmPerM;
      dir
        .copy(stage.up)
        .multiplyScalar(EARTH_RADIUS_KM)
        .addScaledVector(stage.east, eastKm)
        .addScaledVector(stage.north, northKm)
        .normalize();
      northEast(dir, north, east);
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
      // Big animals are drawn at most ANIMAL_MAX_ADULTS adults tall, so people stay readable.
      const cap = Math.min(1, (ANIMAL_MAX_ADULTS * ADULT_M) / actor.height);
      // On a landmark, figures stand on its drawn surface (giza.md section 11.5).
      const onLandmark = frame ? frame.surfaceM(xM, zM) * frame.upKmPerM : 0;
      const ground = this.surface.surfaceKm([dir.x, dir.y, dir.z]) + onLandmark;
      actor.root.position.copy(dir).multiplyScalar(EARTH_RADIUS_KM + ground);
      const scale = FIGURE_KM_PER_M * cap;
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
      /** Drawn height of that hunter in kilometres. */
      heightKm?: number;
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
        let heightKm: number | undefined;
        // A hunter: an adult, so it shows the figure size.
        const first = stage.actors.find(
          (a, i) => a.root.visible && stage.members[i]!.role === 'hunter',
        );
        if (camera && stage.cast.visible && first) {
          const p = first.root.position.clone().project(camera);
          actor = [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight];
          const distance = first.root.position.distanceTo(camera.position);
          const pxAtKm = (camera.projectionMatrix.elements[5]! * innerHeight) / 2;
          heightKm = first.height * first.root.scale.x;
          heightPx = (heightKm * pxAtKm) / distance;
        }
        return {
          id: stage.instance.id,
          lat: stage.instance.site.lat / 1e6,
          lon: stage.instance.site.lon / 1e6,
          actor,
          heightPx,
          heightKm,
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
      else this.onMiss(e.clientX, e.clientY);
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
