import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraController } from './cameraController.ts';

const make = (lon: number) =>
  new CameraController(
    new THREE.PerspectiveCamera(40, 1.5, 1, 1e6),
    { addEventListener: () => {}, style: {} } as unknown as HTMLElement,
    { surfaceKm: () => 0 },
    { lat: 15, lon, altitudeKm: 60_000, heading: 0, tilt: 0 },
  );

describe('the spin-in of the loading screen (milestone-1 section 8.6)', () => {
  const target = { lat: 48, lon: 10, altitudeKm: 8000, heading: 0, tilt: 0 };

  it('keeps turning westward from the spin and comes to rest on the view', () => {
    const c = make(150);
    c.farKm = 60_000;
    const ms = c.spinTo(target, 20, 90, 0);
    expect(ms).toBe(3500);
    const lons: number[] = [];
    for (let t = 0; t <= ms; t += 100) {
      c.update(100, t);
      lons.push(c.state.lon);
    }
    // Westward all the way: the longitude never grows.
    for (let i = 1; i < lons.length; i++) expect(lons[i]!).toBeLessThanOrEqual(lons[i - 1]! + 1e-9);
    expect(c.flying).toBe(false);
    expect(c.state.lat).toBeCloseTo(48);
    expect(c.state.lon).toBeCloseTo(10);
  });

  it('goes round once more when the place already faces the camera', () => {
    const c = make(40);
    c.farKm = 60_000;
    expect(c.spinTo(target, 20, 90, 0)).toBe(5000);
    let turned = 0;
    let last = c.state.lon;
    for (let t = 100; t <= 5000; t += 100) {
      c.update(100, t);
      turned += (((last - c.state.lon) % 360) + 360) % 360;
      last = c.state.lon;
    }
    expect(turned).toBeCloseTo(390, 0);
  });
});
