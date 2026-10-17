import { describe, expect, it } from 'vitest';
import { Lens, decodeLensGrids, encodeLensGrids } from '../../../app/src/globe/lens.ts';
import { latLonToDir, type Vec3 } from '../../../app/src/globe/cube.ts';
import { LENS_PARAMS, buildLens, jacobians, parseCoordinates } from './lens.ts';
import { LENS_COLS, LENS_STEP } from '../../../app/src/globe/lens.ts';

const KM = 6371;

describe('event coordinates', () => {
  it('reads one point per row from the Coordinates column', () => {
    const md = [
      '| Id | Date | Place | Coordinates | Type |',
      '| --- | --- | --- | --- | --- |',
      '| a | 79 | Bay of Naples | 40.82, 14.43 | Natural disaster |',
      '| b | 1066 | Hastings | 50.91, 0.49 (battlefield) | Battle |',
      '| c | 1492 | Atlantic | -12.5, -77 | Voyage |',
      '',
      '| No coordinates | here |',
      '| --- | --- |',
      '| 1, 2 | x |',
    ].join('\n');
    expect(parseCoordinates(md)).toEqual([
      { lat: 40.82, lon: 14.43 },
      { lat: 50.91, lon: 0.49 },
      { lat: -12.5, lon: -77 },
    ]);
  });
});

describe('history lens warp', () => {
  // A small cluster of events in Europe and a few elsewhere, at low degree to stay fast.
  const events: { lat: number; lon: number }[] = [];
  for (let i = 0; i < 60; i++) events.push({ lat: 40 + (i % 10), lon: (i * 7) % 30 });
  events.push({ lat: 30, lon: 31 }, { lat: 35, lon: 105 }, { lat: -15, lon: -60 });
  const lens = buildLens(events, { ...LENS_PARAMS, degree: 8, exponent: 0.3 });
  const grids = decodeLensGrids(encodeLensGrids(lens.forward, lens.inverse));
  const view = new Lens(grids.forward, grids.inverse);
  view.setOn(true, false);

  it('passes the limits and enlarges the busy region', () => {
    expect(lens.checks.folds).toBe(0);
    expect(lens.checks.maxAnisotropy).toBeLessThanOrEqual(LENS_PARAMS.maxAnisotropy);
    const { area } = jacobians(lens.forward);
    const at = (lat: number, lon: number) =>
      area[Math.round((lat + 90) / LENS_STEP) * LENS_COLS + Math.round((lon + 180) / LENS_STEP)]!;
    expect(at(44, 14)).toBeGreaterThan(1.3);
    expect(at(0, -150)).toBeLessThan(1);
    expect(view.widthAt(latLonToDir(44, 14))).toBeGreaterThan(1.1);
  });

  it('turns a true point into a drawn one and back to within 1 km', () => {
    let worst = 0;
    for (let lat = -88; lat <= 88; lat += 7.3)
      for (let lon = -180; lon < 180; lon += 9.1) {
        const d = latLonToDir(lat, lon);
        const back = view.toTrue(view.toDrawn(d));
        const err = Math.acos(Math.min(1, d[0] * back[0] + d[1] * back[1] + d[2] * back[2])) * KM;
        worst = Math.max(worst, err);
      }
    expect(worst).toBeLessThan(1);
  });

  it('blends from true sizes to the lens and back, on frame time', () => {
    const l = new Lens(grids.forward, grids.inverse);
    const d: Vec3 = latLonToDir(46, 10);
    expect(l.toDrawn(d)).toEqual(d);
    l.setOn(true);
    l.advance(500, 1000);
    expect(l.blend).toBeCloseTo(0.5);
    l.setOn(false); // turns round from where it is
    l.advance(250, 1000);
    expect(l.blend).toBeCloseTo(0.15625);
    expect(l.morphing).toBe(true);
    l.advance(1000, 1000);
    expect(l.blend).toBe(0);
    expect(l.morphing).toBe(false);
  });
});
