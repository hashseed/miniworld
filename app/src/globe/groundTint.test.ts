import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FOLIAGE_GRID_H, FOLIAGE_GRID_W, type FoliageSlice } from '../content/formats.ts';
import { groundTint } from './groundTint.ts';

/** A slice with every kind of cell and density, from a fixed formula. */
function slice(): FoliageSlice {
  const n = FOLIAGE_GRID_W * FOLIAGE_GRID_H;
  const cells = new Uint8Array(n);
  const density = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    cells[i] = (i * 7 + (i >> 9)) % 30;
    density[i] = (i * 13) % 256;
  }
  return { day: 0, cells, density };
}

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').slice(0, 16);

describe('groundTint (issue 127)', () => {
  it('makes four bytes for every cell, the same every time', () => {
    const a = groundTint(slice());
    expect(a.length).toBe(FOLIAGE_GRID_W * FOLIAGE_GRID_H * 4);
    expect(sha(groundTint(slice()))).toBe(sha(a));
  });

  it('keeps the bytes the main thread made before the tint moved to the worker', () => {
    // Checksum of the output of the earlier groundTexture on this slice.
    expect(sha(groundTint(slice()))).toBe('c510837cddab9802');
  });

  it('wraps the blur in longitude and keeps untinted ground clear', () => {
    const n = FOLIAGE_GRID_W * FOLIAGE_GRID_H;
    const none = groundTint({ day: 0, cells: new Uint8Array(n), density: new Uint8Array(n) });
    expect(none.length).toBe(n * 4);
    // Cells without a tint (class 0) have no strength, so the texture is clear.
    expect(none.every((v) => v === 0)).toBe(true);
  });
});

describe('the foliage worker (issue 127)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('answers a slice with the same ground tint the main thread makes, transferred', async () => {
    const posted: { msg: { type: string; k: number; tint: Uint8Array }; transfer: unknown[] }[] =
      [];
    const scope = {
      onmessage: undefined as ((e: { data: unknown }) => void) | undefined,
      postMessage: (msg: never, transfer: unknown[]) => posted.push({ msg, transfer }),
    };
    vi.stubGlobal('self', scope);
    await import('./foliageWorker.ts');
    const s = slice();
    scope.onmessage!({ data: { type: 'slice', k: 3, slice: s } });
    expect(posted).toHaveLength(1);
    const { msg, transfer } = posted[0]!;
    expect(msg.type).toBe('ground');
    expect(msg.k).toBe(3);
    expect(transfer).toEqual([msg.tint.buffer]);
    expect(Buffer.from(msg.tint).equals(Buffer.from(groundTint(s)))).toBe(true);
  });
});
