import { describe, expect, it } from 'vitest';
import { latLonToDir } from './cube.ts';
import { northEast } from './earth.ts';

class V {
  x = 0;
  y = 0;
  z = 0;
  set(x: number, y: number, z: number): this {
    [this.x, this.y, this.z] = [x, y, z];
    return this;
  }
}

describe('northEast', () => {
  it('points north and east on the equator at longitude 0', () => {
    const up = new V().set(...latLonToDir(0, 0));
    const north = new V();
    const east = new V();
    northEast(up, north, east);
    expect([north.x, north.y, north.z].map((v) => +v.toFixed(9))).toEqual([0, 1, 0]);
    expect([east.x, east.y, east.z].map((v) => +v.toFixed(9))).toEqual([1, 0, 0]);
  });

  it('gives an orthonormal frame, and +Z for north at the poles', () => {
    for (const [lat, lon] of [
      [48, 9],
      [-33, 151],
      [89.9, -70],
    ] as const) {
      const up = new V().set(...latLonToDir(lat, lon));
      const n = new V();
      const e = new V();
      northEast(up, n, e);
      expect(n.x * up.x + n.y * up.y + n.z * up.z).toBeCloseTo(0, 9);
      expect(e.x * up.x + e.y * up.y + e.z * up.z).toBeCloseTo(0, 9);
      expect(Math.hypot(e.x, e.y, e.z)).toBeCloseTo(1, 9);
      // Moving east from up increases the longitude.
      expect(
        e.x * Math.cos((lon * Math.PI) / 180) - e.z * Math.sin((lon * Math.PI) / 180),
      ).toBeGreaterThan(0);
    }
    const n = new V();
    northEast(new V().set(0, 1, 0), n, new V());
    expect([n.x, n.y, n.z]).toEqual([0, 0, 1]);
  });
});
