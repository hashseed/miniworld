import { describe, expect, it } from 'vitest';
import { CHUNK_LIMIT_BYTES, chunkSizeProblems, largestFiles } from './chunkSize.ts';

describe('the chunk size limit', () => {
  const sizes = new Map([
    ['tree/m1.a.json', 26_000],
    ['lens.b.bin', 126_000],
    ['big.c.bin', CHUNK_LIMIT_BYTES + 1],
    ['edge.d.bin', CHUNK_LIMIT_BYTES],
  ]);

  it('names every file whose Brotli copy is over 1 MB, and only those', () => {
    expect(chunkSizeProblems(sizes)).toEqual([
      'big.c.bin is 1000 KB Brotli, over the 1000 KB limit',
    ]);
    expect(chunkSizeProblems(new Map([['a', 10]]))).toEqual([]);
  });

  it('lists the largest files first', () => {
    expect(largestFiles(sizes, 2).map(([f]) => f)).toEqual(['big.c.bin', 'edge.d.bin']);
  });
});
