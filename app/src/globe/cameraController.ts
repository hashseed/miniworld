// Orbit-to-ground camera (spec milestone 1, section 6) for mouse, touch and
// keyboard, with tilt that follows altitude, inertia and fly-to.

import * as THREE from 'three';
import type { CameraState } from '../core/camera.ts';
import { dirToLatLon, latLonToDir, type Vec3 } from '../geo/cube.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';

/** Closest zoom: the Iberian Peninsula about fills the screen (section 6.1). */
export const MIN_DISTANCE_KM = 1300;
/** Farthest zoom on a wide screen; narrow screens may go further so the whole globe fits. */
export const MAX_DISTANCE_KM = EARTH_RADIUS_KM * 2.6;
/** Tilt from straight down at the closest zoom, and the distance where it reaches zero. */
const CLOSE_TILT = 40;
const FLAT_TILT_KM = 6000;
const MIN_CLEARANCE_KM = 0.4;
/** Steepest view from straight down; near 90° looks along the ground to the horizon. */
export const MAX_TILT = 85;

/** Tilt (degrees from straight down) that follows the distance to the target. */
export function autoTilt(distanceKm: number): number {
  const t = THREE.MathUtils.clamp(
    Math.log(distanceKm / MIN_DISTANCE_KM) / Math.log(FLAT_TILT_KM / MIN_DISTANCE_KM),
    0,
    1,
  );
  return CLOSE_TILT * Math.pow(1 - t, 1.3);
}

/**
 * Farthest camera distance (km from the target) at which the whole globe
 * still fits on the screen with a small margin, at least MAX_DISTANCE_KM.
 */
export function maxDistanceKm(fovDeg: number, aspect: number): number {
  const half = THREE.MathUtils.degToRad(fovDeg / 2);
  const narrow = Math.min(half, Math.atan(Math.tan(half) * aspect));
  return Math.max(MAX_DISTANCE_KM, (EARTH_RADIUS_KM * 1.08) / Math.sin(narrow) - EARTH_RADIUS_KM);
}

interface Flight {
  from: CameraState;
  to: CameraState;
  start: number;
  duration: number;
  peak: number;
}

export interface SurfaceProvider {
  /** Drawn surface height in km (exaggerated) above the sphere at a drawn direction. */
  surfaceKm(dir: Vec3): number;
}

/**
 * The history lens as the camera sees it (history-lens.md, section 4): the
 * camera state is the true point at the centre of the screen, drawn where the
 * lens puts it.
 */
export interface LensView {
  toDrawn(dir: Vec3): Vec3;
  toTrue(dir: Vec3): Vec3;
  /** Drawn km per true km at a true direction. */
  widthAt(dir: Vec3): number;
}

// Scratch vectors for placing the camera, which runs every frame.
const _up = new THREE.Vector3();
const _target = new THREE.Vector3();
const _north = new THREE.Vector3();
const _east = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _back = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _vec3: Vec3 = [0, 0, 0];

/** A vector as a direction for the surface, in a shared scratch array. */
function toVec3(v: THREE.Vector3): Vec3 {
  _vec3[0] = v.x;
  _vec3[1] = v.y;
  _vec3[2] = v.z;
  return _vec3;
}

const IDENTITY_LENS: LensView = {
  toDrawn: (d) => d,
  toTrue: (d) => d,
  widthAt: () => 1,
};

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  state: CameraState;
  private surface: SurfaceProvider;
  private element: HTMLElement;
  private velocity = { lat: 0, lon: 0 };
  private keys = new Set<string>();
  private pointers = new Map<number, { x: number; y: number; button: number }>();
  private gesture: { dist: number; angle: number; midY: number } | undefined;
  private flight: Flight | undefined;
  private easedAltitude: number;
  /** Surface height (km) under the look point, eased so the camera never jumps at coasts or as tiles load. */
  private targetSurfKm: number | undefined;
  reducedMotion = false;
  /** While the loading screen shows the globe small in the distance, the camera may be this far out (milestone-1 section 8.6). */
  farKm = 0;
  lens: LensView = IDENTITY_LENS;

  constructor(
    camera: THREE.PerspectiveCamera,
    element: HTMLElement,
    surface: SurfaceProvider,
    initial: CameraState,
  ) {
    this.camera = camera;
    this.element = element;
    this.surface = surface;
    this.state = { ...initial };
    this.easedAltitude = initial.altitudeKm;
    this.attach();
  }

  /** Camera altitude above the surface, smoothed (drives the zoom factor of the clock). */
  get altitudeKm(): number {
    return this.easedAltitude;
  }

  private get maxDistance(): number {
    return Math.max(this.farKm, maxDistanceKm(this.camera.fov, this.camera.aspect));
  }

  /** Flies the camera to a view; returns how long the flight takes, in milliseconds. */
  flyTo(target: CameraState, now = performance.now()): number {
    const from = { ...this.state };
    const a = new THREE.Vector3(...latLonToDir(from.lat, from.lon));
    const b = new THREE.Vector3(...latLonToDir(target.lat, target.lon));
    const angle = a.angleTo(b);
    const duration = this.reducedMotion
      ? 250
      : THREE.MathUtils.clamp(1000 + angle * 900, 1000, 3000);
    const peak = Math.min(this.maxDistance, angle * EARTH_RADIUS_KM * 0.9);
    this.flight = {
      from,
      to: { ...target, heading: normaliseHeading(target.heading, from.heading) },
      start: now,
      duration,
      peak,
    };
    return duration;
  }

  /** Whether a fly-to is under way. */
  get flying(): boolean {
    return this.flight !== undefined;
  }

  cancelFlight(): void {
    this.flight = undefined;
  }

  resetOrientation(): void {
    this.flyTo({ ...this.state, heading: 0, tilt: 0 });
  }

  update(dtMs: number, now = performance.now()): void {
    const dt = Math.min(dtMs, 100) / 1000;
    const s = this.state;
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (now - f.start) / f.duration);
      const e = t * t * (3 - 2 * t);
      const a = new THREE.Vector3(...latLonToDir(f.from.lat, f.from.lon));
      const b = new THREE.Vector3(...latLonToDir(f.to.lat, f.to.lon));
      const dir = slerp(a, b, e);
      const ll = dirToLatLon([dir.x, dir.y, dir.z]);
      s.lat = ll.lat;
      s.lon = ll.lon;
      const logD = THREE.MathUtils.lerp(Math.log(f.from.altitudeKm), Math.log(f.to.altitudeKm), e);
      s.altitudeKm = Math.max(Math.exp(logD), f.peak * Math.sin(Math.PI * e));
      s.heading = THREE.MathUtils.lerp(f.from.heading, f.to.heading, e);
      s.tilt = THREE.MathUtils.lerp(f.from.tilt, f.to.tilt, e);
      if (t >= 1) this.flight = undefined;
    } else {
      this.applyKeys(dt);
      if (this.pointers.size === 0) {
        s.lat += this.velocity.lat * dt;
        s.lon += this.velocity.lon * dt;
        const decay = Math.exp(-dt * 4);
        this.velocity.lat *= decay;
        this.velocity.lon *= decay;
      }
    }
    s.lat = THREE.MathUtils.clamp(s.lat, -89.5, 89.5);
    s.lon = ((((s.lon + 180) % 360) + 360) % 360) - 180;
    s.altitudeKm = THREE.MathUtils.clamp(s.altitudeKm, MIN_DISTANCE_KM, this.maxDistance);
    const auto = autoTilt(s.altitudeKm);
    s.tilt = THREE.MathUtils.clamp(s.tilt, -auto, MAX_TILT - auto);
    this.place(dt);
    const actualAlt =
      this.camera.position.length() -
      EARTH_RADIUS_KM -
      this.surface.surfaceKm(this.dirOf(this.camera.position));
    const k = 1 - Math.exp(-dt * 3);
    this.easedAltitude += (Math.max(0.1, actualAlt) - this.easedAltitude) * k;
  }

  /** Total tilt in degrees from straight down. */
  get totalTilt(): number {
    return THREE.MathUtils.clamp(autoTilt(this.state.altitudeKm) + this.state.tilt, 0, MAX_TILT);
  }

  private place(dt: number): void {
    const s = this.state;
    const up = _up.fromArray(this.lens.toDrawn(latLonToDir(s.lat, s.lon)));
    const ground = this.surface.surfaceKm(toVec3(up));
    this.targetSurfKm =
      this.targetSurfKm === undefined
        ? ground
        : this.targetSurfKm + (ground - this.targetSurfKm) * (1 - Math.exp(-dt * 2));
    const surf = this.targetSurfKm;
    const target = _target.copy(up).multiplyScalar(EARTH_RADIUS_KM + surf);
    const north = _north;
    const east = _east;
    northEast(up, north, east);
    const h = THREE.MathUtils.degToRad(s.heading);
    const forward = _forward
      .copy(north)
      .multiplyScalar(Math.cos(h))
      .addScaledVector(east, Math.sin(h));
    const tilt = THREE.MathUtils.degToRad(this.totalTilt);
    const back = _back
      .copy(up)
      .multiplyScalar(Math.cos(tilt))
      .addScaledVector(forward, -Math.sin(tilt));
    const pos = _pos.copy(target).addScaledVector(back, s.altitudeKm);
    // Keep clear of the ground under the camera.
    const camUp = _camUp.copy(pos).normalize();
    const clear = EARTH_RADIUS_KM + this.surface.surfaceKm(toVec3(camUp)) + MIN_CLEARANCE_KM;
    if (pos.length() < clear) pos.setLength(clear);
    this.camera.position.copy(pos);
    this.camera.up
      .copy(forward)
      .lerp(up, Math.cos(tilt) < 0.5 ? 1 - Math.cos(tilt) : 0.5)
      .normalize();
    this.camera.lookAt(target);
    const dist = pos.length() - EARTH_RADIUS_KM;
    this.camera.near = Math.max(0.01, dist * 0.02);
    this.camera.far = EARTH_RADIUS_KM * 4 + dist * 2;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  private dirOf(v: THREE.Vector3): Vec3 {
    return toVec3(_dir.copy(v).normalize());
  }

  /** Angle per screen pixel (radians) for moving over the ground. */
  private radPerPixel(): number {
    const h = this.element.clientHeight || 800;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    // Panning moves the drawn ground with the pointer, so enlarged regions pan slower in true degrees.
    const width = this.lens.widthAt(latLonToDir(this.state.lat, this.state.lon));
    return (2 * Math.tan(fov / 2) * this.state.altitudeKm) / h / EARTH_RADIUS_KM / width;
  }

  private pan(dx: number, dy: number): void {
    const s = this.state;
    const k = THREE.MathUtils.radToDeg(this.radPerPixel());
    const h = THREE.MathUtils.degToRad(s.heading);
    const fwd = dy * k;
    const right = -dx * k;
    const dLat = fwd * Math.cos(h) - right * Math.sin(h);
    const dLon =
      (fwd * Math.sin(h) + right * Math.cos(h)) /
      Math.max(0.05, Math.cos(THREE.MathUtils.degToRad(s.lat)));
    s.lat += dLat;
    s.lon += dLon;
    this.velocity.lat = dLat * 60;
    this.velocity.lon = dLon * 60;
  }

  private zoom(factor: number): void {
    this.state.altitudeKm = THREE.MathUtils.clamp(
      this.state.altitudeKm * factor,
      MIN_DISTANCE_KM,
      this.maxDistance,
    );
  }

  private applyKeys(dt: number): void {
    const k = this.keys;
    if (k.size === 0) return;
    const step = 500 * dt;
    if (k.has('ArrowLeft') || k.has('a')) this.pan(step, 0);
    if (k.has('ArrowRight') || k.has('d')) this.pan(-step, 0);
    if (k.has('ArrowUp') || k.has('w')) this.pan(0, step);
    if (k.has('ArrowDown') || k.has('s')) this.pan(0, -step);
    if (k.has('+') || k.has('=') || k.has('q')) this.zoom(Math.exp(-dt * 1.5));
    if (k.has('-') || k.has('e')) this.zoom(Math.exp(dt * 1.5));
    if (k.has('PageUp')) this.state.tilt += 40 * dt;
    if (k.has('PageDown')) this.state.tilt -= 40 * dt;
    if (k.has(',')) this.state.heading -= 60 * dt;
    if (k.has('.')) this.state.heading += 60 * dt;
    this.velocity.lat = 0;
    this.velocity.lon = 0;
  }

  /** Ray from a screen point to the globe sphere, as a true direction. */
  pick(clientX: number, clientY: number): Vec3 | undefined {
    const rect = this.element.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.ray.intersectSphere(
      new THREE.Sphere(new THREE.Vector3(), EARTH_RADIUS_KM),
      new THREE.Vector3(),
    );
    if (!hit) return undefined;
    hit.normalize();
    return this.lens.toTrue([hit.x, hit.y, hit.z]);
  }

  private attach(): void {
    const el = this.element;
    el.style.touchAction = 'none';
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      this.gesture = undefined;
      this.cancelFlight();
      this.velocity = { lat: 0, lon: 0 };
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (this.pointers.size === 1) {
        if (p.button === 2 || e.ctrlKey) {
          this.state.heading += dx * 0.3;
          this.state.tilt -= dy * 0.2;
        } else this.pan(dx, dy);
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 2) this.twoFinger();
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.gesture = undefined;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.cancelFlight();
        this.zoom(Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
      },
      { passive: false },
    );
    el.addEventListener('dblclick', (e) => {
      const d = this.pick(e.clientX, e.clientY);
      if (!d) return;
      const ll = dirToLatLon(d);
      this.flyTo({
        ...this.state,
        lat: ll.lat,
        lon: ll.lon,
        altitudeKm: Math.max(MIN_DISTANCE_KM, this.state.altitudeKm / 3),
      });
    });
  }

  /**
   * A key pressed outside text fields (app/src/input.ts): N turns north up,
   * and the movement keys move the camera while held. Returns whether the
   * camera used the key.
   */
  keyDown(e: KeyboardEvent): boolean {
    const key = keyName(e);
    if (key === 'n') {
      this.resetOrientation();
      return true;
    }
    if (!HELD_KEYS.includes(key)) return false;
    this.keys.add(key);
    this.cancelFlight();
    return true;
  }

  keyUp(e: KeyboardEvent): void {
    this.keys.delete(keyName(e));
  }

  /** Forgets held keys, such as when the window loses focus. */
  releaseKeys(): void {
    this.keys.clear();
  }

  private twoFinger(): void {
    const pts = [...this.pointers.values()];
    const a = pts[0]!;
    const b = pts[1]!;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const midY = (a.y + b.y) / 2;
    if (this.gesture) {
      if (dist > 0 && this.gesture.dist > 0) this.zoom(this.gesture.dist / dist);
      this.state.heading -= THREE.MathUtils.radToDeg(angle - this.gesture.angle);
      this.state.tilt -= (midY - this.gesture.midY) * 0.2;
    }
    this.gesture = { dist, angle, midY };
  }
}

function slerp(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const angle = a.angleTo(b);
  if (angle < 1e-6) return a.clone();
  const s = Math.sin(angle);
  return a
    .clone()
    .multiplyScalar(Math.sin((1 - t) * angle) / s)
    .add(b.clone().multiplyScalar(Math.sin(t * angle) / s));
}

function normaliseHeading(target: number, from: number): number {
  let h = target;
  while (h - from > 180) h -= 360;
  while (h - from < -180) h += 360;
  return h;
}

/** Keys that move the camera while held (section 6.2). */
const HELD_KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'w',
  'a',
  's',
  'd',
  'q',
  'e',
  '+',
  '=',
  '-',
  ',',
  '.',
];

function keyName(e: KeyboardEvent): string {
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}
