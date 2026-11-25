import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { cacheKey } from './buildCache.ts';
import { Output } from './output.ts';

describe('Output', () => {
  it('writes raw and matching Brotli files when writeBrotli is true', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'out-br-'));
    const cacheDir = join(dir, 'brotli');
    const out = new Output(join(dir, 'dist'), cacheDir, true);
    const name = out.writeJson('chunk', { hello: 'world' });
    await out.finish();

    const rawPath = join(dir, 'dist', name);
    const brPath = `${rawPath}.br`;
    expect(existsSync(rawPath)).toBe(true);
    expect(existsSync(brPath)).toBe(true);
    expect(brotliDecompressSync(readFileSync(brPath)).equals(readFileSync(rawPath))).toBe(true);
    expect(out.sizes.get(name)).toBeGreaterThan(0);
  });

  it('skips Brotli files and retains no compressed sizes when writeBrotli is false', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'out-nobr-'));
    const out = new Output(join(dir, 'dist'), undefined, false);
    const name = out.writeJson('chunk', { hello: 'world' });
    await out.finish();

    const rawPath = join(dir, 'dist', name);
    expect(existsSync(rawPath)).toBe(true);
    expect(existsSync(`${rawPath}.br`)).toBe(false);
    expect(out.sizes.size).toBe(0);
  });
});

describe('cacheKey', () => {
  it('ignores the checkout root prefix when deriving cache keys', () => {
    const a = mkdtempSync(join(tmpdir(), 'root-a-')) + '/';
    const b = mkdtempSync(join(tmpdir(), 'root-b-')) + '/';
    for (const root of [a, b]) {
      mkdirSync(join(root, 'sub'), { recursive: true });
      writeFileSync(join(root, 'sub/file.ts'), 'export const x = 42;\n');
    }
    expect(cacheKey([join(a, 'sub/file.ts')], { opt: 1 }, a)).toBe(
      cacheKey([join(b, 'sub/file.ts')], { opt: 1 }, b),
    );
  });
});
