// The land mask round a Neolithic camp (spec humankind.md section 8.5): which cells of a polar grid
// round the hearth are dry, off rivers and on gentle ground, for the field layout to keep to. The data
// build records it per lodging (the scene has no terrain); the scene reads it through `maskLand`.

import { detAtan2, detCos, detSin } from '../core/detmath.ts';

export const MASK_SECTORS = 48;
export const MASK_RINGS = 10;
/** The first ring starts here and each ring is this wide, in layout metres. */
export const MASK_R0 = 13;
export const MASK_DR = 2.5;
export const MASK_R1 = MASK_R0 + MASK_RINGS * MASK_DR;
/** Ground within this many metres of the hearth's height is gentle enough for fields. */
export const FIELD_RELIEF_M = 300;

/** The cell centre of a ring and sector in layout metres from the hearth. */
export function maskCentre(ring: number, sector: number): { x: number; z: number } {
  const r = MASK_R0 + (ring + 0.5) * MASK_DR;
  const a = ((sector + 0.5) / MASK_SECTORS) * 2 * Math.PI;
  return { x: r * detCos(a), z: r * detSin(a) };
}

/** Packs one flag per cell, ring by ring, into base64. */
export function encodeMask(flags: boolean[]): string {
  const bytes = new Uint8Array(Math.ceil(flags.length / 8));
  flags.forEach((f, i) => {
    if (f) bytes[i >> 3]! |= 1 << (i & 7);
  });
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

const decoded = new Map<string, Uint8Array>();
function bytesOf(mask: string): Uint8Array {
  let b = decoded.get(mask);
  if (!b) {
    const s = atob(mask);
    b = Uint8Array.from(s, (c) => c.charCodeAt(0));
    if (decoded.size > 256) decoded.clear();
    decoded.set(mask, b);
  }
  return b;
}

/** Whether the cell holding a layout point (metres east and north of the hearth) is land. */
export function maskLand(mask: string, x: number, z: number): boolean {
  const r = Math.sqrt(x * x + z * z);
  if (r < MASK_R0 || r >= MASK_R1) return false;
  const ring = Math.floor((r - MASK_R0) / MASK_DR);
  let a = detAtan2(z, x);
  if (a < 0) a += 2 * Math.PI;
  const sector = Math.min(MASK_SECTORS - 1, Math.floor((a / (2 * Math.PI)) * MASK_SECTORS));
  const i = ring * MASK_SECTORS + sector;
  return ((bytesOf(mask)[i >> 3]! >> (i & 7)) & 1) === 1;
}

/** Whether a cell that is land in mask `was` is not in mask `now` (none is land without one). */
export function maskLost(was: string, now: string | undefined): boolean {
  const a = bytesOf(was);
  const b = now === undefined ? undefined : bytesOf(now);
  return a.some((byte, i) => (byte & ~(b?.[i] ?? 0)) !== 0);
}

/**
 * Whether a layout point is land and can be walked to over land: its cell and every cell on the
 * straight way out to it from the mask's inner edge are land, so no one walks to a field or a pen
 * across a bay (neolithic/villages.md section 6).
 */
export function maskReach(mask: string, x: number, z: number): boolean {
  if (!maskLand(mask, x, z)) return false;
  const r = Math.sqrt(x * x + z * z);
  for (let d = MASK_R0 + MASK_DR / 2; d < r; d += MASK_DR / 2)
    if (!maskLand(mask, (x * d) / r, (z * d) / r)) return false;
  return true;
}
