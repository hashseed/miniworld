// Draws vignettes on the globe (spec milestone 2, sections 5.1 and 18): asks
// the player which instances stand on the current day, places a stage of
// figures, props and spears at each site and poses them at the instance's
// phase. Like the trees, a stage keeps one drawn size at every zoom, large
// enough to be seen moving from orbit. It only draws; the player decides everything.

import * as THREE from 'three';
import type { ContentLoader } from '../content/loader.ts';
import type { VignetteEntry } from '../content/types.ts';
import { latLonToDir, type Vec3 } from '../geo/cube.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import { dayAtMs } from '../time/rate.ts';
import {
  buildMembers,
  formationOffset,
  buildProps,
  buildSpears,
  instancesAt,
  phaseOf,
  posesAt,
  propPosesAt,
  spearsAt,
  type CompiledVignette,
  type Instance,
  type Member,
  type PropTrack,
  type Spear,
} from '../world/vignette.ts';
import type { PartFrame } from '../landmarks/landmarkLayer.ts';
import { buildActor, buildProp, buildSpearObject, lightModels } from './figures.ts';
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
/** Taps within this many pixels of a cast member count as hits. */
const HIT_PX = 26;
/** Altitude the camera flies down to on a double-tap: the whole stage in view. */
const FLY_ALTITUDE_KM = 2000;
/** A spear leaves the hand this high and arcs up by this share of its flight, in figure metres. */
const SPEAR_HAND_M = 1.7;
const SPEAR_ARC = 0.15;

/** What every instance of a vignette record shares: built once per structure file. */
interface Script {
  members: Member[];
  props: PropTrack[];
  spears: Spear[];
}

/** Where the landmark parts stand that singular vignettes build (giza.md section 11.4). */
export interface PartFrames {
  frame(landmark: string, part: string): PartFrame | undefined;
}

export interface SurfaceSource {
  /** Drawn surface height in km over a drawn direction. */
  surfaceKm(dir: Vec3): number;
  /** Where a true direction is drawn, through the history lens (history-lens.md section 4). */
  toDrawn(dir: Vec3): Vec3;
  /** Drawn km per true km at a true direction; 1 where absent. */
  widthAt?(dir: Vec3): number;
}

interface Stage {
  instance: Instance;
  entry: VignetteEntry;
  members: Member[];
  /** Each member's formation offset in centimetres, spread apart on a landmark's stage. */
  offsets: [number, number][];
  /** The landmark part a building stage stands on, once it is drawn. */
  frame?: PartFrame;
  /** Holds the actors, each placed in world coordinates on the globe. */
  cast: THREE.Group;
  actors: StandIn[];
  script: Script;
  /** Prop models; undefined for a prop without an approved model. */
  props: (StandIn | undefined)[];
  /** One object per spear; in flight it hangs in the cast, stuck it rides its target's back. */
  spears: THREE.Group[];
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
  private scripts = new Map<string, Script>();
  private stages = new Map<string, Stage>();
  /** Instances standing this frame, reused from frame to frame. */
  private wanted = new Set<string>();
  private light = new THREE.DirectionalLight(0xffffff, 2.2);
  private ambient = new THREE.AmbientLight(0xffffff, 0.9);
  private camera: THREE.PerspectiveCamera | undefined;
  private ms = 0;
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

  /** Places the stages shown at a clock time; `startDay` is the timeline's first day. */
  update(
    camera: THREE.PerspectiveCamera,
    ms: number,
    startDay: number,
    lightDir: THREE.Vector3,
  ): void {
    this.camera = camera;
    this.ms = ms;
    const day = dayAtMs(ms, startDay);
    this.light.position.copy(lightDir);
    this.light.target.position.set(0, 0, 0);
    if (this.element instanceof HTMLCanvasElement) lightModels(lightDir, camera, this.element);

    const wanted = this.wanted;
    wanted.clear();
    for (const entry of this.entries) {
      if (day < entry.fromDay) continue;
      const v = this.structures.get(entry.structure);
      if (!v) {
        // An instance may run a little past the span; only a span under way needs its file.
        if (day < entry.toDay) this.request(entry);
        continue;
      }
      for (const instance of instancesAt(v, ms, startDay)) {
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
      stage.frame = frame;
      if (facing) this.pose(stage);
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
    let script = this.scripts.get(entry.structure);
    if (!script) {
      const members = buildMembers(v.template);
      script = {
        members,
        props: buildProps(v.template),
        spears: buildSpears(v.template, members),
      };
      this.scripts.set(entry.structure, script);
    }
    const { members } = script;
    const cast = new THREE.Group();
    const actors = members.map((m) => {
      const key = `${instance.id}:${m.group}:${m.index}`;
      const actor = buildActor(m.kind, m.look, key, m.index, m);
      cast.add(actor.root);
      return actor;
    });
    const props = script.props.map((p) => {
      const prop = buildProp(p.kind, p.look);
      if (prop) cast.add(prop.root);
      return prop;
    });
    const spears = script.spears.map(() => {
      const pivot = new THREE.Group();
      pivot.add(buildSpearObject());
      pivot.visible = false;
      cast.add(pivot);
      return pivot;
    });
    this.group.add(cast);
    const stage: Stage = {
      instance,
      entry,
      members,
      cast,
      actors,
      script,
      props,
      spears,
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
   * Poses every actor, prop and spear. Each stands on the ground at its own
   * point of the globe, upright there, so a stage grown to hundreds of
   * kilometres still follows the curve of the Earth.
   */
  private pose(stage: Stage): void {
    const v = this.structures.get(stage.entry.structure);
    if (!v) return;
    const phase = phaseOf(v.template, stage.instance, this.ms);
    const poses = posesAt(stage.instance, stage.members, phase);
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i]!;
      const actor = stage.actors[i]!;
      // Entering and leaving fade (appear, vanish); falling and cut-up sink into the ground.
      const fade = p.fade ? p.visibility : 1;
      actor.root.visible = p.visibility > 0 && (fade >= 0.5 || !!actor.setFade);
      if (!actor.root.visible) continue;
      actor.setFade?.(fade);
      const scale = FIGURE_KM_PER_M * this.cap(actor);
      // On a landmark a group's members are spread as on any other stage, so they
      // do not merge into a blob at the landmark's smaller scale (giza.md section 11.4).
      const frame = stage.frame;
      const spread = frame ? LAYOUT_KM_PER_M / frame.kmPerM - 1 : 0;
      const [ox, oz] = stage.offsets[i]!;
      this.stand(stage, actor.root, p.x + ox * spread, p.z + oz * spread, p.dirX, p.dirZ);
      const sink = p.fade ? 0 : (1 - p.visibility) * actor.height * scale;
      actor.root.position.addScaledVector(this.v2, -sink);
      actor.root.scale.setScalar(scale);
      actor.pose(p.clip, p.clipMs / 1000);
    }
    const props = propPosesAt(stage.instance, stage.script.props, phase);
    for (let i = 0; i < props.length; i++) {
      const p = props[i]!;
      const prop = stage.props[i];
      if (!prop) continue;
      // Put up and taken down: it fades in and out.
      prop.root.visible = p.visibility > 0;
      if (!prop.root.visible) continue;
      prop.setFade?.(p.visibility);
      this.stand(stage, prop.root, p.x, p.z, p.dirX, p.dirZ);
      prop.root.scale.setScalar(FIGURE_KM_PER_M);
    }
    this.poseSpears(stage, phase);
  }

  /** An animal is drawn at most ANIMAL_MAX_ADULTS adults tall, so people stay readable. */
  private cap(actor: StandIn): number {
    return Math.min(1, (ANIMAL_MAX_ADULTS * ADULT_M) / actor.height);
  }

  /**
   * Stands an object on the ground at a stage point, upright there and facing
   * along (dirX east, dirZ north), whatever the camera does. Leaves the ground
   * direction in v2.
   */
  private stand(
    stage: Stage,
    root: THREE.Object3D,
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
  ): void {
    const dir = this.ground(stage, x, z);
    const north = this.v3;
    const east = this.v4;
    northEast(dir, north, east);
    // Local frame x east, y up, z south; then turn to face along (dirX east, dirZ north).
    root.quaternion.setFromRotationMatrix(this.basis.makeBasis(east, dir, north.negate()));
    root.quaternion.multiply(this.turn.setFromAxisAngle(this.yAxis, Math.atan2(dirZ, dirX)));
    // On a landmark, figures stand on its drawn surface (giza.md section 11.6).
    const f = stage.frame;
    const onLandmark = f ? f.surfaceM(x / 100, z / 100) * f.upKmPerM : 0;
    root.position
      .copy(dir)
      .multiplyScalar(EARTH_RADIUS_KM + this.surface.surfaceKm([dir.x, dir.y, dir.z]) + onLandmark);
  }

  /** The up direction of the globe under a stage point, in v2. */
  private ground(stage: Stage, x: number, z: number): THREE.Vector3 {
    // A stage on a landmark is laid out at the landmark's scale (giza.md section 11.4).
    const kmPerM = stage.frame ? stage.frame.kmPerM : LAYOUT_KM_PER_M;
    return this.v2
      .copy(stage.up)
      .multiplyScalar(EARTH_RADIUS_KM)
      .addScaledVector(stage.east, (x / 100) * kmPerM)
      .addScaledVector(stage.north, (z / 100) * kmPerM)
      .normalize();
  }

  /** Spears in the air arc from hand to target; landed ones ride their target's back. */
  private poseSpears(stage: Stage, phase: number): void {
    const spears = spearsAt(stage.instance, stage.script.spears, phase);
    for (let i = 0; i < spears.length; i++) {
      const sp = spears[i]!;
      const pivot = stage.spears[i]!;
      const mesh = pivot.children[0]!;
      if (sp.stuck) {
        const target = stage.actors[sp.stuck.target]!;
        const back = target.back;
        if (!back) {
          pivot.visible = false;
          continue;
        }
        if (pivot.parent !== back.bone) {
          back.bone.add(pivot);
          const b = back.box;
          const u = sp.stuck.spot / 1000;
          const side = (sp.stuck.spot % 2 ? 1 : -1) * 0.25 * (b.max.x - b.min.x);
          pivot.position.set(
            side,
            b.max.y * 0.92,
            b.min.z + (b.max.z - b.min.z) * (0.2 + 0.55 * u),
          );
          // Tip in the body, shaft out, up and back, leaning a little to one side.
          pivot.rotation.set(Math.PI - 0.55, 0, side > 0 ? -0.35 : 0.35);
          pivot.scale.setScalar(1 / this.cap(target));
          mesh.position.set(0, -2.0, 0);
        }
        pivot.visible = true;
        continue;
      }
      if (pivot.parent !== stage.cast) {
        stage.cast.add(pivot);
        pivot.rotation.set(0, 0, 0);
        mesh.position.set(0, -1.1, 0);
      }
      const f = sp.flying;
      pivot.visible = !!f;
      if (!f) continue;
      const s = stage.script.spears[i]!;
      const target = stage.actors[s.target]!;
      const dist = Math.sqrt((s.x1 - s.x0) ** 2 + (s.z1 - s.z0) ** 2);
      const flatKm = (dist / 100) * LAYOUT_KM_PER_M;
      const h0 = SPEAR_HAND_M * FIGURE_KM_PER_M;
      const h1 = target.height * this.cap(target) * 0.75 * FIGURE_KM_PER_M;
      const arc = SPEAR_ARC * flatKm;
      const h = h0 + (h1 - h0) * f.f + 4 * f.f * (1 - f.f) * arc;
      const dh = h1 - h0 + arc * 4 * (1 - 2 * f.f);
      const dir = this.ground(stage, f.x, f.z);
      const north = this.v3;
      const east = this.v4;
      northEast(dir, north, east);
      const ahead = this.v5.copy(east).multiplyScalar(f.dirX).addScaledVector(north, f.dirZ);
      const tangent = ahead.multiplyScalar(flatKm).addScaledVector(dir, dh).normalize();
      const lift = this.v7.copy(dir).multiplyScalar(h);
      pivot.quaternion.setFromUnitVectors(this.yAxis, tangent);
      pivot.position
        .copy(dir)
        .multiplyScalar(EARTH_RADIUS_KM + this.surface.surfaceKm([dir.x, dir.y, dir.z]))
        .add(lift);
      pivot.scale.setScalar(FIGURE_KM_PER_M);
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
        // A role played by men: an adult, so it shows the figure size.
        const first = stage.actors.find((a, i) => a.root.visible && stage.members[i]!.man);
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
            return v ? phaseOf(v.template, stage.instance, this.ms) : undefined;
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
