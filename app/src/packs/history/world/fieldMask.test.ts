import { describe, expect, it } from 'vitest';
import {
  encodeMask,
  maskCentre,
  maskLand,
  maskLost,
  maskReach,
  MASK_RINGS,
  MASK_SECTORS,
} from './fieldMask.ts';

/** A mask whose cells are land where `land(ring, sector)` says. */
const mask = (land: (ring: number, sector: number) => boolean) =>
  encodeMask(
    Array.from({ length: MASK_RINGS * MASK_SECTORS }, (_, i) =>
      land(Math.floor(i / MASK_SECTORS), i % MASK_SECTORS),
    ),
  );

describe('the land mask of a village', () => {
  it('reaches a point only over land from its inner edge (no walk across a bay)', () => {
    // A bay: rings 3 and 4 are water in the first sectors, land beyond.
    const bay = mask((ring, sector) => !(sector < 6 && (ring === 3 || ring === 4)));
    const across = maskCentre(7, 2);
    const beside = maskCentre(7, 20);
    expect(maskLand(bay, across.x, across.z)).toBe(true);
    expect(maskReach(bay, across.x, across.z)).toBe(false);
    expect(maskReach(bay, beside.x, beside.z)).toBe(true);
  });

  it('tells when the sea has taken land a mask had', () => {
    const all = mask(() => true);
    const less = mask((ring) => ring < 8);
    expect(maskLost(all, less)).toBe(true);
    expect(maskLost(less, all)).toBe(false);
    expect(maskLost(all, all)).toBe(false);
    expect(maskLost(all, undefined)).toBe(true);
  });
});
