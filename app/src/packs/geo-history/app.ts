// The geo-history app (geo-history.md): loads the planet, draws it, runs the
// clock of ages and hands the interface its state.

import * as THREE from 'three';
import { h, render } from 'preact';
import { CameraController } from '../../engine/globe/cameraController.ts';
import { cameraLight, Sky } from '../../engine/globe/sky.ts';
import { EARTH_RADIUS_KM } from '../../engine/geo/earth.ts';
import { detectLanguage, type Language } from '../../engine/i18n/messages.ts';
import type { CameraState } from '../../engine/core/camera.ts';
import { loadGeoData, type GeoData, type Moment } from './data.ts';
import { GeoScene } from './render/scene.ts';
import { STRINGS } from './strings.ts';
import { Ui, type Actions, type UiState, type View } from './ui/Ui.tsx';
import { START_AGE, advance, clampAge, maToAge, type SpeedMode, SPEED_MODES } from './world/age.ts';
import './ui/styles.css';

const PREFIX = 'geo-history.';
const FULL_VIEW: View = { from: 1000, to: 0 };
const MIN_RANGE = 1;
const START_CAMERA: CameraState = { lat: 15, lon: 20, altitudeKm: 16000, heading: 0, tilt: 0 };

interface Saved {
  language: Language;
  age: number;
  speed: SpeedMode;
  overlays: { boundaries: boolean; coasts: boolean };
  camera: CameraState;
}

function load(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(`${PREFIX}state.v1`) ?? '{}') as Partial<Saved>;
  } catch {
    return {};
  }
}

function save(s: Saved): void {
  try {
    localStorage.setItem(`${PREFIX}state.v1`, JSON.stringify(s));
  } catch {
    // Storage may be blocked; the app works without it.
  }
}

export async function startApp(): Promise<void> {
  const canvas = document.getElementById('globe') as HTMLCanvasElement;
  const root = document.getElementById('ui') as HTMLElement;
  const saved = load();
  const language: Language =
    saved.language ?? detectLanguage(navigator.languages ?? [navigator.language]);
  document.documentElement.lang = language;
  document.title = `Miniworld · ${STRINGS[language].title}`;
  root.textContent = '';
  const loading = document.createElement('div');
  loading.className = 'geo-loading';
  loading.textContent = STRINGS[language].loading;
  root.append(loading);

  let data: GeoData;
  try {
    data = await loadGeoData();
  } catch (e) {
    console.error(e);
    loading.textContent = STRINGS[language].loadError;
    return;
  }
  loading.remove();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0xada1cc);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 50, 1e5);
  const sky = new Sky();
  const geo = new GeoScene(data);
  scene.add(sky.dome, geo.group);
  // The first view looks at the middle of the land of the start age, from a height that shows the globe.
  const centre = geo.landCentre(clampAge(saved.age ?? START_AGE));
  const first: CameraState = {
    ...START_CAMERA,
    lat: centre.lat,
    lon: centre.lon,
    altitudeKm: innerWidth < 700 ? 40000 : 17000,
  };
  const controller = new CameraController(
    camera,
    canvas,
    { surfaceKm: () => 0 },
    saved.camera ?? first,
  );
  controller.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state: UiState = {
    data,
    language,
    age: clampAge(saved.age ?? START_AGE),
    playing: false,
    speed: SPEED_MODES.includes(saved.speed as SpeedMode) ? (saved.speed as SpeedMode) : 'regular',
    view: { ...FULL_VIEW },
    overlays: saved.overlays ?? { boundaries: true, coasts: true },
    moment: undefined,
    about: false,
    width: innerWidth,
  };

  let dirty = true;
  const redraw = (): void => {
    dirty = true;
  };
  const clampView = (v: View): View => {
    let range = Math.min(FULL_VIEW.from - FULL_VIEW.to, Math.max(MIN_RANGE, v.from - v.to));
    let from = v.from;
    if (from > FULL_VIEW.from) from = FULL_VIEW.from;
    if (from - range < FULL_VIEW.to) from = FULL_VIEW.to + range;
    range = Math.min(range, FULL_VIEW.from - FULL_VIEW.to);
    return { from, to: from - range };
  };
  const keepInView = (): void => {
    const ma = state.age / 1_000_000;
    const v = state.view;
    if (ma > v.from || ma < v.to) {
      const range = v.from - v.to;
      state.view = clampView({ from: ma + range / 2, to: ma - range / 2 });
    }
  };
  const fly = (m: Moment): void => {
    const age = maToAge(m.age);
    state.age = age;
    let target: { lat: number; lon: number };
    if ('follow' in m.look)
      target = geo.followPoint(m.look.follow.plate, m.look.follow.lat, m.look.follow.lon, age);
    else target = geo.landCentre(age);
    controller.flyTo({ lat: target.lat, lon: target.lon, altitudeKm: 9000, heading: 0, tilt: 0 });
  };
  const actions: Actions = {
    togglePlay: () => {
      if (!state.playing && state.age === 0) state.age = START_AGE;
      state.playing = !state.playing;
      redraw();
    },
    setSpeed: (mode) => {
      state.speed = mode;
      redraw();
    },
    seekMa: (ma) => {
      state.age = maToAge(ma);
      redraw();
    },
    toStart: () => {
      state.age = START_AGE;
      keepInView();
      redraw();
    },
    toEnd: () => {
      state.age = 0;
      state.playing = false;
      keepInView();
      redraw();
    },
    setLanguage: (l) => {
      state.language = l;
      document.documentElement.lang = l;
      document.title = `Miniworld · ${STRINGS[l].title}`;
      redraw();
    },
    toggleOverlay: (name) => {
      state.overlays = { ...state.overlays, [name]: !state.overlays[name] };
      geo.setOverlays(state.overlays);
      redraw();
    },
    zoom: (factor, centre) => {
      const v = state.view;
      const c = centre ?? (v.from + v.to) / 2;
      const range = Math.max(MIN_RANGE, (v.from - v.to) * factor);
      const t = (v.from - c) / (v.from - v.to);
      const from = c + t * range;
      state.view = clampView({ from, to: from - range });
      redraw();
    },
    showAll: () => {
      state.view = { ...FULL_VIEW };
      redraw();
    },
    selectMoment: (m) => {
      state.moment = m;
      if (m) {
        fly(m);
        keepInView();
      }
      redraw();
    },
    setAbout: (open) => {
      state.about = open;
      redraw();
    },
  };
  geo.setOverlays(state.overlays);

  function resize(): void {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    // The globe sits above the timeline panel.
    camera.setViewOffset(
      innerWidth,
      innerHeight,
      0,
      innerWidth < 700 ? 120 : 70,
      innerWidth,
      innerHeight,
    );
    camera.updateProjectionMatrix();
    state.width = innerWidth;
    redraw();
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    if (e.key === 'Escape') {
      if (state.about) actions.setAbout(false);
      else if (state.moment) actions.selectMoment(undefined);
    } else if (state.about) return;
    else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      actions.togglePlay();
    } else if (e.key === '[' || e.key === ']') {
      const i = SPEED_MODES.indexOf(state.speed) + (e.key === ']' ? 1 : -1);
      actions.setSpeed(SPEED_MODES[Math.max(0, Math.min(SPEED_MODES.length - 1, i))]!);
    } else if (e.key === 'Home') actions.toStart();
    else if (e.key === 'End') actions.toEnd();
    else if (controller.keyDown(e)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => controller.keyUp(e));
  window.addEventListener('blur', () => controller.releaseKeys());

  // The pack's own debugging hook, in development builds only.
  if (import.meta.env.DEV)
    (window as unknown as { __geo: unknown }).__geo = { state, actions, controller, geo };

  const light = new THREE.Vector3();
  let last = performance.now();
  let lastUi = 0;
  let lastSave = 0;
  const tick = (now: number): void => {
    const dt = Math.min(100, now - last);
    last = now;
    if (state.playing) {
      state.age = advance(state.age, dt, state.speed);
      if (state.age === 0) state.playing = false;
      keepInView();
      dirty = true;
    }
    controller.update(dt, now);
    sky.update(camera);
    geo.setAge(state.age);
    cameraLight(camera, light);
    geo.setLight(light);
    const dist = camera.position.length();
    geo.setViewport(
      renderer.domElement.width,
      renderer.domElement.height,
      0.012 * Math.min(1.6, Math.max(0.2, (dist - EARTH_RADIUS_KM) / 9000)),
    );
    renderer.render(scene, camera);
    if (dirty && now - lastUi > 45) {
      dirty = false;
      lastUi = now;
      render(h(Ui, { s: { ...state }, a: actions }), root);
    }
    if (now - lastSave > 2000) {
      lastSave = now;
      save({
        language: state.language,
        age: state.age,
        speed: state.speed,
        overlays: state.overlays,
        camera: { ...controller.state },
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
