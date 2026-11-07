import { describe, expect, it } from 'vitest';
import { tessellate, type V3 } from './tessellate.ts';

/** Spherical area of the triangles (in steradians, for the unit sphere). */
function area(tri: number[]): number {
  let total = 0;
  for (let i = 0; i < tri.length; i += 9) {
    const a: V3 = [tri[i]!, tri[i + 1]!, tri[i + 2]!];
    const b: V3 = [tri[i + 3]!, tri[i + 4]!, tri[i + 5]!];
    const c: V3 = [tri[i + 6]!, tri[i + 7]!, tri[i + 8]!];
    const det =
      a[0] * (b[1] * c[2] - b[2] * c[1]) -
      a[1] * (b[0] * c[2] - b[2] * c[0]) +
      a[2] * (b[0] * c[1] - b[1] * c[0]);
    const den =
      1 +
      (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) +
      (b[0] * c[0] + b[1] * c[1] + b[2] * c[2]) +
      (c[0] * a[0] + c[1] * a[1] + c[2] * a[2]);
    total += 2 * Math.atan2(Math.abs(det), den);
  }
  return total;
}

/** A ring of `n` points on a circle of angular radius `radius` degrees about (lat, lon). */
function circle(lat: number, lon: number, radius: number, n = 48): number[] {
  const out: number[] = [];
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  const r = (radius * Math.PI) / 180;
  const c = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const e1 = [-Math.sin(lo), Math.cos(lo), 0];
  const e2 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    const p = [0, 1, 2].map(
      (k) => Math.cos(r) * c[k]! + Math.sin(r) * (Math.cos(t) * e1[k]! + Math.sin(t) * e2[k]!),
    );
    out.push((Math.asin(p[2]!) * 180) / Math.PI, (Math.atan2(p[1]!, p[0]!) * 180) / Math.PI);
  }
  return out;
}

const cap = (radius: number): number => 2 * Math.PI * (1 - Math.cos((radius * Math.PI) / 180));

describe('tessellate', () => {
  it('fills a cap with triangles that add up to its area', () => {
    const tri = tessellate([circle(30, 40, 10)]);
    expect(area(tri) / cap(10)).toBeGreaterThan(0.98);
    expect(area(tri) / cap(10)).toBeLessThan(1.001);
  });

  it('fills a cap across the antimeridian and one over the pole', () => {
    for (const [lat, lon] of [
      [0, 180],
      [88, 10],
      [-90, 0],
    ] as const) {
      const tri = tessellate([circle(lat, lon, 12)]);
      expect(area(tri) / cap(12), `${lat}, ${lon}`).toBeGreaterThan(0.97);
      expect(area(tri) / cap(12), `${lat}, ${lon}`).toBeLessThan(1.01);
    }
  });

  it('leaves out a hole', () => {
    const tri = tessellate([circle(10, 10, 15), circle(10, 10, 5)]);
    expect(area(tri) / (cap(15) - cap(5))).toBeGreaterThan(0.97);
    expect(area(tri) / (cap(15) - cap(5))).toBeLessThan(1.01);
  });

  it('keeps every vertex on the unit sphere and every edge short', () => {
    const tri = tessellate([circle(-20, 100, 18)], 0.03);
    for (let i = 0; i < tri.length; i += 3)
      expect(Math.hypot(tri[i]!, tri[i + 1]!, tri[i + 2]!)).toBeCloseTo(1, 9);
    for (let i = 0; i < tri.length; i += 9) {
      for (const [a, b] of [
        [0, 3],
        [3, 6],
        [6, 0],
      ] as const) {
        const d =
          tri[i + a]! * tri[i + b]! +
          tri[i + a + 1]! * tri[i + b + 1]! +
          tri[i + a + 2]! * tri[i + b + 2]!;
        expect(Math.acos(Math.min(1, d))).toBeLessThanOrEqual(0.0301);
      }
    }
  });

  it('gives nothing for a degenerate ring', () => {
    expect(tessellate([[0, 0, 1, 1]])).toEqual([]);
    expect(tessellate([])).toEqual([]);
  });
});
