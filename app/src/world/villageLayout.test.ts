import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildShelter, type ShelterId } from '../../../assets/src/shelters.ts';
// The Neolithic houses load with their cultures; build them all here.
import '../../../assets/src/allCultureModels.ts';
import { encodeMask, MASK_RINGS, MASK_SECTORS } from './fieldMask.ts';
import { NEOLITHIC_PROFILES } from './neolithicProfiles.ts';
import { LODGING_MAX_M, villageHouse } from './scene/camp.ts';
import { NEVER, type TreeLodging } from './tree.ts';

const land = encodeMask(new Array<boolean>(MASK_RINGS * MASK_SECTORS).fill(true));
const water = encodeMask(
  Array.from({ length: MASK_RINGS * MASK_SECTORS }, (_, i) => i % MASK_SECTORS !== 7),
);

/** A lodging of a profile's village at a slot. */
const lodging = (culture: string, kind: string, slot: number, camp: number, mask = land) =>
  ({
    id: slot,
    camp,
    lat: 0,
    lon: 0,
    built: 0,
    gone: NEVER,
    builder: 0,
    slot,
    reach: [80, 80, 80, 80, 80],
    kind,
    culture,
    fieldLand: mask,
  }) as TreeLodging;

type Rect = { cx: number; cz: number; ux: number; uz: number; hx: number; hz: number };

function overlap(a: Rect, b: Rect): boolean {
  const axes = [
    [a.ux, a.uz],
    [-a.uz, a.ux],
    [b.ux, b.uz],
    [-b.uz, b.ux],
  ] as const;
  const radius = (r: Rect, ax: number, az: number) =>
    r.hx * Math.abs(r.ux * ax + r.uz * az) + r.hz * Math.abs(-r.uz * ax + r.ux * az);
  return axes.every(([ax, az]) => {
    const d = Math.abs((b.cx - a.cx) * ax + (b.cz - a.cz) * az);
    return d < radius(a, ax, az) + radius(b, ax, az);
  });
}

/** A house's footprint in layout metres, as the layer draws it (fit to its longest side). */
function rect(l: TreeLodging, maxM: number): Rect {
  const h = villageHouse(l)!;
  const object = buildShelter(l.kind as ShelterId).object;
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  const k = Math.min(1, maxM / Math.max(size.x, size.z)) * 3;
  // The model's +Z (its door) turned to the house's facing, its +X to the side.
  const u = { x: h.dir.z, z: -h.dir.x };
  return {
    cx: h.at.x + mid.x * k * u.x + mid.z * k * h.dir.x,
    cz: h.at.z + mid.x * k * u.z + mid.z * k * h.dir.z,
    ux: u.x,
    uz: u.z,
    hx: (size.x * k) / 2,
    hz: (size.z * k) / 2,
  };
}

describe('the houses of a village (neolithic/villages.md section 5)', () => {
  const villages = Object.entries(NEOLITHIC_PROFILES).filter(([, p]) => p.layout !== 'pits');

  it.each(villages.map(([id]) => id))('%s: no two houses overlap, all clear of the green', (id) => {
    const p = NEOLITHIC_PROFILES[id]!;
    for (const camp of [3, 1_000_123, 777]) {
      const all = [0, 1, 2, 3, 4].map((k) => lodging(id, p.architecture[0]!, k, camp));
      expect(all.every((l) => villageHouse(l))).toBe(true);
      const rects = all.map((l) => rect(l, p.houseM ?? LODGING_MAX_M));
      for (let a = 0; a < rects.length; a++)
        for (let b = a + 1; b < rects.length; b++)
          expect(overlap(rects[a]!, rects[b]!), `${id} houses ${a} and ${b}`).toBe(false);
      // The green keeps the people's spots, out to 8.5 layout metres (humankind.md section 8.1).
      for (const r of rects)
        expect(Math.hypot(r.cx, r.cz) - Math.hypot(r.hx, r.hz)).toBeGreaterThan(5);
    }
  });

  it('draws the LBK longhouse twice as long as other houses', () => {
    const lbk = NEOLITHIC_PROFILES['lbk-farmer']!;
    expect(lbk.houseM).toBe(2 * LODGING_MAX_M);
    const h = villageHouse(lodging('lbk-farmer', lbk.architecture[0]!, 0, 5));
    expect(h?.lengthM).toBeCloseTo(2 * LODGING_MAX_M * 3, 5);
  });

  it('keeps the whole village on the ring where the ground does not take every house', () => {
    const lbk = NEOLITHIC_PROFILES['lbk-farmer']!;
    const fine = [0, 1, 2, 3, 4].some(
      (k) => !villageHouse(lodging('lbk-farmer', lbk.architecture[0]!, k, 9, water)),
    );
    // A strip of water through the layout: either every house stands in it or none does.
    const states = [0, 1, 2, 3, 4].map(
      (k) => !!villageHouse(lodging('lbk-farmer', lbk.architecture[0]!, k, 9, water)),
    );
    expect(new Set(states).size).toBe(1);
    expect(fine || states[0]).toBe(true);
  });
});
