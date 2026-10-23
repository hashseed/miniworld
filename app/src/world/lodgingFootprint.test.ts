import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildShelter, type ShelterId } from '../../../assets/src/shelters.ts';
import { detAtan2, detCos, detSin } from '../core/detmath.ts';
import { NEOLITHIC_PROFILES } from './neolithicProfiles.ts';
import {
  COMPACT_SITE,
  FIGURE_KM_PER_M,
  LAYOUT_KM_PER_M,
  LODGING_SLOTS,
  MINIMAL_LODGING,
  MINIMAL_SITE,
  LODGING_RING_M,
  layoutOf,
  ringOf,
  slotPoint,
} from './treeScene.ts';

/** A lodging model is drawn at most this many figure metres across (treeLayer.ts, LODGING_MAX_M). */
const LODGING_MAX_M = 2.7;
const TO_LAYOUT = FIGURE_KM_PER_M / LAYOUT_KM_PER_M;

type Rect = { cx: number; cz: number; ux: number; uz: number; hx: number; hz: number };

/** Whether two rectangles overlap, by the separating axis test. */
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

/** The footprint of a model after the layer's fit, in layout metres, round its box's middle. */
function footprint(id: ShelterId, room: number) {
  const object = buildShelter(id).object;
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const fit = Math.min(1, (LODGING_MAX_M * room) / Math.max(size.x, size.z, 1e-6));
  const mid = box.getCenter(new THREE.Vector3());
  const k = fit * TO_LAYOUT;
  return { hx: (size.x * k) / 2, hz: (size.z * k) / 2, mx: mid.x * k, mz: mid.z * k };
}

describe('the lodgings of a camp', () => {
  const houses = new Set<string>(Object.values(NEOLITHIC_PROFILES).flatMap((p) => p.architecture));
  const layouts = [
    ['full', 0, [...houses]],
    ['compact', COMPACT_SITE, [...houses]],
    ['minimal', MINIMAL_SITE, [MINIMAL_LODGING]],
  ] as const;
  for (const [name, camp, ids] of layouts)
    it(`never overlap in a ${name} camp or reach its hearth`, () => {
      for (const id of ids) {
        const f = footprint(id as ShelterId, ringOf(camp) / LODGING_RING_M);
        // Each faces the hearth, its door on either side of the model, so both are tried.
        for (const flip of [0, Math.PI]) {
          const rects = Array.from({ length: LODGING_SLOTS }, (_, slot) => {
            const p = slotPoint(camp, slot);
            const a = detAtan2(p.z, p.x) + Math.PI / 2 + flip;
            const ux = detCos(a);
            const uz = detSin(a);
            return {
              cx: p.x + f.mx * ux - f.mz * uz,
              cz: p.z + f.mx * uz + f.mz * ux,
              ux,
              uz,
              hx: f.hx,
              hz: f.hz,
            };
          });
          for (let i = 0; i < rects.length; i++) {
            // A box's half diagonal short of the hearth's rim (about a metre) is the clearance asked.
            expect(
              Math.sqrt(rects[i]!.cx ** 2 + rects[i]!.cz ** 2) - Math.sqrt(f.hx ** 2 + f.hz ** 2),
            ).toBeGreaterThan(layoutOf(camp).ring * 0.2);
            for (let j = i + 1; j < rects.length; j++)
              expect(overlap(rects[i]!, rects[j]!), `${id} slots ${i} and ${j}`).toBe(false);
          }
        }
      }
    });
});
