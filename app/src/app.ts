// The app: builds the state and the scene, loads the manifest and index,
// and implements the interface's actions (spec milestone 1). The frame loop
// is in loop.ts, the keyboard in input.ts and the stress scene in dev/stress.ts.

import * as THREE from 'three';
import { h, render } from 'preact';
import { ContentLoader } from './content/loader.ts';
import type { StartupIndex, VignetteEntry } from './content/types.ts';
import { Store } from './core/store.ts';
import { CameraController } from './globe/cameraController.ts';
import { EARTH_RADIUS_KM } from './geo/earth.ts';
import { FADE_MS } from './ui/LoadingScreen.tsx';
import { Globe } from './globe/globe.ts';
import { Foliage } from './globe/foliage.ts';
import { Lens, decodeLensGrids, LENS_STRENGTH } from './globe/lens.ts';
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
import { LandmarkLayer } from './landmarks/landmarkLayer.ts';
import { VignetteLayer } from './vignettes/vignetteLayer.ts';
import { WildlifeLayer } from './wildlife/wildlifeLayer.ts';
import { OPENING_DAY, TIMELINE_START } from './time/calendar.ts';
import { TreeLayer } from './tree/treeLayer.ts';
import { SitesLayer } from './tree/sitesLayer.ts';
import { Clock, JUMP_SECONDS } from './time/clock.ts';
import { yearsPerMinuteAt } from './time/rate.ts';
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
import { groupSpanAt, WILD_GROUPS } from './world/wildlife.ts';

const params = new URLSearchParams(location.search);
const STRESS = params.get('scene') === 'stress';
/** The first view: the first person's camp at Lake Turkana (spec humankind.md, section 7). */
const DEFAULT_CAMERA: CameraState = {
  lat: 3.95,
  lon: 36.2,
  altitudeKm: 1500,
  heading: 0,
  tilt: 0,
};
const VIEW_SAVE_MS = 2000;

const isPhone =
  matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
const deviceId = `${navigator.userAgent}|${screen.width}x${screen.height}@${devicePixelRatio}`;

// --- State --------------------------------------------------------------------------

const settings = loadSettings({
  language: detectLanguage(navigator.languages ?? [navigator.language]),
  timelineExpanded: false,
  timelineMinimized: false,
  trueTimeScale: false,
  showStats: false,
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
  jumping: 0,
  stats: { fps: 0, avg: 0, p99: 0, calls: 0, triangles: 0, scale: 1 },
});
const ui = new Store<UiState>({
  intro: 'loading',
  introCaptionY: innerHeight * 0.75,
  loaded: 0.05,
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
// A reversed float depth buffer where the graphics card supports it, else a
// logarithmic one (section 11.7).
const reversedDepth = supportsClipControl();
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  logarithmicDepthBuffer: !reversedDepth,
  reversedDepthBuffer: reversedDepth,
  powerPreference: 'high-performance',
});
renderer.info.autoReset = false;
renderer.setClearColor(0xfbe3d4);
const frames = new FrameRenderer(renderer, isPhone ? 2 : 4, reversedDepth);
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
const landmarks = new LandmarkLayer(loader, {
  surfaceKm: surface.surfaceKm,
  toDrawn: (d) => globe.lens.toDrawn(d),
});
vignettes.landmarks = landmarks;
const wildlife = new WildlifeLayer({
  surfaceKm: surface.surfaceKm,
  toDrawn: (d) => globe.lens.toDrawn(d),
  widthAt: (d) => globe.lens.widthAt(d),
});
const tree = new TreeLayer(loader, {
  surfaceKm: surface.surfaceKm,
  toDrawn: (d) => globe.lens.toDrawn(d),
});
scene.add(landmarks.group, vignettes.group, wildlife.group, tree.group);
/** The camp sites for development, with `?sites` (sites.md section 7). */
let sitesView: SitesLayer | undefined;
vignettes.onOpen = (entry) => void openVignette(entry);
// A tap that misses every cast may land on a landmark, then on an animal, which open their cards the same way.
vignettes.onMiss = (x, y) => {
  const entry = landmarks.hit(x, y);
  if (entry) return void openVignette(entry);
  const group = wildlife.hit(x, y);
  if (group !== undefined) void openAnimal(group);
};
vignettes.onFly = (lat, lon, altitudeKm) =>
  controller.flyTo({ ...controller.state, lat, lon, altitudeKm });
controller.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
foliage.still = controller.reducedMotion;
// The camera sees the lens through the globe, which swaps in the loaded warp.
controller.lens = {
  toDrawn: (d) => globe.lens.toDrawn(d),
  toTrue: (d) => globe.lens.toTrue(d),
  widthAt: (d) => globe.lens.widthAt(d),
};
// The lens is fixed at 120% (history-lens.md section 1; Yang, 2026-10-19).
globe.lens.setStrength(LENS_STRENGTH, false);

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
    landmarks,
    wildlife,
    tree,
    hot,
    stress: STRESS
      ? new StressRun(scene, Number(params.get('pathFrames')) || undefined)
      : undefined,
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
  // Minimized, the timeline shows only its ruler of years; collapsed, only the lane of the
  // region the globe is centred on; expanded, the World lane and every regional lane.
  if (ui.value.settings.timelineMinimized) {
    if (timeline.visibleLanes?.length !== 0) {
      timeline.setVisibleLanes([]);
      lastRegion = undefined;
      layoutTimeline();
    }
    return;
  }
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
    if (key === 'trueTimeScale') timeline?.setMode(value ? 'true' : 'watch');
  },
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
  jump: (dir) => clock.jumpWatch(dir * JUMP_SECONDS * 1000),
  followPlayhead: () => timeline?.setFollow(true),
  toggleLanes: () => {
    actions.setSetting('timelineExpanded', !ui.value.settings.timelineExpanded);
    updateVisibleLanes();
    layoutTimeline();
  },
  toggleMinimized: () => {
    actions.setSetting('timelineMinimized', !ui.value.settings.timelineMinimized);
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
      timeline.setMode(ui.value.settings.trueTimeScale ? 'true' : 'watch', false);
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
  landmarks.setIndex(next.landmarks);
  const open =
    ui.value.vignette &&
    [...next.vignettes, ...next.landmarks].find((v) => v.id === ui.value.vignette!.id);
  if (open && ui.value.panel === 'vignette') void openVignette(open);
  if (ui.value.panel === 'vignette' && ui.value.vignette?.animal && openAnimalGroup !== undefined)
    void openAnimal(openAnimalGroup);
  ui.update({ sources: next.sources });
}

/** The group whose animal card is open, so a language change can reopen it. */
let openAnimalGroup: number | undefined;

/**
 * Opens the card of a tapped animal's species at once with its title and its
 * group's span, then fills in the text (wildlife.md section 8).
 */
async function openAnimal(group: number): Promise<void> {
  const g = WILD_GROUPS[group];
  const entry = g && index?.animals.find((a) => a.id === g.species);
  if (!g || !entry) return;
  openAnimalGroup = group;
  const span = groupSpanAt(g, clock.day);
  // Years before 1500 are approximate (section 8).
  const card: VignetteCard = {
    id: `animal:${entry.id}`,
    title: entry.title,
    fromDay: span?.from?.day ?? 0,
    toDay: (span?.to?.day ?? 0) + 1,
    fromApproximate: (span?.from?.year ?? 1500) < 1500,
    toApproximate: (span?.to?.year ?? 1500) < 1500,
    animal: { from: span?.from !== undefined, to: span?.to !== undefined },
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
let lastFrame = 0;
loop.afterFrame = (now) => {
  introFrame(lastFrame ? now - lastFrame : 0);
  lastFrame = now;
  sitesView?.update(loop.planet.seaLevel, camera);
  timeline?.draw();
  updateVisibleLanes();
  if (now - lastViewSave > VIEW_SAVE_MS) {
    lastViewSave = now;
    persistView();
  }
};
let lastSavedView = '';
/** Saves the view when it has changed since it was last saved. */
function persistView(): void {
  // Not the far view of the loading screen (milestone-1 section 8.6).
  if (STRESS || !index || ui.value.intro !== 'done') return;
  const view = {
    day: clock.day,
    camera: { ...controller.state },
    playState: clock.playState,
    speedMode: clock.speedMode,
  };
  const key = JSON.stringify(view);
  if (key === lastSavedView) return;
  lastSavedView = key;
  saveView(view);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistView();
});
window.addEventListener('pagehide', persistView);

// --- Start --------------------------------------------------------------------------

async function start(): Promise<void> {
  document.documentElement.lang = i18n.language;
  document.title = tabTitle();
  startIntro();
  render(h(App, { store: ui, hot, i18n, actions }), document.getElementById('ui')!);
  try {
    const manifest = await loader.init();
    showLoaded(0.15);
    tree.setChunks(manifest.tree?.files ?? [], manifest.tree?.days ?? []);
    if (params.has('sites') && manifest.tree?.sites) {
      sitesView = new SitesLayer(
        loader,
        { surfaceKm: surface.surfaceKm, toDrawn: (d) => globe.lens.toDrawn(d) },
        manifest.tree.sites,
      );
      scene.add(sitesView.group);
    }
    // The lens grids load with the startup index; the first frame needs both.
    const [loadedIndex, lensBytes] = await Promise.all([
      loader.index(i18n.language),
      loader.fetchBytes(manifest.lens.file),
    ]);
    index = loadedIndex;
    showLoaded(0.35);
    const grids = decodeLensGrids(lensBytes);
    globe.setLens(new Lens(grids.forward, grids.inverse));
    minSeaLevel = lowestSeaLevel(index.seaLevel);
    vignettes.setIndex(index.vignettes);
    landmarks.setIndex(index.landmarks);
    wildlife.setMasks(index.wildlife);
    wildlife.setCamps(index.wildlifeCamps ?? []);
    globe.lowestSeaLevel = minSeaLevel;
    clock.configure({
      startDay: manifest.timelineStartDay,
      endDay: manifest.cutoffDay,
      day: STRESS ? STRESS_DAY : (savedView?.day ?? OPENING_DAY),
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
      timeline.setMode(ui.value.settings.trueTimeScale ? 'true' : 'watch', false);
      updateVisibleLanes();
      layoutTimeline();
    }
    applyQuality();
    resize();
    placeIntro();
    loop.start();
    await firstView();
    await handOver();
    // The first view's data budget counts what was requested before this mark.
    performance.mark('miniworld:first-view');
    // Plants load after the first view, outside its data budget (spec foliage.md, section 7).
    foliage.active = true;
  } catch (err) {
    ui.update({ error: err instanceof Error ? err.message : String(err) });
  }
  registerServiceWorker();
}

// --- Loading screen (milestone-1 section 8.6) ----------------------------------------

/** The latitude the small globe is seen from while loading, its spin westward, and its radius on screen. */
const INTRO_LAT = 15;
const INTRO_SPIN_DEG_PER_S = 20;
/** How long the controls take to fade in after loading (styles.css, ui-arrive). */
const ARRIVE_MS = 1600;
const introRadiusPx = () => Math.min(90, innerWidth * 0.22);
/** The view the camera flies in to once the world has loaded. */
let introTarget: CameraState | undefined;

/**
 * Moves the camera far out, where the globe is small, and keeps the remembered view for
 * later; the controls stay hidden meanwhile.
 */
function startIntro(): void {
  if (STRESS) {
    ui.update({ intro: 'done' });
    return;
  }
  introTarget = { ...controller.state };
  document.getElementById('ui')!.classList.add('intro');
  controller.state = { ...controller.state, lat: INTRO_LAT, lon: introTarget.lon + 40 };
  placeIntro();
}

/**
 * Puts the camera as far out as draws the globe introRadiusPx() across, through the view
 * offset, looking straight down, and the caption under the globe; again once the layout of
 * the bottom controls has moved the view offset.
 */
function placeIntro(): void {
  if (!introTarget || ui.value.intro !== 'loading') return;
  const full = camera.view?.fullHeight ?? innerHeight;
  const perRad = full / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const angle = Math.atan(introRadiusPx() / perRad);
  const altitudeKm = EARTH_RADIUS_KM / Math.sin(angle) - EARTH_RADIUS_KM;
  controller.farKm = altitudeKm;
  controller.state = { ...controller.state, altitudeKm, heading: 0, tilt: 0 };
  const centreY = full / 2 - (camera.view?.offsetY ?? 0);
  ui.update({ introCaptionY: centreY + introRadiusPx() + 20 });
}

/**
 * Each frame of the loading screen: spins the small globe, as many degrees as `dtMs` takes,
 * and keeps it plain: no clouds before the land has arrived, and no camps, animals or
 * vignettes, which would be specks at that distance.
 */
function introFrame(dtMs: number): void {
  const loading = ui.value.intro === 'loading' && !STRESS;
  clouds.mesh.visible = !loading || globe.drawnTiles > 0;
  for (const layer of [landmarks.group, vignettes.group, wildlife.group, tree.group])
    layer.visible = !loading;
  if (loading && !controller.reducedMotion)
    controller.state.lon -= (INTRO_SPIN_DEG_PER_S * Math.min(dtMs, 100)) / 1000;
}

/** Once the world has loaded: the caption fades, the controls appear and the camera flies in. */
async function handOver(): Promise<void> {
  if (!introTarget) return;
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  ui.update({ intro: 'flying', loaded: 1 });
  const root = document.getElementById('ui')!;
  root.classList.replace('intro', 'arrive');
  setTimeout(() => root.classList.remove('arrive'), ARRIVE_MS);
  controller.flyTo(introTarget);
  await wait(FADE_MS);
  // The caption's screen stays, invisible, until the flight ends or the viewer takes over.
  while (controller.flying) await wait(100);
  controller.farKm = 0;
  ui.update({ intro: 'done' });
}

/** Shows a larger share loaded on the loading screen; the share never goes down (milestone-1 section 8.6). */
function showLoaded(share: number): void {
  if (share >= ui.value.loaded + 0.01) ui.update({ loaded: Math.min(1, share) });
}

/** Resolves when the globe has stopped refining for a moment, or after a timeout. */
function firstView(): Promise<void> {
  return new Promise((resolve) => {
    const begin = performance.now();
    const before = loader.finished;
    let stable = 0;
    let last = -1;
    const check = () => {
      // The first view's share: the requests made since the index arrived that have finished.
      const done = loader.finished - before;
      const left = loader.pending + globe.pendingBuilds;
      if (done + left > 0) showLoaded(0.35 + (0.65 * done) / (done + left));
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
  void navigator.serviceWorker.register('sw.js').catch(() => undefined);
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
      landmarks,
      wildlife,
      tree,
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
      /**
       * Fixes the render scale for browser screenshots, so they do not depend
       * on how fast the software renderer draws (section 11.3).
       */
      /** History's rate at a day at regular speed, for the browser tests (spec section 2.1). */
      rateAt: (day: number) => yearsPerMinuteAt(day),
      /** Holds the frame loop for a screenshot, or releases it (section 13). */
      holdFrames: (on: boolean) => loop.hold(on),
      pinRenderScale: (scale: number) => {
        dynres.configure(scale, Infinity);
        dynres.scale = scale;
        frames.setSize(innerWidth, innerHeight, scale);
      },
    },
  });

/** Whether WebGL 2 offers clip control, which a reversed depth buffer needs. */
function supportsClipControl(): boolean {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ok = !!gl?.getExtension('EXT_clip_control');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return ok;
}
