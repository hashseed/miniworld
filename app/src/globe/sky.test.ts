import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DAY_LENGTH_MS, lifeMsForMorning, sunDirection } from './sky.ts';
import { latLonToDir } from './cube.ts';

describe('day and night', () => {
  it('lasts four minutes per day', () => {
    const a = sunDirection(1000);
    const b = sunDirection(1000 + DAY_LENGTH_MS);
    expect(a.distanceTo(b)).toBeLessThan(1e-9);
  });

  it('starts mid-morning at the camera longitude', () => {
    for (const lon of [0, 31, -100, 150]) {
      const sun = sunDirection(lifeMsForMorning(lon));
      const place = new THREE.Vector3(...latLonToDir(0, lon));
      const elevation = Math.asin(sun.dot(place)) * (180 / Math.PI);
      expect(elevation).toBeGreaterThan(25);
      expect(elevation).toBeLessThan(65);
      // Morning: the sun is east of the place, moving west.
      const later = sunDirection(lifeMsForMorning(lon) + DAY_LENGTH_MS / 24);
      expect(later.dot(place)).toBeGreaterThan(sun.dot(place));
    }
  });
});
