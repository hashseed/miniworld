import { describe, expect, it } from 'vitest';
import {
  FIELD_MARGIN_M,
  boundingRectangleArea,
  layoutFields,
  pointInPolygon,
  polygonArea,
  type Field,
  type FieldInput,
  type Pt,
} from './fieldShapes.ts';

const CROPS = ['emmer', 'barley', 'flax'];
const open: Pick<FieldInput, 'isLand' | 'isBlocked'> = {
  isLand: () => true,
  isBlocked: () => false,
};
const base = (seed: number, extra: Partial<FieldInput> = {}): FieldInput => ({
  seed,
  centre: { x: 3, z: -2 },
  ringRadius: 1.4,
  crops: CROPS,
  ...open,
  ...extra,
});

/** Distance from a point to a segment. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

function overlap(a: Field, b: Field): boolean {
  return (
    a.outline.some((p) => pointInPolygon(b.outline, p.x, p.z)) ||
    b.outline.some((p) => pointInPolygon(a.outline, p.x, p.z))
  );
}

/** A river: the polyline's points within 0.25 m. */
const river: Pt[] = [
  { x: 0, z: 4 },
  { x: 2.5, z: 1.5 },
  { x: 4.5, z: 2.2 },
  { x: 8, z: 5 },
];
const nearRiver = (x: number, z: number) =>
  river.slice(1).some((b, i) => distToSegment({ x, z }, river[i]!, b) < 0.25);
const mountain = (x: number, z: number) => Math.hypot(x - 6.5, z + 4) < 1.2;
const sea = (x: number) => x < -0.6; // the sea lies west of this line

describe('layoutFields', () => {
  it.each([1, 2, 3, 7, 42, 1000])('gives 3 to 10 fields in open country (seed %i)', (seed) => {
    const fields = layoutFields(base(seed));
    expect(fields.length).toBeGreaterThanOrEqual(3);
    expect(fields.length).toBeLessThanOrEqual(10);
  });

  it('fills the space it is given up to 10 fields', () => {
    expect(layoutFields(base(5)).length).toBe(10);
    expect(layoutFields(base(5, { want: 4 })).length).toBe(4);
  });

  it.each([1, 2, 3, 4, 5])('keeps fields apart and off the ring (seed %i)', (seed) => {
    const input = base(seed);
    const fields = layoutFields(input);
    for (let i = 0; i < fields.length; i++) {
      for (let j = i + 1; j < fields.length; j++)
        expect(overlap(fields[i]!, fields[j]!), `${i} and ${j}`).toBe(false);
      for (const p of fields[i]!.outline)
        expect(Math.hypot(p.x - 3, p.z + 2)).toBeGreaterThan(1.4 + FIELD_MARGIN_M * 0.99);
    }
  });

  it.each([1, 2, 3, 4, 5, 6])('keeps off rivers, mountains and the sea (seed %i)', (seed) => {
    const input = base(seed, {
      isLand: (x) => !sea(x),
      isBlocked: (x, z) => nearRiver(x, z) || mountain(x, z),
    });
    const fields = layoutFields(input);
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) {
      // Every outline point and every interior sample is land and unblocked.
      for (const p of f.outline) {
        expect(sea(p.x)).toBe(false);
        expect(nearRiver(p.x, p.z)).toBe(false);
        expect(mountain(p.x, p.z)).toBe(false);
      }
      for (let x = -2; x < 10; x += 0.1)
        for (let z = -8; z < 8; z += 0.1)
          if (pointInPolygon(f.outline, x, z)) {
            expect(sea(x) || nearRiver(x, z) || mountain(x, z)).toBe(false);
          }
    }
  });

  it('gives fewer fields where land is short, and none where there is none', () => {
    const strip = layoutFields(base(9, { isLand: (_x, z) => Math.abs(z + 2) < 0.7 }));
    expect(strip.length).toBeLessThan(10);
    expect(layoutFields(base(9, { isLand: () => false }))).toEqual([]);
  });

  it('never makes rectangles and keeps fields 1 to 2 metres across', () => {
    for (const seed of [1, 2, 3, 4]) {
      for (const f of layoutFields(base(seed))) {
        expect(f.outline.length).toBeGreaterThanOrEqual(24);
        expect(polygonArea(f.outline) / boundingRectangleArea(f.outline)).toBeLessThan(0.9);
        let wide = 0;
        for (const p of f.outline)
          for (const q of f.outline) wide = Math.max(wide, Math.hypot(p.x - q.x, p.z - q.z));
        expect(wide).toBeGreaterThan(0.7);
        expect(wide).toBeLessThan(2.2);
        expect(f.area).toBeCloseTo(polygonArea(f.outline), 6);
      }
    }
  });

  it('is deterministic from the seed, and the seed matters', () => {
    const a = layoutFields(base(11));
    expect(layoutFields(base(11))).toEqual(a);
    expect(layoutFields(base(12))).not.toEqual(a);
  });

  it('rotates through the crops and gives whole-day offsets', () => {
    const fields = layoutFields(base(3));
    expect(new Set(fields.map((f) => f.crop)).size).toBe(3);
    for (const f of fields) {
      expect(CROPS).toContain(f.crop);
      expect(Number.isInteger(f.offsetDays)).toBe(true);
      expect(f.offsetDays).toBeGreaterThanOrEqual(0);
      expect(f.offsetDays).toBeLessThan(15);
      expect(polygonArea(f.outline)).toBeGreaterThan(0.4);
    }
  });
});
