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
import { moundDepthAt, type Mound } from '../globe/globe.ts';
import { CavePaintings } from './cavePaintings.ts';
import { CaveWalls } from './caveWalls.ts';
import {
  CAMP_CLEARING_KM,
  FIGURE_KM_PER_M,
  LAYOUT_KM_PER_M,
  POLE_HALF_M,
  POLE_ON_GROUND_M,
  TEMPO,
  treeScene,
  type CampPropPose,
  type Placed,
  type TreeChunk,
  type TreeScene,
} from '../world/treeScene.ts';
import {
  buildTreeFigure,
  buildTreePrey,
  TREE_SPEAR_BATCH,
  treeFigureBatch,
  treePreyBatch,
  treePropBatch,
  type TreeActor,
  type TreeBatch,
} from '../vignettes/figures.ts';
import type { StandIn } from '../vignettes/standIns.ts';
import type { Profile } from '../world/cultures.ts';
import { animalLoop, animateAnimal } from '../../../assets/src/clips.ts';
import type { Model } from '../../../assets/src/kit.ts';
import { buildSteps, flickerHearth, lightHearth, setBuilt } from '../../../assets/src/shelters.ts';
import { ClipBatches } from './clipBatches.ts';
import type { SceneMessage } from './sceneWorker.ts';
import { PosedBatches } from './posedBatches.ts';
import type { SurfaceSource } from '../vignettes/vignetteLayer.ts';
import type { Obstacle } from '../wildlife/wildlifeLayer.ts';

/** Camps this far beyond the horizon, in radians, are still worked out, for the history lens. */

/**
 * A cave's cut hill (humankind.md section 8.2): within this many layout metres of the painting
 * the half towards the hearth sinks, by up to this many life-size metres as drawn for figures.
 */
const CAVE_CUT_M = 13;
const CAVE_CUT_DEEP_M = 1.8;
/** A grave's heap lies this deep (life-size metres) beneath the ground when it has sunk away. */
const GRAVE_DEPTH_M = 0.75;
/** Below this share of its depth a cut has no wall; low, so the wall sinks into the ground rather than popping off. */
const CAVE_WALL_FROM = 0.04;
/** The cut, and its wall, run this many layout metres behind the painting. */
const CAVE_FACE_BEHIND_M = 0;
const NEAR_MARGIN = 0.3;
/** The oldest camp scene from the worker drawn while the clock runs: a few frames' worth of watching. */
const MAX_SCENE_LAG_MS = 100;

/** The worker's answer: the camp scene of a tree file at a time. */
interface SceneAnswer {
  w: number;
  ms: number;
  scene?: TreeScene;
}

/** The camp scene worker, where the browser has workers; undefined in tests under Node. */
function startSceneWorker(answer: (a: SceneAnswer) => void): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined;
  const worker = new Worker(new URL('./sceneWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<SceneAnswer>) => answer(e.data);
  return worker;
}
/** Half sizes of what wild animals keep clear of, in life-size metres (wildlife.md section 4). */
const FIGURE_HALF_M = 0.4;
const PREY_HALF_M = 1.3;
const LODGING_HALF_M = 1.4;
/**
 * Levels of detail by size on screen (milestone 2 section 5.5): a figure (FIGURE_M tall)
 * drawn smaller than FIGURE_PX pixels is not drawn, nor its camp's animals, spears, poles
 * and props; lodgings and hearths go below LODGING_PX.
 */
const FIGURE_M = 1.7;
const FIGURE_PX = 5;
const LODGING_PX = 3;
/** A red flag stands this tall, in life-size metres. */
const FLAG_M = 12.8;
/** Lodgings are drawn at most this wide, in life-size metres, so every culture's fits the camp's layout. */
const LODGING_MAX_M = 2.7;
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
  /** Hunted animals fading in or out, each drawn on its own with its own fade. */
  private prey = new Map<string, StandIn | undefined>();
  /** Sparks of fires being lit: small glowing beads, reused frame to frame. */
  private sparks: THREE.Mesh[] = [];
  private sparkGeometry = new THREE.SphereGeometry(0.07, 6, 4);
  private sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffc04a });
  private camera: THREE.PerspectiveCamera | undefined;
  private cleared: Clearing[] = [];
  private blocking: Obstacle[] = [];
  private blocked = 0;
  private basis = new THREE.Matrix4();
  private turn = new THREE.Quaternion();
  private yAxis = new THREE.Vector3(0, 1, 0);
  private zAxis = new THREE.Vector3(0, 0, 1);
  private pos = new THREE.Vector3();
  /** Drawn up per camp place, and drawn ground per spot of a camp (place()). */
  private drawnUps = new Map<string, THREE.Vector3>();
  private grounds = new Map<string, number>();
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
    this.walls = new CaveWalls(
      (d) => surface.surfaceKm(d),
      () => surface.seaKm?.() ?? -Infinity,
    );
    this.group.add(
      this.walls.group,
      this.batches.group,
      this.paintings.group,
      this.clips.group,
      this.preyClips.group,
    );
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

  /** Screen pixels per life-size metre at each camp this frame, by place. */
  private pixels = new Map<string, number>();
  private probe = new THREE.Vector3();
  /** Whether a figure-sized thing at a camp would be drawn smaller than `px` pixels tall. */
  private tiny(p: { lat: number; lon: number }, px: number): boolean {
    const key = `${p.lat}:${p.lon}`;
    let perM = this.pixels.get(key);
    if (perM === undefined) {
      const camera = this.camera!;
      const at = this.probe.set(...this.surface.toDrawn(latLonToDir(p.lat, p.lon)));
      at.normalize().multiplyScalar(EARTH_RADIUS_KM);
      const km = Math.max(1, at.distanceTo(camera.position));
      const fov = (camera.fov * Math.PI) / 180;
      perM = (FIGURE_KM_PER_M * innerHeight) / (2 * km * Math.tan(fov / 2));
      this.pixels.set(key, perM);
    }
    return perM * FIGURE_M < px;
  }

  /** The scale that keeps a lodging model at most LODGING_MAX_M across, by its kind. */
  private fits = new Map<string, number>();
  /** Everything of the camps with approved models, drawn as copies of a few models (posedBatches.ts). */
  private batches = new PosedBatches();
  /** The caves' paintings, pictures on their rock faces (cavePaintings.ts). */
  private paintings = new CavePaintings();
  /** The caves' rock faces, smooth walls along their cuts (caveWalls.ts). */
  private walls: CaveWalls;
  /** The people of the camps with approved models, playing baked clips on the GPU (clipBatches.ts). */
  private clips = new ClipBatches();
  /** The hunted animals of the camps, likewise (clipBatches.ts). */
  private preyClips = new ClipBatches(animateAnimal, animalLoop);
  private scratch = new THREE.Object3D();
  private fitOf(batch: TreeBatch): number {
    let fit = this.fits.get(batch.key);
    if (fit === undefined) {
      // Measured on a model of its own, upright at the origin, as built.
      const object = batch.build().object;
      object.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
      fit = Math.min(1, LODGING_MAX_M / Math.max(size.x, size.z, 1e-6));
      this.fits.set(batch.key, fit);
    }
    return fit;
  }

  /** The building steps of a batch's template, found once. */
  private templateSteps = new WeakMap<Model, THREE.Object3D[]>();
  private stepsOf(m: Model): THREE.Object3D[] {
    let steps = this.templateSteps.get(m);
    if (!steps) this.templateSteps.set(m, (steps = buildSteps(m)));
    return steps;
  }

  /** Whether a lodging model goes up in building steps, by its kind. */
  private steps = new Map<string, boolean>();
  private stepped(batch: TreeBatch): boolean {
    let stepped = this.steps.get(batch.key);
    if (stepped === undefined) {
      stepped = buildSteps(batch.build()).length > 0;
      this.steps.set(batch.key, stepped);
    }
    return stepped;
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
    // The minute's chunk, and those around it ahead of time; until it arrives the nearest
    // loaded one stands in, so the camps do not blink out between minutes.
    for (const k of [w, w + 1, w + 2, w + 3, w - 1]) this.request(k);
    for (const k of this.chunks.keys())
      if (k < w - 2 || k > w + 4) {
        // Forgotten, so it is fetched again when the clock comes back to it.
        this.chunks.delete(k);
        this.requested.delete(k);
        this.worker?.postMessage({ type: 'drop', w: k } satisfies SceneMessage);
      }
    const key = [w, w - 1, w + 1].find((k) => this.chunks.has(k));
    const chunk = key === undefined ? undefined : this.chunks.get(key);
    if (!chunk || key === undefined) {
      this.clear();
      return;
    }
    // Only the camps on the camera's side of the globe, with a margin for the history lens.
    const camDir = this.v2.copy(camera.position).normalize();
    const limit = Math.acos(Math.min(1, EARTH_RADIUS_KM / camera.position.length())) + NEAR_MARGIN;
    const cosLimit = Math.cos(Math.min(Math.PI, limit));
    const near = (lat: number, lon: number) => {
      const [x, y, z] = latLonToDir(lat, lon);
      return x * camDir.x + y * camDir.y + z * camDir.z >= cosLimit;
    };
    const scene = this.sceneAt(chunk, key, ms, startDay, near, camDir, cosLimit);
    this.pixels.clear();
    // What is too small on screen to see is left out (milestone 2 section 5.5).
    const big = <T extends { lat: number; lon: number }>(list: T[], px: number) =>
      list.filter((x) => !this.tiny(x, px));
    scene.prey = big(scene.prey, FIGURE_PX);
    scene.spears = big(scene.spears, FIGURE_PX);
    scene.poles = big(scene.poles, FIGURE_PX);
    // The red flags are huge, to be seen from far out (peopling.md section 3.6).
    scene.props = scene.props.filter((q) =>
      q.kind === 'prop-red-flag'
        ? !this.tiny(q, (LODGING_PX * FIGURE_M) / FLAG_M)
        : !this.tiny(q, FIGURE_PX),
    );
    scene.sparks = big(scene.sparks, FIGURE_PX);
    scene.lodgings = big(scene.lodgings, LODGING_PX);
    scene.hearths = big(scene.hearths, LODGING_PX);

    // The caves' cut hills first, so everything standing on them stands on the lowered ground.
    this.hills = [];
    for (const q of scene.props)
      if (q.kind.startsWith('prop-cave-wall-') && q.rise !== undefined) this.hill(q);
    this.walls.update(this.hills);
    const seen = new Set<number>();
    // Clips play TEMPO times faster, matching the faster pace on the ground.
    const sec = (clipMs: number) => (clipMs * TEMPO) / 1000;
    this.batches.begin();
    this.paintings.begin();
    this.clips.begin();
    this.preyClips.begin();
    for (const f of scene.figures) {
      seen.add(f.id);
      let actor = this.figures.get(f.id);
      // Too small on screen to see: neither built nor posed (milestone 2 section 5.5).
      if (this.tiny(f, FIGURE_PX)) {
        if (actor) actor.root.visible = false;
        continue;
      }
      // A figure with an approved model is a copy in its model's batch, playing baked clips
      // (clipBatches.ts).
      const profile0 = (f.profile ?? 'african-stone-age') as Profile;
      // A soul is drawn on its own, see-through, never in a batch (humankind.md section 8.2).
      const batch = f.soul ? undefined : treeFigureBatch(f.look, f.id, profile0);
      if (batch) {
        const at = this.scratch;
        if (!this.place(at, f, false) || f.hidden) continue;
        if (f.lift) at.position.addScaledVector(this.dir, f.lift * FIGURE_KM_PER_M);
        this.block(at, FIGURE_HALF_M);
        at.scale.setScalar(FIGURE_KM_PER_M);
        at.updateMatrix();
        this.clips.add(batch.key, batch.build, at.matrix, {
          clip: f.clip,
          seconds: sec(f.clipMs),
          ...(f.from
            ? { from: { clip: f.from.clip, seconds: sec(f.from.clipMs), weight: f.from.weight } }
            : {}),
          ...(f.unarmed ? { hide: 'tool' } : {}),
        });
        continue;
      }
      // A figure in new clothes is a new model (peopling.md section 5.3).
      const profile = (f.profile ?? 'african-stone-age') as Profile;
      if (actor && this.profiles.get(f.id) !== profile) {
        this.prune(this.figures, new Set([...this.figures.keys()].filter((id) => id !== f.id)));
        actor = undefined;
      }
      if (!actor) {
        actor = buildTreeFigure(f.look, f.id < 0 ? -1 - f.id : f.id, profile);
        this.figures.set(f.id, actor);
        this.profiles.set(f.id, profile);
        this.group.add(actor.root);
      }
      if (!this.place(actor.root, f)) continue;
      if (f.lift) actor.root.position.addScaledVector(this.dir, f.lift * FIGURE_KM_PER_M);
      if (f.soul) {
        actor.root.position.addScaledVector(this.dir, f.soul.height * FIGURE_KM_PER_M);
        actor.setFade?.(f.soul.fade);
      }
      // Inside its hut, out of sight (humankind.md section 8.1).
      if (f.hidden) {
        actor.root.visible = false;
        continue;
      }
      this.block(actor.root, FIGURE_HALF_M);
      actor.root.scale.setScalar(FIGURE_KM_PER_M);
      if (f.from)
        actor.blend(f.from.clip, sec(f.from.clipMs), f.clip, sec(f.clipMs), f.from.weight);
      else actor.pose(f.clip, sec(f.clipMs));
      if (f.unarmed) actor.hideTool();
    }
    this.prune(this.figures, seen);

    // Everything else of the camps is drawn as copies of a few models too (posedBatches.ts):
    // placed on the scratch object, scaled, and posed on the batch's template.
    const at = this.scratch;
    const copy = (batch: TreeBatch, pose?: (m: Model) => void) => {
      at.updateMatrix();
      this.batches.add(batch.key, batch.build, at.matrix, pose);
    };

    // Spears away from the hand: their middle at its height, along their flight.
    for (const sp of scene.spears) {
      if (!this.place(at, sp, false)) continue;
      const up = this.v1.copy(this.dir);
      northEast(up, this.n2, this.e2);
      const ahead = this.e2.multiplyScalar(sp.dirX).addScaledVector(this.n2, sp.dirZ);
      const along = ahead.addScaledVector(up, sp.slope).normalize();
      at.quaternion.setFromUnitVectors(this.yAxis, along);
      at.position.addScaledVector(up, sp.height * FIGURE_KM_PER_M);
      at.scale.setScalar(FIGURE_KM_PER_M);
      copy(TREE_SPEAR_BATCH);
    }

    // Drying racks beside the lodgings, the spit over a fire while meat roasts, canoes on
    // the water and red flags at the Neolithic thresholds.
    for (const q of scene.props) {
      const batch = treePropBatch(q.kind);
      if (!batch || !this.place(at, q, false)) continue;
      const km = FIGURE_KM_PER_M * (q.scale ?? 1);
      const cave = q.kind.startsWith('prop-cave-wall-');
      if (q.rise !== undefined && !cave) {
        // A grave's heap of earth rises out of the ground and sinks back (humankind.md section 8.2).
        const r = q.rise * q.rise * (3 - 2 * q.rise);
        // Whole and in shape, it comes up out of the ground and goes back down through it,
        // never squashed flat (Yang, 2026-10-21: "I would rather have the burial mound sink
        // through the ground").
        at.scale.setScalar(km);
        at.position.addScaledVector(this.dir, -(1 - r) * GRAVE_DEPTH_M * km);
      } else at.scale.setScalar(km);
      if (q.height) at.position.addScaledVector(this.dir, q.height * FIGURE_KM_PER_M);
      // A scene's wall or grave grows in step by step as it is painted or filled (humankind.md section 8.2).
      // A cave's painting, a picture on the face, painted session by session.
      if (cave) {
        at.updateMatrix();
        this.paintings.add(q.kind, at.matrix, q.built ?? 0, Math.min(q.rise ?? 1, q.paint ?? 1));
      }
      if (q.built !== undefined)
        copy(batch, (m) => {
          setBuilt(this.stepsOf(m), q.built!);
          const torch = m.bones.get('torch');
          if (torch) torch.visible = !!q.lit;
        });
      else copy(batch);
      // The dead's skull fades away as it rises (humankind.md section 8.2).
      if (q.fade !== undefined) this.batches.fade(batch.key, q.fade);
    }

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
    const pole = treePropBatch('prop-carry-pole');
    for (const p of pole ? scene.poles : []) {
      if (!this.place(at, p, false)) continue;
      // Its two ends rest on the carriers, who each stand on the ground under them: the
      // middle at the mean of the two, the pole tilted along its length to match.
      const [back, front] = this.poleEnds(p);
      at.position.copy(this.dir).multiplyScalar(EARTH_RADIUS_KM + (back + front) / 2);
      at.quaternion.multiply(
        this.turn.setFromAxisAngle(
          this.zAxis,
          Math.atan2(front - back, 2 * POLE_HALF_M * LAYOUT_KM_PER_M),
        ),
      );
      at.position.addScaledVector(this.dir, (p.height - POLE_ON_GROUND_M) * FIGURE_KM_PER_M);
      at.scale.setScalar(FIGURE_KM_PER_M);
      copy(pole!);
    }

    // Hunted animals; one fading in or out is drawn on its own, with its own fade.
    const fading = new Set<string>();
    for (const p of scene.prey) {
      if (p.visibility <= 0) continue;
      const batch = p.visibility >= 1 ? treePreyBatch(p.kind) : undefined;
      if (batch) {
        if (!this.place(at, p, false)) continue;
        // Hung from the pole, it hangs at the pole's height, not the ground's under it.
        if (p.clip === 'hung') {
          const [back, front] = this.poleEnds(p);
          at.position.copy(this.dir).multiplyScalar(EARTH_RADIUS_KM + (back + front) / 2);
        }
        this.block(at, PREY_HALF_M);
        at.scale.setScalar(FIGURE_KM_PER_M);
        at.updateMatrix();
        this.preyClips.add(batch.key, batch.build, at.matrix, {
          clip: p.clip,
          seconds: (p.clipMs * TEMPO) / 1000,
        });
        continue;
      }
      fading.add(p.id);
      if (!this.prey.has(p.id)) this.prey.set(p.id, buildTreePrey(p.kind));
      const animal = this.prey.get(p.id);
      if (!animal || !this.place(animal.root, p)) continue;
      // Its room grows as it fades in, so wild animals near it make way smoothly instead of
      // jumping aside the moment it appears (wildlife.md section 5).
      this.block(animal.root, PREY_HALF_M * p.visibility);
      animal.setFade?.(p.visibility);
      animal.root.scale.setScalar(FIGURE_KM_PER_M);
      animal.pose(p.clip, (p.clipMs * TEMPO) / 1000);
    }
    this.prune(this.prey, fading);

    for (const l of scene.lodgings) {
      const batch = treePropBatch(l.kind);
      if (!batch || !this.place(at, l, false)) continue;
      this.block(at, LODGING_HALF_M);
      // Every lodging fits the camp's layout, at most LODGING_MAX_M across (humankind.md section 8.1).
      const km = FIGURE_KM_PER_M * this.fitOf(batch);
      // While the band builds it, the lodging goes up step by step, or rises whole.
      if (this.stepped(batch)) {
        at.scale.setScalar(km);
        copy(batch, (m) => setBuilt(this.stepsOf(m), l.built));
      } else {
        const rise = l.built * l.built * (3 - 2 * l.built);
        const wide = km * (0.5 + 0.5 * rise);
        at.scale.set(wide, km * Math.max(0.04, rise), wide);
        copy(batch);
      }
    }

    this.cleared = scene.clearings.map((c) => ({
      dir: c.x === undefined ? latLonToDir(c.lat, c.lon) : this.offsetDir(c.lat, c.lon, c.x, c.z!),
      km: c.km ?? CAMP_CLEARING_KM,
      amount: c.amount,
      felling: c.felling,
    }));
    const hearth = treePropBatch('prop-hearth');
    for (const h of hearth ? scene.hearths : []) {
      if (!this.place(at, { lat: h.lat, lon: h.lon, x: 0, z: 0, dirX: 1, dirZ: 0 }, false))
        continue;
      this.block(at, HEARTH_HALF_M);
      at.scale.setScalar(FIGURE_KM_PER_M);
      // The fire flickers with the clock, so a paused world holds still, and grows from
      // nothing while a new fire is lit.
      copy(hearth!, (m) => {
        flickerHearth(m, ms / 1000);
        lightHearth(m, h.lit);
      });
    }
    this.batches.end();
    this.paintings.end();
    this.clips.end();
    this.preyClips.end();
    this.park();
  }

  /**
   * Takes everything hidden this frame out of the scene: behind the globe, too small to see,
   * inside a hut. Hidden objects in the scene still cost a matrix update each frame; out of
   * it they cost nothing, and place() puts them back as soon as they are seen again.
   */
  private park(): void {
    const kept: THREE.Object3D[] = [];
    for (const o of this.group.children) {
      if (o.visible) kept.push(o);
      else o.parent = null;
    }
    this.group.children = kept;
  }

  /**
   * The drawn ground, in km above the globe's radius, under the two ends of a carrying pole
   * facing along (dirX, dirZ): behind its middle and in front of it.
   */
  private poleEnds(p: Placed): [number, number] {
    const at = (s: number) => {
      const { up, east, north, v2 } = this;
      up.set(...this.surface.toDrawn(latLonToDir(p.lat, p.lon))).normalize();
      northEast(up, north, east);
      v2.copy(up)
        .multiplyScalar(EARTH_RADIUS_KM)
        .addScaledVector(east, (p.x + s * p.dirX * POLE_HALF_M) * LAYOUT_KM_PER_M)
        .addScaledVector(north, (p.z + s * p.dirZ * POLE_HALF_M) * LAYOUT_KM_PER_M)
        .normalize();
      return this.surface.surfaceKm([v2.x, v2.y, v2.z]);
    };
    return [at(-1), at(1)];
  }

  /** The true direction of a point of the scene: layout metres east and north of a place. */
  /** The hills of the caves in view this frame (humankind.md section 8.2), for the globe. */
  private hills: Mound[] = [];
  mounds(): readonly Mound[] {
    return this.hills;
  }

  /** A cave's cut hill at its painting, the half towards the hearth sinking (humankind.md section 8.2). */
  private hill(q: CampPropPose): void {
    const k = q.scale ?? 1;
    const r = q.rise!;
    const sink = r * r * (3 - 2 * r);
    const up = new THREE.Vector3(...this.surface.toDrawn(latLonToDir(q.lat, q.lon))).normalize();
    const north = new THREE.Vector3();
    const east = new THREE.Vector3();
    northEast(up, north, east);
    const centre = up
      .clone()
      .multiplyScalar(EARTH_RADIUS_KM)
      .addScaledVector(east, q.x * LAYOUT_KM_PER_M)
      .addScaledVector(north, q.z * LAYOUT_KM_PER_M)
      .normalize();
    // Towards the hearth, along the ground there; the cut runs just behind the painting, so it
    // stands on the lowered ground against the face.
    const toward = east.multiplyScalar(q.dirX).addScaledVector(north, q.dirZ);
    toward.addScaledVector(centre, -toward.dot(centre)).normalize();
    centre
      .multiplyScalar(EARTH_RADIUS_KM)
      .addScaledVector(toward, -CAVE_FACE_BEHIND_M * k * LAYOUT_KM_PER_M)
      .normalize();
    this.hills.push({
      centre: [centre.x, centre.y, centre.z],
      radiusKm: CAVE_CUT_M * k * LAYOUT_KM_PER_M,
      toward: [toward.x, toward.y, toward.z],
      depthKm: CAVE_CUT_DEEP_M * k * FIGURE_KM_PER_M * sink,
      sink,
      walled: sink >= CAVE_WALL_FROM,
      rock: q.kind === 'prop-cave-wall-sulawesi' ? 1 : 0,
    });
  }

  /** How far the caves' cuts lower the ground at a drawn direction, never below the sea. */
  private cutAt(dir: THREE.Vector3, surface: number): number {
    if (!this.hills.length) return 0;
    const v: [number, number, number] = [dir.x, dir.y, dir.z];
    let depth = 0;
    for (const m of this.hills) depth += moundDepthAt(m, v);
    if (depth <= 0) return depth;
    const sea = this.surface.seaKm?.() ?? -Infinity;
    return Math.min(depth, Math.max(0, surface - sea - 1));
  }

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
      (chunk) => {
        this.chunks.set(w, chunk);
        this.worker?.postMessage({ type: 'chunk', w, chunk } satisfies SceneMessage);
      },
      () => this.requested.delete(w),
    );
  }

  /**
   * The camp scene at a time (humankind.md section 8): while the clock runs, the newest one
   * the worker worked out for this tree file, if it is at most MAX_SCENE_LAG_MS behind;
   * otherwise (the clock standing still, a jump, no worker) worked out here. Either way the
   * worker is asked for the next one.
   */
  private sceneAt(
    chunk: TreeChunk,
    key: number,
    ms: number,
    startDay: number,
    near: (lat: number, lon: number) => boolean,
    camDir: THREE.Vector3,
    cosLimit: number,
  ): TreeScene {
    if (this.worker && !this.asked) {
      this.asked = true;
      this.worker.postMessage({
        type: 'scene',
        id: ++this.sceneId,
        w: key,
        ms,
        startDay,
        camDir: [camDir.x, camDir.y, camDir.z],
        cosLimit,
      } satisfies SceneMessage);
    }
    const got = this.answer;
    // A copy, since the layer filters the lists of the scene it draws.
    if (got?.scene && got.w === key && ms >= got.ms && ms - got.ms <= MAX_SCENE_LAG_MS)
      return { ...got.scene };
    return treeScene(chunk, ms, startDay, near);
  }

  /** The worker that works out the camp scene off the main thread, where workers exist. */
  private worker = startSceneWorker((a) => {
    this.asked = false;
    this.answer = a;
  });
  private asked = false;
  private sceneId = 0;
  private answer: SceneAnswer | undefined;

  private clear(): void {
    this.batches.begin();
    this.batches.end();
    this.clips.begin();
    this.preyClips.begin();
    this.clips.end();
    this.preyClips.end();
    this.prune(this.figures, new Set());
    this.prune(this.prey, new Set());
    for (const bead of this.sparks) bead.visible = false;
    this.cleared = [];
    this.hills = [];
    this.walls.update([]);
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
  private place(root: THREE.Object3D, p: Placed, attach = true): boolean {
    const { up, east, north, dir } = this;
    // The drawn up of a camp's place, and the ground under a spot of it, are kept: the
    // history lens is fixed and the ground does not move, while the lookups are not cheap.
    const placeKey = `${p.lat},${p.lon}`;
    let drawnUp = this.drawnUps.get(placeKey);
    if (!drawnUp) {
      if (this.drawnUps.size > 4096) this.drawnUps.clear();
      drawnUp = new THREE.Vector3(...this.surface.toDrawn(latLonToDir(p.lat, p.lon))).normalize();
      this.drawnUps.set(placeKey, drawnUp);
    }
    up.copy(drawnUp);
    northEast(up, north, east);
    dir
      .copy(up)
      .multiplyScalar(EARTH_RADIUS_KM)
      .addScaledVector(east, p.x * LAYOUT_KM_PER_M)
      .addScaledVector(north, p.z * LAYOUT_KM_PER_M)
      .normalize();
    // On the far side of the globe: hidden, before the ground is looked up.
    if (
      this.v1
        .copy(this.camera!.position)
        .sub(this.pos.copy(dir).multiplyScalar(EARTH_RADIUS_KM))
        .dot(dir) <= 0
    ) {
      root.visible = false;
      return false;
    }
    const spotKey = `${placeKey},${p.x},${p.z}`;
    let surface = this.grounds.get(spotKey);
    if (surface === undefined) {
      if (this.grounds.size > 20_000) this.grounds.clear();
      surface = this.surface.surfaceKm([dir.x, dir.y, dir.z]);
      this.grounds.set(spotKey, surface);
    }
    root.position.copy(dir).multiplyScalar(EARTH_RADIUS_KM + surface - this.cutAt(dir, surface));
    const toCam = this.v1.copy(this.camera!.position).sub(root.position);
    root.visible = toCam.dot(dir) > 0;
    if (!root.visible) return false;
    if (attach && root.parent !== this.group) this.group.add(root);
    northEast(dir, this.n2, this.e2);
    // Local frame x east, y up, z south; then turn to face along (dirX east, dirZ north).
    root.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.e2, dir, this.n2.negate()));
    root.quaternion.multiply(this.turn.setFromAxisAngle(this.yAxis, Math.atan2(p.dirZ, p.dirX)));
    return true;
  }
}
