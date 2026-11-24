import { describe, expect, it } from 'vitest';
import {
  decodeWildMask,
  WILD_MASK_N,
  wildMaskCell,
  type WildGroup,
} from '../../../app/src/world/wildlife.ts';
import { LAND_COAST_KM, MIN_COAST_CELLS, wildMasks, type WildGround } from './wildlife.ts';

const KM_PER_DEG = 111.195;

const group = (over: Partial<WildGroup> = {}): WildGroup => ({
  species: 'plains-zebra',
  model: 'animal-zebra',
  home: 'Test',
  lat: 0,
  lon: 0,
  source: 'test',
  ...over,
});

function openCells(g: WildGroup, hex: string): [number, number][] {
  const m = decodeWildMask(hex);
  const pts: [number, number][] = [];
  for (let j = 0; j < WILD_MASK_N; j++)
    for (let i = 0; i < WILD_MASK_N; i++)
      if (m[j * WILD_MASK_N + i] === 1) pts.push(wildMaskCell(g, i, j));
  return pts;
}

describe('wildMasks (wildlife.md section 4)', () => {
  it('erodes mainland coasts by LAND_COAST_KM so animals do not overhang water', () => {
    // Ocean west of lon = 0; group home 3 deg (~333 km) inland so roam covers the shore.
    const g = group({ lon: 3, roamKm: 500 });
    const ground: WildGround = {
      height: () => 50,
      wet: (_lat, lon) => lon * KM_PER_DEG < 0,
    };
    const [buffered] = wildMasks([g], ground, () => LAND_COAST_KM);
    const [unbuffered] = wildMasks([g], ground, () => 0);
    const ptsBuf = openCells(g, buffered!);
    const ptsRaw = openCells(g, unbuffered!);
    expect(ptsBuf.length).toBeGreaterThan(MIN_COAST_CELLS);
    expect(ptsBuf.length).toBeLessThan(ptsRaw.length);
    // Home is 3 deg (~333 km) east of lon = 0, so shore sits at eastKm = -333.5.
    const minEastBuf = Math.min(...ptsBuf.map(([e]) => e));
    const minEastRaw = Math.min(...ptsRaw.map(([e]) => e));
    expect(minEastBuf).toBeGreaterThan(minEastRaw + LAND_COAST_KM * 0.7);
  });

  it('steps down the coastal buffer on a narrow island so it keeps open cells', () => {
    // 180 x 180 km island (half-width 90 km < q + LAND_COAST_KM) within 200 km roam.
    const g = group({ lat: 0, lon: 0, roamKm: 200 });
    const ground: WildGround = {
      height: () => 50,
      wet: (lat, lon) => Math.abs(lat) * KM_PER_DEG > 90 || Math.abs(lon) * KM_PER_DEG > 90,
    };
    const [hex] = wildMasks([g], ground, () => LAND_COAST_KM);
    const insideRoam = openCells(g, hex!).filter(([e, n]) => e * e + n * n <= 200 * 200);
    expect(insideRoam.length).toBeGreaterThan(0);
  });

  it('returns an empty mask cleanly when no dry cell exists near the home', () => {
    const g = group();
    const ground: WildGround = {
      height: () => -50,
      wet: () => true,
    };
    const [hex] = wildMasks([g], ground);
    expect(openCells(g, hex!)).toEqual([]);
  });

  it('keeps sea animals clear of land by SEA_COAST_KM and shallow water', () => {
    const g = group({
      species: 'humpback-whale',
      model: 'animal-whale',
      home: 'Ocean',
      lat: 0,
      lon: 5,
      roamKm: 500,
    });
    const ground: WildGround = {
      height: (_lat, lon) => (lon * KM_PER_DEG < 0 ? 50 : -500),
      wet: (_lat, lon) => lon * KM_PER_DEG >= 0,
    };
    const [hex] = wildMasks([g], ground);
    const pts = openCells(g, hex!);
    expect(pts.length).toBeGreaterThan(0);
    // Home is ~556 km east of shore; every open cell stays well clear of lon = 0.
    expect(Math.min(...pts.map(([e]) => e))).toBeGreaterThan(-556 + 150);
  });
});
