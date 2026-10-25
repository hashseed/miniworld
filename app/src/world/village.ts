// The fields and herd of a Neolithic camp (spec humankind.md section 8.5), worked out once per camp
// from its land mask: a pure function of the camp, its crops and its mask.

import { hash01, hash32 } from '../core/hash.ts';
import { detCos, detSin } from '../core/detmath.ts';
import { layoutFields, MAX_FIELDS, type Field, type Pt } from './fieldShapes.ts';
import { maskReach, MASK_R0 } from './fieldMask.ts';

/** Fields are laid out in a frame this many times smaller than the layout, then scaled up (spec 8.5). */
export const FIELD_FRAME_SCALE = 8;

/** The fields of a camp, in layout metres off its hearth. Empty where the mask leaves none. */
export function fieldsOf(
  camp: number,
  seedKey: number,
  lodgings: number,
  crops: readonly string[],
  mask: string,
  /** Layout points the fields keep clear of (the camp's outing lanes), in layout metres. */
  blocked: (x: number, z: number) => boolean = () => false,
): Field[] {
  const s = FIELD_FRAME_SCALE;
  const fields = layoutFields({
    seed: hash32(camp, seedKey, 211),
    centre: { x: 0, z: 0 },
    ringRadius: MASK_R0 / s,
    crops,
    isLand: (x, z) => maskReach(mask, x * s, z * s),
    isBlocked: (x, z) => blocked(x * s, z * s),
    want: Math.min(MAX_FIELDS, Math.max(2, lodgings + 1)),
  });
  return fields.map((f) => ({
    ...f,
    outline: f.outline.map((p) => ({ x: p.x * s, z: p.z * s })),
    centre: { x: f.centre.x * s, z: f.centre.z * s },
    area: f.area * s * s,
  }));
}

export interface HerdAnimal {
  kind: string;
  x: number;
  z: number;
  /** Facing angle in radians. */
  heading: number;
  /** A phase for its clip, in ms. */
  phase: number;
}

/** A pen and a herd of 3 to 6 animals standing round it, `dist` layout metres out in the direction `angle`. */
export function herdOf(
  camp: number,
  kinds: readonly string[],
  angle: number,
  dist: number,
): { pen: Pt; penDir: Pt; animals: HerdAnimal[] } {
  const pen = { x: dist * detCos(angle), z: dist * detSin(angle) };
  const n = 3 + (hash32(camp, 221) % 4);
  const animals: HerdAnimal[] = [];
  for (let i = 0; i < n; i++) {
    const a = hash01(camp, i, 223) * 2 * Math.PI;
    const r = 8 + 4 * hash01(camp, i, 227);
    animals.push({
      kind: kinds[hash32(camp, i, 229) % kinds.length]!,
      x: pen.x + r * detCos(a),
      z: pen.z + r * detSin(a),
      heading: hash01(camp, i, 231) * 2 * Math.PI,
      phase: hash32(camp, i, 233) % 5000,
    });
  }
  return { pen, penDir: { x: -detCos(angle), z: -detSin(angle) }, animals };
}
