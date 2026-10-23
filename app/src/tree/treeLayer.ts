// Draws the tree of humankind on the globe (spec humankind.md, section 8.1):
// loads the tree chunk of the time window in view, asks the scene who stands
// where at the clock time, and places hearths, lodgings and figures like a
// vignette stage: one drawn size at every zoom, upright on the ground whatever
// the camera does. It only draws; the scene decides everything.

import { FieldGround } from './fieldGround.ts';
import { CropLayer } from './cropLayer.ts';
import { signsAt, type SignEvent } from '../world/eventSigns.ts';
import * as THREE from 'three';
import type { ContentLoader } from '../content/loader.ts';
import { latLonToDir } from '../geo/cube.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import { dayAtMs } from '../time/rate.ts';
import type { Clearing } from '../globe/foliage.ts';
import { moundDepthAt, plateauWeightAt, type Mound } from '../globe/globe.ts';
import { CavePaintings } from './cavePaintings.ts';
import { CampGround } from './campGround.ts';
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
  TREE_ARROW_BATCH,
  TREE_BOW_BATCH,
  TREE_SPEAR_BATCH,
  treeFigureBatch,
  treePreyBatch,
  treePropBatch,
  type TreeActor,
  type TreeBatch,
} from './figures.ts';
import type { StandIn } from './standIns.ts';
import type { Profile } from '../world/cultures.ts';
import { animalLoop, animateAnimal } from '../../../assets/src/clips.ts';
import type { Model } from '../../../assets/src/kit.ts';
import { buildSteps, flickerHearth, lightHearth, setBuilt } from '../../../assets/src/shelters.ts';
import { ClipBatches } from './clipBatches.ts';
import { FarmingGrid, setFarmingGrid } from '../world/farmingOnset.ts';
import type { SceneMessage } from './sceneWorker.ts';
import { PosedBatches } from './posedBatches.ts';
import type { SurfaceSource } from './surface.ts';
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
/** The monument sinks its own height, 5.5 metres, linearly with the date (humankind.md section 8.2). */
const MONUMENT_DEPTH_M = 5.5;
/** The ground is levelled this far round a monument's middle, in layout metres at its drawn size. */
const MONUMENT_PLATEAU_M = 30;
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

let farmingBytes: Uint8Array | undefined;
const sceneWorkers = new Set<Worker>();

/** Sets the farming spread grid for the scenes computed here and in the scene workers. */
export function setTreeFarming(bytes: Uint8Array): void {
  farmingBytes = bytes;
  setFarmingGrid(new FarmingGrid(bytes));
  for (const w of sceneWorkers) w.postMessage({ type: 'farming', bytes } satisfies SceneMessage);
}

/** The camp scene worker, where the browser has workers; undefined in tests under Node. */
function startSceneWorker(answer: (a: SceneAnswer) => void): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined;
  const worker = new Worker(new URL('./sceneWorker.ts', import.meta.url), { type: 'module' });
  // The farming grid goes first, so no scene is computed without it (farming-spread.md section 9.4).
  if (farmingBytes)
    worker.postMessage({ type: 'farming', bytes: farmingBytes } satisfies SceneMessage);
  sceneWorkers.add(worker);
  worker.onmessage = (e: MessageEvent<SceneAnswer>) => answer(e.data);
  return worker;
}
/** Half sizes of what wild animals keep clear of, in life-size metres (wildlife.md section 4). */
const FIGURE_HALF_M = 0.4;
const PREY_HALF_M = 1.3;
/** How far, in layout metres, a hunted animal's ground is looked up round its middle: a mammoth is about 15 layout metres long, other prey about 6. */
const preySpread = (kind: string) => (kind.includes('mammoth') ? 7 : 3);
const SPREAD_STEPS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const LODGING_HALF_M = 1.4;
/**
 * Levels of detail by size on screen (milestone 2 section 5.5): a figure (FIGURE_M tall)
 * drawn smaller than FIGURE_PX pixels is not drawn, nor its camp's animals, spears, poles
 * and props; lodgings and hearths go below LODGING_PX.
 */
const FIGURE_M = 1.7;
const FIGURE_PX = 5;
const LODGING_PX = 3;
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
    this.ground = new CampGround(surface, CAMP_CLEARING_KM * 0.6);
    this.fieldGround = new FieldGround(surface);
    this.crops = new CropLayer(surface);
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
      this.ground.mesh,
      this.fieldGround.mesh,
      this.crops.group,
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
  /** Where each scene prop was drawn last frame, by anchor id, for taps (humankind.md section 8.3). */
  private groundVersion = 0;
  private stagePoints: { id: string; at: THREE.Vector3; m: number }[] = [];
  private events: SignEvent[] = [];
  /** The events of the startup index, whose signs stand before them (humankind.md section 8.4). */
  setEvents(events: SignEvent[]): void {
    this.events = events;
  }
  /** The anchor whose scene wall or grave is under a screen point, if any (humankind.md section 8.3). */
  hitScene(clientX: number, clientY: number): string | undefined {
    const camera = this.camera;
    if (!camera) return undefined;
    const pxAtKm = (camera.projectionMatrix.elements[5]! * innerHeight) / 2;
    const p = new THREE.Vector3();
    let best: string | undefined;
    let bestD = Infinity;
    for (const s of this.stagePoints) {
      p.copy(s.at);
      const distance = p.distanceTo(camera.position);
      p.project(camera);
      if (p.z >= 1) continue;
      const x = ((p.x + 1) / 2) * innerWidth;
      const y = ((1 - p.y) / 2) * innerHeight;
      const radius = Math.max(28, (3 * s.m * pxAtKm) / distance);
      const dist = Math.hypot(clientX - x, clientY - y);
      if (dist < radius && dist < bestD) [best, bestD] = [s.id, dist];
    }
    return best;
  }

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
  /** The lighter ground under the camps seen from orbit (humankind.md section 8.1). */
  private ground: CampGround;
  /** The tilled patches and the crops of the villages' fields (neolithic/fields-and-crops.md). */
  private fieldGround: FieldGround;
  private crops: CropLayer;
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
    const groundVersion = this.surface.version?.() ?? 0;
    if (groundVersion !== this.groundVersion) {
      this.groundVersion = groundVersion;
      this.grounds.clear();
    }
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
    scene.props = scene.props.filter((q) => !this.tiny(q, FIGURE_PX));
    // The signs before the events (humankind.md section 8.4).
    scene.props = scene.props.concat(
      signsAt(this.events, ms, startDay).filter((q) => !this.tiny(q, FIGURE_PX)),
    );
    scene.sparks = big(scene.sparks, FIGURE_PX);
    scene.lodgings = big(scene.lodgings, LODGING_PX);
    scene.hearths = big(scene.hearths, LODGING_PX);

    // The caves' cut hills first, so everything standing on them stands on the lowered ground.
    this.hills = [];
    for (const q of scene.props)
      if (q.kind.startsWith('prop-cave-wall-') && q.rise !== undefined) this.hill(q);
      else if (q.kind === 'prop-gobekli-ring' && q.rise !== undefined) this.plateau(q);
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
      if (sp.kind === 'bow') {
        // Upright, bowed ahead of the archer.
        const x = this.v2.copy(up).cross(ahead).normalize();
        at.quaternion.setFromRotationMatrix(this.basis.makeBasis(x, up, ahead.normalize()));
      } else {
        const along = ahead.addScaledVector(up, sp.slope).normalize();
        at.quaternion.setFromUnitVectors(this.yAxis, along);
      }
      at.position.addScaledVector(up, sp.height * FIGURE_KM_PER_M);
      at.scale.setScalar(FIGURE_KM_PER_M);
      copy(
        sp.kind === 'bow'
          ? TREE_BOW_BATCH
          : sp.kind === 'arrow'
            ? TREE_ARROW_BATCH
            : TREE_SPEAR_BATCH,
      );
    }

    // Drying racks beside the lodgings, the spit over a fire while meat roasts and canoes on
    // the water.
    this.stagePoints = [];
    for (const q of scene.props) {
      const batch = treePropBatch(q.kind);
      if (!batch || !this.place(at, q, false)) continue;
      const km = FIGURE_KM_PER_M * (q.scale ?? 1);
      if (q.id.startsWith('stage:') || q.id.startsWith('sign:'))
        this.stagePoints.push({
          id: q.id.startsWith('sign:') ? q.id : q.id.slice(6),
          at: at.position.clone().addScaledVector(this.dir, 1.2 * km),
          m: km,
        });
      const cave = q.kind.startsWith('prop-cave-wall-');
      if (q.rise !== undefined && !cave) {
        // A grave's heap of earth rises out of the ground and sinks back (humankind.md section 8.2).
        const monument = q.kind === 'prop-gobekli-ring';
        const r = monument ? q.rise : q.rise * q.rise * (3 - 2 * q.rise);
        // Whole and in shape, it comes up out of the ground and goes back down through it,
        // never squashed flat (Yang, 2026-10-21: "I would rather have the burial mound sink
        // through the ground").
        at.scale.setScalar(km);
        at.position.addScaledVector(
          this.dir,
          -(1 - r) * (monument ? MONUMENT_DEPTH_M : GRAVE_DEPTH_M) * km,
        );
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
        if (!this.place(at, p, false, preySpread(p.kind))) continue;
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
      if (!animal || !this.place(animal.root, p, true, preySpread(p.kind))) continue;
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
    this.ground.begin();
    for (const h of hearth ? scene.hearths : []) {
      if (!this.place(at, { lat: h.lat, lon: h.lon, x: 0, z: 0, dirX: 1, dirZ: 0 }, false))
        continue;
      this.ground.add(at.position);
      this.block(at, HEARTH_HALF_M);
      at.scale.setScalar(FIGURE_KM_PER_M);
      // The fire flickers with the clock, so a paused world holds still, and grows from
      // nothing while a new fire is lit.
      copy(hearth!, (m) => {
        flickerHearth(m, ms / 1000);
        lightHearth(m, h.lit);
      });
    }
    this.fieldGround.begin();
    this.crops.begin();
    for (const f of scene.fields) {
      if (!this.place(at, { lat: f.lat, lon: f.lon, x: 0, z: 0, dirX: 1, dirZ: 0 }, false))
        continue;
      this.fieldGround.add(at.position, f.field, f.stage, { x: 0, z: 0 });
      this.crops.add(at.position, f.field, f.stage);
    }
    this.fieldGround.end(camera.position.length(), this.groundVersion);
    this.crops.end(camera.position.length(), this.groundVersion);
    // park() takes hidden things out of the group; the field layers come back when shown.
    for (const o of [this.fieldGround.mesh, this.crops.group])
      if (o.visible && o.parent !== this.group) this.group.add(o);
    this.batches.end();
    this.paintings.end();
    this.clips.end();
    this.preyClips.end();
    this.ground.end(camera.position.length(), this.groundVersion);
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
      rock: q.kind === 'prop-cave-wall-sulawesi' ? 1 : q.kind === 'prop-cave-wall-lascaux' ? 2 : 0,
    });
  }

  /**
   * The ground levelled round a monument (humankind.md section 8.2), to the height at its middle,
   * so the ring stands on a plateau and never floats over a slope: it levels as the ring is
   * raised and eases back as the ring has sunk.
   */
  private plateau(q: CampPropPose): void {
    const k = q.scale ?? 1;
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
    const plateau = Math.min(1, (q.rise ?? 0) * 5);
    if (plateau <= 0) return;
    this.hills.push({
      centre: [centre.x, centre.y, centre.z],
      radiusKm: MONUMENT_PLATEAU_M * k * LAYOUT_KM_PER_M,
      toward: [0, 0, 0],
      depthKm: 0,
      plateauKm: this.surface.surfaceKm([centre.x, centre.y, centre.z]),
      plateau,
    });
  }

  /** How far the caves' cuts lower the ground at a drawn direction, never below the sea. */
  private cutAt(dir: THREE.Vector3, surface: number): number {
    if (!this.hills.length) return 0;
    const v: [number, number, number] = [dir.x, dir.y, dir.z];
    let depth = 0;
    for (const m of this.hills) {
      if (m.plateauKm === undefined) depth += moundDepthAt(m, v);
      else depth += (surface - m.plateauKm) * plateauWeightAt(m, v);
    }
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
  private place(root: THREE.Object3D, p: Placed, attach = true, spread = 0): boolean {
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
    // Drawn towards the same spot in another place's frame (see Placed.anchor).
    const { anchor } = p;
    if (anchor) {
      const anchorKey = `${anchor.lat},${anchor.lon}`;
      let anchorUp = this.drawnUps.get(anchorKey);
      if (!anchorUp) {
        anchorUp = new THREE.Vector3(
          ...this.surface.toDrawn(latLonToDir(anchor.lat, anchor.lon)),
        ).normalize();
        this.drawnUps.set(anchorKey, anchorUp);
      }
      northEast(anchorUp, this.n2, this.e2);
      this.pos
        .copy(anchorUp)
        .multiplyScalar(EARTH_RADIUS_KM)
        .addScaledVector(this.e2, anchor.x * LAYOUT_KM_PER_M)
        .addScaledVector(this.n2, anchor.z * LAYOUT_KM_PER_M)
        .normalize();
      dir
        .multiplyScalar(1 - anchor.mix)
        .addScaledVector(this.pos, anchor.mix)
        .normalize();
    }
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
    const spotKey = `${placeKey},${p.x},${p.z},${anchor?.x},${anchor?.z},${anchor?.mix}`;
    let surface = this.grounds.get(spotKey);
    if (surface === undefined) {
      if (this.grounds.size > 20_000) this.grounds.clear();
      surface = this.surface.surfaceKm([dir.x, dir.y, dir.z]);
      this.grounds.set(spotKey, surface);
    }
    // A big animal is many kilometres long on the drawn globe, so on a slope its middle's
    // ground would sink an end: it stands on the highest ground under it (issue 172).
    if (spread > 0) {
      const key = `${spotKey},${spread}`;
      let top = this.grounds.get(key);
      if (top === undefined) {
        top = surface;
        northEast(dir, this.n2, this.e2);
        for (const [dx, dz] of SPREAD_STEPS) {
          this.v1
            .copy(dir)
            .addScaledVector(this.e2, (dx * spread * LAYOUT_KM_PER_M) / EARTH_RADIUS_KM)
            .addScaledVector(this.n2, (dz * spread * LAYOUT_KM_PER_M) / EARTH_RADIUS_KM)
            .normalize();
          top = Math.max(top, this.surface.surfaceKm([this.v1.x, this.v1.y, this.v1.z]));
        }
        this.grounds.set(key, top);
      }
      surface = top;
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
