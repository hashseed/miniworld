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

  it("names a minute's tree file over 100 KB, which calls for the split by tile", () => {
    const tree = new Map([
      ['tree/m7.e.json', 100_001],
      ['tree/sites.f.json', 200_000],
      ['tree/m8.g.json', 100_000],
    ]);
    expect(chunkSizeProblems(tree)).toEqual([
      "tree/m7.e.json is 100 KB Brotli, over the 100 KB of a minute's tree file: " +
        'split the tree by tile (humankind.md section 8)',
    ]);
  });

  it('lists the largest files first', () => {
    expect(largestFiles(sizes, 2).map(([f]) => f)).toEqual(['big.c.bin', 'edge.d.bin']);
  });
});
