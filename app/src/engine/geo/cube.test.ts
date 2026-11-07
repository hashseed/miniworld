import { describe, expect, it } from 'vitest';
import {
  childKeys,
  dirToFaceUv,
  dirToLatLon,
  faceUvToDir,
  latLonToDir,
  parentKey,
  tileAt,
  tilePath,
} from './cube.ts';

describe('cube sphere', () => {
  it('round-trips face coordinates and directions', () => {
    for (let face = 0; face < 6; face++) {
      for (const [u, v] of [
        [0, 0],
        [0.5, -0.3],
        [-0.99, 0.99],
      ] as const) {
        const d = faceUvToDir(face, u, v);
        const back = dirToFaceUv(d);
        expect(back.face).toBe(face);
        expect(back.u).toBeCloseTo(u, 9);
        expect(back.v).toBeCloseTo(v, 9);
      }
    }
  });

  it('puts the poles on the Y faces', () => {
    expect(dirToFaceUv(latLonToDir(90, 0)).face).toBe(2);
    expect(dirToFaceUv(latLonToDir(-90, 0)).face).toBe(3);
    const ll = dirToLatLon(latLonToDir(31.2, 29.9));
    expect(ll.lat).toBeCloseTo(31.2, 9);
    expect(ll.lon).toBeCloseTo(29.9, 9);
  });

  it('builds quadtree paths and parents', () => {
    const k = tileAt(2, 0.3, -0.7, 3);
    expect(childKeys(k).map(parentKey)).toEqual([k, k, k, k]);
    expect(tilePath({ face: 2, level: 2, x: 1, y: 2 })).toBe('2/21');
  });
});
