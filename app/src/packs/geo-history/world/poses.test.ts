import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RotationModel, conjugate, fromPole, mul, rotate, slerp } from './poses.ts';

const close = (a: readonly number[], b: readonly number[], eps = 1e-9): void => {
  expect(a.length).toBe(b.length);
  a.forEach((x, i) => expect(Math.abs(x - b[i]!)).toBeLessThan(eps));
};

describe('quaternions', () => {
  it('a quarter turn about the north pole takes the x axis to the y axis', () => {
    close(rotate(fromPole(90, 0, 90), [1, 0, 0]), [0, 1, 0]);
  });

  it('a rotation about a pole on the equator keeps the pole fixed', () => {
    close(
      rotate(fromPole(0, 30, 70), [Math.cos(0.5236), Math.sin(0.5236), 0]),
      [Math.cos(0.5236), Math.sin(0.5236), 0],
      1e-4,
    );
  });

  it('composes: q·conjugate(q) is the identity', () => {
    const q = fromPole(20, 40, 33);
    close(mul(q, conjugate(q)), [0, 0, 0, 1]);
  });

  it('slerp halfway between 0 and 40 degrees is 20 degrees, on either side of the sign', () => {
    const a = fromPole(90, 0, 0);
    const b = fromPole(90, 0, 40);
    close(slerp(a, b, 0.5), fromPole(90, 0, 20));
    const neg = [-b[0], -b[1], -b[2], -b[3]] as const;
    close(slerp(a, neg, 0.5), fromPole(90, 0, 20));
  });
});

describe('RotationModel', () => {
  // Plate 10 turns 30 degrees about the north pole by 10 Ma; plate 20 sits on plate 10 and
  // turns 20 degrees more relative to it by 10 Ma.
  const model = new RotationModel([
    [10, 0, 90, 0, 0, 0],
    [10, 10, 90, 0, 30, 0],
    [20, 0, 90, 0, 0, 10],
    [20, 10, 90, 0, 20, 10],
  ]);
  const lon = (v: readonly number[]): number => (Math.atan2(v[1]!, v[0]!) * 180) / Math.PI;

  it('interpolates along the great circle between key ages', () => {
    expect(lon(rotate(model.absolute(10, 5), [1, 0, 0]))).toBeCloseTo(15, 9);
    expect(lon(rotate(model.absolute(10, 10), [1, 0, 0]))).toBeCloseTo(30, 9);
  });

  it('composes a plate with the plate it is fixed to', () => {
    expect(lon(rotate(model.absolute(20, 10), [1, 0, 0]))).toBeCloseTo(50, 9);
    expect(lon(rotate(model.absolute(20, 5), [1, 0, 0]))).toBeCloseTo(25, 9);
  });

  it("holds the nearest rotation outside the plate's ages and the identity for unknown plates", () => {
    expect(lon(rotate(model.absolute(10, 400), [1, 0, 0]))).toBeCloseTo(30, 9);
    close(model.absolute(999, 50), [0, 0, 0, 1]);
    close(model.absolute(0, 50), [0, 0, 0, 1]);
  });

  it('interpolates the poses themselves where the fixed plate changes', () => {
    const m = new RotationModel([
      [10, 0, 90, 0, 0, 0],
      [10, 10, 90, 0, 10, 0],
      [30, 0, 90, 0, 0, 10],
      // Relative to plate 10 up to 5 Ma, then straight to the frame.
      [30, 5, 90, 0, 10, 10],
      [30, 10, 90, 0, 40, 0],
    ]);
    // At 5 Ma: plate 10 is at 5, so plate 30 is at 15. At 10 Ma it is at 40.
    expect(lon(rotate(m.absolute(30, 5), [1, 0, 0]))).toBeCloseTo(15, 9);
    expect(lon(rotate(m.absolute(30, 10), [1, 0, 0]))).toBeCloseTo(40, 9);
    expect(lon(rotate(m.absolute(30, 7.5), [1, 0, 0]))).toBeCloseTo(27.5, 6);
  });

  it('gives every plate its pose at once', () => {
    const poses = model.poses(10);
    expect([...poses.keys()].sort()).toEqual([10, 20]);
  });
});

/** Where a present-day point on a plate lies at an age, in the model's frame. */
function place(model: RotationModel, plate: number, lat: number, lon: number, ma: number) {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  const v = rotate(model.absolute(plate, ma), [
    Math.cos(la) * Math.cos(lo),
    Math.cos(la) * Math.sin(lo),
    Math.sin(la),
  ]);
  return { lat: (Math.asin(v[2]) * 180) / Math.PI, lon: (Math.atan2(v[1], v[0]) * 180) / Math.PI };
}

describe('the plate model of Merdith et al. (2021)', () => {
  const rows = JSON.parse(
    readFileSync(
      new URL('../../../../../data/sources/merdith-2021/rotations.json', import.meta.url),
      'utf8',
    ),
  ) as number[][];
  const model = new RotationModel(rows);

  it('puts every plate where it is today at 0 Ma', () => {
    for (const plate of [101, 201, 301, 501, 701, 801, 802]) {
      const p = place(model, plate, 10, 20, 0);
      expect(p.lat).toBeCloseTo(10, 6);
      expect(p.lon).toBeCloseTo(20, 6);
    }
  });

  // Golden values from this code, checked for plausibility against what is known of the
  // motions: India crosses the equator about 50 Ma, North America lies in the tropics inside
  // Pangaea, Australia hugs Antarctica in the Cretaceous.
  const golden: [string, number, number, number, number, number, number][] = [
    ['Delhi', 501, 28.6, 77.2, 50, 3.3, 72.7],
    ['Delhi', 501, 28.6, 77.2, 70, -22.6, 65.9],
    ['New York', 101, 40.7, -74, 250, 8.6, -6.3],
    ['Sydney', 801, -33.9, 151.2, 100, -64.7, 168.3],
    ['Sydney', 801, -33.9, 151.2, 520, 8.1, 134.1],
  ];
  for (const [name, plate, lat, lon, ma, glat, glon] of golden)
    it(`${name} at ${ma} Ma lies at ${glat}, ${glon}`, () => {
      const p = place(model, plate, lat, lon, ma);
      expect(Math.abs(p.lat - glat)).toBeLessThan(0.06);
      expect(Math.abs(p.lon - glon)).toBeLessThan(0.06);
    });

  it('moves smoothly: a plate never jumps more than 12 degrees in 1 Ma', () => {
    for (const plate of [101, 301, 501, 701, 801]) {
      let prev = place(model, plate, 10, 20, 0);
      for (let ma = 1; ma <= 1000; ma++) {
        const p = place(model, plate, 10, 20, ma);
        const a = (prev.lat * Math.PI) / 180;
        const b = (p.lat * Math.PI) / 180;
        const dl = ((p.lon - prev.lon) * Math.PI) / 180;
        const d = Math.acos(
          Math.min(1, Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(dl)),
        );
        expect((d * 180) / Math.PI, `plate ${plate} at ${ma} Ma`).toBeLessThan(12);
        prev = p;
      }
    }
  });
});
