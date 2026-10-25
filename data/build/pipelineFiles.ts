// The check of every built file's content hash and Brotli copy (spec milestone 1, section 13),
// split over several test files so vitest reads the 400 MB of the full build in parallel.

import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Manifest } from '../../app/src/content/types.ts';
import { built, json, read, referenced } from './lib/builtData.ts';
import { contentHash } from './lib/output.ts';

/** Registers the check of every `shards`-th file the manifest names, starting at `shard`. */
export function filesHashed(shard: number, shards: number): void {
  describe.skipIf(!built)(`built data files, part ${shard + 1} of ${shards}`, () => {
    it('names every file by the hash of its content, with a matching Brotli copy', () => {
      const files = [...referenced(json<Manifest>('manifest.json'))].sort();
      for (let i = shard; i < files.length; i += shards) {
        const file = files[i]!;
        const bytes = read(file);
        const hash = /\.([0-9a-f]{16})\.[a-z]+$/.exec(file)?.[1];
        expect(hash, file).toBe(contentHash(bytes));
        expect(brotliDecompressSync(read(`${file}.br`)).equals(bytes), `${file}.br`).toBe(true);
      }
    }, 120_000); // Reading and decompressing a quarter of the full build takes seconds on a busy machine.
  });
}
