import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_KM } from '../geo/earth.ts';
import { FieldGround, fieldGrowth } from './fieldGround.ts';
import { layoutFields } from './fieldShapes.ts';
import type { SurfaceSource } from './surface.ts';

const surface: SurfaceSource = {
  surfaceKm: (d) => 0.5 + 0.3 * d[0],
  toDrawn: (d) => d,
  seaKm: () => 0,
};

const centre = { x: 0, z: 0 };
const fields = layoutFields({
  seed: 4,
  centre,
  ringRadius: 1.2,
  crops: ['emmer', 'rice'],
  isLand: () => true,
  isBlocked: () => false,
});

describe('FieldGround', () => {
  it('drapes every field on the surface, with indices inside the buffers', () => {
    const ground = new FieldGround(surface);
    const origin = new THREE.Vector3(0.3, 0.2, 0.93).normalize().multiplyScalar(EARTH_RADIUS_KM);
    ground.begin();
    fields.forEach((f, i) => ground.add(origin, f, i / fields.length, centre));
    ground.end(EARTH_RADIUS_KM + 1_000, 1);
    expect(ground.mesh.visible).toBe(true);
    const position = ground.mesh.geometry.getAttribute('position');
    const index = ground.mesh.geometry.getIndex()!;
    const ring = fields.reduce((n, f) => n + 1 + 5 * f.outline.length, 0);
    expect(position.count).toBe(ring);
    for (const i of index.array) expect(i).toBeLessThan(position.count);
    for (let i = 0; i < position.count; i++) {
      const r = Math.hypot(position.getX(i), position.getY(i), position.getZ(i));
      // The ground is at 0.5 +- 0.3 km, the patch floats 4 km over it.
      expect(r).toBeGreaterThan(EARTH_RADIUS_KM + 3);
      expect(r).toBeLessThan(EARTH_RADIUS_KM + 6);
    }
    expect(ground.mesh.geometry.getAttribute('stage').count).toBe(position.count);
  });

  it('stays drawn from orbit, enlarged, and rebuilds when the ground changes', () => {
    const ground = new FieldGround(surface);
    const origin = new THREE.Vector3(0, 0, EARTH_RADIUS_KM);
    ground.begin();
    ground.add(origin, fields[0]!, 0.5, centre);
    ground.end(EARTH_RADIUS_KM + 20_000, 1);
    expect(ground.mesh.visible).toBe(true);
    ground.begin();
    ground.add(origin, fields[0]!, 0.5, centre);
    ground.end(EARTH_RADIUS_KM + 2_000, 2);
    expect(ground.mesh.visible).toBe(true);
  });

  it('enlarges fields in proportion to the altitude, within bounds', () => {
    expect(fieldGrowth(1_000)).toBe(1);
    expect(fieldGrowth(12_000)).toBeCloseTo(2, 5);
    expect(fieldGrowth(100_000)).toBe(4);
  });
});
