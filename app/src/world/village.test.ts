import { describe, expect, it } from 'vitest';
import { MASK_RINGS, MASK_SECTORS, encodeMask, maskLand } from './fieldMask.ts';
import { pointInPolygon } from '../tree/fieldShapes.ts';
import { fieldsOf, herdOf } from './village.ts';
import { NEOLITHIC_PROFILES } from './neolithicProfiles.ts';
import { ROLE_NOUNS, roleOf } from './roles.ts';

const allLand = encodeMask(new Array<boolean>(MASK_SECTORS * MASK_RINGS).fill(true));
const halfLand = encodeMask(
  Array.from({ length: MASK_SECTORS * MASK_RINGS }, (_, i) => i % MASK_SECTORS < MASK_SECTORS / 2),
);

describe('village fields', () => {
  it('are the same every time and number 3 to 5 on open land', () => {
    const a = fieldsOf(7, 99, 4, ['emmer', 'lentil'], allLand);
    expect(fieldsOf(7, 99, 4, ['emmer', 'lentil'], allLand)).toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a.length).toBeLessThanOrEqual(5);
  });
  it('keep to the land of the mask and out of the ring of houses', () => {
    for (const f of fieldsOf(11, 5, 5, ['barley'], halfLand))
      for (const p of f.outline) {
        expect(maskLand(halfLand, p.x, p.z)).toBe(true);
        expect(Math.sqrt(p.x * p.x + p.z * p.z)).toBeGreaterThan(12);
      }
  });
  it('have none on water', () => {
    expect(fieldsOf(1, 1, 5, ['barley'], encodeMask(new Array<boolean>(480).fill(false)))).toEqual(
      [],
    );
  });
  it('never overlap one another', () => {
    const fs = fieldsOf(3, 8, 5, ['emmer'], allLand);
    for (const a of fs)
      for (const b of fs)
        if (a !== b) expect(pointInPolygon(b.outline, a.centre.x, a.centre.z)).toBe(false);
  });
});

describe('herds', () => {
  it('stand round their pen, 3 to 6 animals, deterministically', () => {
    const h = herdOf(5, ['animal-goat', 'animal-sheep'], 1, 17);
    expect(herdOf(5, ['animal-goat', 'animal-sheep'], 1, 17)).toEqual(h);
    expect(h.animals.length).toBeGreaterThanOrEqual(3);
    expect(h.animals.length).toBeLessThanOrEqual(6);
  });
});

describe('roles', () => {
  it('are drawn from the profile and named in both languages', () => {
    for (const id of Object.keys(NEOLITHIC_PROFILES) as (keyof typeof NEOLITHIC_PROFILES)[])
      for (let n = 0; n < 40; n++) {
        const r = roleOf(id, n);
        expect(roleOf(id, n)).toBe(r);
        const noun = ROLE_NOUNS[r];
        expect(noun.en && noun.de.f && noun.de.m).toBeTruthy();
      }
  });
});
