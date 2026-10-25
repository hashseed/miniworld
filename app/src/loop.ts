// The frame loop (spec milestone 1, sections 3 and 11): advances the camera,
// the lens morph and the clock, updates every layer for the date, renders,
// adapts the resolution and keeps the interface's hot state and the
// performance report up to date.

import type * as THREE from 'three';
import type { StartupIndex } from './content/types.ts';
import type { Store } from './core/store.ts';
import type { StressRun } from './dev/stress.ts';
import type { CameraController } from './globe/cameraController.ts';
import type { Clouds } from './globe/clouds.ts';
import type { Foliage } from './globe/foliage.ts';
import type { Globe } from './globe/globe.ts';
import { MORPH_OMEGA, MORPH_OMEGA_REDUCED } from './globe/lens.ts';
import { cameraLight, type Sky } from './globe/sky.ts';
import type { FrameRenderer } from './perf/frameRenderer.ts';
import { DynamicResolution, FrameStats, targetFrameMs } from './perf/quality.ts';
import { planetAt, type PlanetState } from './planet/state.ts';
import type { Clock } from './time/clock.ts';
import type { HotState } from './ui/state.ts';
import type { TreeLayer } from './tree/treeLayer.ts';
import type { WildlifeLayer } from './wildlife/wildlifeLayer.ts';

/** Everything the loop draws and advances. */
export interface LoopParts {
  renderer: THREE.WebGLRenderer;
  frames: FrameRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controller: CameraController;
  clock: Clock;
  globe: Globe;
  foliage: Foliage;
  sky: Sky;
  clouds: Clouds;
  wildlife: WildlifeLayer;
  tree: TreeLayer;
  hot: Store<HotState>;
  stress: StressRun | undefined;
  isPhone: boolean;
}

/** What changes while the app runs, read by the loop each frame. */
export interface LoopInputs {
  index: StartupIndex | undefined;
  minSeaLevel: number;
  showStats: boolean;
}

export interface PerfReport {
  device: string;
  frames: number;
  averageFps: number;
  averageFrameMs: number;
  p99FrameMs: number;
  /** Main-thread time spent updating a frame before drawing it. */
  averageUpdateMs: number;
  p99UpdateMs: number;
  maxDrawCalls: number;
  maxTriangles: number;
  done: boolean;
}

export class FrameLoop {
  readonly dynres: DynamicResolution;
  /** The planet at the current date, for surface queries between frames. */
  planet: PlanetState = { seaLevel: 0, glacialIndex: 0 };
  /** Runs after each frame is drawn: the timeline, saved view and similar. */
  afterFrame: (now: number) => void = () => {};
  private parts: LoopParts;
  private inputs: () => LoopInputs;
  private stats = new FrameStats(600);
  private updateStats = new FrameStats(600);
  private report = { frames: 0, maxCalls: 0, maxTriangles: 0, done: false };
  private lastFrame = 0;
  private lastStats = 0;
  /** Held for a browser screenshot: no frame is drawn until released (section 13). */
  private held = false;
  private running = false;
  private stopped: (() => void) | undefined;

  constructor(parts: LoopParts, inputs: () => LoopInputs) {
    this.parts = parts;
    this.inputs = inputs;
    this.dynres = new DynamicResolution(1, targetFrameMs(parts.isPhone));
  }

  start(): void {
    this.lastFrame = performance.now();
    this.parts.stress?.begin(this.lastFrame);
    this.running = true;
    requestAnimationFrame(this.frame);
  }

  /**
   * Browser tests only: holds the loop after the frame under way, resolving once
   * no frame is drawing, so a screenshot need not wait for the slow software
   * renderer to finish a frame; or releases it again.
   */
  hold(on: boolean): Promise<void> {
    this.held = on;
    if (!on) {
      if (!this.running) {
        this.running = true;
        this.lastFrame = performance.now();
        requestAnimationFrame(this.frame);
      }
      return Promise.resolve();
    }
    if (!this.running) return Promise.resolve();
    return new Promise((resolve) => (this.stopped = resolve));
  }

  /** Schedules the next frame, or stops while the loop is held. */
  private next(): void {
    if (!this.held) return void requestAnimationFrame(this.frame);
    this.running = false;
    this.stopped?.();
    this.stopped = undefined;
  }

  /** Cameras whose tiles are loaded ahead of need (the loading screen's flight in). */
  warm: () => THREE.PerspectiveCamera[] = () => [];

  private frame = (now: number): void => {
    const p = this.parts;
    const input = this.inputs();
    const dt = Math.min(250, now - this.lastFrame);
    this.lastFrame = now;
    if (!input.index) return this.next();
    const updateStart = performance.now();

    p.stress?.steer(now, p.controller);
    // The lens morph runs on frame time, never on the clock (history-lens.md, section 4.1).
    p.globe.lens.advance(dt, p.controller.reducedMotion ? MORPH_OMEGA_REDUCED : MORPH_OMEGA);
    p.controller.update(dt, now);
    p.clock.tick(dt);

    const day = p.clock.day;
    this.planet = planetAt(input.index, day, input.minSeaLevel);
    const u = p.globe.material.uniforms;
    p.camera.updateMatrixWorld();
    cameraLight(p.camera, u.lightDir!.value);
    const e = p.camera.matrixWorld.elements;
    u.screenUp!.value.set(e[4]!, e[5]!, e[6]!);
    // Wrapped to an hour so the shader's float keeps millisecond precision.
    u.time!.value = (p.clock.ms % 3_600_000) / 1000;
    // The views the camera will fly to have their tiles loaded too.
    p.globe.update(p.camera, innerHeight, this.planet, day, this.warm());
    p.foliage.clearings = [
      ...p.tree.clearings(),
      ...p.wildlife.clearings(day, p.clock.ms, p.clock.startDay),
    ];
    p.foliage.update(
      p.camera,
      this.planet,
      day,
      u.lightDir!.value,
      p.clock.playState === 'playing',
    );
    p.sky.update(p.camera);
    p.clouds.update(p.camera, p.clock.ms, u.lightDir!.value);
    p.stress?.update(now, p.globe, this.planet, p.camera, p.clock.ms);
    // While the loading screen's small globe stands, the camps and animals are left out
    // (milestone-1 section 8.6) and not worked out either, so the frames are free for loading
    // the first view; the tree's files still load, so the camps are there when the camera flies in.
    if (p.tree.group.visible) {
      // The camps first: the animals keep clear of their people (wildlife.md section 4).
      p.tree.update(p.camera, p.clock.ms, p.clock.startDay);
      // The hills of the caves in view rise from the ground (humankind.md section 8.2).
      p.globe.setMounds(p.tree.mounds());
    } else p.tree.prefetch(p.clock.ms, p.clock.startDay);
    if (p.wildlife.group.visible)
      p.wildlife.update(p.camera, day, p.clock.ms, p.clock.startDay, p.tree.obstacles());

    this.updateStats.push(performance.now() - updateStart);
    p.renderer.info.reset();
    p.frames.render(p.scene, p.camera);
    this.stats.push(dt);
    const r = this.report;
    r.frames++;
    r.maxCalls = Math.max(r.maxCalls, p.renderer.info.render.calls);
    r.maxTriangles = Math.max(r.maxTriangles, p.renderer.info.render.triangles);
    if (p.stress?.done(now)) r.done = true;
    if (this.dynres.frame(dt)) p.frames.setSize(innerWidth, innerHeight, this.dynres.scale);

    this.afterFrame(now);
    this.syncUi(now);
    this.next();
  };

  /** Copies the clock and the frame statistics into the interface's hot state. */
  syncUi(now: number): void {
    const { clock, hot, renderer } = this.parts;
    const v = hot.value;
    const patch: Partial<HotState> = {};
    if (v.day !== clock.day) patch.day = clock.day;
    if (v.playState !== clock.playState) patch.playState = clock.playState;
    if (v.speedMode !== clock.speedMode) patch.speedMode = clock.speedMode;
    if (v.scrubbing !== clock.isScrubbing) patch.scrubbing = clock.isScrubbing;
    if (v.jumping !== clock.jumping) patch.jumping = clock.jumping;
    if (v.yearsPerMinute !== clock.yearsPerMinute) patch.yearsPerMinute = clock.yearsPerMinute;
    if ((this.inputs().showStats || this.parts.stress) && now - this.lastStats > 500) {
      this.lastStats = now;
      patch.stats = {
        fps: this.stats.fps,
        avg: this.stats.average,
        p99: this.stats.percentile(99),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        scale: this.dynres.scale,
      };
    }
    if (Object.keys(patch).length) hot.update(patch);
  }

  perfReport(device: string): PerfReport {
    return {
      device,
      frames: this.report.frames,
      averageFps: this.stats.fps,
      averageFrameMs: this.stats.average,
      p99FrameMs: this.stats.percentile(99),
      averageUpdateMs: this.updateStats.average,
      p99UpdateMs: this.updateStats.percentile(99),
      maxDrawCalls: this.report.maxCalls,
      maxTriangles: this.report.maxTriangles,
      done: this.report.done,
    };
  }
}
