import { describe, expect, it } from 'vitest';
import {
  groundDraped,
  groundRingPlane,
  groundTerrainAligned,
  groundUprightPlinth,
} from './grounding.ts';
import type { Vec3 } from '../geo/cube.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';

describe('shared terrain grounding (grounding.ts)', () => {
  const unitZ: Vec3 = [0, 0, 1];
  const n = {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
  const e = {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
  northEast({ x: 0, y: 0, z: 1, set() {} }, n, e);

  const planarSurface =
    (slopeEast: number, slopeNorth: number, base = 10) =>
    (d: Vec3) => {
      const eastKm = (d[0] * e.x + d[1] * e.y + d[2] * e.z) * EARTH_RADIUS_KM;
      const northKm = (d[0] * n.x + d[1] * n.y + d[2] * n.z) * EARTH_RADIUS_KM;
      return base + slopeEast * eastKm + slopeNorth * northKm;
    };

  it('keeps flat ground exact without lowering or raising', () => {
    const r = groundUprightPlinth({
      centerDir: unitZ,
      dirX: 0,
      dirZ: 1,
      halfWidthKm: 80,
      halfDepthKm: 60,
      plinthDepthKm: 63.75,
      maxBuryKm: 10.625,
      surfaceAt: () => 5,
    });
    expect(r.grounded).toBe(true);
    expect(r.baseH).toBeCloseTo(5, 6);
    expect(r.reliefKm).toBeCloseTo(0, 6);
    expect(r.plinthBottomH).toBeCloseTo(5 - 63.75, 6);
  });

  it('grounds buildings on 10 deg and 20 deg slopes across any facing without hovering', () => {
    for (const deg of [10, 20]) {
      const slope = Math.tan((deg * Math.PI) / 180);
      for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
        const halfW = 160;
        const halfD = 55;
        const plinth = 63.75; // 1.5 m * 42.5 km/m
        const r = groundUprightPlinth({
          centerDir: unitZ,
          dirX: Math.cos(angle),
          dirZ: Math.sin(angle),
          halfWidthKm: halfW,
          halfDepthKm: halfD,
          plinthDepthKm: plinth,
          maxBuryKm: 10.625,
          surfaceAt: planarSurface(slope, slope * 0.4, 20),
        });
        expect(r.plinthBottomH).toBeLessThanOrEqual(r.minH + 1e-6);
        if (r.reliefKm <= plinth + 10.625) {
          expect(r.grounded).toBe(true);
        }
      }
    }
  });

  it('limits uphill burial to maxBuryKm until plinth depth requires lowering', () => {
    // 80 km half-width on a 15 deg slope -> +/- 21.4 km corner delta; maxBury 10.625 lifts baseH.
    const slope = Math.tan((15 * Math.PI) / 180);
    const r = groundUprightPlinth({
      centerDir: unitZ,
      dirX: 1,
      dirZ: 0,
      halfWidthKm: 80,
      halfDepthKm: 50,
      plinthDepthKm: 63.75,
      maxBuryKm: 10.625,
      surfaceAt: planarSurface(0, slope, 0),
    });
    expect(r.grounded).toBe(true);
    expect(r.baseH).toBeGreaterThan(0);
    expect(r.maxH - r.baseH).toBeCloseTo(10.625, 4);
    expect(r.plinthBottomH).toBeLessThanOrEqual(r.minH);

    // Extreme cliff where relief > plinth + maxBury cannot satisfy both without exceeding plinth depth.
    const cliff = groundUprightPlinth({
      centerDir: unitZ,
      dirX: 1,
      dirZ: 0,
      halfWidthKm: 160,
      halfDepthKm: 50,
      plinthDepthKm: 20,
      maxBuryKm: 5,
      surfaceAt: planarSurface(0, 1.0, 0),
    });
    expect(cliff.grounded).toBe(true);
    expect(cliff.plinthBottomH).toBeCloseTo(cliff.minH, 4);
  });

  it('handles asymmetric model bounds accurately', () => {
    const r = groundUprightPlinth({
      centerDir: unitZ,
      dirX: 0,
      dirZ: 1,
      minXKm: -120,
      maxXKm: 60,
      minZKm: -40,
      maxZKm: 100,
      halfWidthKm: 90,
      halfDepthKm: 70,
      plinthDepthKm: 63.75,
      maxBuryKm: 10.625,
      surfaceAt: planarSurface(0.2, 0.1, 0),
    });
    // Corner (minX=-120, maxZ=100) shifts eastKm = 100*0 - (-120)*1 = +120, northKm = +100.
    expect(r.maxH).toBeCloseTo(0.2 * 120 + 0.1 * 100, 1);
    expect(r.grounded).toBe(true);
  });

  it('computes ring best-fit plane and draped height', () => {
    const plane = groundRingPlane(unitZ, 100, 12, planarSurface(0.1, -0.05, 10));
    expect(plane.east).toBeCloseTo(0.1, 3);
    expect(plane.north).toBeCloseTo(-0.05, 3);
    expect(plane.lift).toBeLessThanOrEqual(1e-6);

    expect(groundTerrainAligned(0, 0.2, 0.2, 0.2, 0.2, 1, 3).ground).toBeCloseTo(0.2, 6);
    expect(groundDraped(12.5, 0.4)).toBeCloseTo(12.9, 6);
  });
});
