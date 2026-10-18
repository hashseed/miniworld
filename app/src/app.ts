// The app: builds the state and the scene, loads the manifest and index,
// and implements the interface's actions (spec milestone 1). The frame loop
// is in loop.ts, the keyboard in input.ts and the stress scene in dev/stress.ts.

import * as THREE from 'three';
import { h, render } from 'preact';
import { ContentLoader } from './content/loader.ts';
import type { StartupIndex, VignetteEntry } from './content/types.ts';
import { Store } from './core/store.ts';
import { CameraController } from './globe/cameraController.ts';
import { Globe } from './globe/globe.ts';
import { Foliage } from './globe/foliage.ts';
import { Lens, decodeLensGrids } from './globe/lens.ts';
import { lowestSeaLevel } from './planet/state.ts';
import { Clouds } from './globe/clouds.ts';
import { Sky } from './globe/sky.ts';
import { formatDateReadout } from './i18n/dates.ts';
import { I18n } from './i18n/i18n.ts';
import { detectLanguage } from './i18n/messages.ts';
import { FrameRenderer } from './perf/frameRenderer.ts';
import { QUALITY, targetFrameMs } from './perf/quality.ts';
import { STRESS_DAY, StressRun, stressCamera } from './dev/stress.ts';
import { attachKeys } from './input.ts';
import { FrameLoop } from './loop.ts';
import { VignetteLayer } from './vignettes/vignetteLayer.ts';
import { OPENING_DAY, TIMELINE_START } from './time/calendar.ts';
import { Clock } from './time/clock.ts';
import { Timeline } from './timeline/timeline.ts';
import { App } from './ui/App.tsx';
import type { Actions, HotState, UiState, VignetteCard } from './ui/state.ts';
import {
  loadBookmarks,
  loadSettings,
  loadView,
  saveBookmarks,
  saveSettings,
  saveView,
  MAX_BOOKMARKS,
  type Settings,
} from './ui/storage.ts';
import type { CameraState } from './core/camera.ts';

const params = new URLSearchParams(location.search);
const STRESS = params.get('scene') === 'stress';
const DEFAULT_CAMERA: CameraState = { lat: 25, lon: 30, altitudeKm: 14000, heading: 0, tilt: 0 };
const VIEW_SAVE_MS = 2000;

const isPhone =
  matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
const deviceId = `${navigator.userAgent}|${screen.width}x${screen.height}@${devicePixelRatio}`;

// --- State --------------------------------------------------------------------------

const settings = loadSettings({
  language: detectLanguage(navigator.languages ?? [navigator.language]),
  timelineExpanded: false,
  trueTimeScale: false,
  showStats: false,
  lensStrength: 100,
  lensHintSeen: false,
});
const savedView = STRESS ? undefined : loadView();
const i18n = new I18n(settings.language);

const clock = new Clock({
  startDay: TIMELINE_START,
  endDay: TIMELINE_START + 1, // replaced once the manifest gives the cutoff
  day: OPENING_DAY,
});

const hot = new Store<HotState>({
  day: OPENING_DAY,
  playState: 'paused',
  speedMode: clock.speedMode,
  yearsPerMinute: clock.yearsPerMinute,
  scrubbing: false,
  stats: { fps: 0, avg: 0, p99: 0, calls: 0, triangles: 0, scale: 1 },
});
const ui = new Store<UiState>({
  ready: false,
  error: undefined,
  panel: 'none',
  settings,
  bookmarks: loadBookmarks(),
  follow: true,
  isPhone,
  stressScene: STRESS,
  fixture: false,
  version: '',
  cutoffDay: 0,
  sources: [],
  vignette: undefined,
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
const surface = {
  surfaceKm: (dir: [number, number, number]): number =>
    index ? globe.surfaceKm(dir, loop.planet) : 0,
};
const controller = new CameraController(
  camera,
  canvas,
  surface,
  savedView?.camera ?? (STRESS ? stressCamera(0) : DEFAULT_CAMERA),
);
const vignettes = new VignetteLayer(
  loader,
  { surfaceKm: surface.surfaceKm, toDrawn: (d) => globe.lens.toDrawn(d) },
  canvas,
);
scene.add(vignettes.group);
vignettes.onOpen = (entry) => void openVignette(entry);
vignettes.onFly = (lat, lon, altitudeKm) =>
  controller.flyTo({ ...controller.state, lat, lon, altitudeKm });
controller.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// The camera sees the lens through the globe, which swaps in the loaded warp.
controller.lens = {
  toDrawn: (d) => globe.lens.toDrawn(d),
  toTrue: (d) => globe.lens.toTrue(d),
  widthAt: (d) => globe.lens.widthAt(d),
};
globe.lens.setStrength(settings.lensStrength / 100, false);

let timeline: Timeline | undefined;
const loop = new FrameLoop(
  {
    renderer,
    frames,
    scene,
    camera,
    controller,
    clock,
    globe,
    foliage,
    sky,
    clouds,
    vignettes,
    hot,
    stress: STRESS ? new StressRun(scene) : undefined,
    isPhone,
  },
  () => ({
    index,
    minSeaLevel,
    showStats: ui.value.settings.showStats,
  }),
);
const dynres = loop.dynres;
const perfReport = () => loop.perfReport(deviceId);
(globalThis as unknown as { __perfReport: () => unknown }).__perfReport = perfReport;

/** Applies the one fixed quality (section 11.2). */
function applyQuality(): void {
  const q = QUALITY;
  globe.quality = { errorTargetPx: q.errorTargetPx };
  dynres.configure(Math.min(q.renderScaleCap, devicePixelRatio || 1), targetFrameMs(isPhone));
  dynres.scale = Math.min(q.renderScaleCap, devicePixelRatio || 1);
  frames.setSize(innerWidth, innerHeight, dynres.scale);
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
  pause: () => clock.setPlayState('paused'),
  setSpeed: (mode) => clock.setSpeedMode(mode),
  setPanel: (panel) => ui.update({ panel }),
  setSetting: (key, value) => {
    const next: Settings = { ...ui.value.settings, [key]: value };
    saveSettings(next);
    ui.update({ settings: next });
    if (key === 'language') void switchLanguage(next.language);
    if (key === 'trueTimeScale') timeline?.setMode(value ? 'true' : 'log');
    if (key === 'lensStrength') globe.lens.setStrength((value as number) / 100);
  },
  closeLensHint: () => actions.setSetting('lensHintSeen', true),
  addBookmark: () => {
    const name = formatDateReadout(clock.day, i18n.language, {
      yearsPerMinute: 0,
      stationary: true,
    });
    const b = { id: newId(), name, ms: clock.ms, camera: { ...controller.state } };
    setBookmarks([b, ...ui.value.bookmarks].slice(0, MAX_BOOKMARKS));
  },
  goToBookmark: (id) => {
    const b = ui.value.bookmarks.find((x) => x.id === id);
    if (!b) return;
    clock.setMs(b.ms);
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
  followPlayhead: () => timeline?.setFollow(true),
  toggleLanes: () => {
    actions.setSetting('timelineExpanded', !ui.value.settings.timelineExpanded);
    updateVisibleLanes();
    layoutTimeline();
  },
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
      timeline.setMode(ui.value.settings.trueTimeScale ? 'true' : 'log', false);
    }
    lastRegion = undefined;
    updateVisibleLanes();
    layoutTimeline();
  },
};

/**
 * An experimental build shown for feedback carries a short description from
 * VITE_BUILD_LABEL in front of the title (spec section 11); main has none.
 */
const BUILD_LABEL: string = (import.meta.env.VITE_BUILD_LABEL as string | undefined) ?? '';

function tabTitle(): string {
  const title = i18n.t('app.title');
  return BUILD_LABEL ? `${BUILD_LABEL} · ${title}` : title;
}

async function switchLanguage(lang: Settings['language']): Promise<void> {
  // Keep the old strings until the other language's index has arrived. If it
  // cannot be loaded, stay in the current language and put the setting back
  // (section 10.4); switching again tries again.
  let next: StartupIndex;
  try {
    next = await loader.index(lang);
  } catch {
    if (ui.value.settings.language === lang && i18n.language !== lang) {
      const back: Settings = { ...ui.value.settings, language: i18n.language };
      saveSettings(back);
      ui.update({ settings: back });
    }
    return;
  }
  i18n.set(lang);
  document.documentElement.lang = lang;
  document.title = tabTitle();
  index = next;
  timeline?.setIndex(next);
  vignettes.setIndex(next.vignettes);
  const open = ui.value.vignette && next.vignettes.find((v) => v.id === ui.value.vignette!.id);
  if (open && ui.value.panel === 'vignette') void openVignette(open);
  ui.update({ sources: next.sources });
}

/** Opens a vignette's card at once with its title, then fills in the text (milestone 2 section 11). */
async function openVignette(entry: VignetteEntry): Promise<void> {
  const card: VignetteCard = {
    id: entry.id,
    title: entry.title,
    fromDay: entry.fromDay,
    toDay: entry.toDay,
    fromApproximate: entry.fromApproximate,
    toApproximate: entry.toApproximate,
  };
  ui.update({ panel: 'vignette', vignette: card });
  const done = (patch: Partial<VignetteCard>) => {
    if (ui.value.vignette === card) ui.update({ vignette: { ...card, ...patch } });
  };
  try {
    done({ text: await loader.json<NonNullable<VignetteCard['text']>>(entry.text) });
  } catch {
    done({ failed: true });
  }
}

attachKeys({
  clock,
  controller,
  closePanel: () => {
    if (ui.value.panel === 'none') return false;
    ui.update({ panel: 'none' });
    return true;
  },
  timelineCanvas: () => timeline?.canvas,
});

// --- Saved view ---------------------------------------------------------------------

let lastViewSave = 0;
loop.afterFrame = (now) => {
  timeline?.draw();
  if (!ui.value.settings.timelineExpanded) updateVisibleLanes();
  if (now - lastViewSave > VIEW_SAVE_MS) {
    lastViewSave = now;
    persistView();
  }
};
function persistView(): void {
  if (STRESS || !index) return;
  saveView({
    ms: clock.ms,
    camera: { ...controller.state },
    playState: clock.playState,
    speedMode: clock.speedMode,
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistView();
});
window.addEventListener('pagehide', persistView);

// --- Start --------------------------------------------------------------------------

async function start(): Promise<void> {
  document.documentElement.lang = i18n.language;
  document.title = tabTitle();
  render(h(App, { store: ui, hot, i18n, actions }), document.getElementById('ui')!);
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
    vignettes.setIndex(index.vignettes);
    globe.lowestSeaLevel = minSeaLevel;
    clock.configure({
      startDay: manifest.timelineStartDay,
      endDay: manifest.cutoffDay,
      ms: STRESS ? undefined : savedView?.ms,
      day: STRESS ? STRESS_DAY : OPENING_DAY,
      playState: STRESS ? 'playing' : (savedView?.playState ?? 'paused'),
      speedMode: STRESS ? 'regular' : savedView?.speedMode,
    });
    clock.subscribe(() => loop.syncUi(performance.now()));
    ui.update({
      fixture: manifest.fixture,
      version: manifest.version,
      cutoffDay: manifest.cutoffDay,
      sources: index.sources,
    });
    hot.update({
      day: clock.day,
      playState: clock.playState,
      speedMode: clock.speedMode,
      yearsPerMinute: clock.yearsPerMinute,
    });
    if (timeline) {
      timeline.setIndex(index);
      timeline.setMode(ui.value.settings.trueTimeScale ? 'true' : 'log', false);
      updateVisibleLanes();
      layoutTimeline();
    }
    applyQuality();
    resize();
    loop.start();
    await firstView();
    ui.update({ ready: true });
    // The first view's data budget counts what was requested before this mark.
    performance.mark('miniworld:first-view');
    // Plants load after the first view, outside its data budget (spec foliage.md, section 7).
    foliage.active = true;
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
      if (tiles > 0 && tiles === last && loader.pending === 0 && globe.pendingBuilds === 0)
        stable++;
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

export function startApp(): void {
  void start();
}

if (import.meta.env.DEV)
  Object.assign(globalThis, {
    __miniworld: {
      globe,
      foliage,
      vignettes,
      controller,
      clock,
      loader,
      renderer,
      ui,
      hot,
      scene,
      sky,
      camera,
      timeline: () => timeline,
    },
  });
