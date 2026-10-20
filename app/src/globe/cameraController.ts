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
  /**
   * A spin-in (milestone-1 section 8.6): degrees of longitude to turn westward, and the turning
   * speed at the start as a share of the average, so it carries on from a spin under way.
   */
  spin?: { degrees: number; start: number };
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
  /**
   * A drag grabs the drawn point under the pointer and keeps it there, as in Google Earth
   * (milestone-1 section 6.2); letting go leaves the globe turning on, slowing down.
   */
  private grabbed: THREE.Vector3 | undefined;
  private spin = { axis: new THREE.Vector3(1, 0, 0), rate: 0 };
  private lastDrag = 0;
  /**
   * The heading when a drag began, and, once it is let go having turned the heading only a
   * little, the heading the view eases back to (milestone-1 section 6.2).
   */
  private dragHeading = 0;
  /** The last right-button press, for a right double-click (milestone-1 section 6.2). */
  private lastRight = { t: -Infinity, x: 0, y: 0 };
  private recoverHeading: number | undefined;
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
    this.recoverHeading = undefined;
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

  /**
   * Spins and zooms in to a view (milestone-1 section 8.6): the camera keeps turning westward
   * from `degPerS`, at least `ahead` degrees further, else once more all the way round, and
   * comes to rest on the view. Returns how long it takes, in milliseconds.
   */
  spinTo(target: CameraState, degPerS: number, ahead: number, now = performance.now()): number {
    const from = { ...this.state };
    let degrees = (((from.lon - target.lon) % 360) + 360) % 360;
    if (degrees < ahead) degrees += 360;
    const duration = this.reducedMotion ? 250 : 3500 + (degrees > 360 ? 1500 : 0);
    this.flight = {
      from,
      to: { ...target, heading: normaliseHeading(target.heading, from.heading) },
      start: now,
      duration,
      peak: 0,
      spin: { degrees, start: Math.min(3, (degPerS * duration) / 1000 / degrees) },
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
      if (f.spin) {
        // From the spin's own speed to rest: a cubic with that slope at the start and none at the end.
        const k = f.spin.start * (t * t * t - 2 * t * t + t) + (3 * t * t - 2 * t * t * t);
        s.lon = f.from.lon - f.spin.degrees * k;
        s.lat = THREE.MathUtils.lerp(f.from.lat, f.to.lat, e);
        s.altitudeKm = Math.exp(
          THREE.MathUtils.lerp(Math.log(f.from.altitudeKm), Math.log(f.to.altitudeKm), e),
        );
        s.heading = THREE.MathUtils.lerp(f.from.heading, f.to.heading, e);
        s.tilt = THREE.MathUtils.lerp(f.from.tilt, f.to.tilt, e);
        if (t >= 1) {
          s.lon = f.to.lon;
          this.flight = undefined;
        }
      } else {
        const a = new THREE.Vector3(...latLonToDir(f.from.lat, f.from.lon));
        const b = new THREE.Vector3(...latLonToDir(f.to.lat, f.to.lon));
        const dir = slerp(a, b, e);
        const ll = dirToLatLon([dir.x, dir.y, dir.z]);
        s.lat = ll.lat;
        s.lon = ll.lon;
        const logD = THREE.MathUtils.lerp(
          Math.log(f.from.altitudeKm),
          Math.log(f.to.altitudeKm),
          e,
        );
        s.altitudeKm = Math.max(Math.exp(logD), f.peak * Math.sin(Math.PI * e));
        s.heading = THREE.MathUtils.lerp(f.from.heading, f.to.heading, e);
        s.tilt = THREE.MathUtils.lerp(f.from.tilt, f.to.tilt, e);
        if (t >= 1) this.flight = undefined;
      }
    } else {
      this.applyKeys(dt);
      if (this.pointers.size === 0) {
        if (this.spin.rate > 1e-4) {
          this.turn(_spinQ.setFromAxisAngle(this.spin.axis, this.spin.rate * dt));
          this.spin.rate *= Math.exp(-dt * SPIN_DECAY);
        }
        if (this.recoverHeading !== undefined) {
          const d = headingDelta(this.recoverHeading, s.heading);
          if (Math.abs(d) < 0.05) {
            s.heading = this.recoverHeading;
            this.recoverHeading = undefined;
          } else s.heading += d * (1 - Math.exp(-dt * HEADING_RECOVER));
        }
        s.lat += this.velocity.lat * dt;
        s.lon += this.velocity.lon * dt;
        const decay = Math.exp(-dt * 4);
        this.velocity.lat *= decay;
        this.velocity.lon *= decay;
      }
    }
    // Only a hair from the poles, where north has no direction; drags pass over them.
    s.lat = THREE.MathUtils.clamp(s.lat, -89.95, 89.95);
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
    if (k.has(',') || k.has('.')) this.recoverHeading = undefined;
    if (k.has(',')) this.state.heading -= 60 * dt;
    if (k.has('.')) this.state.heading += 60 * dt;
    this.velocity.lat = 0;
    this.velocity.lon = 0;
  }

  /**
   * The drawn direction under a screen point on the globe's sphere, or, off the globe, the
   * nearest point of its outline, so a drag past the edge keeps hold.
   */
  private under(clientX: number, clientY: number): THREE.Vector3 {
    const rect = this.element.getBoundingClientRect();
    _ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    _ray.setFromCamera(_ndc, this.camera);
    const hit = _ray.ray.intersectSphere(_sphere, _hit);
    if (hit) return hit.clone().normalize();
    _ray.ray.closestPointToPoint(_origin, _hit);
    return _hit.clone().normalize();
  }

  /** Turns the whole view about the globe's centre by a rotation of the drawn globe. */
  private turn(q: THREE.Quaternion): void {
    const s = this.state;
    const up = _tUp.fromArray(this.lens.toDrawn(latLonToDir(s.lat, s.lon)));
    northEast(up, _north, _east);
    const h = THREE.MathUtils.degToRad(s.heading);
    const fwd = _tFwd.copy(_north).multiplyScalar(Math.cos(h)).addScaledVector(_east, Math.sin(h));
    up.applyQuaternion(q).normalize();
    fwd.applyQuaternion(q);
    northEast(up, _north, _east);
    s.heading = THREE.MathUtils.radToDeg(Math.atan2(fwd.dot(_east), fwd.dot(_north)));
    const ll = dirToLatLon(this.lens.toTrue([up.x, up.y, up.z]));
    s.lat = ll.lat;
    s.lon = ll.lon;
  }

  /** A drag with one finger or the left button: the grabbed point follows the pointer. */
  private drag(clientX: number, clientY: number, now: number): void {
    if (!this.grabbed) return;
    const at = this.under(clientX, clientY);
    const angle = at.angleTo(this.grabbed);
    if (angle < 1e-7) return;
    _dragQ.setFromUnitVectors(at, this.grabbed);
    this.turn(_dragQ);
    this.place(0);
    // The turning speed it leaves when let go, smoothed over the last moves.
    const dt = Math.max(1, now - this.lastDrag) / 1000;
    const rate = angle / dt;
    this.spin.axis.crossVectors(at, this.grabbed).normalize();
    this.spin.rate = this.lastDrag ? this.spin.rate * 0.5 + rate * 0.5 : 0;
    this.lastDrag = now;
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
    // An open hand over the globe, a closed one while it is held (Yang, 2026-10-20).
    el.style.cursor = 'grab';
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      this.gesture = undefined;
      this.cancelFlight();
      this.velocity = { lat: 0, lon: 0 };
      this.spin.rate = 0;
      this.lastDrag = 0;
      this.recoverHeading = undefined;
      this.dragHeading = this.state.heading;
      // A right double-click turns north up and looks straight down, as the compass button does.
      if (e.button === 2) {
        const r = this.lastRight;
        const twice =
          e.timeStamp - r.t < RIGHT_DOUBLE_MS &&
          Math.hypot(e.clientX - r.x, e.clientY - r.y) < RIGHT_DOUBLE_PX;
        this.lastRight = twice
          ? { t: -Infinity, x: 0, y: 0 }
          : { t: e.timeStamp, x: e.clientX, y: e.clientY };
        if (twice) this.resetOrientation();
      }
      this.grabbed =
        this.pointers.size === 1 && e.button === 0 && !e.ctrlKey
          ? this.under(e.clientX, e.clientY)
          : undefined;
      if (this.grabbed) el.style.cursor = 'grabbing';
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
        } else this.drag(e.clientX, e.clientY, e.timeStamp);
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 2) this.twoFinger();
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.gesture = undefined;
      // Held still before letting go, it stays; flung, it turns on and slows down.
      if (!this.grabbed || e.timeStamp - this.lastDrag > SPIN_HOLD_MS) this.spin.rate = 0;
      // A drag that turned the heading only a little did not mean to: north eases back to
      // where it pointed (Yang, 2026-10-20), while the globe keeps where it was moved to.
      if (
        this.grabbed &&
        Math.abs(headingDelta(this.dragHeading, this.state.heading)) < HEADING_KEEP_DEG
      )
        this.recoverHeading = this.dragHeading;
      this.grabbed = undefined;
      el.style.cursor = 'grab';
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

/** How fast a flung globe slows down (per second), and how long a pause before letting go stops it, in ms. */
const SPIN_DECAY = 2.5;
const SPIN_HOLD_MS = 80;
/** A drag turning the heading less than this (degrees) did not mean to; it eases back at this rate per second. */
const HEADING_KEEP_DEG = 20;
/** Two right-button presses this close in time (ms) and place (px) are a double-click. */
const RIGHT_DOUBLE_MS = 400;
const RIGHT_DOUBLE_PX = 8;
const HEADING_RECOVER = 3;

/** The signed turn in degrees from one heading to another, within ±180. */
function headingDelta(to: number, from: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}
const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _sphere = new THREE.Sphere(new THREE.Vector3(), EARTH_RADIUS_KM);
const _hit = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _tUp = new THREE.Vector3();
const _tFwd = new THREE.Vector3();
const _dragQ = new THREE.Quaternion();
const _spinQ = new THREE.Quaternion();

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
