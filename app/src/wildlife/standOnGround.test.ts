import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { setModels } from '../content/assets.ts';
import type { WildAnimal } from '../world/wildlife.ts';
import { standOnGround, WildlifeLayer, type Obstacle } from './wildlifeLayer.ts';

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

function separateWith(
  isWater: (d: readonly [number, number, number]) => boolean | undefined,
  animals: WildAnimal[],
  obstacles: Obstacle[] = [],
): THREE.Vector3[] {
  const layer = new WildlifeLayer({
    surfaceKm: () => 0,
    toDrawn: (d) => d,
    isWater: (d) => isWater(d),
  });
  return (
    layer as unknown as {
      separate(a: readonly WildAnimal[], o: readonly Obstacle[]): THREE.Vector3[];
    }
  ).separate(animals, obstacles);
}

const zebra = (key: string, eastKm: number, northKm = 0): WildAnimal => ({
  key,
  model: 'animal-zebra',
  lat: 0,
  lon: 0,
  eastKm,
  northKm,
  heading: [1, 0],
  offset: [0, 0],
  clip: 'idle',
  seconds: 0,
  walkS: 0,
  grow: 1,
  liftKm: 0,
  rise: 0,
  pitch: 0,
});

describe('WildlifeLayer.separate coastal guard', () => {
  setModels([
    { id: 'animal-zebra', status: 'approved', file: '' },
    { id: 'animal-whale', status: 'approved', file: '' },
  ]);

  it('stops or slides along a shoreline instead of pushing a walking animal into water', () => {
    // Sea at x < 0 on the globe; zebra sits 150 km east of shore, obstacle east tries to push it west.
    const isWater = (d: readonly [number, number, number]) => d[0] < 0;
    const [pos] = separateWith(
      isWater,
      [zebra('0:0', 150)],
      [{ dir: new THREE.Vector3(240 / 6371, 0, 1).normalize(), km: 200 }],
    );
    expect(isWater([pos!.x, pos!.y, pos!.z])).toBe(false);
    expect(pos!.x).toBeGreaterThanOrEqual(0);
    // It pushed west and stopped short before its leading edge entered x < 0 water.
    expect(pos!.x).toBeLessThan(150 / 6371);
  });

  it('slides tangentially along a shoreline when radial push is blocked', () => {
    const isWater = (d: readonly [number, number, number]) => d[0] < 0;
    // Zebra halfKm is ~83.8 km; starting at 85 km blocks radial steps [1, 0.75, 0.5, 0.25].
    const [pos] = separateWith(
      isWater,
      [zebra('0:0', 85)],
      [{ dir: new THREE.Vector3(175 / 6371, 0, 1).normalize(), km: 200 }],
    );
    expect(isWater([pos!.x, pos!.y, pos!.z])).toBe(false);
    expect(pos!.x).toBeGreaterThanOrEqual(0);
    expect(Math.abs(pos!.y)).toBeGreaterThan(0);
  });

  it('yields the inland partner when separating overlapping land animals near water', () => {
    const isWater = (d: readonly [number, number, number]) => d[0] < 0;
    const [shorePos, inlandPos] = separateWith(isWater, [zebra('0:0', 135), zebra('1:0', 145)]);
    expect(isWater([shorePos!.x, shorePos!.y, shorePos!.z])).toBe(false);
    expect(isWater([inlandPos!.x, inlandPos!.y, inlandPos!.z])).toBe(false);
    expect(shorePos!.distanceTo(inlandPos!) * 6371).toBeGreaterThan(20);
  });

  it('never pushes a swimming animal onto dry land', () => {
    const isWater = (d: readonly [number, number, number]) => d[0] < 0;
    const whale: WildAnimal = {
      ...zebra('0:0', -50),
      model: 'animal-whale',
      clip: 'swim',
    };
    const [pos] = separateWith(
      isWater,
      [whale],
      [{ dir: new THREE.Vector3(-120 / 6371, 0, 1).normalize(), km: 200 }],
    );
    expect(isWater([pos!.x, pos!.y, pos!.z])).toBe(true);
  });
});
