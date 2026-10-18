// Writes content-hashed chunk files with Brotli copies (spec milestone 1,
// sections 10.3 and 10.9).

import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';

const compress = promisify(brotliCompress);

export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

export class Output {
  readonly root: string;
  rawBytes = 0;
  compressedBytes = 0;
  files = 0;
  /** Compressed size per file, for budgets; complete after finish(). */
  readonly sizes = new Map<string, number>();
  /** Brotli copies being written, on Node's thread pool. */
  private pending: Promise<void>[] = [];

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
    this.rawBytes += bytes.length;
    this.files++;
    this.pending.push(
      compress(bytes, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 9,
          [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
        },
      }).then((br) => {
        writeFileSync(`${path}.br`, br);
        this.compressedBytes += br.length;
        this.sizes.set(name, br.length);
      }),
    );
  }

  /** Waits for every Brotli copy to be written. */
  async finish(): Promise<void> {
    await Promise.all(this.pending);
    this.pending = [];
  }
}
