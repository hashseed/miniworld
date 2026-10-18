// The app controller: loads the manifest and index, builds the scene, runs
// the frame loop and implements the interface's actions (spec milestone 1).

import '@fontsource-variable/fredoka';
import * as THREE from 'three';
import { h, render } from 'preact';
import { ContentLoader } from './content/loader.ts';
import type { StartupIndex } from './content/types.ts';
import { Store } from './core/store.ts';
import { latLonToDir } from './globe/cube.ts';
import { CameraController } from './globe/cameraController.ts';
import { Globe } from './globe/globe.ts';
import { Foliage } from './globe/foliage.ts';
import { Lens, MORPH_MS, MORPH_MS_REDUCED, decodeLensGrids } from './globe/lens.ts';
import { lowestSeaLevel, planetAt, type PlanetState } from './globe/planet.ts';
import { Clouds } from './globe/clouds.ts';
import { Sky, cameraLight } from './globe/sky.ts';
import { formatDateReadout } from './i18n/dates.ts';
import { I18n } from './i18n/i18n.ts';
import { detectLanguage } from './i18n/messages.ts';
import { FrameRenderer } from './perf/frameRenderer.ts';
import {
  DynamicResolution,
  FrameStats,
  TIERS,
  TIER_ORDER,
  pickTier,
  targetFrameMs,
} from './perf/quality.ts';
import { STRESS_CENTRE, StressScene } from './perf/stressScene.ts';
import { OPENING_DAY, TIMELINE_START, dayFromDate } from './time/calendar.ts';
import { Clock } from './time/clock.ts';
import { zoomFactor } from './time/rateCurve.ts';
import { Timeline } from './timeline/timeline.ts';
import { App } from './ui/App.tsx';
import type { Actions, UiState } from './ui/state.ts';
import {
  loadBookmarks,
  loadPerf,
  loadSettings,
  loadView,
  saveBookmarks,
  savePerf,
  saveSettings,
  saveView,
  MAX_BOOKMARKS,
  type CameraState,
  type Settings,
  type Tier,
} from './ui/storage.ts';

const params = new URLSearchParams(location.search);
const STRESS = params.get('scene') === 'stress';
const DEFAULT_CAMERA: CameraState = { lat: 25, lon: 30, altitudeKm: 14000, heading: 0, tilt: 0 };
const STRESS_DAY = dayFromDate(1, 1, 1);
const STRESS_PATH_MS = 60000;
const VIEW_SAVE_MS = 2000;
const BENCH_MS_PER_TIER = 1000;

const isPhone =
  matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
const deviceId = `${navigator.userAgent}|${screen.width}x${screen.height}@${devicePixelRatio}`;

// --- State --------------------------------------------------------------------------

const settings = loadSettings({
  language: detectLanguage(navigator.languages ?? [navigator.language]),
  quality: 'auto',
  timelineExpanded: false,
  trueTimeScale: false,
  slowWhenZoomed: true,
  showStats: false,
  historyLens: true,
  lensHintSeen: false,
});
const savedView = STRESS ? undefined : loadView();
const savedPerf = loadPerf();
const i18n = new I18n(settings.language);

const clock = new Clock({
  startDay: TIMELINE_START,
  endDay: TIMELINE_START + 1, // replaced once the manifest gives the cutoff
  day: OPENING_DAY,
});

const ui = new Store<UiState>({
  ready: false,
  preparing: false,
  error: undefined,
  day: OPENING_DAY,
  playState: 'historyPaused',
  speedIndex: clock.speedIndex,
  yearsPerMinute: 0,
  scrubbing: false,
  panel: 'none',
  settings,
  tier: savedPerf?.device === deviceId ? savedPerf.tier : 'medium',
  autoTier: savedPerf?.device === deviceId ? savedPerf.tier : 'medium',
  bookmarks: loadBookmarks(),
  follow: true,
  isPhone,
  stressScene: STRESS,
  stats: { fps: 0, avg: 0, p99: 0, calls: 0, triangles: 0, scale: 1 },
  fixture: false,
  version: '',
  cutoffDay: 0,
  sources: [],
});

// --- Scene --------------------------------------------------------------------------

const canvas = document.getElementById('globe') as HTMLCanvasElement;
canvas.tabIndex = 0;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  logarithmicDepthBuffer: true,
  powerPreference: 'high-performance',
});
renderer.info.autoReset = false;
renderer.setClearColor(0xfbe3d4);
const frames = new FrameRenderer(renderer);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 1e5);
const loader = new ContentLoader('data/');
const globe = new Globe(loader);
// Climate slices go to the graphics card as they arrive, so scrubbing never waits on an upload.
globe.climate.onTexture = (texture) => renderer.initTexture(texture);
const sky = new Sky();
const clouds = new Clouds();
const foliage = new Foliage(globe, loader);
scene.add(sky.dome, globe.group, clouds.mesh, foliage.group);

let index: StartupIndex | undefined;
let minSeaLevel = -130;
let planet: PlanetState = { seaLevel: 0, glacialIndex: 0, iceA: 0, iceB: 0, iceT: 0 };
const surface = {
  surfaceKm: (dir: [number, number, number]) => (index ? globe.surfaceKm(dir, planet) : 0),
};
const controller = new CameraController(
  camera,
  canvas,
  surface,
  savedView?.camera ?? (STRESS ? stressCamera(0) : DEFAULT_CAMERA),
);
controller.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// The camera sees the lens through the globe, which swaps in the loaded warp.
controller.lens = {
  toDrawn: (d) => globe.lens.toDrawn(d),
  toTrue: (d) => globe.lens.toTrue(d),
  widthAt: (d) => globe.lens.widthAt(d),
};
globe.lens.setOn(settings.historyLens, false);

let stress: StressScene | undefined;
let timeline: Timeline | undefined;
const dynres = new DynamicResolution(1, targetFrameMs(isPhone));
const stats = new FrameStats(600);

function activeTier(): Tier {
  const q = ui.value.settings.quality;
  return q === 'auto' ? ui.value.autoTier : q;
}

function applyTier(): void {
  const tier = activeTier();
  const t = TIERS[tier];
  globe.quality = { errorTargetPx: t.errorTargetPx, waterDetail: t.waterDetail };
  dynres.configure(Math.min(t.renderScaleCap, devicePixelRatio || 1), targetFrameMs(isPhone));
  dynres.scale = Math.min(t.renderScaleCap, devicePixelRatio || 1);
  frames.setMode(t.antialias);
  frames.setSize(innerWidth, innerHeight, dynres.scale);
  stress?.setAnimatedLimit(t.animatedFigures);
  if (ui.value.tier !== tier) ui.update({ tier });
}

function resize(): void {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  frames.setSize(innerWidth, innerHeight, dynres.scale);
  updateVisibleLanes();
  layoutTimeline();
}
window.addEventListener('resize', resize);

// --- Timeline -----------------------------------------------------------------------

function regionLane(): string | undefined {
  if (!index) return undefined;
  const r = index.regions;
  const { lat, lon } = controller.state;
  const cell = 180 / r.rows;
  const col = Math.min(r.cols - 1, Math.max(0, Math.floor((lon + 180) / cell)));
  const row = Math.min(r.rows - 1, Math.max(0, Math.floor((90 - lat) / cell)));
  return r.lanes[Number(r.cells[row * r.cols + col])];
}

let lastRegion: string | undefined;
function updateVisibleLanes(): void {
  if (!timeline || !index) return;
  // Collapsed, the timeline shows only the lane of the region the globe is
  // centred on; expanded, the World lane and every regional lane.
  if (ui.value.settings.timelineExpanded) {
    if (timeline.visibleLanes !== undefined) {
      timeline.setVisibleLanes(undefined);
      lastRegion = undefined;
      layoutTimeline();
    }
    return;
  }
  const region = regionLane();
  if (region === lastRegion && timeline.visibleLanes) return;
  lastRegion = region;
  timeline.setVisibleLanes([region ?? 'world']);
  layoutTimeline();
}

function layoutTimeline(): void {
  if (!timeline) return;
  const width = timeline.canvas.parentElement?.clientWidth ?? innerWidth;
  const max = innerHeight * (ui.value.settings.timelineExpanded && isPhone ? 0.66 : 0.33);
  timeline.resize(width, timeline.desiredHeight(max));
  centreGlobe();
}

/** Shifts the projection so the globe is centred in the space above the bottom controls. */
function centreGlobe(): void {
  const bottom = (document.querySelector('.bottom') as HTMLElement | null)?.offsetHeight ?? 0;
  const shift = Math.min(bottom, innerHeight * 0.5) * 0.8;
  camera.setViewOffset(innerWidth, innerHeight + shift, 0, shift, innerWidth, innerHeight);
}

// --- Actions ------------------------------------------------------------------------

function newId(): string {
  // Bookmark ids only need to be unique on this device; they never reach world state.
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function setBookmarks(list: typeof ui.value.bookmarks): void {
  saveBookmarks(list);
  ui.update({ bookmarks: list });
}

const actions: Actions = {
  play: () => {
    clock.setPlayState('playing');
    timeline?.setFollow(true);
  },
  pauseHistory: () =>
    clock.setPlayState(clock.playState === 'historyPaused' ? 'playing' : 'historyPaused'),
  freeze: () => clock.setPlayState(clock.playState === 'frozen' ? 'playing' : 'frozen'),
  setSpeed: (i) => clock.setSpeedIndex(i),
  setPanel: (panel) => ui.update({ panel }),
  setSetting: (key, value) => {
    const next: Settings = { ...ui.value.settings, [key]: value };
    saveSettings(next);
    ui.update({ settings: next });
    if (key === 'language') void switchLanguage(next.language);
    if (key === 'quality') applyTier();
    if (key === 'trueTimeScale') timeline?.setMode(value ? 'true' : 'watch');
    if (key === 'historyLens') globe.lens.setOn(value as boolean);
  },
  toggleTrueSizes: () => actions.setSetting('historyLens', !ui.value.settings.historyLens),
  closeLensHint: () => actions.setSetting('lensHintSeen', true),
  addBookmark: () => {
    const name = formatDateReadout(clock.day, i18n.language, {
      yearsPerMinute: 0,
      stationary: true,
    });
    const b = { id: newId(), name, day: clock.day, camera: { ...controller.state } };
    setBookmarks([b, ...ui.value.bookmarks].slice(0, MAX_BOOKMARKS));
  },
  goToBookmark: (id) => {
    const b = ui.value.bookmarks.find((x) => x.id === id);
    if (!b) return;
    clock.setDay(b.day);
    controller.flyTo(b.camera);
    if (isPhone) ui.update({ panel: 'none' });
  },
  renameBookmark: (id, name) => {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed) return;
    setBookmarks(ui.value.bookmarks.map((b) => (b.id === id ? { ...b, name: trimmed } : b)));
  },
  deleteBookmark: (id) => setBookmarks(ui.value.bookmarks.filter((b) => b.id !== id)),
  resetCamera: () => controller.resetOrientation(),
  tiltCamera: (degrees) => controller.tiltBy(degrees),
  zoomTimeline: (factor) => {
    timeline?.zoomBy(factor);
  },
  followPlayhead: () => timeline?.setFollow(true),
  toggleLanes: () => {
    actions.setSetting('timelineExpanded', !ui.value.settings.timelineExpanded);
    updateVisibleLanes();
    layoutTimeline();
  },
  remeasure: () => void benchmark(),
  saveReport: () => {
    const blob = new Blob([JSON.stringify(perfReport(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'miniworld-perf.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  attachTimeline: (el) => {
    if (!el) return;
    if (timeline?.canvas === el) return;
    timeline = new Timeline({ canvas: el, clock, i18n });
    timeline.onFollowChange = (follow) => ui.update({ follow });
    timeline.onLayout = () => layoutTimeline();
    if (index) {
      timeline.setIndex(index);
      timeline.setMode(ui.value.settings.trueTimeScale ? 'true' : 'watch', false);
    }
    lastRegion = undefined;
    updateVisibleLanes();
    layoutTimeline();
  },
};

async function switchLanguage(lang: Settings['language']): Promise<void> {
  // Keep the old strings until the other language's index has arrived.
  const next = await loader.index(lang);
  i18n.set(lang);
  document.documentElement.lang = lang;
  document.title = i18n.t('app.title');
  index = next;
  timeline?.setIndex(next);
  ui.update({ sources: next.sources });
}

// --- Keys ---------------------------------------------------------------------------

window.addEventListener('keydown', (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  if (e.key === 'Escape' && ui.value.panel !== 'none') {
    ui.update({ panel: 'none' });
    return;
  }
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable)
  )
    return;
  if (e.key === ' ' || e.code === 'Space') {
    if (target?.tagName === 'BUTTON') return;
    e.preventDefault();
    if (e.shiftKey) clock.toggleFreeze();
    else clock.togglePauseHistory();
  } else if ((e.key === 'Home' || e.key === 'End') && target !== timeline?.canvas) {
    e.preventDefault();
    clock.setDay(e.key === 'Home' ? clock.startDay : clock.endDay);
  }
});

// --- Saved view ---------------------------------------------------------------------

let lastViewSave = 0;
function persistView(): void {
  if (STRESS || !index) return;
  saveView({
    day: clock.day,
    camera: { ...controller.state },
    playState: clock.playState,
    speedIndex: clock.speedIndex,
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistView();
});
window.addEventListener('pagehide', persistView);

// --- Stress scene -------------------------------------------------------------------

/** The fixed camera path: low over the delta, out to orbit and back (section 11.4). */
function stressCamera(ms: number): CameraState {
  const t = (ms % STRESS_PATH_MS) / STRESS_PATH_MS;
  const low = 3;
  const high = 15000;
  let alt: number;
  if (t < 0.35) alt = low;
  else if (t < 0.65)
    alt = Math.exp(
      Math.log(low) + (Math.log(high) - Math.log(low)) * Math.sin(((t - 0.35) / 0.3) * Math.PI),
    );
  else alt = low;
  const ring = t * Math.PI * 4;
  return {
    lat: STRESS_CENTRE.lat + Math.sin(ring) * 0.06,
    lon: STRESS_CENTRE.lon + Math.cos(ring) * 0.06,
    altitudeKm: alt,
    heading: t * 360,
    tilt: 0,
  };
}

const report = { frames: 0, maxCalls: 0, maxTriangles: 0, done: false };
function perfReport() {
  return {
    tier: activeTier(),
    device: deviceId,
    frames: report.frames,
    averageFps: stats.fps,
    averageFrameMs: stats.average,
    p99FrameMs: stats.percentile(99),
    maxDrawCalls: report.maxCalls,
    maxTriangles: report.maxTriangles,
    done: report.done,
  };
}
(globalThis as unknown as { __perfReport: () => unknown }).__perfReport = perfReport;

function ensureStress(): StressScene {
  if (!stress) {
    stress = new StressScene(TIERS[activeTier()].animatedFigures);
    scene.add(stress.group);
  }
  return stress;
}

// --- Benchmark ----------------------------------------------------------------------

async function benchmark(): Promise<void> {
  ui.update({ preparing: true, panel: 'none' });
  const keep = stress !== undefined;
  const s = ensureStress();
  const savedCam = { ...controller.state };
  controller.state = {
    lat: STRESS_CENTRE.lat,
    lon: STRESS_CENTRE.lon,
    altitudeKm: 4,
    heading: 30,
    tilt: 0,
  };
  const measured: Partial<Record<Tier, number>> = {};
  const budget = targetFrameMs(isPhone) * 1.15;
  for (const tier of TIER_ORDER) {
    const t = TIERS[tier];
    globe.quality = { errorTargetPx: t.errorTargetPx, waterDetail: t.waterDetail };
    frames.setMode(t.antialias);
    frames.setSize(innerWidth, innerHeight, Math.min(t.renderScaleCap, devicePixelRatio || 1));
    s.setAnimatedLimit(t.animatedFigures);
    const times: number[] = [];
    let last = performance.now();
    const start = last;
    while (performance.now() - start < BENCH_MS_PER_TIER) {
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      times.push(now - last);
      last = now;
      controller.update(now - start, now);
      s.update(camera, clock.lifeMs, now);
      globe.update(camera, innerHeight, planet, clock.day);
      frames.render(scene, camera);
    }
    times.sort((a, b) => a - b);
    measured[tier] = times[Math.floor(times.length / 2)] ?? 1000;
    if (measured[tier]! <= budget) break;
  }
  const autoTier = pickTier(measured, budget);
  savePerf({ tier: autoTier, device: deviceId });
  controller.state = savedCam;
  if (!keep) {
    scene.remove(s.group);
    s.dispose();
    stress = undefined;
  }
  ui.update({ autoTier, preparing: false });
  applyTier();
}

// --- Frame loop ---------------------------------------------------------------------

let lastFrame = performance.now();
let stressStart = 0;

function frame(now: number): void {
  const dt = Math.min(250, now - lastFrame);
  lastFrame = now;
  if (!index) return void requestAnimationFrame(frame);

  if (STRESS) {
    controller.state = stressCamera(now - stressStart);
    controller.cancelFlight();
  }
  // The lens morph runs on frame time, never on either clock (history-lens.md, section 4.1).
  globe.lens.advance(dt, controller.reducedMotion ? MORPH_MS_REDUCED : MORPH_MS);
  controller.update(dt, now);
  clock.zoomFactor =
    ui.value.settings.slowWhenZoomed && !STRESS ? zoomFactor(controller.altitudeKm) : 1;
  clock.tick(dt);

  planet = planetAt(index, clock.day, minSeaLevel);
  const u = globe.material.uniforms;
  camera.updateMatrixWorld();
  cameraLight(camera, u.lightDir!.value);
  const e = camera.matrixWorld.elements;
  u.screenUp!.value.set(e[4]!, e[5]!, e[6]!);
  u.time!.value = clock.lifeMs / 1000;
  globe.update(camera, innerHeight, planet, clock.day);
  foliage.update(camera, planet, clock.day, u.lightDir!.value);
  sky.update(camera);
  clouds.update(camera, clock.lifeMs, u.lightDir!.value);
  if (stress) {
    const centre = latLonToDir(STRESS_CENTRE.lat, STRESS_CENTRE.lon);
    const ground = globe.surfaceAtTrue(centre, planet);
    if (ground > 0 || globe.drawnTiles > 0) stress.setGround(ground);
    stress.place(new THREE.Vector3(...globe.lens.toDrawn(centre)));
    stress.update(camera, clock.lifeMs, now);
  }

  renderer.info.reset();
  frames.render(scene, camera);
  if (!ui.value.preparing) {
    stats.push(dt);
    report.frames++;
    report.maxCalls = Math.max(report.maxCalls, renderer.info.render.calls);
    report.maxTriangles = Math.max(report.maxTriangles, renderer.info.render.triangles);
    if (STRESS && now - stressStart >= STRESS_PATH_MS) report.done = true;
    if (dynres.frame(dt)) frames.setSize(innerWidth, innerHeight, dynres.scale);
  }

  timeline?.draw();
  if (!ui.value.settings.timelineExpanded) updateVisibleLanes();
  syncUi(now);
  if (now - lastViewSave > VIEW_SAVE_MS) {
    lastViewSave = now;
    persistView();
  }
  requestAnimationFrame(frame);
}

let lastStats = 0;
function syncUi(now: number): void {
  const v = ui.value;
  const patch: Partial<UiState> = {};
  if (v.day !== clock.day) patch.day = clock.day;
  if (v.playState !== clock.playState) patch.playState = clock.playState;
  if (v.speedIndex !== clock.speedIndex) patch.speedIndex = clock.speedIndex;
  if (v.scrubbing !== clock.isScrubbing) patch.scrubbing = clock.isScrubbing;
  const ypm = clock.yearsPerMinute;
  if (Math.abs(ypm - v.yearsPerMinute) > v.yearsPerMinute * 0.02 + 1e-3) patch.yearsPerMinute = ypm;
  if ((v.settings.showStats || STRESS) && now - lastStats > 500) {
    lastStats = now;
    patch.stats = {
      fps: stats.fps,
      avg: stats.average,
      p99: stats.percentile(99),
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      scale: dynres.scale,
    };
  }
  if (Object.keys(patch).length) ui.update(patch);
}

// --- Start --------------------------------------------------------------------------

async function start(): Promise<void> {
  document.documentElement.lang = i18n.language;
  document.title = i18n.t('app.title');
  render(h(App, { store: ui, i18n, actions }), document.getElementById('ui')!);
  try {
    const manifest = await loader.init();
    // The lens grids load with the startup index; the first frame needs both.
    const [loadedIndex, lensBytes] = await Promise.all([
      loader.index(i18n.language),
      loader.fetchBytes(manifest.lens.file),
    ]);
    index = loadedIndex;
    const grids = decodeLensGrids(lensBytes);
    globe.setLens(new Lens(grids.forward, grids.inverse));
    minSeaLevel = lowestSeaLevel(index.seaLevel);
    globe.lowestSeaLevel = minSeaLevel;
    const startDay = STRESS ? STRESS_DAY : (savedView?.day ?? OPENING_DAY);
    clock.configure({
      startDay: manifest.timelineStartDay,
      endDay: manifest.cutoffDay,
      day: startDay,
      playState: STRESS ? 'playing' : (savedView?.playState ?? 'historyPaused'),
      speedIndex: savedView?.speedIndex,
    });
    clock.subscribe(() => syncUi(performance.now()));
    ui.update({
      fixture: manifest.fixture,
      version: manifest.version,
      cutoffDay: manifest.cutoffDay,
      sources: index.sources,
      day: clock.day,
      playState: clock.playState,
      speedIndex: clock.speedIndex,
    });
    if (timeline) {
      timeline.setIndex(index);
      timeline.setMode(ui.value.settings.trueTimeScale ? 'true' : 'watch', false);
      updateVisibleLanes();
      layoutTimeline();
    }
    if (STRESS) {
      ensureStress();
      stressStart = performance.now();
    }
    applyTier();
    resize();
    lastFrame = performance.now();
    requestAnimationFrame(frame);
    await firstView();
    ui.update({ ready: true });
    const needsBench =
      !STRESS &&
      ui.value.settings.quality === 'auto' &&
      savedPerf?.device !== deviceId &&
      !params.has('nobench');
    if (needsBench) await benchmark();
  } catch (err) {
    ui.update({ error: err instanceof Error ? err.message : String(err) });
  }
  registerServiceWorker();
}

/** Resolves when the globe has stopped refining for a moment, or after a timeout. */
function firstView(): Promise<void> {
  return new Promise((resolve) => {
    const begin = performance.now();
    let stable = 0;
    let last = -1;
    const check = () => {
      const tiles = globe.drawnTiles;
      if (tiles > 0 && tiles === last && loader.pending === 0) stable++;
      else stable = 0;
      last = tiles;
      if (stable > 10 || performance.now() - begin > 8000) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV && !params.has('sw')) return;
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

void start();

if (import.meta.env.DEV)
  Object.assign(globalThis, {
    __miniworld: {
      globe,
      foliage,
      controller,
      clock,
      loader,
      renderer,
      ui,
      scene,
      sky,
      camera,
      timeline: () => timeline,
    },
  });
