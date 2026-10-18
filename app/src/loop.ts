// The frame loop (spec milestone 1, sections 3 and 11): advances the camera,
// the lens morph and the clocks, updates every layer for the date, renders,
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
import { zoomFactor } from './time/rateCurve.ts';
import type { HotState } from './ui/state.ts';
import type { LandmarkLayer } from './landmarks/landmarkLayer.ts';
import type { VignetteLayer } from './vignettes/vignetteLayer.ts';

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
  vignettes: VignetteLayer;
  landmarks: LandmarkLayer;
  hot: Store<HotState>;
  stress: StressRun | undefined;
  isPhone: boolean;
}

/** What changes while the app runs, read by the loop each frame. */
export interface LoopInputs {
  index: StartupIndex | undefined;
  minSeaLevel: number;
  slowWhenZoomed: boolean;
  showStats: boolean;
}

export interface PerfReport {
  device: string;
  frames: number;
  averageFps: number;
  averageFrameMs: number;
  p99FrameMs: number;
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
  private report = { frames: 0, maxCalls: 0, maxTriangles: 0, done: false };
  private lastFrame = 0;
  private lastStats = 0;

  constructor(parts: LoopParts, inputs: () => LoopInputs) {
    this.parts = parts;
    this.inputs = inputs;
    this.dynres = new DynamicResolution(1, targetFrameMs(parts.isPhone));
  }

  start(): void {
    this.lastFrame = performance.now();
    this.parts.stress?.begin(this.lastFrame);
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    const p = this.parts;
    const input = this.inputs();
    const dt = Math.min(250, now - this.lastFrame);
    this.lastFrame = now;
    if (!input.index) return void requestAnimationFrame(this.frame);

    p.stress?.steer(now, p.controller);
    // The lens morph runs on frame time, never on either clock (history-lens.md, section 4.1).
    p.globe.lens.advance(dt, p.controller.reducedMotion ? MORPH_OMEGA_REDUCED : MORPH_OMEGA);
    p.controller.update(dt, now);
    p.clock.zoomFactor =
      input.slowWhenZoomed && !p.stress ? zoomFactor(p.controller.altitudeKm) : 1;
    p.clock.tick(dt);

    const day = p.clock.day;
    this.planet = planetAt(input.index, day, input.minSeaLevel);
    const u = p.globe.material.uniforms;
    p.camera.updateMatrixWorld();
    cameraLight(p.camera, u.lightDir!.value);
    const e = p.camera.matrixWorld.elements;
    u.screenUp!.value.set(e[4]!, e[5]!, e[6]!);
    u.time!.value = p.clock.lifeMs / 1000;
    p.globe.update(p.camera, innerHeight, this.planet, day);
    p.foliage.clearings = p.vignettes.clearings();
    p.foliage.update(p.camera, this.planet, day, u.lightDir!.value);
    p.sky.update(p.camera);
    p.clouds.update(p.camera, p.clock.lifeMs, u.lightDir!.value);
    p.stress?.update(now, p.globe, this.planet, p.camera, p.clock.lifeMs);
    p.landmarks.update(p.camera, day);
    p.vignettes.update(p.camera, day, p.clock.lifeMs, u.lightDir!.value);

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
    requestAnimationFrame(this.frame);
  };

  /** Copies the clock and the frame statistics into the interface's hot state. */
  syncUi(now: number): void {
    const { clock, hot, renderer } = this.parts;
    const v = hot.value;
    const patch: Partial<HotState> = {};
    if (v.day !== clock.day) patch.day = clock.day;
    if (v.playState !== clock.playState) patch.playState = clock.playState;
    if (v.speedLog2 !== clock.speedLog2) patch.speedLog2 = clock.speedLog2;
    if (v.scrubbing !== clock.isScrubbing) patch.scrubbing = clock.isScrubbing;
    const ypm = clock.yearsPerMinute;
    if (Math.abs(ypm - v.yearsPerMinute) > v.yearsPerMinute * 0.02 + 1e-3)
      patch.yearsPerMinute = ypm;
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
      maxDrawCalls: this.report.maxCalls,
      maxTriangles: this.report.maxTriangles,
      done: this.report.done,
    };
  }
}
