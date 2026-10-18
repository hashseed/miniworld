// Draws vignettes on the globe (spec milestone 2, sections 7.2 and 18): asks
// the player which instances stand on the current day, places a stage of
// stand-ins at each site, poses them from the life clock, and shows a scene
// marker from further away. It only draws; the player decides everything.

import * as THREE from 'three';
import type { ContentLoader } from '../content/loader.ts';
import type { VignetteEntry } from '../content/types.ts';
import { latLonToDir, type Vec3 } from '../globe/cube.ts';
import { EARTH_RADIUS_KM } from '../globe/tileMesh.ts';
import {
  buildMembers,
  instancesAt,
  posesAt,
  type CompiledVignette,
  type Instance,
  type Member,
} from '../world/vignette.ts';
import { buildStandIn, type StandIn } from './standIns.ts';

/** People and everything they make are drawn 90 times life size (section 5.1). */
const MINIATURE = 90;
/** Life-size metres to drawn kilometres. */
const M_TO_KM = MINIATURE / 1000;
/** The cast is drawn when the camera is closer than this (section 5.5). */
const CAST_DISTANCE_KM = 150;
/** The marker fades out between these camera distances, as the cast becomes large enough to see. */
const MARKER_FADE_KM: [number, number] = [8, 16];
/** Marker height on screen in CSS pixels (section 7.2: at least about 28). */
const MARKER_PX = 40;
const MARKER_ASPECT = 0.8;
/** Taps within this many pixels of a marker's badge or a cast member count as hits. */
const HIT_PX = 26;
/** Altitude the camera flies down to on a double-tap: the whole stage in view. */
const FLY_ALTITUDE_KM = 12;

export interface SurfaceSource {
  surfaceKm(dir: Vec3): number;
}

interface Stage {
  instance: Instance;
  entry: VignetteEntry;
  members: Member[];
  root: THREE.Group;
  cast: THREE.Group;
  actors: StandIn[];
  marker: THREE.Sprite;
  up: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  baseKm: number;
  /** World position of the stage centre, on the ground. */
  centre: THREE.Vector3;
  markerOpacity: number;
}

export class VignetteLayer {
  readonly group = new THREE.Group();
  /** Called when a marker or the cast is tapped. */
  onOpen: (entry: VignetteEntry) => void = () => {};
  /** Called when a marker is double-tapped, with the stage's position. */
  onFly: (lat: number, lon: number, altitudeKm: number) => void = () => {};

  private loader: ContentLoader;
  private surface: SurfaceSource;
  private entries: VignetteEntry[] = [];
  private structures = new Map<string, CompiledVignette>();
  private requested = new Set<string>();
  private members = new Map<string, Member[]>();
  private stages = new Map<string, Stage>();
  private markerMaterials = new Map<string, THREE.SpriteMaterial>();
  private light = new THREE.DirectionalLight(0xffffff, 2.2);
  private ambient = new THREE.AmbientLight(0xffffff, 0.9);
  private camera: THREE.PerspectiveCamera | undefined;
  private down: { x: number; y: number; t: number } | undefined;

  constructor(loader: ContentLoader, surface: SurfaceSource, element: HTMLElement) {
    this.loader = loader;
    this.surface = surface;
    this.group.add(this.light, this.light.target, this.ambient);
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
    this.light.position.copy(lightDir);
    this.light.target.position.set(0, 0, 0);

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

    const camPos = camera.position;
    const markerScale = (MARKER_PX * 2) / (camera.projectionMatrix.elements[5]! * innerHeight);
    for (const stage of this.stages.values()) {
      const toCam = camPos.clone().sub(stage.centre);
      const distance = toCam.length();
      const facing = toCam.dot(stage.up) > 0;

      const showCast = facing && distance < CAST_DISTANCE_KM;
      stage.cast.visible = showCast;
      if (showCast) this.pose(stage, lifeMs);

      const [near, far] = MARKER_FADE_KM;
      const fade = Math.min(1, Math.max(0, (distance - near) / (far - near)));
      stage.markerOpacity = facing ? fade : 0;
      stage.marker.visible = stage.markerOpacity > 0.01;
      stage.marker.material.opacity = stage.markerOpacity;
      stage.marker.scale.set(markerScale * MARKER_ASPECT, markerScale, 1);
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
    const lat = instance.site.lat / 1e6;
    const lon = instance.site.lon / 1e6;
    const up = new THREE.Vector3(...latLonToDir(lat, lon));
    const north = new THREE.Vector3(0, 1, 0).addScaledVector(up, -up.y).normalize();
    const east = new THREE.Vector3().crossVectors(north, up).normalize();
    // Local frame: x east, y up, z south.
    const root = new THREE.Group();
    root.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(east, up, north.clone().negate()),
    );
    const baseKm = this.surface.surfaceKm([up.x, up.y, up.z]);
    root.position.copy(up).multiplyScalar(EARTH_RADIUS_KM + baseKm);
    const cast = new THREE.Group();
    root.add(cast);
    const actors = members.map((m) => {
      const actor = buildStandIn(m.kind, m.look, `${instance.id}:${m.group}:${m.index}`, m.role);
      actor.root.scale.setScalar(M_TO_KM);
      cast.add(actor.root);
      return actor;
    });
    const marker = new THREE.Sprite(this.markerMaterial(entry.icon));
    marker.center.set(0.5, 0);
    marker.renderOrder = 10;
    root.add(marker);
    this.group.add(root);
    const stage: Stage = {
      instance,
      entry,
      members,
      root,
      cast,
      actors,
      marker,
      up,
      east,
      north,
      baseKm,
      centre: root.position.clone(),
      markerOpacity: 0,
    };
    return stage;
  }

  private pose(stage: Stage, lifeMs: number): void {
    const v = this.structures.get(stage.entry.structure);
    if (!v) return;
    // The ground can change as finer terrain arrives; follow it.
    const dir = new THREE.Vector3();
    const groundAt = (eastKm: number, northKm: number) => {
      dir
        .copy(stage.up)
        .multiplyScalar(EARTH_RADIUS_KM)
        .addScaledVector(stage.east, eastKm)
        .addScaledVector(stage.north, northKm)
        .normalize();
      return this.surface.surfaceKm([dir.x, dir.y, dir.z]);
    };
    const base = groundAt(0, 0);
    if (base !== stage.baseKm) {
      stage.baseKm = base;
      stage.root.position.copy(stage.up).multiplyScalar(EARTH_RADIUS_KM + base);
      stage.centre.copy(stage.root.position);
    }
    const poses = posesAt(v.template, stage.members, stage.instance, lifeMs);
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i]!;
      const actor = stage.actors[i]!;
      const eastKm = (p.x / 100) * M_TO_KM;
      const northKm = (p.z / 100) * M_TO_KM;
      const sink = (1 - p.visibility) * actor.height * M_TO_KM;
      actor.root.position.set(eastKm, groundAt(eastKm, northKm) - base - sink, -northKm);
      actor.root.rotation.y = Math.atan2(p.dirZ, p.dirX);
      actor.root.visible = p.visibility > 0;
      actor.pose(p.clip, p.clipMs / 1000);
    }
  }

  private disposeStage(stage: Stage): void {
    this.group.remove(stage.root);
    stage.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }

  private markerMaterial(icon: string): THREE.SpriteMaterial {
    let m = this.markerMaterials.get(icon);
    if (!m) {
      const texture = new THREE.CanvasTexture(drawBadge(icon));
      texture.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.SpriteMaterial({
        map: texture,
        sizeAttenuation: false,
        depthTest: false,
        transparent: true,
      });
      this.markerMaterials.set(icon, m);
    }
    return m;
  }

  /** The current stages, for browser tests: site, marker point on screen and cast positions. */
  debug(): {
    entries: VignetteEntry[];
    stages: { id: string; lat: number; lon: number; marker?: [number, number]; cast: number[] }[];
  } {
    const camera = this.camera;
    return {
      entries: this.entries,
      stages: [...this.stages.values()].map((stage) => {
        let marker: [number, number] | undefined;
        if (camera && stage.marker.visible) {
          const p = stage.centre.clone().project(camera);
          marker = [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight - MARKER_PX * 0.6];
        }
        return {
          id: stage.instance.id,
          lat: stage.instance.site.lat / 1e6,
          lon: stage.instance.site.lon / 1e6,
          marker,
          cast: stage.actors.flatMap((a) => [a.root.position.x, a.root.position.z]),
        };
      }),
    };
  }

  // --- Taps -------------------------------------------------------------------------

  /** The stage whose marker or cast is under a screen point, if any. */
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
      if (stage.markerOpacity > 0.3) {
        // The badge's circle sits above the tip of its stalk.
        const [x, y, front] = screen(stage.centre);
        const d = Math.hypot(clientX - x, clientY - y + MARKER_PX * 0.6);
        if (front && d < bestD) [best, bestD] = [stage, d];
      }
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
    // Capture before the camera's own double-click zoom, so a marker flies to its stage.
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

/** A round badge on a short stalk with the template's icon; no text (CLAUDE.md). */
function drawBadge(icon: string): HTMLCanvasElement {
  const w = 128;
  const h = 160;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const ink = '#2a1a12';
  const r = 54;
  const cx = w / 2;
  const cy = r + 6;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // Stalk.
  g.fillStyle = '#fff6e8';
  g.strokeStyle = ink;
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(cx - 14, cy + r - 8);
  g.lineTo(cx, h - 4);
  g.lineTo(cx + 14, cy + r - 8);
  g.closePath();
  g.fill();
  g.stroke();
  // Badge.
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#e9a23b';
  g.beginPath();
  g.arc(cx, cy, r - 12, 0, Math.PI * 2);
  g.fill();
  if (icon === 'spear') drawSpear(g, cx, cy, ink);
  return c;
}

function drawSpear(g: CanvasRenderingContext2D, cx: number, cy: number, ink: string): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(-Math.PI / 4);
  g.strokeStyle = ink;
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(-30, 0);
  g.lineTo(18, 0);
  g.stroke();
  g.fillStyle = '#8a8f99';
  g.beginPath();
  g.moveTo(16, -9);
  g.lineTo(36, 0);
  g.lineTo(16, 9);
  g.closePath();
  g.fill();
  g.lineWidth = 4;
  g.stroke();
  g.restore();
}
