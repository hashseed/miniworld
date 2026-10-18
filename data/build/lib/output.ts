// Writes content-hashed chunk files with Brotli copies (spec milestone 1,
// sections 10.3 and 10.9).

import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

export class Output {
  readonly root: string;
  rawBytes = 0;
  compressedBytes = 0;
  files = 0;
  /** Compressed size per file, for budgets. */
  readonly sizes = new Map<string, number>();

  constructor(root: string) {
    this.root = root;
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
  }

  /** Writes bytes as `${base}.${hash}.${ext}` and returns the relative file name. */
  write(base: string, ext: string, bytes: Uint8Array): string {
    const name = `${base}.${contentHash(bytes)}.${ext}`;
    this.writeNamed(name, bytes);
    return name;
  }

  writeJson(base: string, value: unknown): string {
    return this.write(base, 'json', new TextEncoder().encode(JSON.stringify(value)));
  }

  /** Writes a file under a fixed name (the manifest). */
  writeNamed(name: string, bytes: Uint8Array): void {
    const path = join(this.root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    const br = brotliCompressSync(bytes, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 9,
        [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
      },
    });
    writeFileSync(`${path}.br`, br);
    this.rawBytes += bytes.length;
    this.compressedBytes += br.length;
    this.files++;
    this.sizes.set(name, br.length);
  }
}
