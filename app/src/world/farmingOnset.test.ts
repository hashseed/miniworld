import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  FarmingGrid,
  cropFarmingDay,
  dayOfFarmingYear,
  farmingOnsetDay,
  farmingProfileAt,
  farmingStateAt,
  fieldToolOf,
  setFarmingGrid,
  settlementStage,
} from './farmingOnset.ts';

const DATA = join(__dirname, '../../public/data');
const manifest = existsSync(join(DATA, 'manifest.json'))
  ? (JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8')) as { farming?: string })
  : {};
const built = manifest.farming !== undefined && existsSync(join(DATA, manifest.farming));
const yearOf = (lat: number, lon: number): number | null => {
  const d = farmingOnsetDay(lat, lon);
  if (d === null) return null;
  for (let y = 12000; y > -2100; y--) if (dayOfFarmingYear(y) >= d) return y;
  return null;
};

describe.skipIf(!built)('farming onset (built raster)', () => {
  beforeAll(() => {
    setFarmingGrid(new FarmingGrid(new Uint8Array(readFileSync(join(DATA, manifest.farming!)))));
  });

  it('puts the anchors near their dates', () => {
    // [name, lat, lon, earliest BCE, latest BCE]: a centre or waypoint keeps its own date;
    // Catalhoyuk (about 7100 BCE) lies between its early neighbour Asikli and the Aegean.
    const anchors: [string, number, number, number, number][] = [
      ['Jericho', 31.87, 35.44, 9550, 9450],
      ['Catalhoyuk', 37.67, 32.83, 8300, 7000],
      ['LBK', 47, 18, 5850, 5500],
      ['Britain', 51.3, 0.7, 4050, 3950],
      ['Yellow River', 36.58, 114.1, 6550, 6450],
      ['Mesoamerica', 16.95, -96.43, 4350, 4250],
      ['Andes', -6.85, -79.2, 3550, 3450],
      ['Kuk', -5.78, 144.33, 5050, 4950],
    ];
    for (const [name, lat, lon, from, to] of anchors) {
      const y = yearOf(lat, lon) ?? 0;
      expect(y, name).toBeLessThanOrEqual(from);
      expect(y, name).toBeGreaterThanOrEqual(to);
    }
  });

  it('spreads outwards from the Fertile Crescent into Europe', () => {
    const route = [
      [31.87, 35.44],
      [37.67, 32.83],
      [40, 22],
      [45, 20],
      [50, 10],
      [51.3, 0.7],
    ] as const;
    const days = route.map(([a, b]) => farmingOnsetDay(a, b)!);
    for (let i = 1; i < days.length; i++) expect(days[i]!).toBeGreaterThan(days[i - 1]!);
  });

  it('has no onset on the sea, ice or desert', () => {
    expect(farmingOnsetDay(0, -140)).toBeNull();
    expect(farmingOnsetDay(80, 20)).toBeNull();
    expect(farmingOnsetDay(-85, 0)).toBeNull();
  });

  it('is deterministic', () => {
    const a = [farmingStateAt(50, 10, dayOfFarmingYear(5000)), farmingOnsetDay(50, 10)];
    const b = [farmingStateAt(50, 10, dayOfFarmingYear(5000)), farmingOnsetDay(50, 10)];
    expect(a).toEqual(b);
  });

  it('tells the state of a place by the day', () => {
    const before = farmingStateAt(50, 10, dayOfFarmingYear(7000));
    expect(before.farming).toBe(false);
    expect(before.stage).toBe('none');
    const after = farmingStateAt(50, 10, dayOfFarmingYear(5000));
    expect(after.farming).toBe(true);
    expect(after.sinceDays).toBeGreaterThan(0);
    expect(after.profile).toBe('lbk-farmer');
    expect(after.fieldTool).toBe('hoe');
    expect(after.package).not.toBeNull();
    expect(farmingStateAt(50, 10, dayOfFarmingYear(2000)).fieldTool).toBe('ard');
    expect(farmingStateAt(18, -97, dayOfFarmingYear(1000)).fieldTool).toBe('digging-stick');
  });

  it('lets herders come before crops in the Sahara and the steppe', () => {
    const sahara = [21, 30.7] as const;
    const on = farmingOnsetDay(...sahara);
    const crops = cropFarmingDay(...sahara);
    if (on !== null && crops !== null && crops > on)
      expect(settlementStage(...sahara, on)).toBe('herding');
    expect(settlementStage(50, 10, dayOfFarmingYear(0))).toBe('farming');
  });
});

describe('farming helpers', () => {
  it('chooses profiles and tools', () => {
    expect(farmingProfileAt(50, 10)).toBe('lbk-farmer');
    expect(farmingProfileAt(0, -140)).toBeNull();
    expect(fieldToolOf('new-guinea-highland-farmer', dayOfFarmingYear(1000))).toBe('digging-stick');
  });

  it('answers none without a raster', () => {
    setFarmingGrid(undefined);
    expect(farmingOnsetDay(50, 10)).toBeNull();
    expect(farmingStateAt(50, 10, 0).farming).toBe(false);
  });
});
