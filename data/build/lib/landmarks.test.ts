import { describe, expect, it } from 'vitest';
import {
  TIMELINE_START,
  astronomicalYear,
  dayOfYearStart,
} from '../../../app/src/time/calendar.ts';
import { partAt } from '../../../app/src/world/landmark.ts';
import { buildLandmarks, placeOffWater, shiftOffWater } from './landmarks.ts';

const CURATED = new URL('../../curated', import.meta.url).pathname;
const bce = (y: number) => dayOfYearStart(astronomicalYear(y, 'BCE'));
const ce = (y: number) => dayOfYearStart(y);

function giza() {
  const r = buildLandmarks({
    curated: CURATED,
    lanes: new Set(['mena']),
    startDay: TIMELINE_START,
    cutoffDay: ce(1991),
  });
  expect(r.errors).toEqual([]);
  return r.landmarks.find((l) => l.structure.id === 'giza-pyramids')!;
}

describe('landmark records', () => {
  it('builds the pyramids of Giza with their parts, stages and builds', () => {
    const l = giza();
    expect(l.structure.parts.map((p) => p.name)).toEqual(['khufu', 'khafre', 'menkaure', 'sphinx']);
    expect(l.text.en.title).toBe('The pyramids of Giza');
    expect(l.text.de.title).toBe('Die Pyramiden von Gizeh');
    expect(l.structure.beacon).toBe(true);
    const khufu = l.structure.parts[0]!;
    expect(khufu.east).toBe(0);
    expect(khufu.build!.vignette).toBe('khufu-pyramid-building');
    // Menkaure's pyramid stands about 900 m south-west of the Great Pyramid.
    const m = l.structure.parts[2]!;
    expect(Math.hypot(m.east, m.north) / 100).toBeGreaterThan(700);
    expect(Math.hypot(m.east, m.north) / 100).toBeLessThan(1100);
    expect(m.east).toBeLessThan(0);
    expect(m.north).toBeLessThan(0);
  });

  it('picks the stage by date and rises during the build', () => {
    const khufu = giza().structure.parts[0]!;
    expect(partAt(khufu, bce(2600))).toBeUndefined();
    expect(partAt(khufu, khufu.build!.fromDay)).toEqual({ asset: 'giza-khufu', rise: 0 });
    const mid = partAt(khufu, bce(2575))!;
    expect(mid.rise).toBeGreaterThan(0.4);
    expect(mid.rise).toBeLessThan(0.6);
    expect(partAt(khufu, bce(2000))).toEqual({ asset: 'giza-khufu' });
    expect(partAt(khufu, ce(1350))!.asset).toBe('giza-khufu-stripping');
    expect(partAt(khufu, ce(1991))!.asset).toBe('giza-khufu-stepped');
    const sphinx = giza().structure.parts[3]!;
    expect(partAt(sphinx, ce(1800))!.asset).toBe('giza-sphinx-sand-noseless');
    expect(partAt(sphinx, ce(1950))!.asset).toBe('giza-sphinx-today');
  });

  it('rejects unknown assets, stages out of order and builds that do not fit', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } =
      await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'landmarks-'));
    mkdirSync(join(dir, 'landmarks'));
    copyFileSync(join(CURATED, 'sources.yaml'), join(dir, 'sources.yaml'));
    const bad = readFileSync(join(CURATED, 'landmarks/giza-pyramids.md'), 'utf8')
      .replace('asset: giza-khafre-stepped', 'asset: giza-khafre-ruins')
      .replace(
        '{ from: 1925, asset: giza-sphinx-today }',
        '{ from: 1000, asset: giza-sphinx-today }',
      )
      .replace(
        'part: menkaure, from: c. 2532 BCE, to: c. 2503 BCE',
        'part: menkaure, from: c. 2532 BCE, to: 1200',
      );
    writeFileSync(join(dir, 'landmarks/giza-pyramids.md'), bad);
    const r = buildLandmarks({
      curated: dir,
      lanes: new Set(['mena']),
      startDay: TIMELINE_START,
      cutoffDay: ce(1991),
    });
    const text = r.errors.join('\n');
    expect(text).toMatch(/unknown asset "giza-khafre-ruins"/);
    expect(text).toMatch(/part sphinx: stages must be in date order/);
    expect(text).toMatch(/build of menkaure runs into its next stage/);
  });
});

describe('placement off the water', () => {
  it('does not move a group on dry land', () => {
    expect(shiftOffWater(30, 31, 50, () => false)).toEqual({ lat: 30, lon: 31, shiftedKm: 0 });
  });

  it('moves the group west of a river running north across it', () => {
    // A river 30 km wide along longitude 31.1.
    const wet = (_lat: number, lon: number) => Math.abs(lon - 31.1) * 96 < 15;
    const r = shiftOffWater(29.98, 31.13, 60, wet);
    expect(r.shiftedKm).toBeGreaterThan(70);
    expect(r.lon).toBeLessThan(31.13);
    expect(r.lat).toBe(29.98);
    // Its whole footprint is now dry: its east edge lies west of the river bank.
    expect((31.1 - r.lon) * 96.4).toBeGreaterThan(60 + 15 - 1);
  });

  it('keeps the true point for flying and the card', () => {
    const l = giza();
    placeOffWater(l, (_lat, lon) => lon > 31.1);
    expect(l.structure.lon).toBe(31134200);
    expect(l.structure.drawnLon).toBeLessThan(31100000);
  });
});
