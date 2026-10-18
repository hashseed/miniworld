// Drives the stress scene (spec milestone 1, section 11.4): a fixed camera
// path low over the Nile delta, out to orbit and back, with the figures
// standing on the drawn ground. Opened with ?scene=stress.

import * as THREE from 'three';
import type { CameraState } from '../core/camera.ts';
import { latLonToDir } from '../geo/cube.ts';
import type { CameraController } from '../globe/cameraController.ts';
import type { Globe } from '../globe/globe.ts';
import { QUALITY } from '../perf/quality.ts';
import { STRESS_CENTRE, StressScene } from '../perf/stressScene.ts';
import type { PlanetState } from '../planet/state.ts';
import { dayFromDate } from '../time/calendar.ts';

export const STRESS_DAY = dayFromDate(1, 1, 1);
const STRESS_PATH_MS = 60000;

/** The camera on the path at a time since the start. */
export function stressCamera(ms: number): CameraState {
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

export class StressRun {
  private scene: StressScene;
  private start = 0;

  constructor(parent: THREE.Scene) {
    this.scene = new StressScene(QUALITY.animatedFigures);
    parent.add(this.scene.group);
  }

  begin(now: number): void {
    this.start = now;
  }

  /** Whether one full camera path has been flown. */
  done(now: number): boolean {
    return now - this.start >= STRESS_PATH_MS;
  }

  /** Puts the camera on the path, before the camera updates. */
  steer(now: number, controller: CameraController): void {
    controller.state = stressCamera(now - this.start);
    controller.cancelFlight();
  }

  /** Stands the figures on the ground and animates them, after the globe updates. */
  update(
    now: number,
    globe: Globe,
    planet: PlanetState,
    camera: THREE.Camera,
    clockMs: number,
  ): void {
    const centre = latLonToDir(STRESS_CENTRE.lat, STRESS_CENTRE.lon);
    const ground = globe.surfaceAtTrue(centre, planet);
    if (ground > 0 || globe.drawnTiles > 0) this.scene.setGround(ground);
    this.scene.place(new THREE.Vector3(...globe.lens.toDrawn(centre)));
    this.scene.update(camera, clockMs, now);
  }
}
