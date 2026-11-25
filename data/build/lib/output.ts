// Writes content-hashed chunk files with Brotli copies (spec milestone 1,
// sections 10.3 and 10.9).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';

const compress = promisify(brotliCompress);
const BROTLI_QUALITY = 6;
const MAX_BROTLI_WORKERS = 8;

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
  /**
   * Files waiting for their Brotli copies. They are compressed at the end, a few at a time,
   * so the build's memory and the machine's cores are not all taken at once (small CI
   * runners lost the job when every copy was queued while the build ran).
   */
  private pending: { name: string; path: string; bytes: Uint8Array; hash?: string }[] = [];

  /**
   * Where Brotli copies are kept by the hash of their file's bytes, so an unchanged file is
   * not compressed again; only the copies the build used are kept. None with `--fresh`.
   */
  private readonly brotliCache: string | undefined;
  private readonly writeBrotli: boolean;

  /** The files written since `startRecording`, for the stage cache. */
  private recording: { name: string; bytes: Uint8Array }[] | undefined;

  startRecording(): void {
    this.recording = [];
  }

  stopRecording(): { name: string; bytes: Uint8Array }[] {
    const writes = this.recording ?? [];
    this.recording = undefined;
    return writes;
  }

  /** Writes files a cached stage wrote before, under the same names. */
  replay(writes: { name: string; bytes: Uint8Array }[]): void {
    for (const w of writes) this.writeNamed(w.name, w.bytes);
  }

  constructor(root: string, brotliCache?: string, writeBrotli = true) {
    this.root = root;
    this.brotliCache = brotliCache;
    this.writeBrotli = writeBrotli;
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
  }

  /** Writes bytes as `${base}.${hash}.${ext}` and returns the relative file name. */
  write(base: string, ext: string, bytes: Uint8Array): string {
    const full = createHash('sha256').update(bytes).digest('hex');
    const name = `${base}.${full.slice(0, 16)}.${ext}`;
    this.writeNamed(name, bytes, full.slice(0, 32));
    return name;
  }

  writeJson(base: string, value: unknown): string {
    return this.write(base, 'json', new TextEncoder().encode(JSON.stringify(value)));
  }

  /** Writes a file under a fixed name (the manifest). */
  writeNamed(name: string, bytes: Uint8Array, hash?: string): void {
    this.recording?.push({ name, bytes });
    const path = join(this.root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    this.rawBytes += bytes.length;
    this.files++;
    if (this.writeBrotli) {
      this.pending.push({ name, path, bytes, ...(hash ? { hash } : {}) });
    }
  }

  /** Writes every Brotli copy across bounded concurrent workers. */
  async finish(): Promise<void> {
    if (!this.writeBrotli) return;
    const queue = this.pending;
    this.pending = [];
    const cache = this.brotliCache;
    const used = new Set<string>();
    if (cache) mkdirSync(cache, { recursive: true });
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const job = queue[next++]!;
        const digest =
          job.hash ?? createHash('sha256').update(job.bytes).digest('hex').slice(0, 32);
        const key = cache && `q${BROTLI_QUALITY}-${digest}.br`;
        let br: Uint8Array;
        if (cache && key && existsSync(join(cache, key))) br = readFileSync(join(cache, key));
        else {
          br = await compress(job.bytes, {
            params: {
              [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
              [constants.BROTLI_PARAM_SIZE_HINT]: job.bytes.length,
            },
          });
          if (cache && key) writeFileSync(join(cache, key), br);
        }
        if (key) used.add(key);
        writeFileSync(`${job.path}.br`, br);
        this.compressedBytes += br.length;
        this.sizes.set(job.name, br.length);
      }
    };
    const concurrency = Math.max(2, Math.min(availableParallelism(), MAX_BROTLI_WORKERS));
    await Promise.all(Array.from({ length: concurrency }, worker));
    if (cache) for (const f of readdirSync(cache)) if (!used.has(f)) rmSync(join(cache, f));
  }
}
