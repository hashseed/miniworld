import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { standOnGround, WildlifeLayer } from './wildlifeLayer.ts';

describe('standOnGround (issue 129)', () => {
  it('keeps its feet out of a hillside steeper than it leans', () => {
    // A 40 degree slope rising to the front; the elephant is 3 km tall, its points 1 km away.
    const slope = Math.tan((40 * Math.PI) / 180);
    const half = 1;
    const r = standOnGround(0, slope * half, -slope * half, 0, 0, half, 3);
    expect(r.along).toBeLessThan(slope);
    expect(r.ground + r.along * half).toBeGreaterThanOrEqual(slope * half - 1e-9);
    expect(r.ground).toBeLessThanOrEqual(0.3 * 3 + 1e-9);
  });

  it('stands on flat ground exactly, and lifts a valley floor by at most a tenth of its height', () => {
    expect(standOnGround(2, 2, 2, 2, 2, 1, 3)).toEqual({ ground: 2, along: 0, across: 0 });
    const r = standOnGround(0, 0.1, 0.1, 0.1, 0.1, 1, 3);
    expect(r.ground).toBeCloseTo(0.1, 9);
    expect(standOnGround(0, 5, 5, 5, 5, 1, 3).ground).toBeCloseTo(0.3, 9);
  });
});

describe('standOnGround ends (aurochs in the ground)', () => {
  it('raises an animal on gentle ground whose tail end lies above its feet', () => {
    const r = standOnGround(0, 0, 0, 0, 0, 1, 3, { front: 0, back: 0.5, right: 0, left: 0 });
    expect(r.ground).toBeCloseTo(0.5, 5);
  });
  it('never lifts it more than 30% of its height', () => {
    const r = standOnGround(0, 0, 0, 0, 0, 1, 3, { front: 0, back: 5, right: 0, left: 0 });
    expect(r.ground).toBeCloseTo(0.9, 5);
  });
});

describe('ground read before its tile arrived (camels in the ground, issue 179)', () => {
  it('stands on the new ground once the surface says it changed', () => {
    let height = 0;
    let version = 0;
    const layer = new WildlifeLayer({
      surfaceKm: () => height,
      version: () => version,
      toDrawn: (d) => d,
    });
    const cached = layer as unknown as {
      right: THREE.Vector3;
      slopeCached(
        key: string,
        up: THREE.Vector3,
        f: THREE.Vector3,
        half: number,
        h: number,
      ): { ground: number };
    };
    const up = new THREE.Vector3(0, 1, 0);
    const f = new THREE.Vector3(0, 0, 1);
    cached.right.set(1, 0, 0);
    expect(cached.slopeCached('a', up, f, 1, 3).ground).toBe(0);
    height = 100;
    expect(cached.slopeCached('a', up, f, 1, 3).ground).toBe(0);
    version++;
    expect(cached.slopeCached('a', up, f, 1, 3).ground).toBe(100);
  });
});
